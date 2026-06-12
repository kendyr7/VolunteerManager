'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function updateInitialPin(userId: string, userType: 'profile' | 'volunteer', newPin: string) {
  const supabase = await createClient();
  const table = userType === 'profile' ? 'profiles' : 'volunteers';
  
  const updateData: any = { pin: newPin };
  if (userType === 'volunteer') {
    updateData.pin_hash = newPin; // For volunteers using pin_hash
  }

  const { error } = await supabase
    .from(table)
    .update(updateData)
    .eq('id', userId);

  if (error) {
    console.error("Error updating initial PIN:", error);
    return { error: "No se pudo actualizar el PIN." };
  }

  // If successful, we need to create the session cookie because loginWithPin didn't do it
  const { data: user } = await supabase
    .from(table)
    .select('*, committees(name)')
    .eq('id', userId)
    .single();

  if (user) {
    const cookieStore = await cookies();
    const committeeName = user.committees?.name || '';
    
    if (userType === 'profile') {
      const role = user.role;
      cookieStore.set('session', `coordinator-${role}-${committeeName}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
      
      let redirectTo = '/dashboard';
      if (role === 'Editor') redirectTo = '/volunteers';
      if (role === 'Lector') redirectTo = '/shifts';

      return { success: true, redirectTo, role, committee: committeeName };
    } else {
      cookieStore.set('session', `volunteer-${user.id}-${committeeName}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
      return { success: true, redirectTo: '/calendar', role: 'Lector', committee: committeeName };
    }
  }

  return { error: "Error de sesión tras actualizar PIN." };
}
