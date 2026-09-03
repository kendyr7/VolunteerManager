-- Add covering indexes for every foreign key reported by Supabase.
CREATE INDEX IF NOT EXISTS idx_area_shift_requirements_updated_by_fkey
  ON public.area_shift_requirements (updated_by);

CREATE INDEX IF NOT EXISTS idx_committee_areas_archived_by_fkey
  ON public.committee_areas (archived_by);
CREATE INDEX IF NOT EXISTS idx_committee_areas_created_by_fkey
  ON public.committee_areas (created_by);
CREATE INDEX IF NOT EXISTS idx_committee_areas_updated_by_fkey
  ON public.committee_areas (updated_by);

CREATE INDEX IF NOT EXISTS idx_phone_cleanup_review_items_duplicate_primary_volunteer_id_fkey
  ON public.phone_cleanup_review_items (duplicate_primary_volunteer_id);
CREATE INDEX IF NOT EXISTS idx_phone_cleanup_review_items_shared_phone_owner_id_fkey
  ON public.phone_cleanup_review_items (shared_phone_owner_id);

CREATE INDEX IF NOT EXISTS idx_profiles_committee_id_fkey
  ON public.profiles (committee_id);

CREATE INDEX IF NOT EXISTS idx_push_deliveries_event_id_fkey
  ON public.push_deliveries (event_id);

CREATE INDEX IF NOT EXISTS idx_scan_log_coordinator_id_fkey
  ON public.scan_log (coordinator_id);
CREATE INDEX IF NOT EXISTS idx_scan_log_shift_id_fkey
  ON public.scan_log (shift_id);
CREATE INDEX IF NOT EXISTS idx_scan_log_volunteer_id_fkey
  ON public.scan_log (volunteer_id);

CREATE INDEX IF NOT EXISTS idx_shift_change_requests_reviewed_by_fkey
  ON public.shift_change_requests (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_shift_change_requests_volunteer_id_fkey
  ON public.shift_change_requests (volunteer_id);

CREATE INDEX IF NOT EXISTS idx_shifts_checked_in_by_fkey
  ON public.shifts (checked_in_by);

CREATE INDEX IF NOT EXISTS idx_volunteer_import_exceptions_committee_id_fkey
  ON public.volunteer_import_exceptions (committee_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_import_exceptions_conflicting_volunteer_id_fkey
  ON public.volunteer_import_exceptions (conflicting_volunteer_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_import_exceptions_created_volunteer_id_fkey
  ON public.volunteer_import_exceptions (created_volunteer_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_import_exceptions_reviewed_by_user_id_fkey
  ON public.volunteer_import_exceptions (reviewed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_import_exceptions_submitted_by_user_id_fkey
  ON public.volunteer_import_exceptions (submitted_by_user_id);

CREATE INDEX IF NOT EXISTS idx_volunteers_lector_id_fkey
  ON public.volunteers (lector_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_shared_phone_owner_id_fkey
  ON public.volunteers (shared_phone_owner_id);
