import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { VolunteerRequestsClient } from "@/components/VolunteerRequestsClient";

export const metadata = {
  title: "Mis Solicitudes | Volunteer Manager",
  description: "Historial y solicitudes de reagendamiento de turnos",
};

export default async function RequestsPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value || '';
  const session = verifySessionToken(sessionCookie);

  if (!session) {
    redirect('/login');
  }

  if (session.userType !== 'volunteer') {
    redirect('/volunteers');
  }

  const volunteerId = session.userId;
  const supabase = await getAdminSupabase();

  // Try to find volunteer by id first, then profile_id fallback
  let { data: volunteer } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone')
    .eq('id', volunteerId)
    .maybeSingle();

  if (!volunteer) {
    const { data: fallbackVol } = await supabase
      .from('volunteers')
      .select('id, first_name, last_name, phone')
      .eq('profile_id', volunteerId)
      .maybeSingle();
    volunteer = fallbackVol;
  }

  if (!volunteer) {
    console.error("REQUESTS_PAGE_ERROR: Volunteer not found for session user ID:", volunteerId);
    redirect('/login');
  }

  // Fetch volunteer assigned shifts and shift change requests in parallel
  const [{ data: rawShifts }, { data: requests }] = await Promise.all([
    supabase
      .from('shifts')
      .select('day_key, shift_key')
      .eq('volunteer_id', volunteer.id),
    supabase
      .from('shift_change_requests')
      .select('*')
      .eq('volunteer_id', volunteer.id)
      .order('created_at', { ascending: false })
  ]);

  // Construct shiftsByDay mapping (e.g. { "30 Aug": ["T1", "T2"] })
  const shiftsByDay: Record<string, string[]> = {};
  (rawShifts || []).forEach((s: any) => {
    if (s.day_key && s.shift_key) {
      if (!shiftsByDay[s.day_key]) {
        shiftsByDay[s.day_key] = [];
      }
      if (!shiftsByDay[s.day_key].includes(s.shift_key)) {
        shiftsByDay[s.day_key].push(s.shift_key);
      }
    }
  });

  return (
    <VolunteerRequestsClient
      volunteerId={volunteer.id}
      shiftsByDay={shiftsByDay}
      initialRequests={requests || []}
    />
  );
}
