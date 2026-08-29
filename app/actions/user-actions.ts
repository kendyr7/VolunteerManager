'use server';

import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { requireCapability } from '@/lib/authorization';
import { CoordinatorType } from '@/lib/role-permissions';
import { sendVolunteerWelcomeTemplate } from '@/lib/whatsapp-api';
import { formatE164 } from '@/lib/whatsapp';
import { generateTemporaryPin } from '@/lib/pin-security';

type PlatformRole = 'Admin' | 'Editor' | 'Lector';

function relationName(relation: { name?: string | null } | Array<{ name?: string | null }> | null): string | undefined {
  const row = Array.isArray(relation) ? relation[0] : relation;
  return row?.name || undefined;
}

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
      supabase
        .from('profiles')
        .select('id, full_name, phone, role, coordinator_type, committee_id, status, created_at, committees(name)')
        .order('created_at', { ascending: false }),
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

    const pin = generateTemporaryPin();
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
      .select('id, full_name, phone, role, coordinator_type, committee_id, status, committees(name)')
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
        committee: relationName(inserted.committees),
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
      .select('id, full_name, phone, role, coordinator_type, committee_id, status, committees(name)')
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
        committee: relationName(updated.committees),
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
    const { error } = await supabase
      .from('profiles')
      .update({ pin: generateTemporaryPin() })
      .eq('id', userId);
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

export async function sendPlatformUserPinWhatsAppAction(userId: string) {
  try {
    const actor = await requireCapability('manage_platform_users');
    const supabase = await getAdminSupabase();
    const { data: user, error: fetchError } = await supabase
      .from('profiles')
      .select('id, full_name, phone, pin, status')
      .eq('id', userId)
      .maybeSingle();

    if (fetchError || !user) {
      return { success: false as const, error: 'No se encontró el usuario.' };
    }
    if (user.status === 'archived') {
      return { success: false as const, error: 'No se pueden enviar credenciales a un usuario archivado.' };
    }

    const phone = formatE164(user.phone || '');
    if (!phone) return { success: false as const, error: 'El usuario no tiene un teléfono válido.' };

    let pin = user.pin as string | null;
    if (!pin) {
      pin = generateTemporaryPin();
      const { error: updateError } = await supabase.from('profiles').update({ pin }).eq('id', userId);
      if (updateError) return { success: false as const, error: 'No se pudo generar el PIN de acceso.' };
    }

    const delivery = await sendVolunteerWelcomeTemplate({
      to: phone,
      name: user.full_name || 'Usuario',
      pin,
    });
    if (!delivery.success) {
      return { success: false as const, error: delivery.error || 'No se pudo enviar el PIN por WhatsApp.' };
    }

    await supabase.from('activity_logs').insert({
      user_name: actor.name,
      user_role: actor.role,
      action_type: 'Seguridad',
      description: `Envió el PIN de acceso de ${user.full_name || 'un usuario'} por WhatsApp`,
      details: JSON.stringify({ userId, operation: 'platform_user_pin_delivery' }),
      target_id: userId,
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'No autorizado.' };
  }
}

export async function sendBulkPlatformUserPinsWhatsAppAction(userIds: string[]) {
  try {
    const actor = await requireCapability('manage_platform_users');
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return { success: false as const, error: 'No se seleccionaron usuarios.' };
    }

    const supabase = await getAdminSupabase();
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, pin, status')
      .in('id', userIds)
      .neq('status', 'archived');
    if (error || !users) return { success: false as const, error: 'No se pudieron cargar los usuarios seleccionados.' };

    let sentCount = 0;
    let failedCount = 0;
    const results: Array<{ id: string; name: string; success: boolean; error?: string }> = [];

    for (const user of users) {
      const name = user.full_name || 'Usuario';
      const phone = formatE164(user.phone || '');
      if (!phone) {
        failedCount++;
        results.push({ id: user.id, name, success: false, error: 'Teléfono inválido o ausente.' });
        continue;
      }

      let pin = user.pin as string | null;
      if (!pin) {
        pin = generateTemporaryPin();
        const { error: pinError } = await supabase.from('profiles').update({ pin }).eq('id', user.id);
        if (pinError) {
          failedCount++;
          results.push({ id: user.id, name, success: false, error: 'No se pudo generar el PIN.' });
          continue;
        }
      }

      const delivery = await sendVolunteerWelcomeTemplate({ to: phone, name, pin });
      if (!delivery.success) {
        failedCount++;
        results.push({ id: user.id, name, success: false, error: delivery.error || 'WhatsApp rechazó el envío.' });
        continue;
      }

      sentCount++;
      results.push({ id: user.id, name, success: true });
      await supabase.from('activity_logs').insert({
        user_name: actor.name,
        user_role: actor.role,
        action_type: 'Seguridad',
        description: `Envió el PIN de acceso de ${name} por WhatsApp`,
        details: JSON.stringify({ userId: user.id, operation: 'platform_user_pin_delivery_bulk' }),
        target_id: user.id,
      });
      if (users.length > 1) await new Promise(resolve => setTimeout(resolve, 150));
    }

    return { success: true as const, total: users.length, sentCount, failedCount, results };
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
