-- Attendance decisions captured at scan time.
--
-- A session records physical presence. This companion record documents which
-- scheduled block the coordinator intended to recognize and why an exceptional
-- checkout is valid. Keeping this separate preserves the original timestamps
-- while giving every exception an auditable, deterministic interpretation.

create table if not exists public.attendance_session_decisions (
  session_id uuid primary key references public.attendance_sessions(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  day_key text not null,
  intended_shift_keys text[] not null,
  attendance_kind text not null default 'scheduled',
  exit_decision text,
  reason_code text not null default 'scanner_confirmed',
  explanation text not null default '',
  hide_alert boolean not null default true,
  decided_by text,
  decided_by_name text,
  decided_by_role text,
  decided_at timestamptz not null default now(),
  source text not null default 'qr_scanner',
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_session_decisions_shift_keys_check check (
    cardinality(intended_shift_keys) between 1 and 4
    and intended_shift_keys <@ array['T1', 'T2', 'T3', 'T4']::text[]
  ),
  constraint attendance_session_decisions_kind_check check (
    attendance_kind in ('scheduled', 'full_block', 'additional', 'late_entry', 'forgotten_scan', 'historical_audit')
  ),
  constraint attendance_session_decisions_exit_check check (
    exit_decision is null or exit_decision in ('normal', 'confirmed_short', 'resolved_stale', 'admin_corrected')
  )
);

create unique index if not exists attendance_session_decisions_idempotency_idx
  on public.attendance_session_decisions(idempotency_key)
  where idempotency_key is not null;

create index if not exists attendance_session_decisions_volunteer_day_idx
  on public.attendance_session_decisions(volunteer_id, day_key);

alter table public.attendance_session_decisions enable row level security;
revoke all on table public.attendance_session_decisions from public, anon, authenticated;
grant all on table public.attendance_session_decisions to service_role;

comment on table public.attendance_session_decisions is
  'Decision explícita que interpreta una sesión de asistencia sin alterar la evidencia original.';

create table if not exists public.attendance_scan_events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null,
  volunteer_id uuid references public.volunteers(id) on delete set null,
  session_id uuid references public.attendance_sessions(id) on delete set null,
  day_key text,
  actor_id text,
  actor_name text,
  actor_role text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint attendance_scan_events_code_check check (
    event_code in ('session_opened', 'session_closed', 'short_exit_confirmed', 'stale_session_resolved')
  )
);

create index if not exists attendance_scan_events_session_idx
  on public.attendance_scan_events(session_id, created_at desc);

create index if not exists attendance_scan_events_volunteer_idx
  on public.attendance_scan_events(volunteer_id, created_at desc);

alter table public.attendance_scan_events enable row level security;
revoke all on table public.attendance_scan_events from public, anon, authenticated;
grant all on table public.attendance_scan_events to service_role;

