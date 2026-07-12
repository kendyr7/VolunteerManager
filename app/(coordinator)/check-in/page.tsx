import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckInScanner } from "@/components/CheckInScanner";

export const metadata = {
  title: "Registrar Asistencia | Volunteer Manager",
  description: "Escanear pases QR de voluntarios",
};

export default async function CheckInPage() {
  const cookieStore = await cookies();
  const session = decodeURIComponent(cookieStore.get('session')?.value || '');

  if (!session) {
    redirect('/login');
  }

  if (!session.startsWith('coordinator-')) {
    redirect('/login');
  }

  const firstHyphen = session.indexOf('-');
  const secondHyphen = session.indexOf('-', firstHyphen + 1);
  const role = session.substring(firstHyphen + 1, secondHyphen);
  const committeeName = session.substring(secondHyphen + 1) || '';

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
