'use server';

import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { requireCapability } from '@/lib/authorization';
import { CoordinatorType } from '@/lib/role-permissions';
import { sendVolunteerWelcomeTemplate } from '@/lib/whatsapp-api';
import { formatE164 } from '@/lib/whatsapp';

type PlatformRole = 'Admin' | 'Editor' | 'Lector';

export async function getCurrentSettingsProfileAction() {
  try {
    const sessionToken = (await cookies()).get('session')?.value;
    const session = sessionToken ? verifySessionToken(sessionToken) : null;
    if (!session?.userId) return { success: false as const, error: 'No hay una sesión válida.' };

    const supabase = await getAdminSupabase();
    const isVolunteer = session.userType === 'volunteer';
    const table = isVolunteer ? 'volunteers' : 'profiles';
    const fields = isVolunteer
      ? 'id, first_name, last_name, phone, committee_id, status, created_at, committees(name)'
      : 'id, full_name, phone, role, coordinator_type, committee_id, status, created_at, committees(name)';
    const { data: user, error } = await supabase.from(table).select(fields).eq('id', session.userId).maybeSingle();

    if (error || !user) return { success: false as const, error: 'No se encontró el perfil de la sesión actual.' };
    return {
      success: true as const,
      user,
      role: isVolunteer ? 'Lector' : ((user as { role?: PlatformRole }).role || 'Editor'),
    };
  } catch (error) {
    console.error('Error loading current settings profile:', error);
    return { success: false as const, error: 'No se pudo cargar el perfil actual.' };
  }
}

export async function listUserProfilesAction() {
  try {
    await requireCapability('manage_platform_users');
    const supabase = await getAdminSupabase();
    const [profilesResult, committeesResult] = await Promise.all([
      supabase.from('profiles').select('*, committees(name)').order('created_at', { ascending: false }),
      supabase.from('committees').select('id, name').or('status.is.null,status.neq.archived'),
    ]);
    const error = profilesResult.error || committeesResult.error;
    if (error) return { success: false as const, error: error.message };
    return {
      success: true as const,
      profiles: profilesResult.data || [],
      committees: committeesResult.data || [],
    };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'No autorizado.' };
  }
}

export async function createUserProfileAction({
  fullName,
  phone,
  role,
  committeeId,
  coordinatorType,
  sendWhatsApp = true,
}: {
  fullName: string;
  phone: string;
  role: PlatformRole;
  committeeId?: string | null;
  coordinatorType?: CoordinatorType | null;
  sendWhatsApp?: boolean;
}) {
  try {
    const actor = await requireCapability('manage_platform_users');
    if (role === 'Lector') {
      return {
        success: false as const,
        error: 'Los voluntarios se crean y administran desde la sección Voluntarios.',
      };
    }
    const formattedPhone = formatE164(phone);
    if (!formattedPhone) return { success: false as const, error: 'Número de teléfono inválido.' };

    const normalizedType = role === 'Editor' ? (coordinatorType || 'committee') : null;
    if (normalizedType === 'committee' && !committeeId) {
      return { success: false as const, error: 'Selecciona el comité del Coordinador de comité.' };
    }

    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const supabase = await getAdminSupabase();
    const { data: inserted, error } = await supabase
      .from('profiles')
      .insert({
        full_name: fullName.trim(),
        phone: formattedPhone,
        role,
        coordinator_type: normalizedType,
        committee_id: normalizedType === 'committee' ? committeeId : null,
        pin,
      })
      .select('*, committees(name)')
      .single();

    if (error) {
      if (error.code === '23505') return { success: false as const, error: 'Este número de teléfono ya está registrado.' };
      return { success: false as const, error: `Error al crear usuario: ${error.message}` };
    }

    await supabase.from('activity_logs').insert({
      user_name: actor.name,
      user_role: actor.role,
      action_type: 'Creación',
      description: `Creó el usuario de plataforma "${fullName.trim()}"`,
      details: JSON.stringify({ phone: formattedPhone, role, coordinatorType: normalizedType }),
      target_id: inserted.id,
    });

    let waSuccess = false;
    let waError: string | undefined;
    if (sendWhatsApp) {
      const result = await sendVolunteerWelcomeTemplate({ to: formattedPhone, name: fullName.trim(), pin });
      waSuccess = result.success;
      waError = result.error;
    }

    return {
      success: true as const,
      user: {
        id: inserted.id,
        name: inserted.full_name,
        phone: inserted.phone,
        role: inserted.role,
        coordinatorType: inserted.coordinator_type,
        committee: inserted.committees?.name,
        pin: inserted.pin,
      },
      waSuccess,
      waError,
    };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Error de servidor.' };
  }
}

