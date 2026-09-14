-- Merge fully contained closed sessions into one corrected attendance interval.
-- Removed rows remain recoverable from the immutable activity log.
create function public.merge_closed_attendance_sessions(
  p_session_id uuid,
  p_expected_started_at timestamptz,
  p_expected_ended_at timestamptz,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_absorbed_sessions jsonb,
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
  v_absorbed public.attendance_sessions%rowtype;
  v_item jsonb;
  v_update jsonb;
  v_absorbed_id uuid;
  v_absorbed_ids uuid[] := '{}'::uuid[];
  v_removed jsonb := '[]'::jsonb;
  v_shift_id uuid;
  v_count integer;
begin
  select * into v_session from public.attendance_sessions
   where id = p_session_id for update;
  if not found or v_session.status <> 'completed' or v_session.ended_at is null then
    raise exception 'Solo se puede unir una asistencia cerrada.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_session.volunteer_id::text, 0));
  if v_session.started_at is distinct from p_expected_started_at
     or v_session.ended_at is distinct from p_expected_ended_at then
    raise exception 'La asistencia cambió. Actualiza el historial antes de unirla.';
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
  if p_started_at = v_session.started_at and p_ended_at = v_session.ended_at then
    raise exception 'Las horas corregidas son iguales a las actuales.';
  end if;
  if p_absorbed_sessions is null or pg_catalog.jsonb_typeof(p_absorbed_sessions) <> 'array'
     or pg_catalog.jsonb_array_length(p_absorbed_sessions) = 0 then
    raise exception 'Selecciona las asistencias cerradas que se van a unir.';
  end if;
  if p_reliability_score is null or p_reliability_score < 0 or p_reliability_score > 100 then
    raise exception 'La confiabilidad calculada no es válida.';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_absorbed_sessions) loop
    v_absorbed_id := (v_item->>'id')::uuid;
    if v_absorbed_id is null or v_absorbed_id = p_session_id
       or v_absorbed_id = any(v_absorbed_ids) then
      raise exception 'Hay una asistencia duplicada o inválida para unir.';
    end if;
    select * into v_absorbed from public.attendance_sessions
     where id = v_absorbed_id for update;
    if not found or v_absorbed.volunteer_id <> v_session.volunteer_id
       or v_absorbed.day_key <> v_session.day_key
       or v_absorbed.status <> 'completed' or v_absorbed.ended_at is null
       or v_absorbed.started_at is distinct from (v_item->>'started_at')::timestamptz
       or v_absorbed.ended_at is distinct from (v_item->>'ended_at')::timestamptz then
      raise exception 'Una asistencia cambió. Actualiza el historial antes de unirla.';
    end if;
    if v_absorbed.started_at < p_started_at or v_absorbed.ended_at > p_ended_at then
      raise exception 'Solo se pueden unir asistencias totalmente cubiertas por el horario corregido.';
    end if;
    v_absorbed_ids := pg_catalog.array_append(v_absorbed_ids, v_absorbed_id);
    v_removed := v_removed || pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(v_absorbed));
  end loop;

  if exists (
    select 1 from public.attendance_sessions other
     where other.volunteer_id = v_session.volunteer_id
       and other.id <> p_session_id and other.id <> all(v_absorbed_ids)
       and other.started_at < p_ended_at
       and coalesce(other.ended_at, now()) > p_started_at
  ) then
    raise exception 'Hay otra asistencia solapada. Actualiza el historial antes de unirla.';
  end if;

  delete from public.attendance_sessions where id = any(v_absorbed_ids);
  get diagnostics v_count = row_count;
  if v_count <> pg_catalog.array_length(v_absorbed_ids, 1) then
    raise exception 'Una asistencia cambió. Actualiza el historial antes de unirla.';
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
    get diagnostics v_count = row_count;
    if v_count <> 1 then raise exception 'Un turno afectado cambió. Actualiza el historial.'; end if;
  end loop;
  update public.volunteers set reliability_score = p_reliability_score
   where id = v_session.volunteer_id;
  if not found then raise exception 'No se encontró el voluntario.'; end if;

  insert into public.activity_logs
    (user_name, user_role, action_type, description, target_id, details)
  values
    (p_actor_name, p_actor_role, 'Corrección de asistencia',
     'Unió asistencias cerradas en una jornada continua', v_session.volunteer_id::text,
     pg_catalog.jsonb_build_object(
       'sessionId', v_session.id, 'volunteerId', v_session.volunteer_id,
       'adminId', p_actor_id, 'reason', btrim(p_reason),
       'previousStartedAt', p_expected_started_at,
       'previousEndedAt', p_expected_ended_at,
       'newStartedAt', p_started_at, 'newEndedAt', p_ended_at,
       'absorbedSessions', v_removed,
       'updatedShifts', p_shift_updates,
       'changes', pg_catalog.jsonb_build_array(
         pg_catalog.jsonb_build_object('field', 'started_at', 'label', 'Entrada', 'oldValue', p_expected_started_at, 'newValue', p_started_at),
         pg_catalog.jsonb_build_object('field', 'ended_at', 'label', 'Salida', 'oldValue', p_expected_ended_at, 'newValue', p_ended_at)
       ),
       'context', pg_catalog.jsonb_build_object('summary', btrim(p_reason))
     )::text);
  return v_session;
end;
$$;

revoke all on function public.merge_closed_attendance_sessions(uuid, timestamptz, timestamptz, timestamptz, timestamptz, jsonb, text, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.merge_closed_attendance_sessions(uuid, timestamptz, timestamptz, timestamptz, timestamptz, jsonb, text, text, text, text, jsonb, integer) to service_role;
