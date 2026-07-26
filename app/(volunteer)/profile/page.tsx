import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VolunteerProfileClient } from "@/components/VolunteerProfileClient";
import { verifySessionToken } from "@/lib/auth";

export const metadata = {
  title: "Mi Perfil | Volunteer Manager",
  description: "Ver perfil de voluntario y gestionar inicio de sesión biométrico",
};

export default async function VolunteerProfilePage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value || '';
  const session = verifySessionToken(sessionCookie);

  if (!session || session.userType !== 'volunteer') {
    redirect('/login');
  }

  const volunteerId = session.userId;
  
  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY 
    ? (await import('@supabase/supabase-js')).createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    : await createClient();

  // Fetch volunteer details with committee name
  const { data: volunteer, error } = await supabase
    .from('volunteers')
    .select('*, committees(name)')
    .eq('id', volunteerId)
    .maybeSingle();

  console.log("PROFILE_LOG: Fetch volunteer result:", { volunteer, error, volunteerId });

  if (error || !volunteer) {
    console.log("PROFILE_LOG: Redirecting because of DB error or volunteer not found", { error, volunteer });
    redirect('/login');
  }

  // Check if they have passkeys registered
  const { data: passkeys } = await supabase
    .from('passkeys')
    .select('id')
    .eq('user_id', volunteer.id);

  const hasPasskey = passkeys && passkeys.length > 0;

  // Fetch shifts to construct attendance history
  const { data: shifts } = await supabase
    .from('shifts')
    .select('*')
    .eq('volunteer_id', volunteerId);

  return (
    <VolunteerProfileClient 
      volunteer={volunteer}
      initialHasPasskey={!!hasPasskey}
      initialShifts={shifts || []}
    />
  );
}
