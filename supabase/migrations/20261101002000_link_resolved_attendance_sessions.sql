alter table public.attendance_review_resolutions
  add column if not exists resolved_session_id uuid;

comment on column public.attendance_review_resolutions.resolved_session_id is
  'Sesión que quedó vigente después de corregir, fusionar o eliminar un escaneo duplicado.';

create index if not exists attendance_review_resolutions_resolved_session_idx
  on public.attendance_review_resolutions (resolved_session_id)
  where hide_alert = true and resolved_session_id is not null;

-- Link earlier resolutions to the surviving session using the corrected interval.
update public.attendance_review_resolutions resolution
set resolved_session_id = (
  select session.id
  from public.attendance_sessions session
  where session.volunteer_id = resolution.volunteer_id
    and session.day_key = resolution.day_key
    and session.started_at = resolution.resolved_started_at
    and session.ended_at is not distinct from resolution.resolved_ended_at
  order by session.id
  limit 1
)
where resolution.resolved_session_id is null
  and exists (
    select 1
    from public.attendance_sessions session
    where session.volunteer_id = resolution.volunteer_id
      and session.day_key = resolution.day_key
      and session.started_at = resolution.resolved_started_at
      and session.ended_at is not distinct from resolution.resolved_ended_at
  );

create or replace function public.apply_attendance_audit_batch(
  p_operations jsonb,
  p_resolutions jsonb,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_op jsonb;
  v_resolution jsonb;
  v_session public.attendance_sessions%rowtype;
  v_expected_end timestamptz;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_new_day_key text;
  v_rows integer;
  v_updated integer := 0;
  v_deleted integer := 0;
  v_reviewed integer := 0;
begin
  if jsonb_typeof(p_operations) <> 'array' or jsonb_typeof(p_resolutions) <> 'array' then
    raise exception 'Las operaciones y resoluciones deben ser arreglos JSON.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_operations) item
    group by item->>'session_id'
    having count(*) > 1
  ) then
    raise exception 'Una sesión no puede tener dos operaciones en el mismo lote.';
  end if;

  for v_op in select value from pg_catalog.jsonb_array_elements(p_operations) loop
    select * into v_session
    from public.attendance_sessions
    where id = (v_op->>'session_id')::uuid
    for update;

    if not found then
      raise exception 'La sesión % ya no existe.', v_op->>'session_id';
    end if;

    v_expected_end := nullif(v_op->>'expected_ended_at', '')::timestamptz;
    if v_session.started_at is distinct from (v_op->>'expected_started_at')::timestamptz
       or v_session.ended_at is distinct from v_expected_end
       or v_session.day_key is distinct from v_op->>'expected_day_key'
       or v_session.status is distinct from v_op->>'expected_status' then
      raise exception 'La sesión % cambió después de la auditoría.', v_session.id;
    end if;
  end loop;

  for v_op in
    select value from pg_catalog.jsonb_array_elements(p_operations)
    where value->>'type' = 'delete'
  loop
    delete from public.attendance_sessions
    where id = (v_op->>'session_id')::uuid;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'No se pudo eliminar la sesión %.', v_op->>'session_id'; end if;
    v_deleted := v_deleted + 1;
  end loop;

  for v_op in
    select value from pg_catalog.jsonb_array_elements(p_operations)
    where value->>'type' = 'update'
  loop
    v_new_start := (v_op->>'new_started_at')::timestamptz;
    v_new_end := (v_op->>'new_ended_at')::timestamptz;
    v_new_day_key := v_op->>'new_day_key';
    if v_new_start is null or v_new_end is null or v_new_end <= v_new_start
       or v_new_end - v_new_start > interval '18 hours' then
      raise exception 'Intervalo corregido inválido para la sesión %.', v_op->>'session_id';
    end if;

    update public.attendance_sessions
    set day_key = v_new_day_key,
        started_at = v_new_start,
        ended_at = v_new_end,
        status = 'completed',
        auto_closed = false,
        updated_at = now()
    where id = (v_op->>'session_id')::uuid;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'No se pudo actualizar la sesión %.', v_op->>'session_id'; end if;
    v_updated := v_updated + 1;
  end loop;

  for v_op in
    select value from pg_catalog.jsonb_array_elements(p_operations)
    where value->>'type' = 'update'
  loop
    select * into v_session
    from public.attendance_sessions
    where id = (v_op->>'session_id')::uuid;
    if exists (
      select 1 from public.attendance_sessions other
      where other.volunteer_id = v_session.volunteer_id
        and other.id <> v_session.id
        and other.started_at < v_session.ended_at
        and coalesce(other.ended_at, now()) > v_session.started_at
    ) then
      raise exception 'La sesión corregida % se solapa con otra asistencia.', v_session.id;
    end if;
  end loop;

  for v_resolution in select value from pg_catalog.jsonb_array_elements(p_resolutions) loop
    insert into public.attendance_review_resolutions (
      session_id, resolved_session_id, volunteer_id, day_key, decision, explanation, correction,
      hide_alert, reviewed_by, reviewed_at, resolution_status,
      original_started_at, original_ended_at, resolved_started_at, resolved_ended_at,
      applied_at, updated_at
    ) values (
      (v_resolution->>'session_id')::uuid,
      nullif(v_resolution->>'resolved_session_id', '')::uuid,
      (v_resolution->>'volunteer_id')::uuid,
      v_resolution->>'day_key',
      v_resolution->>'decision',
      coalesce(v_resolution->>'explanation', ''),
      coalesce(v_resolution->>'correction', ''),
      coalesce((v_resolution->>'hide_alert')::boolean, false),
      nullif(v_resolution->>'reviewed_by', ''),
      nullif(v_resolution->>'reviewed_at', '')::date,
      coalesce(v_resolution->>'resolution_status', 'reviewed'),
      nullif(v_resolution->>'original_started_at', '')::timestamptz,
      nullif(v_resolution->>'original_ended_at', '')::timestamptz,
      nullif(v_resolution->>'resolved_started_at', '')::timestamptz,
      nullif(v_resolution->>'resolved_ended_at', '')::timestamptz,
      now(), now()
    )
    on conflict (session_id) do update set
      resolved_session_id = excluded.resolved_session_id,
      volunteer_id = excluded.volunteer_id,
      day_key = excluded.day_key,
      decision = excluded.decision,
      explanation = excluded.explanation,
      correction = excluded.correction,
      hide_alert = excluded.hide_alert,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at,
      resolution_status = excluded.resolution_status,
      original_started_at = excluded.original_started_at,
      original_ended_at = excluded.original_ended_at,
      resolved_started_at = excluded.resolved_started_at,
      resolved_ended_at = excluded.resolved_ended_at,
      applied_at = now(),
      updated_at = now();

    insert into public.activity_logs (
      user_name, user_role, action_type, description, target_id, details
    ) values (
      p_actor_name,
      p_actor_role,
      'Auditoría de asistencia',
      'Aplicó una decisión documentada de la auditoría de asistencias',
      v_resolution->>'volunteer_id',
      pg_catalog.jsonb_build_object(
        'sessionId', v_resolution->>'session_id',
        'resolvedSessionId', v_resolution->>'resolved_session_id',
        'caseId', v_resolution->>'case_id',
        'adminId', p_actor_id,
        'decision', v_resolution->>'decision',
        'explanation', v_resolution->>'explanation',
        'correction', v_resolution->>'correction',
        'resolutionStatus', v_resolution->>'resolution_status',
        'originalStartedAt', v_resolution->>'original_started_at',
        'originalEndedAt', v_resolution->>'original_ended_at',
        'resolvedStartedAt', v_resolution->>'resolved_started_at',
        'resolvedEndedAt', v_resolution->>'resolved_ended_at'
      )::text
    );
    v_reviewed := v_reviewed + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'updated', v_updated,
    'deleted', v_deleted,
    'reviewed', v_reviewed
  );
end;
$$;

revoke all on function public.apply_attendance_audit_batch(jsonb, jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_attendance_audit_batch(jsonb, jsonb, text, text, text)
  to service_role;
