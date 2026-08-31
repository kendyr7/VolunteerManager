-- Run manually after deployment, migration and Vault configuration (docs/web-push.md).
-- Enable pg_cron, pg_net and Vault in Supabase first. No secrets are embedded here.
BEGIN;
DO $$
DECLARE
  app_url text;
  dispatch_secret text;
BEGIN
  SELECT decrypted_secret INTO STRICT app_url FROM vault.decrypted_secrets WHERE name = 'push_app_url';
  SELECT decrypted_secret INTO STRICT dispatch_secret FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret';
  IF app_url !~ '^https://[a-zA-Z0-9.-]+/?$' OR length(dispatch_secret) < 32 THEN
    RAISE EXCEPTION 'Configure a root HTTPS app URL and a strong dispatch secret in Vault first.';
  END IF;
END;
$$;

-- Scheduling an existing named job updates it instead of creating a duplicate.
SELECT cron.schedule('volunteer-manager-web-push', '* * * * *', $job$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_app_url'), '/') || '/api/push/dispatch?scan=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
COMMIT;
