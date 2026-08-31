-- Web Push is server-only. Subscription endpoints and encryption keys are secrets.
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL UNIQUE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  requests_enabled boolean NOT NULL DEFAULT true,
  coverage_enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_profile_idx ON public.push_subscriptions(profile_id);

CREATE TABLE public.push_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('request', 'coverage')),
  event_key text NOT NULL UNIQUE,
  committee_id uuid,
  request_id uuid,
  day_key text,
  shift_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX push_events_pending_idx ON public.push_events(created_at) WHERE processed_at IS NULL;

CREATE TABLE public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.push_events(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  -- One coverage alert per slot, device and local date, even if many edits occur.
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  UNIQUE(subscription_id, dedupe_key)
);
CREATE INDEX push_deliveries_pending_idx ON public.push_deliveries(next_attempt_at)
  WHERE status IN ('pending', 'sending');

CREATE TABLE public.push_worker_lease (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_worker_lease ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions, public.push_events, public.push_deliveries,
  public.push_worker_lease FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_subscriptions, public.push_events, public.push_deliveries,
  public.push_worker_lease TO service_role;

CREATE FUNCTION public.claim_push_worker(p_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.push_worker_lease(id, token, expires_at)
  VALUES (true, p_token, now() + interval '3 minutes')
  ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
  WHERE push_worker_lease.expires_at < now();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_push_worker(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_worker(uuid) TO service_role;

-- Transactional outbox: portal, WhatsApp and direct administrative writes all
-- create the event in the same transaction as the underlying change.
CREATE FUNCTION public.queue_request_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' AND EXISTS (
    SELECT 1 FROM public.push_subscriptions WHERE expires_at > now()
  ) THEN
    INSERT INTO public.push_events(kind, event_key, request_id)
    VALUES ('request', 'request:' || NEW.id::text, NEW.id)
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER push_new_request AFTER INSERT ON public.shift_change_requests
FOR EACH ROW EXECUTE FUNCTION public.queue_request_push();

CREATE FUNCTION public.queue_coverage_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_committee uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE expires_at > now()) THEN
    RETURN NULL;
  END IF;
  -- Attendance flags and area assignments do not alter scheduled headcount.
  IF TG_OP = 'UPDATE' AND OLD.volunteer_id = NEW.volunteer_id
    AND OLD.day_key = NEW.day_key AND OLD.shift_key = NEW.shift_key THEN
    RETURN NULL;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    SELECT committee_id INTO v_committee FROM public.volunteers WHERE id = OLD.volunteer_id;
    IF v_committee IS NOT NULL THEN
      INSERT INTO public.push_events(kind, event_key, committee_id, day_key, shift_key)
      VALUES ('coverage', concat('coverage:', txid_current(), ':', v_committee, ':', OLD.day_key, ':', OLD.shift_key),
        v_committee, OLD.day_key, OLD.shift_key) ON CONFLICT (event_key) DO NOTHING;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER push_coverage_change AFTER DELETE OR UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.queue_coverage_push();

REVOKE ALL ON FUNCTION public.queue_request_push(), public.queue_coverage_push()
FROM PUBLIC, anon, authenticated;
