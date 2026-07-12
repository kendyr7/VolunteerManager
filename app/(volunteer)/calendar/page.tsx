import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ShiftCalendar } from "@/components/ShiftCalendar";
import { EntryPassButton } from "@/components/EntryPassButton";

export const metadata = {
  title: "Mi Calendario | Volunteer Manager",
  description: "Calendario de turnos de voluntariado",
};

export default async function CalendarPage() {
  const cookieStore = await cookies();
  const session = decodeURIComponent(cookieStore.get('session')?.value || '');

  console.log("CALENDAR_LOG: Reading session cookie:", session);

  if (!session) {
    console.log("CALENDAR_LOG: Redirecting because session is empty");
    redirect('/login');
  }

  if (!session.startsWith('volunteer-')) {
    console.log("CALENDAR_LOG: Redirecting because session does not start with 'volunteer-'");
    redirect('/login');
  }

  const volunteerId = session.substring(10, 46);
  const committeeName = session.substring(47) || 'Sin comité';

  const supabase = await createClient();
  const { data: volunteer, error } = await supabase
    .from('volunteers')
    .select('first_name, last_name')
    .eq('id', volunteerId)
    .single();

  console.log("CALENDAR_LOG: Supabase fetch volunteer result:", { volunteer, error });

  if (error || !volunteer) {
    console.log("CALENDAR_LOG: Redirecting because of DB error or volunteer not found", { error, volunteer });
    redirect('/login');
  }

  const fullName = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim();

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-12 flex flex-col">
      {/* Sticky Header matching admin design */}
      <div className="sticky top-0 z-40 bg-slate-950/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 mb-4 border-b border-white/10 pointer-events-auto">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-white tracking-tight flex items-center gap-3">
            Mis Turnos
          </h1>
          
          <div className="flex items-center gap-3">
            <EntryPassButton 
              volunteerId={volunteerId}
              volunteerName={fullName}
              committeeName={committeeName}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-2">

        <ShiftCalendar volunteerId={volunteerId} />
      </main>
    </div>
  );
}
