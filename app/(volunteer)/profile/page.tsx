import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VolunteerProfileClient } from "@/components/VolunteerProfileClient";

export const metadata = {
  title: "Mi Perfil | Volunteer Manager",
  description: "Ver perfil de voluntario y gestionar inicio de sesión biométrico",
};

export default async function VolunteerProfilePage() {
  const cookieStore = await cookies();
  const session = decodeURIComponent(cookieStore.get('session')?.value || '');

  if (!session) {
    redirect('/login');
  }

  if (!session.startsWith('volunteer-')) {
    redirect('/login');
  }

  const volunteerId = session.substring(10, 46);
  const supabase = await createClient();

  // Fetch volunteer details with committee name
  const { data: volunteer, error } = await supabase
    .from('volunteers')
    .select('*, committees(name)')
    .eq('id', volunteerId)
    .single();

  if (error || !volunteer) {
    redirect('/login');
  }

  // Check if they have passkeys registered
  const { data: passkeys } = await supabase
    .from('passkeys')
    .select('id')
    .eq('user_id', volunteer.id);

  const hasPasskey = passkeys && passkeys.length > 0;

  return (
    <VolunteerProfileClient 
      volunteer={volunteer}
      initialHasPasskey={!!hasPasskey}
    />
  );
}
