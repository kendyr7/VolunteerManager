import { redirect } from 'next/navigation';
import { CommitteeAreaQueryService } from '@/lib/services/committee-area-query.service';
import { CommitteeAreasClient } from './CommitteeAreasClient';

export const metadata = {
  title: 'Áreas y cobertura | Volunteer Manager',
  description: 'Configura las áreas operativas y la cobertura requerida por día y turno.',
};

export default async function CommitteeAreasPage({
  searchParams,
}: {
  searchParams: Promise<{ committee?: string; area?: string; archived?: string; view?: string }>;
}) {
  const params = await searchParams;
  const data = await CommitteeAreaQueryService.getManagementData(params.committee);
  if (!data) redirect('/dashboard');

  if (data.isAdmin && params.committee && params.committee !== data.selectedCommittee.slug) {
    const canonicalParams = new URLSearchParams();
    canonicalParams.set('committee', data.selectedCommittee.slug);
    if (params.area) canonicalParams.set('area', params.area);
    if (params.archived === '1') canonicalParams.set('archived', '1');
    if (params.view === 'assignments' || params.view === 'coverage') canonicalParams.set('view', params.view);
    redirect(`/shifts/areas?${canonicalParams.toString()}`);
  }

  return (
    <CommitteeAreasClient
      key={`${data.selectedCommittee.id}:${params.area || 'default'}:${params.archived || 'active'}:${params.view || 'areas'}`}
      data={data}
      requestedAreaId={params.area || null}
      initiallyShowArchived={params.archived === '1'}
      initialView={params.view === 'assignments' || params.view === 'coverage' ? params.view : 'areas'}
    />
  );
}
