-- Additive migration: run after 20261025000000_web_push.sql, never instead of it.
BEGIN;

CREATE TABLE public.notification_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('request', 'coverage')),
  committee_id uuid,
  dedupe_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Source events can arrive late: distinguish occurrence from inbox arrival.
  inserted_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE(profile_id, dedupe_key)
);
CREATE INDEX notification_inbox_profile_date_idx ON public.notification_inbox(profile_id, created_at DESC, id DESC);
CREATE INDEX notification_inbox_unread_idx ON public.notification_inbox(profile_id, created_at DESC) WHERE read_at IS NULL;
ALTER TABLE public.notification_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_inbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_inbox TO service_role;

-- Separate cursors: opening the inbox must never consume the external push queue.
ALTER TABLE public.push_events ADD COLUMN inbox_processed_at timestamptz;
CREATE INDEX push_events_inbox_pending_idx ON public.push_events(created_at) WHERE inbox_processed_at IS NULL;

-- Internal notifications do not depend on browser permission or subscriptions.
CREATE OR REPLACE FUNCTION public.queue_request_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO public.push_events(kind, event_key, request_id)
    VALUES ('request', 'request:' || NEW.id::text, NEW.id)
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_coverage_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_committee uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.volunteer_id = NEW.volunteer_id
    AND OLD.day_key = NEW.day_key AND OLD.shift_key = NEW.shift_key THEN
    RETURN NULL;
  END IF;
  SELECT committee_id INTO v_committee FROM public.volunteers WHERE id = OLD.volunteer_id;
  IF v_committee IS NOT NULL THEN
    INSERT INTO public.push_events(kind, event_key, committee_id, day_key, shift_key)
    VALUES ('coverage', concat('coverage:', txid_current(), ':', v_committee, ':', OLD.day_key, ':', OLD.shift_key),
      v_committee, OLD.day_key, OLD.shift_key) ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_request_push(), public.queue_coverage_push() FROM PUBLIC, anon, authenticated;

-- Seed only still-pending requests from the delivery window, not an old backlog.
INSERT INTO public.push_events(kind, event_key, request_id, created_at)
SELECT 'request', 'request:' || id::text, id, created_at FROM public.shift_change_requests
WHERE status = 'pending' AND created_at > now() - interval '24 hours'
ON CONFLICT(event_key) DO NOTHING;

COMMIT;
