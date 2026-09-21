-- Backfill the exact 44 reviewed attendance resolutions into the session-decision model.
-- This migration only writes attendance_session_decisions. It deliberately does
-- not update attendance_sessions, shifts, or attendance_review_resolutions.
--
-- The reviewed batch contains 43 links to live sessions. Two reviewed source
-- rows converge on one surviving session, so they produce 42 session decisions.
-- One accidental source session was deleted and remains traceable in
-- attendance_review_resolutions with resolved_session_id = null.

alter table public.attendance_session_decisions
  add column if not exists source_resolution_ids uuid[] not null default '{}'::uuid[];

alter table public.attendance_session_decisions
  add column if not exists source_case_ids text[] not null default '{}'::text[];

comment on column public.attendance_session_decisions.source_resolution_ids is
  'Resoluciones históricas que justifican esta decisión de sesión.';

comment on column public.attendance_session_decisions.source_case_ids is
  'Identificadores visibles de los casos de auditoría que originaron la decisión.';

drop table if exists pg_temp._attendance_audit_sources_202609;
create temporary table _attendance_audit_sources_202609 (
  source_session_id uuid primary key,
  case_id text not null unique,
  volunteer_id uuid not null,
  day_key text not null,
  resolved_session_id uuid
);

insert into pg_temp._attendance_audit_sources_202609 (
  source_session_id, case_id, volunteer_id, day_key, resolved_session_id
) values
  (
    '04e5c653-2a6a-4d24-b224-fbe728aa7f2d'::uuid, 'ASI-032', '16689847-ff9f-445d-83e9-d7cc86d630fc'::uuid, 'lun 14',
    '04e5c653-2a6a-4d24-b224-fbe728aa7f2d'::uuid
  ),
  (
    '05183e14-6651-4e02-8ce0-7db3e68651d6'::uuid, 'ASI-027', '47c409cf-9480-42b0-9c1c-74bfe6157f14'::uuid, 'lun 14',
    '05183e14-6651-4e02-8ce0-7db3e68651d6'::uuid
  ),
  (
    '0d7a4c9b-b6d1-4d79-8efc-d3812f76cb4c'::uuid, 'ASI-049', '9cc9f0fd-3b9e-4e5f-8cbd-6587d29bdbff'::uuid, 'sáb 12',
    '0d7a4c9b-b6d1-4d79-8efc-d3812f76cb4c'::uuid
  ),
  (
    '119bdfa5-631c-4967-81d0-b22f9af93c36'::uuid, 'ASI-029', 'd1342418-7cf9-4d33-8e24-21fbbee0abe1'::uuid, 'lun 14',
    '119bdfa5-631c-4967-81d0-b22f9af93c36'::uuid
  ),
  (
    '15d243c8-0c1b-4730-90d8-3998f852d751'::uuid, 'ASI-045', '00de3a2f-2ee4-4a9f-9273-32e2a699bf8b'::uuid, 'sáb 12',
    '15d243c8-0c1b-4730-90d8-3998f852d751'::uuid
  ),
  (
    '1a9a8780-1492-41ba-8da7-7c5ceef6e2f3'::uuid, 'ASI-054', '2fa86313-078b-4f7b-8e64-9ee87c580bbe'::uuid, 'vie 11',
    '1a9a8780-1492-41ba-8da7-7c5ceef6e2f3'::uuid
  ),
  (
    '1d6865ea-66d6-415f-92b5-ae2b1c5effa0'::uuid, 'ASI-031', 'a454a749-2ba2-4b14-8a1b-f41964978a4f'::uuid, 'lun 14',
    '1d6865ea-66d6-415f-92b5-ae2b1c5effa0'::uuid
  ),
  (
    '1f2a5c27-c03d-4f57-8f83-a4dc2a872a6d'::uuid, 'ASI-021', '8bbd9344-19be-4de8-8ecf-418a42915534'::uuid, 'lun 14',
    '1f2a5c27-c03d-4f57-8f83-a4dc2a872a6d'::uuid
  ),
  (
    '2a0cb363-677d-4a62-ac13-824ae437f43d'::uuid, 'ASI-023', 'cda23ae9-6cc2-4026-b844-e2ab2583c412'::uuid, 'lun 14',
    '2a0cb363-677d-4a62-ac13-824ae437f43d'::uuid
  ),
  (
    '2bb99e08-00cb-4515-8f54-5340e3f8b5e6'::uuid, 'ASI-042', 'd57bd3d3-11db-4398-a344-f8b09ac0fff2'::uuid, 'sáb 12',
    '7966aa3f-f0bf-4235-9beb-af4fedf02231'::uuid
  ),
  (
    '2dde6994-6bdc-48b6-8141-038b36f8aa42'::uuid, 'ASI-040', '80e38f21-5b1f-46c5-a6df-e4950c8e82c6'::uuid, 'lun 14',
    '2dde6994-6bdc-48b6-8141-038b36f8aa42'::uuid
  ),
  (
    '3e51d16b-5d67-42a6-b59f-cc81220bbf85'::uuid, 'ASI-043', 'ae840bb2-3294-4a24-93cc-2ddcd595dcb4'::uuid, 'sáb 12',
    '3e51d16b-5d67-42a6-b59f-cc81220bbf85'::uuid
  ),
  (
    '46cf378d-3905-4c8c-b3d2-aee486057273'::uuid, 'ASI-061', '4e1d8d70-b9c8-466c-974a-2e743b60df36'::uuid, 'jue 10',
    '51a9cc83-abb7-40be-ab79-08a9224dec4b'::uuid
  ),
  (
    '47769ef1-bf94-4b58-a5da-d179d1eb5b0b'::uuid, 'ASI-022', 'addf895d-878c-4c21-9891-cb2c7f814cbb'::uuid, 'lun 14',
    '47769ef1-bf94-4b58-a5da-d179d1eb5b0b'::uuid
  ),
  (
    '4842f392-dda5-4c58-951b-c489a0af50bb'::uuid, 'ASI-025', '82b73111-9fff-4f73-a42c-667d78bfa6fa'::uuid, 'lun 14',
    '8d7d7dca-676e-4141-9df3-9753ada02c35'::uuid
  ),
  (
    '49503268-72e9-43de-b92e-c664d298ce75'::uuid, 'ASI-041', '5153f5b8-6a17-4b54-b67c-9168dac90faa'::uuid, 'sáb 12',
    'dcdfdb64-729b-4e69-921d-e7a76a7a1076'::uuid
  ),
  (
    '49816226-b787-4085-9329-06ec0e0d913e'::uuid, 'ASI-058', '0ca862e2-c950-42e0-b48d-efc54402a514'::uuid, 'jue 10',
    '49816226-b787-4085-9329-06ec0e0d913e'::uuid
  ),
  (
    '4f0c90cc-746d-4282-be00-cc4296788fe8'::uuid, 'ASI-034', '6c4837ab-122c-4ee8-b388-96a0a9a476ec'::uuid, 'lun 14',
    '4f0c90cc-746d-4282-be00-cc4296788fe8'::uuid
  ),
  (
    '517abdaa-f4a2-48c8-b245-96fc9f472f44'::uuid, 'ASI-039', 'e1a00c57-ac52-438b-a9ae-c7c5091b44f0'::uuid, 'lun 14',
    '517abdaa-f4a2-48c8-b245-96fc9f472f44'::uuid
  ),
  (
    '6344ff23-f17d-42a5-9aa2-c12e14d3cb07'::uuid, 'ASI-048', '21fef061-6381-42e3-abc0-910b033a9f80'::uuid, 'sáb 12',
    '6344ff23-f17d-42a5-9aa2-c12e14d3cb07'::uuid
  ),
  (
    '6ac2e6f4-b903-4a31-9812-e42e571a3df5'::uuid, 'ASI-055', 'b5764b78-33cb-48a4-bc08-7f15e1fe42a8'::uuid, 'vie 11',
    '6ac2e6f4-b903-4a31-9812-e42e571a3df5'::uuid
  ),
  (
    '6bcbc660-cf17-43ad-a333-fbca2877c8c1'::uuid, 'ASI-037', '55279f01-a4f4-44ed-8de9-d739f5093957'::uuid, 'lun 14',
    '6bcbc660-cf17-43ad-a333-fbca2877c8c1'::uuid
  ),
  (
    '6cb5ed69-2874-48f9-8aa1-fc0ebaefc1c7'::uuid, 'ASI-033', '7e4ed5d5-d884-411e-a5d2-58cf0f29b385'::uuid, 'lun 14',
    '9b8e4ee2-a5b2-4c71-8d53-df12f16eeffc'::uuid
  ),
  (
    '6db84ae1-cec3-4c1a-be71-609aaad3ecf8'::uuid, 'ASI-030', 'f5d4e535-be8d-41bd-9620-5d4d4bd8f3ef'::uuid, 'lun 14',
    '6db84ae1-cec3-4c1a-be71-609aaad3ecf8'::uuid
  ),
  (
    '6ef05eb8-0a7f-45f7-a363-2dc22a0a721a'::uuid, 'ASI-036', '5ecdd2cb-8965-40fc-90f9-0f55513f19f7'::uuid, 'lun 14',
    '7e4ad187-bf21-4efc-ba35-45ef247a3fdc'::uuid
  ),
  (
    '80a4d37c-ae04-490c-a3c1-fb4a9d56721c'::uuid, 'ASI-024', 'ac328779-4326-4807-a010-c09df5606faf'::uuid, 'lun 14',
    '80a4d37c-ae04-490c-a3c1-fb4a9d56721c'::uuid
  ),
  (
    '8302a2f5-b54f-45a8-adf2-41a8f749a28b'::uuid, 'ASI-038', '55d39ccc-6119-4f96-bb74-5700c5141ccb'::uuid, 'lun 14',
    '8302a2f5-b54f-45a8-adf2-41a8f749a28b'::uuid
  ),
  (
    '8866c6f3-85af-46f3-8270-90e5741c514d'::uuid, 'ASI-050', '4e1d8d70-b9c8-466c-974a-2e743b60df36'::uuid, 'sáb 12',
    '8866c6f3-85af-46f3-8270-90e5741c514d'::uuid
  ),
  (
    '89aa45e4-04c1-445d-ae3e-1019f1607074'::uuid, 'ASI-035', 'b8211508-a7aa-4ce2-bc75-98fb8e64554b'::uuid, 'lun 14',
    '59fca870-5afc-445a-85cf-684ef9dd4b06'::uuid
  ),
  (
    '9a847cf6-a9d8-4ca0-9487-a878bbfa190c'::uuid, 'ASI-057', 'b712bd4e-4372-4ebb-8c36-de426a14c066'::uuid, 'vie 11',
    '9e7b6909-b6d9-48cb-a3dc-8f540de6e606'::uuid
  ),
  (
    '9be300bd-cf55-4101-be5f-f45e571a1e9c'::uuid, 'ASI-051', 'da538a1c-26b7-43e9-8e0f-895fb623ddf1'::uuid, 'vie 11',
    '9be300bd-cf55-4101-be5f-f45e571a1e9c'::uuid
  ),
  (
    '9cc7a31a-e81e-42ef-84d4-e238c0aa956b'::uuid, 'ASI-026', 'd23d2170-a23f-44e9-81fd-c2b76744c97c'::uuid, 'lun 14',
    'cb84e3d0-3228-43d5-8f7f-fb4a6a28454e'::uuid
  ),
  (
    '9d8c41cb-8791-45fc-8d4c-7b455ad41136'::uuid, 'ASI-060', '5ca4a68d-c81d-4549-abcb-2a44df35745d'::uuid, 'jue 10',
    '9d8c41cb-8791-45fc-8d4c-7b455ad41136'::uuid
  ),
  (
    '9eb58018-d8ea-438a-9bff-03e458c7f5dd'::uuid, 'ASI-062', 'ad110571-56e1-42d0-91fd-28fb831440d8'::uuid, 'jue 10',
    '9eb58018-d8ea-438a-9bff-03e458c7f5dd'::uuid
  ),
  (
    'a0830ad7-488a-4366-9139-d6b624631f1d'::uuid, 'ASI-052', 'b2623e1e-f851-4432-b31f-1f6fc3d3fae2'::uuid, 'vie 11',
    'a0830ad7-488a-4366-9139-d6b624631f1d'::uuid
  ),
  (
    'a48a42bf-4d06-410f-92eb-05a636602427'::uuid, 'ASI-103', '731746a6-9a42-4ca9-9be8-30d6cc7489dc'::uuid, 'sáb 5',
    '71901497-1b31-499e-b99c-1a6ddc5d21b0'::uuid
  ),
  (
    'ac38aad7-b7be-44bd-9760-7b28b645ed1e'::uuid, 'ASI-046', '00de3a2f-2ee4-4a9f-9273-32e2a699bf8b'::uuid, 'sáb 12',
    '15d243c8-0c1b-4730-90d8-3998f852d751'::uuid
  ),
  (
    'c0208122-27a3-45ab-8e6b-666fc45e0aad'::uuid, 'ASI-056', '445498d4-e083-4366-ab80-60b51936cc9a'::uuid, 'vie 11',
    'c0208122-27a3-45ab-8e6b-666fc45e0aad'::uuid
  ),
  (
    'c39e2248-3b51-41c3-b482-ea8368343b56'::uuid, 'ASI-028', '3f5abdb0-d69a-40af-8083-b0495f47bfdd'::uuid, 'lun 14',
    '4820be35-f563-40e4-9e36-409e2828202d'::uuid
  ),
  (
    'e30626fa-e7ad-431e-a1c8-c66ff04ac927'::uuid, 'ASI-102', '19f61086-2e54-4426-9916-68f843f291dd'::uuid, 'vie 14',
    null::uuid
  ),
  (
    'e4302122-fdad-4afa-9dd0-93e7b0870e8b'::uuid, 'ASI-053', 'd89c19c5-236a-4051-ac3f-512a6e1f3115'::uuid, 'vie 11',
    'e4302122-fdad-4afa-9dd0-93e7b0870e8b'::uuid
  ),
  (
    'ef3bd754-226a-4529-be31-5cd081872406'::uuid, 'ASI-044', 'ff6be90f-1a1c-45fa-afc4-32dee9780a4d'::uuid, 'sáb 12',
    'ef3bd754-226a-4529-be31-5cd081872406'::uuid
  ),
  (
    'fa92248a-1261-4b78-b737-04f78ee8a6a4'::uuid, 'ASI-059', '744c6274-39d2-4c90-966d-54f41a58ee99'::uuid, 'jue 10',
    'fa92248a-1261-4b78-b737-04f78ee8a6a4'::uuid
  ),
  (
    'fdaaf6f0-5962-4b73-9711-5519d7cd0e5e'::uuid, 'ASI-047', 'f418fbb4-75dc-4e80-9c3d-d4046f46004a'::uuid, 'sáb 12',
    'fdaaf6f0-5962-4b73-9711-5519d7cd0e5e'::uuid
  );

