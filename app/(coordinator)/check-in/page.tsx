import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckInScanner } from "@/components/CheckInScanner";
import { verifySessionToken } from "@/lib/auth";

export const metadata = {
  title: "Escanear Turno | Volunteer Manager",
  description: "Escanear pases QR de voluntarios para registrar asistencia",
};

export default async function CheckInPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value || '';
  const session = verifySessionToken(sessionCookie);

  if (!session || session.userType !== 'profile') {
    redirect('/login');
  }

  const { role, committee: committeeName, userId } = session;

  // Admin Check: Solo Admin y Editor pueden acceder al check-in
  if (role !== 'Admin' && role !== 'Editor') {
    redirect('/login');
  }

  const supabase = await createClient();
  
  // Resolve coordinator ID directly from session userId
  let coordinatorId = userId;
  let coordinatorName = 'Coordinador';

  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      coordinatorId = profile.id;
      coordinatorName = profile.full_name || 'Coordinador';
    }
  }

  return (
    <CheckInScanner 
      coordinatorId={coordinatorId} 
      coordinatorName={coordinatorName}
      role={role}
      committeeName={committeeName}
    />
  );
}
