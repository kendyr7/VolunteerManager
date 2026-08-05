'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { sendVolunteerWelcomeTemplate } from '@/lib/whatsapp-api';
import { formatE164 } from '@/lib/whatsapp';

function getAdminClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return createClient();
}

export async function createUserProfileAction({
  fullName,
  phone,
  role,
  committeeId,
  sendWhatsApp = true
}: {
  fullName: string;
  phone: string;
  role: 'Admin' | 'Editor' | 'Lector';
  committeeId?: string | null;
  sendWhatsApp?: boolean;
}) {
  try {
    const formattedPhone = formatE164(phone);
    if (!formattedPhone) {
      return { success: false, error: "Número de teléfono inválido." };
    }

    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const supabase = getAdminClient();

    const { data: inserted, error } = await supabase
      .from('profiles')
      .insert({
        full_name: fullName.trim(),
        phone: formattedPhone,
        role,
        committee_id: committeeId || null,
        pin
      })
      .select('*, committees(name)')
      .single();

    if (error) {
      console.error("Error creating user profile:", error);
      if (error.code === '23505') {
        return { success: false, error: "Este número de teléfono ya está registrado en el sistema." };
      }
      return { success: false, error: `Error al crear usuario: ${error.message}` };
    }

    // Audit log
    const { getCurrentUserSession } = await import('@/lib/auth-helpers');
    const sessionUser = await getCurrentUserSession();

    await supabase.from('activity_logs').insert({
      user_name: sessionUser.userName,
      user_role: sessionUser.userRole,
      action_type: 'Creación',
      description: `Creó el usuario de plataforma "${fullName.trim()}" (${role})`,
      details: `Tel: ${formattedPhone} · PIN: ${pin}`
    });

    let waSuccess = false;
    let waError: string | undefined;

    if (sendWhatsApp) {
      const waResult = await sendVolunteerWelcomeTemplate({
        to: formattedPhone,
        name: fullName.trim(),
        pin
      });
      waSuccess = waResult.success;
      waError = waResult.error;
    }

    return {
      success: true,
      user: {
        id: inserted.id,
        name: inserted.full_name,
        phone: inserted.phone,
        role: inserted.role,
        committee: inserted.committees?.name,
        pin: inserted.pin
      },
      waSuccess,
      waError
    };
  } catch (err: any) {
    console.error("Exception in createUserProfileAction:", err);
    return { success: false, error: err.message || "Error de servidor al crear usuario." };
  }
}

export async function updateUserProfileAction({
  userId,
  fullName,
  phone,
  role,
  committeeId
}: {
  userId: string;
  fullName: string;
  phone: string;
  role: 'Admin' | 'Editor' | 'Lector';
  committeeId?: string | null;
}) {
  try {
    const formattedPhone = formatE164(phone);
    if (!formattedPhone) {
      return { success: false, error: "Número de teléfono inválido." };
    }

    const supabase = getAdminClient();

    const { data: updated, error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: formattedPhone,
        role,
        committee_id: role === 'Editor' ? (committeeId || null) : null
      })
      .eq('id', userId)
      .select('*, committees(name)')
      .single();

    if (error) {
      console.error("Error updating user profile:", error);
      return { success: false, error: `Error al actualizar usuario: ${error.message}` };
    }

    // Audit log
    try {
      const { getCurrentUserSession } = await import('@/lib/auth-helpers');
      const sessionUser = await getCurrentUserSession();

      await supabase.from('activity_logs').insert({
        user_name: sessionUser.userName,
        user_role: sessionUser.userRole,
        action_type: 'Edición',
        description: `Actualizó el usuario de plataforma "${fullName.trim()}" (Rol: ${role})`,
        details: `ID: ${userId} · Tel: ${formattedPhone} · Rol: ${role}`
      });
    } catch (e) {}

    return {
      success: true,
      user: {
        id: updated.id,
        name: updated.full_name,
        phone: updated.phone,
        role: updated.role,
        committee: updated.committees?.name
      }
    };
  } catch (err: any) {
    console.error("Exception in updateUserProfileAction:", err);
    return { success: false, error: err.message || "Error de servidor al actualizar usuario." };
  }
}