create or replace function public.open_attendance_session_with_decision(
  p_session_id uuid,
  p_volunteer_id uuid,
  p_day_key text,
  p_started_at timestamptz,
  p_intended_shift_keys text[],
  p_attendance_kind text,
  p_reason_code text,
  p_explanation text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.attendance_sessions%rowtype;
begin
  if p_volunteer_id is null or p_session_id is null then
    raise exception 'session_id y volunteer_id son requeridos';
  end if;
  if p_started_at is null or nullif(btrim(p_day_key), '') is null then
    raise exception 'day_key y started_at son requeridos';
  end if;
  if cardinality(p_intended_shift_keys) < 1
     or not (p_intended_shift_keys <@ array['T1', 'T2', 'T3', 'T4']::text[]) then
    raise exception 'Los turnos seleccionados no son válidos';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_volunteer_id::text, 0));

  if p_idempotency_key is not null then
    select session.* into v_session
    from public.attendance_session_decisions decision
    join public.attendance_sessions session on session.id = decision.session_id
    where decision.idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('session', to_jsonb(v_session), 'alreadyOpen', true, 'idempotentReplay', true);
    end if;
  end if;

  select * into v_session
  from public.attendance_sessions
  where volunteer_id = p_volunteer_id and status = 'open'
  for update;
  if found then
    return jsonb_build_object('session', to_jsonb(v_session), 'alreadyOpen', true);
  end if;

  insert into public.attendance_sessions (
    id, volunteer_id, day_key, started_at, ended_at, status, auto_closed, created_at, updated_at
  ) values (
    p_session_id, p_volunteer_id, btrim(p_day_key), p_started_at, null, 'open', false, p_started_at, p_started_at
  ) returning * into v_session;

  insert into public.attendance_session_decisions (
    session_id, volunteer_id, day_key, intended_shift_keys, attendance_kind,
    reason_code, explanation, hide_alert, decided_by, decided_by_name,
    decided_by_role, decided_at, source, idempotency_key
  ) values (
    v_session.id, p_volunteer_id, btrim(p_day_key), p_intended_shift_keys, p_attendance_kind,
    coalesce(nullif(btrim(p_reason_code), ''), 'scanner_confirmed'), coalesce(p_explanation, ''), true,
    p_actor_id, p_actor_name, p_actor_role, p_started_at, 'qr_scanner', p_idempotency_key
  );

  insert into public.attendance_scan_events (
    event_code, volunteer_id, session_id, day_key, actor_id, actor_name, actor_role, details, created_at
  ) values (
    'session_opened', p_volunteer_id, v_session.id, v_session.day_key,
    p_actor_id, p_actor_name, p_actor_role,
    jsonb_build_object('intendedShiftKeys', p_intended_shift_keys, 'attendanceKind', p_attendance_kind),
    p_started_at
  );

  insert into public.activity_logs (user_name, user_role, action_type, description, details, target_id)
  values (
    coalesce(nullif(p_actor_name, ''), 'Coordinador'),
    coalesce(nullif(p_actor_role, ''), 'Coordinador'),
    'Check-in', 'Inició una sesión de asistencia con turno confirmado',
    jsonb_build_object(
      'sessionId', v_session.id, 'volunteerId', p_volunteer_id,
      'dayKey', v_session.day_key, 'startedAt', v_session.started_at,
      'intendedShiftKeys', p_intended_shift_keys, 'attendanceKind', p_attendance_kind
    )::text,
    p_volunteer_id::text
  );

  return jsonb_build_object('session', to_jsonb(v_session), 'alreadyOpen', false);
end;
$$;

