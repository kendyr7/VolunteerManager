import { CommitteeAreaQueryService } from '@/lib/services/committee-area-query.service';
import {
  CommitteeAreasClient,
  type AreaView,
} from '@/app/(coordinator)/shifts/areas/CommitteeAreasClient';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Áreas y Cobertura | Volunteer Manager',
  description: 'Gestión de áreas operativas, metas de cobertura y asignación de voluntarios por comité.',
};

function parseAreaView(view?: string): AreaView {
  return view === 'areas' || view === 'assignments' || view === 'coverage'
    ? view
    : 'coverage';
}

export default async function AreasPage({
  searchParams,
}: {
  searchParams: Promise<{ committee?: string; area?: string; archived?: string; view?: string }>;
}) {
  const params = await searchParams;
  const data = await CommitteeAreaQueryService.getManagementData(params.committee);

  if (!data) {
    redirect('/shifts');
  }

  const requestedAreaId = params.area || null;
  const initiallyShowArchived = params.archived === '1';
  const initialView = parseAreaView(params.view);
  const visibleAreas = data.areas.filter((area) => initiallyShowArchived || area.status === 'active');
  const resolvedAreaId = visibleAreas.find((area) => area.id === requestedAreaId)?.id
    || visibleAreas.find((area) => area.status === 'active')?.id
    || visibleAreas[0]?.id
    || 'none';

  return (
    <CommitteeAreasClient
      key={`${data.selectedCommittee.id}:${resolvedAreaId}`}
      data={data}
      requestedAreaId={requestedAreaId}
      initiallyShowArchived={initiallyShowArchived}
      initialView={initialView}
      embedded={false}
    />
  );
}
