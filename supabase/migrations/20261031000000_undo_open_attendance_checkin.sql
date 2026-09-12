-- Undo an accidental open check-in atomically. Preserve the original session
-- and shift values in the immutable activity log before removing the session.
create or replace function public.undo_open_attendance_checkin(
  p_volunteer_id uuid,
  p_day_key text,
  p_shift_key text,
  p_session_id uuid,
  p_expected_started_at timestamptz,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_shift_updates jsonb,
  p_reliability_score integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_target public.shifts%rowtype;
  v_update jsonb;
  v_shift_id uuid;
  v_shift_count integer;
  v_previous_shifts jsonb := '[]'::jsonb;
  v_removed_session jsonb := null;
begin
  if p_volunteer_id is null or p_day_key is null or p_shift_key is null then
    raise exception 'Falta identificar el turno que se va a revertir.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_volunteer_id::text, 0));
  select * into v_target from public.shifts
   where volunteer_id = p_volunteer_id and day_key = p_day_key and shift_key = p_shift_key
   for update;
  if not found then raise exception 'No se encontró el turno indicado.'; end if;

  if p_session_id is not null then
    select * into v_session from public.attendance_sessions
     where id = p_session_id and volunteer_id = p_volunteer_id and day_key = p_day_key
     for update;
    if not found or v_session.status <> 'open' or v_session.started_at is distinct from p_expected_started_at then
      raise exception 'La asistencia abierta cambió. Actualiza el historial antes de deshacerla.';
    end if;
    v_removed_session := pg_catalog.to_jsonb(v_session);
  elsif not (coalesce(v_target.checked_in, false) or v_target.checked_in_at is not null)
     or coalesce(v_target.checked_out, false) or v_target.checked_out_at is not null then
    raise exception 'El turno ya no tiene una entrada abierta. Actualiza el historial.';
  end if;

  if p_shift_updates is null or pg_catalog.jsonb_typeof(p_shift_updates) <> 'array'
     or pg_catalog.jsonb_array_length(p_shift_updates) = 0 then
    raise exception 'No se identificaron turnos afectados.';
  end if;
  if p_reliability_score is null or p_reliability_score < 0 or p_reliability_score > 100 then
    raise exception 'La confiabilidad calculada no es válida.';
  end if;

  for v_update in select value from pg_catalog.jsonb_array_elements(p_shift_updates) loop
    v_shift_id := (v_update->>'id')::uuid;
    if v_shift_id is null or exists (
      select 1 from pg_catalog.jsonb_array_elements(v_previous_shifts) previous
       where (previous->>'id')::uuid = v_shift_id
    ) then raise exception 'Hay un turno afectado inválido o duplicado.'; end if;
    select v_previous_shifts || pg_catalog.to_jsonb(s) into v_previous_shifts
      from public.shifts s
     where s.id = v_shift_id and s.volunteer_id = p_volunteer_id and s.day_key = p_day_key
     for update;
    if not found then raise exception 'Un turno afectado cambió. Actualiza el historial.'; end if;
  end loop;
  if not exists (
    select 1 from pg_catalog.jsonb_array_elements(p_shift_updates) item
     where (item->>'id')::uuid = v_target.id
  ) then raise exception 'El turno seleccionado no figura entre los afectados.'; end if;

  if p_session_id is not null then
    delete from public.attendance_sessions where id = p_session_id;
  end if;
  for v_update in select value from pg_catalog.jsonb_array_elements(p_shift_updates) loop
    update public.shifts
       set checked_in = (v_update->>'checked_in')::boolean,
           checked_in_at = (v_update->>'checked_in_at')::timestamptz,
           checked_out = (v_update->>'checked_out')::boolean,
           checked_out_at = (v_update->>'checked_out_at')::timestamptz
     where id = (v_update->>'id')::uuid and volunteer_id = p_volunteer_id and day_key = p_day_key;
    get diagnostics v_shift_count = row_count;
    if v_shift_count <> 1 then raise exception 'Un turno afectado cambió. Actualiza el historial.'; end if;
  end loop;
  update public.volunteers set reliability_score = p_reliability_score where id = p_volunteer_id;
  if not found then raise exception 'No se encontró el voluntario.'; end if;

  insert into public.activity_logs
    (user_name, user_role, action_type, description, target_id, details)
  values
    (p_actor_name, p_actor_role, 'Deshacer',
     'Revirtió una entrada (Check-in) abierta', p_volunteer_id::text,
     pg_catalog.jsonb_build_object(
       'volunteerId', p_volunteer_id, 'dayKey', p_day_key, 'shiftKey', p_shift_key,
       'adminId', p_actor_id, 'removedSession', v_removed_session,
       'previousShifts', v_previous_shifts, 'updatedShifts', p_shift_updates
     )::text);
  return pg_catalog.jsonb_build_object('removedSession', v_removed_session);
end;
$$;

revoke all on function public.undo_open_attendance_checkin(uuid, text, text, uuid, timestamptz, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.undo_open_attendance_checkin(uuid, text, text, uuid, timestamptz, text, text, text, jsonb, integer) to service_role;
