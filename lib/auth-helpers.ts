import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth';

function getAdminClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  const { createClient } = require('@/lib/supabase/server');
  return createClient();
}

export async function getCurrentUserSession() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value;
    if (!sessionCookie) {
      return { userId: null, userName: 'Administrador', userRole: 'Admin', committee: null };
    }

    const session = verifySessionToken(sessionCookie);
    if (!session) {
      return { userId: null, userName: 'Administrador', userRole: 'Admin', committee: null };
    }

    const supabase = await getAdminClient();

    if (session.userType === 'profile') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, committees(name)')
        .eq('id', session.userId)
        .maybeSingle();

      if (profile?.full_name) {
        return {
          userId: session.userId,
          userName: profile.full_name,
          userRole: profile.role || session.role || 'Admin',
          committee: (profile.committees as any)?.name || session.committee || null,
        };
      }
    } else {
      const { data: vol } = await supabase
        .from('volunteers')
        .select('first_name, last_name, committees(name)')
        .eq('id', session.userId)
        .maybeSingle();

      if (vol?.first_name) {
        return {
          userId: session.userId,
          userName: `${vol.first_name || ''} ${vol.last_name || ''}`.trim(),
          userRole: session.role || 'Lector',
          committee: (vol.committees as any)?.name || session.committee || null,
        };
      }
    }

    return {
      userId: session.userId,
      userName: 'Administrador',
      userRole: session.role || 'Admin',
      committee: session.committee || null,
    };
  } catch (err) {
    console.error("Error fetching current user session:", err);
    return { userId: null, userName: 'Administrador', userRole: 'Admin', committee: null };
  }
}
