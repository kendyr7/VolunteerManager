import { redirect } from "next/navigation";
import { CheckInScanner } from "@/components/CheckInScanner";
import { getAuthorizationSnapshot } from '@/lib/authorization';
import { hasCapability } from '@/lib/role-permissions';
import { getCurrentAttendanceHistoryAction } from '@/app/actions/attendance';

export const metadata = {
  title: "Escanear Turno | Volunteer Manager",
  description: "Escanear pases QR de voluntarios para registrar asistencia",
};

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
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
  let initialHistory: Awaited<ReturnType<typeof getCurrentAttendanceHistoryAction>> | undefined;
  let initialHistoryError = '';
  try {
    initialHistory = await getCurrentAttendanceHistoryAction();
  } catch {
    initialHistoryError = 'No se pudo cargar Esta sesión. Usa Actualizar para reintentar; los registros no se han borrado.';
  }

  return (
    <CheckInScanner 
      coordinatorId={coordinatorId} 
      coordinatorName={coordinatorName}
      role={authorization.role}
      committeeName={committeeName}
      initialView={params.view === 'scanner' ? 'scanner' : 'history'}
      initialHistory={initialHistory}
      initialHistoryError={initialHistoryError}
    />
  );
}
