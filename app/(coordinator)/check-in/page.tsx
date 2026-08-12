import { redirect } from "next/navigation";
import { CheckInScanner } from "@/components/CheckInScanner";
import { getAuthorizationSnapshot } from '@/lib/authorization';
import { hasCapability } from '@/lib/role-permissions';

export const metadata = {
  title: "Escanear Turno | Volunteer Manager",
  description: "Escanear pases QR de voluntarios para registrar asistencia",
};

export default async function CheckInPage() {
  const authorization = await getAuthorizationSnapshot();
  if (!authorization.authenticated || authorization.userType !== 'profile') {
    redirect('/login');
  }
  if (!hasCapability(authorization, 'scan_qr_attendance')) {
    redirect('/dashboard');
  }

  const coordinatorId = authorization.userId!;
  const coordinatorName = authorization.name || 'Coordinador';
  const committeeName = authorization.committeeName || '';

  return (
    <CheckInScanner 
      coordinatorId={coordinatorId} 
      coordinatorName={coordinatorName}
      role={authorization.role}
      committeeName={committeeName}
    />
  );
}
