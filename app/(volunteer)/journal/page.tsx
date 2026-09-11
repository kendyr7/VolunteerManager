import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import { VolunteerScheduleService } from '@/lib/services/volunteer-schedule.service';
import { VolunteerJournal } from '@/components/journal/VolunteerJournal';
import { getJournalDays } from '@/lib/journal-days';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Mi diario | Volunteer Manager',
  description: 'Tus recuerdos y sentimientos de cada día de servicio',
};

export default async function JournalPage() {
  const session = verifySessionToken((await cookies()).get('session')?.value ?? '');
  if (!session || session.userType !== 'volunteer') redirect('/login');

  // Read the existing schedule only. Journal content never leaves the client.
  const shifts = await VolunteerScheduleService.getSchedule(session.userId);
  const days = getJournalDays(shifts);
  return <VolunteerJournal key={session.userId} volunteerId={session.userId} days={days} />;
}
