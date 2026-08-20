-- Server-only, atomic rate limiting for login and public WebAuthn endpoints.
-- Bucket identifiers are HMAC hashes; raw phone numbers and IP addresses are
-- never persisted in this table.

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  bucket_key text PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.auth_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_auth_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  bucket public.auth_rate_limits%ROWTYPE;
BEGIN
  IF p_bucket_key IS NULL OR length(p_bucket_key) < 16 THEN
    RAISE EXCEPTION 'invalid rate-limit bucket';
  END IF;
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'invalid rate-limit configuration';
  END IF;

  INSERT INTO public.auth_rate_limits AS limits (
    bucket_key,
    request_count,
    window_started_at,
    updated_at
  )
  VALUES (p_bucket_key, 1, v_now, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    request_count = CASE
      WHEN limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE limits.request_count + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        THEN v_now
      ELSE limits.window_started_at
    END,
    updated_at = v_now
  RETURNING * INTO bucket;

  allowed := bucket.request_count <= p_limit;
  retry_after_seconds := CASE
    WHEN allowed THEN 0
    ELSE greatest(
      1,
      ceil(extract(epoch FROM (
        bucket.window_started_at
        + make_interval(secs => p_window_seconds)
        - v_now
      )))::integer
    )
  END;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_auth_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_auth_rate_limit(text, integer, integer)
  TO service_role;

-- The legacy table must not be writable through the public Data API.
ALTER TABLE IF EXISTS public.login_attempts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF to_regclass('public.login_attempts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Acceso total a login_attempts" ON public.login_attempts;
    REVOKE ALL ON TABLE public.login_attempts FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;
