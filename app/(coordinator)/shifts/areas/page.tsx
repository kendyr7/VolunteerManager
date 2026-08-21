import { redirect } from 'next/navigation';

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
  const canonicalParams = new URLSearchParams();
  if (params.committee) canonicalParams.set('committee', params.committee);
  if (params.area) canonicalParams.set('area', params.area);
  if (params.archived === '1') canonicalParams.set('archived', '1');
  if (params.view) canonicalParams.set('view', params.view);
  const searchStr = canonicalParams.toString();
  redirect(`/areas${searchStr ? `?${searchStr}` : ''}`);
}
