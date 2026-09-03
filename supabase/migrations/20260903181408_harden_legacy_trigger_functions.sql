-- Harden legacy trigger functions without changing their behavior.
ALTER FUNCTION public.update_updated_at_column()
  SET search_path = '';

ALTER FUNCTION public.apply_latest_whatsapp_status_to_reminder()
  SET search_path = '';

REVOKE ALL ON FUNCTION public.update_updated_at_column()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column()
  TO service_role;

REVOKE ALL ON FUNCTION public.apply_latest_whatsapp_status_to_reminder()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_latest_whatsapp_status_to_reminder()
  TO service_role;