create or replace function public.close_attendance_session_with_decision(
  p_session_id uuid,
  p_volunteer_id uuid,
  p_ended_at timestamptz,
  p_intended_shift_keys text[],
  p_exit_decision text,
  p_reason_code text,
  p_explanation text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.attendance_sessions%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_volunteer_id::text, 0));

  select * into v_session
  from public.attendance_sessions
  where id = p_session_id and volunteer_id = p_volunteer_id
  for update;
  if not found then
    raise exception 'No se encontró la sesión activa';
  end if;
  if v_session.status = 'completed' then
    return jsonb_build_object('session', to_jsonb(v_session), 'alreadyClosed', true);
  end if;
  if p_ended_at < v_session.started_at then
    raise exception 'La salida no puede ser anterior a la entrada';
  end if;
  if cardinality(p_intended_shift_keys) < 1
     or not (p_intended_shift_keys <@ array['T1', 'T2', 'T3', 'T4']::text[]) then
    raise exception 'Los turnos seleccionados no son válidos';
  end if;

  update public.attendance_sessions
  set ended_at = p_ended_at, status = 'completed', auto_closed = false, updated_at = now()
  where id = v_session.id
  returning * into v_session;

  insert into public.attendance_session_decisions (
    session_id, volunteer_id, day_key, intended_shift_keys, attendance_kind,
    exit_decision, reason_code, explanation, hide_alert,
    decided_by, decided_by_name, decided_by_role, decided_at, source
  ) values (
    v_session.id, v_session.volunteer_id, v_session.day_key, p_intended_shift_keys, 'scheduled',
    p_exit_decision, coalesce(nullif(btrim(p_reason_code), ''), 'scanner_checkout'),
    coalesce(p_explanation, ''), true, p_actor_id, p_actor_name, p_actor_role, now(), 'qr_scanner'
  )
  on conflict (session_id) do update set
    intended_shift_keys = excluded.intended_shift_keys,
    exit_decision = excluded.exit_decision,
    reason_code = excluded.reason_code,
    explanation = excluded.explanation,
    hide_alert = true,
    decided_by = excluded.decided_by,
    decided_by_name = excluded.decided_by_name,
    decided_by_role = excluded.decided_by_role,
    decided_at = excluded.decided_at,
    updated_at = now();

  insert into public.attendance_scan_events (
    event_code, volunteer_id, session_id, day_key, actor_id, actor_name, actor_role, details
  ) values (
    case when p_exit_decision = 'confirmed_short' then 'short_exit_confirmed' else 'session_closed' end,
    v_session.volunteer_id, v_session.id, v_session.day_key,
    p_actor_id, p_actor_name, p_actor_role,
    jsonb_build_object('endedAt', v_session.ended_at, 'exitDecision', p_exit_decision)
  );

  insert into public.activity_logs (user_name, user_role, action_type, description, details, target_id)
  values (
    coalesce(nullif(p_actor_name, ''), 'Coordinador'),
    coalesce(nullif(p_actor_role, ''), 'Coordinador'),
    'Check-out', 'Finalizó una sesión de asistencia con decisión registrada',
    jsonb_build_object(
      'sessionId', v_session.id, 'volunteerId', v_session.volunteer_id,
      'endedAt', v_session.ended_at, 'exitDecision', p_exit_decision,
      'intendedShiftKeys', p_intended_shift_keys
    )::text,
    v_session.volunteer_id::text
  );

  return jsonb_build_object('session', to_jsonb(v_session), 'alreadyClosed', false);
end;
$$;

