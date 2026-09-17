create table if not exists public.attendance_review_resolutions (
  session_id uuid primary key,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  day_key text not null,
  decision text not null,
  explanation text not null default '',
  correction text not null default '',
  hide_alert boolean not null default false,
  reviewed_by text,
  reviewed_at date,
  resolution_status text not null default 'reviewed',
  original_started_at timestamptz,
  original_ended_at timestamptz,
  resolved_started_at timestamptz,
  resolved_ended_at timestamptz,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attendance_review_resolutions_day_key_idx
  on public.attendance_review_resolutions (day_key, hide_alert)
  where hide_alert = true;

create index if not exists attendance_review_resolutions_volunteer_idx
  on public.attendance_review_resolutions (volunteer_id, day_key);

alter table public.attendance_review_resolutions enable row level security;

revoke all on table public.attendance_review_resolutions from public, anon, authenticated;
grant all on table public.attendance_review_resolutions to service_role;

comment on table public.attendance_review_resolutions is
  'Decisiones documentadas de auditoría para evitar que casos válidos vuelvan a mostrarse como alertas pendientes.';
