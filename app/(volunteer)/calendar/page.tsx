import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ShiftCalendar, VolunteerInfo } from "@/components/ShiftCalendar";
import { verifySessionToken } from "@/lib/auth";

export const metadata = {
  title: "Mi Calendario | Volunteer Manager",
  description: "Calendario de turnos de voluntariado",
};

export default async function CalendarPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value || '';
  const session = verifySessionToken(sessionCookie);

  if (!session || session.userType !== 'volunteer') {
    redirect('/login');
  }

  const volunteerId = session.userId;

  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? (await import('@supabase/supabase-js')).createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    : await createClient();

  const [{ data: volunteer, error }, { data: initialShifts }] = await Promise.all([
    supabase
      .from('volunteers')
      .select('*, committees(name)')
      .eq('id', volunteerId)
      .maybeSingle(),
    supabase
      .from('shifts')
      .select('*')
      .eq('volunteer_id', volunteerId)
  ]);

  if (error || !volunteer) {
    console.error("CALENDAR_PAGE_ERROR:", error);
    redirect('/login');
  }

  const fullName = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim();
  const commName = (volunteer.committees as any)?.name || session.committee || 'Sin comité';

  const volunteerInfo: VolunteerInfo = {
    id: volunteer.id,
    name: fullName,
    first_name: volunteer.first_name || '',
    last_name: volunteer.last_name || '',
    committee: commName,
    stake: volunteer.stake || '',
    ward: volunteer.neighborhood || '',
    phone: volunteer.phone || '',
    reliability: volunteer.reliability_score ?? 100,
    age: volunteer.age || undefined,
  };

  return (
    <div className="min-h-screen bg-dark text-text pb-12 flex flex-col w-full">
      {/* Sticky Header matching layout background */}
      <div className="sticky top-0 z-40 bg-dark/80 backdrop-blur-xl pt-5 pb-3 px-4 sm:px-6 lg:px-8 flex items-center justify-between border-b border-border pointer-events-auto w-full">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-black text-text tracking-tight flex items-center gap-2">
            <span>Mi Calendario</span>
          </h1>
        </div>
      </div>

      {/* Main Content - Full 100% Width */}
      <main className="w-full px-4 sm:px-6 lg:px-8 mt-4 flex-1">
        <ShiftCalendar volunteerId={volunteerId} volunteerInfo={volunteerInfo} initialShifts={initialShifts || []} />
      </main>
    </div>
  );
}