drop table if exists pg_temp._attendance_audit_decisions_202609;
create temporary table _attendance_audit_decisions_202609 (
  session_id uuid primary key,
  volunteer_id uuid not null,
  day_key text not null,
  intended_shift_keys text[] not null,
  attendance_kind text not null,
  exit_decision text not null,
  reason_code text not null,
  explanation text not null,
  hide_alert boolean not null,
  decided_by text not null,
  decided_by_name text not null,
  decided_by_role text not null,
  decided_at timestamptz not null,
  source text not null,
  idempotency_key text not null unique,
  source_resolution_ids uuid[] not null,
  source_case_ids text[] not null
);

insert into pg_temp._attendance_audit_decisions_202609 (
  session_id, volunteer_id, day_key, intended_shift_keys,
  attendance_kind, exit_decision, reason_code, explanation, hide_alert,
  decided_by, decided_by_name, decided_by_role, decided_at,
  source, idempotency_key, source_resolution_ids, source_case_ids
) values
  (
    '04e5c653-2a6a-4d24-b224-fbe728aa7f2d'::uuid, '16689847-ff9f-445d-83e9-d7cc86d630fc'::uuid, 'lun 14', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Hizo el turno 4 dentro de las horas oficiales, el escaneo lo hicieron mal | Marcar turno 4 entrada y salida en base a las horas oficiales', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:04e5c653-2a6a-4d24-b224-fbe728aa7f2d', array['04e5c653-2a6a-4d24-b224-fbe728aa7f2d'::uuid]::uuid[], array['ASI-032']::text[]
  ),
  (
    '05183e14-6651-4e02-8ce0-7db3e68651d6'::uuid, '47c409cf-9480-42b0-9c1c-74bfe6157f14'::uuid, 'lun 14', array['T1']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'No se marco la hora de salida del Turno 1, salio a las 12:00 PM', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:05183e14-6651-4e02-8ce0-7db3e68651d6', array['05183e14-6651-4e02-8ce0-7db3e68651d6'::uuid]::uuid[], array['ASI-027']::text[]
  ),
  (
    '0d7a4c9b-b6d1-4d79-8efc-d3812f76cb4c'::uuid, '9cc9f0fd-3b9e-4e5f-8cbd-6587d29bdbff'::uuid, 'sáb 12', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entro tarde al Turno 4 y salio temprano', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:0d7a4c9b-b6d1-4d79-8efc-d3812f76cb4c', array['0d7a4c9b-b6d1-4d79-8efc-d3812f76cb4c'::uuid]::uuid[], array['ASI-049']::text[]
  ),
  (
    '119bdfa5-631c-4967-81d0-b22f9af93c36'::uuid, 'd1342418-7cf9-4d33-8e24-21fbbee0abe1'::uuid, 'lun 14', array['T3']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'No hizo turno 4, solo el turno 3 | Marcar solamente turno 3, entrada a las 2:09 pm y salio a las 6:00 PM', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:119bdfa5-631c-4967-81d0-b22f9af93c36', array['119bdfa5-631c-4967-81d0-b22f9af93c36'::uuid]::uuid[], array['ASI-029']::text[]
  ),
  (
    '15d243c8-0c1b-4730-90d8-3998f852d751'::uuid, '00de3a2f-2ee4-4a9f-9273-32e2a699bf8b'::uuid, 'sáb 12', array['T2']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entro normal a su turno 2 pero escanearon mal las dos veces | Eliminar este registro porque solo hizo Turno  pero escanearon doble | Hizo Turno 2 completo, usar horas oficiales', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:15d243c8-0c1b-4730-90d8-3998f852d751', array['15d243c8-0c1b-4730-90d8-3998f852d751'::uuid, 'ac38aad7-b7be-44bd-9760-7b28b645ed1e'::uuid]::uuid[], array['ASI-045', 'ASI-046']::text[]
  ),
  (
    '1a9a8780-1492-41ba-8da7-7c5ceef6e2f3'::uuid, '2fa86313-078b-4f7b-8e64-9ee87c580bbe'::uuid, 'vie 11', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Escanearon dos veces | Poner Turno 4 completo con hora oficial de entrada y salida', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:1a9a8780-1492-41ba-8da7-7c5ceef6e2f3', array['1a9a8780-1492-41ba-8da7-7c5ceef6e2f3'::uuid]::uuid[], array['ASI-054']::text[]
  ),
  (
    '1d6865ea-66d6-415f-92b5-ae2b1c5effa0'::uuid, 'a454a749-2ba2-4b14-8a1b-f41964978a4f'::uuid, 'lun 14', array['T1', 'T2']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Mantener Turno 1 como adicional, empezo tarde a las 9:08 AM y salio a las 2:23 PM, entonces marcar turno  tambien, turno 3 no lo hizo', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:1d6865ea-66d6-415f-92b5-ae2b1c5effa0', array['1d6865ea-66d6-415f-92b5-ae2b1c5effa0'::uuid]::uuid[], array['ASI-031']::text[]
  ),
  (
    '1f2a5c27-c03d-4f57-8f83-a4dc2a872a6d'::uuid, '8bbd9344-19be-4de8-8ecf-418a42915534'::uuid, 'lun 14', array['T2', 'T3', 'T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'No hizo T1 pero hizo T2, 3 y 4 como adicionales', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:1f2a5c27-c03d-4f57-8f83-a4dc2a872a6d', array['1f2a5c27-c03d-4f57-8f83-a4dc2a872a6d'::uuid]::uuid[], array['ASI-021']::text[]
  ),
  (
    '2a0cb363-677d-4a62-ac13-824ae437f43d'::uuid, 'cda23ae9-6cc2-4026-b844-e2ab2583c412'::uuid, 'lun 14', array['T2']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'No hizo turno 1, entro tarde al turno 2 | No hizo Turno 1, entro tarde al T2, poner hora oficial del turno 2', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:2a0cb363-677d-4a62-ac13-824ae437f43d', array['2a0cb363-677d-4a62-ac13-824ae437f43d'::uuid]::uuid[], array['ASI-023']::text[]
  ),
  (
    '2dde6994-6bdc-48b6-8141-038b36f8aa42'::uuid, '80e38f21-5b1f-46c5-a6df-e4950c8e82c6'::uuid, 'lun 14', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entro al turno 4 a las 5:37 PM y salio a las 8:41 PM , no hizo turno 3', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:2dde6994-6bdc-48b6-8141-038b36f8aa42', array['2dde6994-6bdc-48b6-8141-038b36f8aa42'::uuid]::uuid[], array['ASI-040']::text[]
  ),
  (
    '3e51d16b-5d67-42a6-b59f-cc81220bbf85'::uuid, 'ae840bb2-3294-4a24-93cc-2ddcd595dcb4'::uuid, 'sáb 12', array['T2', 'T3']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Empezo el T2 como adicional, luego termino el turno 3 tambien | Marcar el T2 como adicional, entro tarde y luego marcar el T3 completo, el T4 no lo hizo', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:3e51d16b-5d67-42a6-b59f-cc81220bbf85', array['3e51d16b-5d67-42a6-b59f-cc81220bbf85'::uuid]::uuid[], array['ASI-043']::text[]
  ),
  (
    '47769ef1-bf94-4b58-a5da-d179d1eb5b0b'::uuid, 'addf895d-878c-4c21-9891-cb2c7f814cbb'::uuid, 'lun 14', array['T2']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entro tarde al T2, y nunca se marco la salida, T4 no se completo | Entro tarde al T2, y nunca se marco la salida, poner salida oficial del turno 2, T4 no se completo', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:47769ef1-bf94-4b58-a5da-d179d1eb5b0b', array['47769ef1-bf94-4b58-a5da-d179d1eb5b0b'::uuid]::uuid[], array['ASI-022']::text[]
  ),
  (
    '4820be35-f563-40e4-9e36-409e2828202d'::uuid, '3f5abdb0-d69a-40af-8083-b0495f47bfdd'::uuid, 'lun 14', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Empezo turno 4 a las 4:16 PM y salio antes del turno 4 a las 4:16 PM, no hizo el turno 3', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:4820be35-f563-40e4-9e36-409e2828202d', array['c39e2248-3b51-41c3-b482-ea8368343b56'::uuid]::uuid[], array['ASI-028']::text[]
  ),
  (
    '49816226-b787-4085-9329-06ec0e0d913e'::uuid, '0ca862e2-c950-42e0-b48d-efc54402a514'::uuid, 'jue 10', array['T1']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Hizo mas tiempo del T1 | Termino T1 mas tarde', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:49816226-b787-4085-9329-06ec0e0d913e', array['49816226-b787-4085-9329-06ec0e0d913e'::uuid]::uuid[], array['ASI-058']::text[]
  ),
  (
    '4f0c90cc-746d-4282-be00-cc4296788fe8'::uuid, '6c4837ab-122c-4ee8-b388-96a0a9a476ec'::uuid, 'lun 14', array['T2']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entro normal a su turno2 , a las 11:01 am, salio temprano a las 2:55 de ese mismo turno, no hizo turno 3', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:4f0c90cc-746d-4282-be00-cc4296788fe8', array['4f0c90cc-746d-4282-be00-cc4296788fe8'::uuid]::uuid[], array['ASI-034']::text[]
  ),
  (
    '517abdaa-f4a2-48c8-b245-96fc9f472f44'::uuid, 'e1a00c57-ac52-438b-a9ae-c7c5091b44f0'::uuid, 'lun 14', array['T1', 'T2', 'T3', 'T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Empezo el Turno 1 a las 9:04 AM tarde y salio hasta las 9:02 PM, entonces hizo T1,2, 3 y 4', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:517abdaa-f4a2-48c8-b245-96fc9f472f44', array['517abdaa-f4a2-48c8-b245-96fc9f472f44'::uuid]::uuid[], array['ASI-039']::text[]
  ),
  (
    '51a9cc83-abb7-40be-ab79-08a9224dec4b'::uuid, '4e1d8d70-b9c8-466c-974a-2e743b60df36'::uuid, 'jue 10', array['T2', 'T3', 'T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Hicieron mal el escaneo | No hizo T1, Entrada: 02:51 p. m como parte del turno 2 y terminar a las Salida: 08:01 p. m. como que Salio temprano del turno 4', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:51a9cc83-abb7-40be-ab79-08a9224dec4b', array['46cf378d-3905-4c8c-b3d2-aee486057273'::uuid]::uuid[], array['ASI-061']::text[]
  ),
  (
    '59fca870-5afc-445a-85cf-684ef9dd4b06'::uuid, 'b8211508-a7aa-4ce2-bc75-98fb8e64554b'::uuid, 'lun 14', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entraron temprano al turno 4, no hizo el turno 3 entonces turno 4 queda como adicional | Entraron temprano al turno 4 desde las 4:20PM, no hizo el turno 3 entonces turno 4 queda como adicional y lo termino a las 9:54 PM', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:59fca870-5afc-445a-85cf-684ef9dd4b06', array['89aa45e4-04c1-445d-ae3e-1019f1607074'::uuid]::uuid[], array['ASI-035']::text[]
  ),
  (
    '6344ff23-f17d-42a5-9aa2-c12e14d3cb07'::uuid, '21fef061-6381-42e3-abc0-910b033a9f80'::uuid, 'sáb 12', array['T2', 'T3']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'No hizo Turno 1, entro tarde al T2 y salio temprano del Turno 3, el turno 4 no lo hizo', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:6344ff23-f17d-42a5-9aa2-c12e14d3cb07', array['6344ff23-f17d-42a5-9aa2-c12e14d3cb07'::uuid]::uuid[], array['ASI-048']::text[]
  ),
  (
    '6ac2e6f4-b903-4a31-9812-e42e571a3df5'::uuid, 'b5764b78-33cb-48a4-bc08-7f15e1fe42a8'::uuid, 'vie 11', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Hizo su turno 4 normal pero entro tarde | Entro tarde a su turno 4 y salio un poco despues', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:6ac2e6f4-b903-4a31-9812-e42e571a3df5', array['6ac2e6f4-b903-4a31-9812-e42e571a3df5'::uuid]::uuid[], array['ASI-055']::text[]
  ),
  (
    '6bcbc660-cf17-43ad-a333-fbca2877c8c1'::uuid, '55279f01-a4f4-44ed-8de9-d739f5093957'::uuid, 'lun 14', array['T2']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entro al turno 2  a las 11:03 aM y salio a las 2:55 PM, no hizo otro turno', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:6bcbc660-cf17-43ad-a333-fbca2877c8c1', array['6bcbc660-cf17-43ad-a333-fbca2877c8c1'::uuid]::uuid[], array['ASI-037']::text[]
  ),
  (
    '6db84ae1-cec3-4c1a-be71-609aaad3ecf8'::uuid, 'f5d4e535-be8d-41bd-9620-5d4d4bd8f3ef'::uuid, 'lun 14', array['T1']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Hizo turno 1, salio mas tarde | Marcar solamente turno 1, se quedo un poco mas tarde del mismo turno', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:6db84ae1-cec3-4c1a-be71-609aaad3ecf8', array['6db84ae1-cec3-4c1a-be71-609aaad3ecf8'::uuid]::uuid[], array['ASI-030']::text[]
  ),
  (
    '71901497-1b31-499e-b99c-1a6ddc5d21b0'::uuid, '731746a6-9a42-4ca9-9be8-30d6cc7489dc'::uuid, 'sáb 5', array['T1']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Este registro pertenece a Sep 5 al unico turno existente | Turno1 de Sep 5', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:71901497-1b31-499e-b99c-1a6ddc5d21b0', array['a48a42bf-4d06-410f-92eb-05a636602427'::uuid]::uuid[], array['ASI-103']::text[]
  ),
  (
    '7966aa3f-f0bf-4235-9beb-af4fedf02231'::uuid, 'd57bd3d3-11db-4398-a344-f8b09ac0fff2'::uuid, 'sáb 12', array['T2']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Se genero la alerta mal | Empezo temprano el T2 a las 10:42 am y salio a las 2:08PM, no hizo turno 1', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:7966aa3f-f0bf-4235-9beb-af4fedf02231', array['2bb99e08-00cb-4515-8f54-5340e3f8b5e6'::uuid]::uuid[], array['ASI-042']::text[]
  ),
  (
    '7e4ad187-bf21-4efc-ba35-45ef247a3fdc'::uuid, '5ecdd2cb-8965-40fc-90f9-0f55513f19f7'::uuid, 'lun 14', array['T1', 'T2']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Empezo T1 que no tenia agendado a las 09:08 PM y luego hizo turno 2 hasta las 2:23 PM, no hizo turno 3', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:7e4ad187-bf21-4efc-ba35-45ef247a3fdc', array['6ef05eb8-0a7f-45f7-a363-2dc22a0a721a'::uuid]::uuid[], array['ASI-036']::text[]
  ),
  (
    '80a4d37c-ae04-490c-a3c1-fb4a9d56721c'::uuid, 'ac328779-4326-4807-a010-c09df5606faf'::uuid, 'lun 14', array['T2']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'No se marco la salida del Turno 2 | Poner Turno 2 unicamente, entrada a las 10:58 am y salida oficial del turno 2', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:80a4d37c-ae04-490c-a3c1-fb4a9d56721c', array['80a4d37c-ae04-490c-a3c1-fb4a9d56721c'::uuid]::uuid[], array['ASI-024']::text[]
  ),
  (
    '8302a2f5-b54f-45a8-adf2-41a8f749a28b'::uuid, '55d39ccc-6119-4f96-bb74-5700c5141ccb'::uuid, 'lun 14', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entro normal a su turno 1 a las 8:05 AM, y salio en el turno 2 a las 2:53 PM. Luego entro al turno 4 a las 5:47 PM y salio a las 9:17 PM', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:8302a2f5-b54f-45a8-adf2-41a8f749a28b', array['8302a2f5-b54f-45a8-adf2-41a8f749a28b'::uuid]::uuid[], array['ASI-038']::text[]
  ),
  (
    '8866c6f3-85af-46f3-8270-90e5741c514d'::uuid, '4e1d8d70-b9c8-466c-974a-2e743b60df36'::uuid, 'sáb 12', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'No hizo turno 1 ni 3, entro tarde al turno 4 y salio temprano del turno 4', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:8866c6f3-85af-46f3-8270-90e5741c514d', array['8866c6f3-85af-46f3-8270-90e5741c514d'::uuid]::uuid[], array['ASI-050']::text[]
  ),
  (
    '8d7d7dca-676e-4141-9df3-9753ada02c35'::uuid, '82b73111-9fff-4f73-a42c-667d78bfa6fa'::uuid, 'lun 14', array['T2', 'T3', 'T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entro tarde al Turno 2 y salio hasta el turno 4 | Marcar el Turno 2 (entro tarde) y salio hasta el turno 4', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:8d7d7dca-676e-4141-9df3-9753ada02c35', array['4842f392-dda5-4c58-951b-c489a0af50bb'::uuid]::uuid[], array['ASI-025']::text[]
  ),
  (
    '9b8e4ee2-a5b2-4c71-8d53-df12f16eeffc'::uuid, '7e4ed5d5-d884-411e-a5d2-58cf0f29b385'::uuid, 'lun 14', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Escanearon mal, solamente debia quedar marcado turno 4 | Marcar solo turno 4 como que empezo a las 4:48 y salio a las 9:54 PM', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:9b8e4ee2-a5b2-4c71-8d53-df12f16eeffc', array['6cb5ed69-2874-48f9-8aa1-fc0ebaefc1c7'::uuid]::uuid[], array['ASI-033']::text[]
  ),
  (
    '9be300bd-cf55-4101-be5f-f45e571a1e9c'::uuid, 'da538a1c-26b7-43e9-8e0f-895fb623ddf1'::uuid, 'vie 11', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Escaneraon dos veces | Poner Turno 4 completo con hora oficial de entrada y salida', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:9be300bd-cf55-4101-be5f-f45e571a1e9c', array['9be300bd-cf55-4101-be5f-f45e571a1e9c'::uuid]::uuid[], array['ASI-051']::text[]
  ),
  (
    '9d8c41cb-8791-45fc-8d4c-7b455ad41136'::uuid, '5ca4a68d-c81d-4549-abcb-2a44df35745d'::uuid, 'jue 10', array['T3']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Hicieron el escaneo dos veces | Hizo el Turno 3 completo, poner hora de entrada y salida oficial', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:9d8c41cb-8791-45fc-8d4c-7b455ad41136', array['9d8c41cb-8791-45fc-8d4c-7b455ad41136'::uuid]::uuid[], array['ASI-060']::text[]
  ),
  (
    '9e7b6909-b6d9-48cb-a3dc-8f540de6e606'::uuid, 'b712bd4e-4372-4ebb-8c36-de426a14c066'::uuid, 'vie 11', array['T2', 'T3']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Salio tarde de algunos turnos | Mantener Entrada: 07:50 a. m. · Salida: 11:54 a. m. que corresponde al Turno 1, luego hizo una pausa y empezo el Turno 2 a las 12:51 PM y de ahi hizo tambien turno 3 de corrido hasta las 5:52 PM que se fue, Turno 4 no deberia salir marcado', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:9e7b6909-b6d9-48cb-a3dc-8f540de6e606', array['9a847cf6-a9d8-4ca0-9487-a878bbfa190c'::uuid]::uuid[], array['ASI-057']::text[]
  ),
  (
    '9eb58018-d8ea-438a-9bff-03e458c7f5dd'::uuid, 'ad110571-56e1-42d0-91fd-28fb831440d8'::uuid, 'jue 10', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entro tarde al T4 | Mantener su hora de Entrada: 05:09 p. m como parte del T4 y salio un poco antes pero mantener la hora oficial que tiene de salida', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:9eb58018-d8ea-438a-9bff-03e458c7f5dd', array['9eb58018-d8ea-438a-9bff-03e458c7f5dd'::uuid]::uuid[], array['ASI-062']::text[]
  ),
  (
    'a0830ad7-488a-4366-9139-d6b624631f1d'::uuid, 'b2623e1e-f851-4432-b31f-1f6fc3d3fae2'::uuid, 'vie 11', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Se genero la alerta mal | Su entrada al Turno 2 de 11:00 AM a 3:00 PM, luego hizo normal turno 4 de 5:00 a 9:00  PM', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:a0830ad7-488a-4366-9139-d6b624631f1d', array['a0830ad7-488a-4366-9139-d6b624631f1d'::uuid]::uuid[], array['ASI-052']::text[]
  ),
  (
    'c0208122-27a3-45ab-8e6b-666fc45e0aad'::uuid, '445498d4-e083-4366-ab80-60b51936cc9a'::uuid, 'vie 11', array['T1']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Se tuvo que retirar temprano | Se fue temprano, mantener la misma hora de entrada y salida', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:c0208122-27a3-45ab-8e6b-666fc45e0aad', array['c0208122-27a3-45ab-8e6b-666fc45e0aad'::uuid]::uuid[], array['ASI-056']::text[]
  ),
  (
    'cb84e3d0-3228-43d5-8f7f-fb4a6a28454e'::uuid, 'd23d2170-a23f-44e9-81fd-c2b76744c97c'::uuid, 'lun 14', array['T3', 'T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entro en el turno 3  temprano y salio hasta el turno 4 | Entro temprano al turno 3, a las 4:4 PM y salio en el turno 4 a las 9:36 PM', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:cb84e3d0-3228-43d5-8f7f-fb4a6a28454e', array['9cc7a31a-e81e-42ef-84d4-e238c0aa956b'::uuid]::uuid[], array['ASI-026']::text[]
  ),
  (
    'dcdfdb64-729b-4e69-921d-e7a76a7a1076'::uuid, '5153f5b8-6a17-4b54-b67c-9168dac90faa'::uuid, 'sáb 12', array['T3', 'T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Se abrio la alerta mal del T2 | Turno 3 empezo a las 4:41 osea que lo empezo temprano y termino de corrido hasta el turno 4 que salio a las 9:11 PM', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:dcdfdb64-729b-4e69-921d-e7a76a7a1076', array['49503268-72e9-43de-b92e-c664d298ce75'::uuid]::uuid[], array['ASI-041']::text[]
  ),
  (
    'e4302122-fdad-4afa-9dd0-93e7b0870e8b'::uuid, 'd89c19c5-236a-4051-ac3f-512a6e1f3115'::uuid, 'vie 11', array['T1', 'T2']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Hizo un turno no agendado que fue el T2 y perdio el otro T3 que si tenia agendado | Entro a las 7:26, tarde al turno 1 y luego hizo como turno adicional el Turno 2, el Turno 3 lo perdio y decidio no asistir', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:e4302122-fdad-4afa-9dd0-93e7b0870e8b', array['e4302122-fdad-4afa-9dd0-93e7b0870e8b'::uuid]::uuid[], array['ASI-053']::text[]
  ),
  (
    'ef3bd754-226a-4529-be31-5cd081872406'::uuid, 'ff6be90f-1a1c-45fa-afc4-32dee9780a4d'::uuid, 'sáb 12', array['T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'No hizo el Turno 3 | Marcar normal el Turno 4, entro tarde', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:ef3bd754-226a-4529-be31-5cd081872406', array['ef3bd754-226a-4529-be31-5cd081872406'::uuid]::uuid[], array['ASI-044']::text[]
  ),
  (
    'fa92248a-1261-4b78-b737-04f78ee8a6a4'::uuid, '744c6274-39d2-4c90-966d-54f41a58ee99'::uuid, 'jue 10', array['T3']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Hicieron el escaneo dos veces | Hizo el Turno 3 completo, poner hora de entrada y salida oficial', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:fa92248a-1261-4b78-b737-04f78ee8a6a4', array['fa92248a-1261-4b78-b737-04f78ee8a6a4'::uuid]::uuid[], array['ASI-059']::text[]
  ),
  (
    'fdaaf6f0-5962-4b73-9711-5519d7cd0e5e'::uuid, 'f418fbb4-75dc-4e80-9c3d-d4046f46004a'::uuid, 'sáb 12', array['T3', 'T4']::text[],
    'historical_audit', 'admin_corrected', 'reviewed_attendance_audit_2026_09', 'Entro temprano al T3 que no tenia agendado, se cuenta como adicional, luego hizo turno 4 | Poner Turno 3 como adicional, entro a la 1:14 PM, luego hizo turno 4 y salio a las 9:11 PM', true,
    'Kendyr', 'Kendyr', 'Administrador', '2026-09-16T12:00:00-06:00'::timestamptz,
    'historical_audit', 'historical-audit:fdaaf6f0-5962-4b73-9711-5519d7cd0e5e', array['fdaaf6f0-5962-4b73-9711-5519d7cd0e5e'::uuid]::uuid[], array['ASI-047']::text[]
  );

do $migration$
declare
  v_count integer;
begin
  select count(*) into v_count from pg_temp._attendance_audit_sources_202609;
  if v_count <> 44 then
    raise exception 'El lote histórico contiene % resoluciones; se esperaban 44.', v_count;
  end if;

  select count(*) into v_count
  from pg_temp._attendance_audit_sources_202609 source
  join public.attendance_review_resolutions resolution
    on resolution.session_id = source.source_session_id
   and resolution.volunteer_id = source.volunteer_id
   and resolution.day_key = source.day_key
   and resolution.resolved_session_id is not distinct from source.resolved_session_id
   and resolution.hide_alert is true;
  if v_count <> 44 then
    raise exception 'Las 44 resoluciones ya no coinciden con el lote revisado; no se aplicó el backfill.';
  end if;

  select count(*) into v_count
  from pg_temp._attendance_audit_sources_202609
  where resolved_session_id is not null;
  if v_count <> 43 then
    raise exception 'El lote debe contener exactamente 43 resoluciones enlazadas.';
  end if;

  select count(distinct resolved_session_id) into v_count
  from pg_temp._attendance_audit_sources_202609
  where resolved_session_id is not null;
  if v_count <> 42 then
    raise exception 'El lote debe enlazar exactamente 42 sesiones finales.';
  end if;

  select count(*) into v_count from pg_temp._attendance_audit_decisions_202609;
  if v_count <> 42 then
    raise exception 'El backfill debe contener exactamente 42 decisiones por sesión.';
  end if;

  if exists (
    select 1
    from pg_temp._attendance_audit_decisions_202609 decision
    left join public.attendance_sessions session on session.id = decision.session_id
    where session.id is null
       or session.volunteer_id is distinct from decision.volunteer_id
       or session.day_key is distinct from decision.day_key
  ) then
    raise exception 'Una sesión final ya no coincide con el lote revisado; no se aplicó el backfill.';
  end if;

  if exists (
    select 1
    from pg_temp._attendance_audit_sources_202609 source
    left join pg_temp._attendance_audit_decisions_202609 decision
      on decision.session_id = source.resolved_session_id
    where source.resolved_session_id is not null
      and (decision.session_id is null or not (source.source_session_id = any(decision.source_resolution_ids)))
  ) then
    raise exception 'Una resolución enlazada no tiene una decisión histórica trazable.';
  end if;

  if exists (
    select 1
    from public.attendance_session_decisions existing
    join pg_temp._attendance_audit_decisions_202609 incoming using (session_id)
    where existing.source <> 'historical_audit'
  ) then
    raise exception 'Existe una decisión posterior no histórica; el backfill no la sobrescribirá.';
  end if;

  if exists (
    select 1
    from public.attendance_session_decisions existing
    join pg_temp._attendance_audit_decisions_202609 incoming
      on existing.idempotency_key = incoming.idempotency_key
    where existing.session_id <> incoming.session_id
  ) then
    raise exception 'Una clave idempotente histórica pertenece a otra sesión.';
  end if;
end
$migration$;

insert into public.attendance_session_decisions (
  session_id, volunteer_id, day_key, intended_shift_keys,
  attendance_kind, exit_decision, reason_code, explanation, hide_alert,
  decided_by, decided_by_name, decided_by_role, decided_at,
  source, idempotency_key, source_resolution_ids, source_case_ids
)
select
  session_id, volunteer_id, day_key, intended_shift_keys,
  attendance_kind, exit_decision, reason_code, explanation, hide_alert,
  decided_by, decided_by_name, decided_by_role, decided_at,
  source, idempotency_key, source_resolution_ids, source_case_ids
from pg_temp._attendance_audit_decisions_202609
on conflict (session_id) do update set
  volunteer_id = excluded.volunteer_id,
  day_key = excluded.day_key,
  intended_shift_keys = excluded.intended_shift_keys,
  attendance_kind = excluded.attendance_kind,
  exit_decision = excluded.exit_decision,
  reason_code = excluded.reason_code,
  explanation = excluded.explanation,
  hide_alert = excluded.hide_alert,
  decided_by = excluded.decided_by,
  decided_by_name = excluded.decided_by_name,
  decided_by_role = excluded.decided_by_role,
  decided_at = excluded.decided_at,
  source = excluded.source,
  idempotency_key = excluded.idempotency_key,
  source_resolution_ids = excluded.source_resolution_ids,
  source_case_ids = excluded.source_case_ids,
  updated_at = now();

do $verification$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.attendance_session_decisions actual
  join pg_temp._attendance_audit_decisions_202609 expected using (session_id)
  where actual.volunteer_id = expected.volunteer_id
    and actual.day_key = expected.day_key
    and actual.intended_shift_keys = expected.intended_shift_keys
    and actual.attendance_kind = 'historical_audit'
    and actual.exit_decision = 'admin_corrected'
    and actual.reason_code = 'reviewed_attendance_audit_2026_09'
    and actual.explanation = expected.explanation
    and actual.hide_alert is true
    and actual.source = 'historical_audit'
    and actual.idempotency_key = expected.idempotency_key
    and actual.source_resolution_ids = expected.source_resolution_ids
    and actual.source_case_ids = expected.source_case_ids;
  if v_count <> 42 then
    raise exception 'La verificación encontró % decisiones históricas correctas; se esperaban 42.', v_count;
  end if;

  select count(*) into v_count
  from pg_temp._attendance_audit_sources_202609 source
  join public.attendance_session_decisions decision
    on decision.session_id = source.resolved_session_id
   and source.source_session_id = any(decision.source_resolution_ids)
  where source.resolved_session_id is not null
    and decision.hide_alert is true;
  if v_count <> 43 then
    raise exception 'La verificación trazó % resoluciones enlazadas; se esperaban 43.', v_count;
  end if;
end
$verification$;

drop table pg_temp._attendance_audit_decisions_202609;
drop table pg_temp._attendance_audit_sources_202609;

notify pgrst, 'reload schema';
