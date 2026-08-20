export interface VolunteerScheduleShift {
  id: string;
  volunteer_id: string;
  day_key: string;
  shift_key: string;
  checked_in: boolean | null;
  checked_in_at: string | null;
  checked_out: boolean | null;
  checked_out_at: string | null;
  area_id: string | null;
  area_name: string | null;
}