create or replace function public.resolve_stale_and_open_attendance(
  p_previous_session_id uuid,
  p_new_session_id uuid,
  p_volunteer_id uuid,
  p_previous_ended_at timestamptz,
  p_new_day_key text,
  p_new_started_at timestamptz,
  p_previous_shift_keys text[],
  p_new_shift_keys text[],
  p_new_attendance_kind text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_previous public.attendance_sessions%rowtype;
  v_new public.attendance_sessions%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_volunteer_id::text, 0));

  if cardinality(p_previous_shift_keys) < 1 or cardinality(p_new_shift_keys) < 1
     or not (p_previous_shift_keys <@ array['T1', 'T2', 'T3', 'T4']::text[])
     or not (p_new_shift_keys <@ array['T1', 'T2', 'T3', 'T4']::text[]) then
    raise exception 'Los turnos seleccionados no son válidos';
  end if;

  if p_idempotency_key is not null then
    select session.* into v_new
    from public.attendance_session_decisions decision
    join public.attendance_sessions session on session.id = decision.session_id
    where decision.idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('previousSessionId', p_previous_session_id, 'session', to_jsonb(v_new), 'idempotentReplay', true);
    end if;
  end if;

  select * into v_previous
  from public.attendance_sessions
  where id = p_previous_session_id and volunteer_id = p_volunteer_id
  for update;
  if not found or v_previous.status <> 'open' then
    raise exception 'La sesión anterior ya no está abierta';
  end if;
  if p_previous_ended_at < v_previous.started_at or p_new_started_at <= p_previous_ended_at then
    raise exception 'Las horas de resolución no son válidas';
  end if;

  update public.attendance_sessions
  set ended_at = p_previous_ended_at, status = 'completed', auto_closed = true, updated_at = now()
  where id = v_previous.id;

  insert into public.attendance_session_decisions (
    session_id, volunteer_id, day_key, intended_shift_keys, attendance_kind,
    exit_decision, reason_code, explanation, hide_alert,
    decided_by, decided_by_name, decided_by_role, decided_at, source
  ) values (
    v_previous.id, v_previous.volunteer_id, v_previous.day_key, p_previous_shift_keys, 'forgotten_scan',
    'resolved_stale', 'forgotten_checkout', 'Salida pendiente resuelta antes de iniciar una nueva asistencia.', true,
    p_actor_id, p_actor_name, p_actor_role, now(), 'qr_scanner'
  ) on conflict (session_id) do update set
    intended_shift_keys = excluded.intended_shift_keys,
    attendance_kind = excluded.attendance_kind,
    exit_decision = excluded.exit_decision,
    reason_code = excluded.reason_code,
    explanation = excluded.explanation,
    hide_alert = true,
    decided_by = excluded.decided_by,
    decided_by_name = excluded.decided_by_name,
    decided_by_role = excluded.decided_by_role,
    decided_at = excluded.decided_at,
    updated_at = now();

  insert into public.attendance_sessions (
    id, volunteer_id, day_key, started_at, ended_at, status, auto_closed, created_at, updated_at
  ) values (
    p_new_session_id, p_volunteer_id, btrim(p_new_day_key), p_new_started_at, null,
    'open', false, p_new_started_at, p_new_started_at
  ) returning * into v_new;

  insert into public.attendance_session_decisions (
    session_id, volunteer_id, day_key, intended_shift_keys, attendance_kind,
    reason_code, explanation, hide_alert, decided_by, decided_by_name,
    decided_by_role, decided_at, source, idempotency_key
  ) values (
    v_new.id, p_volunteer_id, v_new.day_key, p_new_shift_keys, p_new_attendance_kind,
    'stale_resolved_then_checkin', '', true, p_actor_id, p_actor_name,
    p_actor_role, p_new_started_at, 'qr_scanner', p_idempotency_key
  );

  insert into public.attendance_scan_events (
    event_code, volunteer_id, session_id, day_key, actor_id, actor_name, actor_role, details
  ) values (
    'stale_session_resolved', p_volunteer_id, v_previous.id, v_previous.day_key,
    p_actor_id, p_actor_name, p_actor_role,
    jsonb_build_object('previousEndedAt', p_previous_ended_at, 'newSessionId', v_new.id, 'newDayKey', v_new.day_key)
  );

  insert into public.activity_logs (user_name, user_role, action_type, description, details, target_id)
  values (
    coalesce(nullif(p_actor_name, ''), 'Coordinador'),
    coalesce(nullif(p_actor_role, ''), 'Coordinador'),
    'Resolución de asistencia', 'Cerró una salida pendiente e inició la asistencia actual',
    jsonb_build_object(
      'previousSessionId', v_previous.id, 'previousEndedAt', p_previous_ended_at,
      'newSessionId', v_new.id, 'newDayKey', v_new.day_key,
      'previousShiftKeys', p_previous_shift_keys, 'newShiftKeys', p_new_shift_keys
    )::text,
    p_volunteer_id::text
  );

  return jsonb_build_object('previousSessionId', v_previous.id, 'session', to_jsonb(v_new), 'idempotentReplay', false);
end;
$$;

revoke all on function public.open_attendance_session_with_decision(
  uuid, uuid, text, timestamptz, text[], text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.open_attendance_session_with_decision(
  uuid, uuid, text, timestamptz, text[], text, text, text, text, text, text, text
) to service_role;

revoke all on function public.close_attendance_session_with_decision(
  uuid, uuid, timestamptz, text[], text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.close_attendance_session_with_decision(
  uuid, uuid, timestamptz, text[], text, text, text, text, text, text
) to service_role;

revoke all on function public.resolve_stale_and_open_attendance(
  uuid, uuid, uuid, timestamptz, text, timestamptz, text[], text[], text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.resolve_stale_and_open_attendance(
  uuid, uuid, uuid, timestamptz, text, timestamptz, text[], text[], text, text, text, text, text
) to service_role;

-- Make the new tables and RPC signatures available to PostgREST immediately.
notify pgrst, 'reload schema';
