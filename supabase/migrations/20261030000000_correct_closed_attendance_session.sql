-- A correction is one transaction: retain the original check-in/out events,
-- append their previous values to the audit trail, and update affected totals.
create or replace function public.correct_closed_attendance_session(
  p_session_id uuid,
  p_expected_started_at timestamptz,
  p_expected_ended_at timestamptz,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_reason text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_shift_updates jsonb,
  p_reliability_score integer
)
returns public.attendance_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_update jsonb;
  v_shift_id uuid;
  v_shift_count integer;
begin
  select * into v_session from public.attendance_sessions
  where id = p_session_id for update;
  if not found or v_session.status <> 'completed' then
    raise exception 'Solo se puede corregir una asistencia cerrada.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_session.volunteer_id::text, 0));
  if v_session.started_at is distinct from p_expected_started_at
     or v_session.ended_at is distinct from p_expected_ended_at then
    raise exception 'La asistencia cambió. Actualiza el historial antes de corregirla.';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'El motivo debe tener al menos 5 caracteres.';
  end if;
  if p_started_at is null or p_ended_at is null
     or p_started_at > now() or p_ended_at > now()
     or p_ended_at - p_started_at < interval '5 minutes'
     or p_ended_at - p_started_at > interval '18 hours' then
    raise exception 'La duración corregida debe estar entre 5 minutos y 18 horas, sin horas futuras.';
  end if;
  if (p_started_at at time zone 'America/Guatemala')::date
      is distinct from (v_session.started_at at time zone 'America/Guatemala')::date then
    raise exception 'La entrada corregida debe pertenecer al día original.';
  end if;
  if exists (
    select 1 from public.attendance_sessions other
    where other.volunteer_id = v_session.volunteer_id and other.id <> v_session.id
      and other.started_at < p_ended_at
      and coalesce(other.ended_at, now()) > p_started_at
  ) then
    raise exception 'El horario corregido se solapa con otra asistencia. Corrige la sesión correspondiente.';
  end if;
  if p_started_at = v_session.started_at and p_ended_at = v_session.ended_at then
    raise exception 'Las horas corregidas son iguales a las actuales.';
  end if;
  if p_reliability_score is null or p_reliability_score < 0 or p_reliability_score > 100 then
    raise exception 'La confiabilidad calculada no es válida.';
  end if;

  update public.attendance_sessions
     set started_at = p_started_at, ended_at = p_ended_at,
         auto_closed = false, updated_at = now()
   where id = p_session_id returning * into v_session;

  for v_update in select value from pg_catalog.jsonb_array_elements(p_shift_updates) loop
    v_shift_id := (v_update->>'id')::uuid;
    update public.shifts
       set checked_in = (v_update->>'checked_in')::boolean,
           checked_in_at = (v_update->>'checked_in_at')::timestamptz,
           checked_out = (v_update->>'checked_out')::boolean,
           checked_out_at = (v_update->>'checked_out_at')::timestamptz
     where id = v_shift_id and volunteer_id = v_session.volunteer_id
       and day_key = v_session.day_key;
    get diagnostics v_shift_count = row_count;
    if v_shift_count <> 1 then raise exception 'Un turno afectado cambió. Actualiza el historial.'; end if;
  end loop;

  update public.volunteers set reliability_score = p_reliability_score
   where id = v_session.volunteer_id;

  insert into public.activity_logs
    (user_name, user_role, action_type, description, target_id, details)
  values
    (p_actor_name, p_actor_role, 'Corrección de asistencia',
     'Corrigió la entrada o salida de una asistencia cerrada',
     v_session.volunteer_id::text,
     pg_catalog.jsonb_build_object(
       'sessionId', v_session.id, 'volunteerId', v_session.volunteer_id,
       'adminId', p_actor_id, 'reason', btrim(p_reason),
       'previousStartedAt', p_expected_started_at,
       'previousEndedAt', p_expected_ended_at,
       'newStartedAt', p_started_at, 'newEndedAt', p_ended_at,
       'changes', pg_catalog.jsonb_build_array(
         pg_catalog.jsonb_build_object('field', 'started_at', 'label', 'Entrada', 'oldValue', p_expected_started_at, 'newValue', p_started_at),
         pg_catalog.jsonb_build_object('field', 'ended_at', 'label', 'Salida', 'oldValue', p_expected_ended_at, 'newValue', p_ended_at)
       ),
       'context', pg_catalog.jsonb_build_object('summary', btrim(p_reason))
     )::text);
  return v_session;
end;
$$;

revoke all on function public.correct_closed_attendance_session(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.correct_closed_attendance_session(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, jsonb, integer) to service_role;
