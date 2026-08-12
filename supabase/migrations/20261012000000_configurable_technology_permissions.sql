-- Make every capability assigned to the Technology Coordinator configurable
-- by Administrators. Admin-only capabilities remain fixed application policy.
INSERT INTO public.system_settings (key, value)
VALUES
  ('role.technology.view_dashboard', 'true'),
  ('role.technology.view_volunteers', 'true'),
  ('role.technology.reschedule_volunteers', 'true'),
  ('role.technology.scan_qr_attendance', 'true'),
  ('role.technology.create_volunteers', 'true'),
  ('role.technology.import_volunteers', 'true')
ON CONFLICT (key) DO NOTHING;
