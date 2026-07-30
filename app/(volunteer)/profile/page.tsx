import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VolunteerProfileClient } from "@/components/VolunteerProfileClient";
import { verifySessionToken } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const metadata = {
  title: "Mi Perfil | Volunteer Manager",
  description: "Ver perfil de voluntario y gestionar inicio de sesión biométrico",
};

export default async function VolunteerProfilePage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value || '';
  const session = verifySessionToken(sessionCookie);

  if (!session) {
    redirect('/login');
  }

  // Si no es voluntario (es coordinador/admin), redirigir a la vista de voluntariados
  if (session.userType !== 'volunteer') {
    redirect('/volunteers');
  }

  const volunteerId = session.userId;
  const supabase = await getAdminSupabase();

  // Fetch volunteer details, passkeys, and shifts in parallel for speed
  const [{ data: volunteer, error }, { data: passkeys }, { data: shifts }] = await Promise.all([
    supabase
      .from('volunteers')
      .select('*, committees(name)')
      .eq('id', volunteerId)
      .maybeSingle(),
    supabase
      .from('passkeys')
      .select('id')
      .eq('user_id', volunteerId),
    supabase
      .from('shifts')
      .select('*')
      .eq('volunteer_id', volunteerId)
  ]);

  if (error || !volunteer) {
    console.error("PROFILE_PAGE_ERROR:", error);
    redirect('/login');
  }

  const hasPasskey = passkeys && passkeys.length > 0;

  return (
    <VolunteerProfileClient 
      volunteer={volunteer}
      initialHasPasskey={!!hasPasskey}
      initialShifts={shifts || []}
    />
  );
}
