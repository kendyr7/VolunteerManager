import { Suspense } from 'react';
import ShiftChangeRequestsClient from '@/components/ShiftChangeRequestsClient';

export default function ReplacementsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-text">Cargando solicitudes...</p>}>
      <ShiftChangeRequestsClient />
    </Suspense>
  );
}
