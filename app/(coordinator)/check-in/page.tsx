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
  
  // Resolve coordinator ID
  let query = supabase.from('profiles').select('id, full_name');
  if (role === 'Admin') {
    query = query.eq('role', 'Admin');
  } else {
    const { data: comm } = await supabase
      .from('committees')
      .select('id')
      .eq('name', committeeName)
      .maybeSingle();

    if (comm) {
      query = query.eq('role', role).eq('committee_id', comm.id);
    } else {
      query = query.eq('role', role);
    }
  }

  const { data: profile } = await query.limit(1).maybeSingle();
  const coordinatorId = profile?.id || '99999999-9999-9999-9999-999999999999'; // Fallback to system admin ID
  const coordinatorName = profile?.full_name || 'Coordinador';

  return (
    <CheckInScanner 
      coordinatorId={coordinatorId} 
      coordinatorName={coordinatorName}
      role={role}
      committeeName={committeeName}
    />
  );
}