export async function updateUserProfileAction({
  userId,
  fullName,
  phone,
  role,
  committeeId,
  coordinatorType,
}: {
  userId: string;
  fullName: string;
  phone: string;
  role: PlatformRole;
  committeeId?: string | null;
  coordinatorType?: CoordinatorType | null;
}) {
  try {
    const actor = await requireCapability('manage_platform_users');
    if (role === 'Lector') {
      return {
        success: false as const,
        error: 'El rol Voluntario no se asigna a usuarios de plataforma. Administra ese perfil desde Voluntarios.',
      };
    }
    const formattedPhone = formatE164(phone);
    if (!formattedPhone) return { success: false as const, error: 'Número de teléfono inválido.' };

    const normalizedType = role === 'Editor' ? (coordinatorType || 'committee') : null;
    if (normalizedType === 'committee' && !committeeId) {
      return { success: false as const, error: 'Selecciona el comité del Coordinador de comité.' };
    }

    const supabase = await getAdminSupabase();
    const { data: updated, error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: formattedPhone,
        role,
        coordinator_type: normalizedType,
        committee_id: normalizedType === 'committee' ? committeeId : null,
      })
      .eq('id', userId)
      .select('*, committees(name)')
      .single();
    if (error) return { success: false as const, error: `Error al actualizar usuario: ${error.message}` };

    await supabase.from('activity_logs').insert({
      user_name: actor.name,
      user_role: actor.role,
      action_type: 'Edición',
      description: `Actualizó el usuario de plataforma "${fullName.trim()}"`,
      details: JSON.stringify({ userId, phone: formattedPhone, role, coordinatorType: normalizedType }),
      target_id: userId,
    });

    return {
      success: true as const,
      user: {
        id: updated.id,
        name: updated.full_name,
        phone: updated.phone,
        role: updated.role,
        coordinatorType: updated.coordinator_type,
        committee: updated.committees?.name,
      },
    };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Error de servidor.' };
  }
}

export async function resetPlatformUserPinAction(userId: string) {
  try {
    const actor = await requireCapability('manage_platform_users');
    const supabase = await getAdminSupabase();
    const { data: user } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
    const { error } = await supabase.from('profiles').update({ pin: '1234' }).eq('id', userId);
    if (error) return { success: false as const, error: error.message };
    await supabase.from('activity_logs').insert({
      user_name: actor.name,
      user_role: actor.role,
      action_type: 'Seguridad',
      description: `Restableció el PIN de ${user?.full_name || 'un usuario'}`,
      details: JSON.stringify({ userId }),
      target_id: userId,
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'No autorizado.' };
  }
}

export async function updatePlatformUserStatusAction(userId: string, status: 'active' | 'archived') {
  try {
    const actor = await requireCapability('manage_platform_users');
    if (actor.userId === userId && status === 'archived') {
      return { success: false as const, error: 'No puedes archivar tu propio usuario.' };
    }
    const supabase = await getAdminSupabase();
    const { data: user } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
    const { error } = await supabase.from('profiles').update({ status }).eq('id', userId);
    if (error) return { success: false as const, error: error.message };
    await supabase.from('activity_logs').insert({
      user_name: actor.name,
      user_role: actor.role,
      action_type: status === 'archived' ? 'Archivo' : 'Restauración',
      description: `${status === 'archived' ? 'Archivó' : 'Desarchivó'} el usuario ${user?.full_name || ''}`,
      details: JSON.stringify({ userId, status }),
      target_id: userId,
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'No autorizado.' };
  }
}
