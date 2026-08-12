'use server';

import { revalidatePath } from 'next/cache';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAuthorizationSnapshot, requireCapability } from '@/lib/authorization';
import {
  CONFIGURABLE_PERMISSION_LABELS,
  CONFIGURABLE_PERMISSION_DEFAULTS,
  CONFIGURABLE_PERMISSION_KEYS,
  ConfigurablePermissionKey,
  configurablePermissionRoleLabel,
  roleDisplayName,
} from '@/lib/role-permissions';

export async function getCurrentAuthorizationAction() {
  try {
    return { success: true as const, snapshot: await getAuthorizationSnapshot() };
  } catch (error) {
    console.error('[PERMISSIONS] Could not resolve authorization:', error);
    return { success: false as const, error: 'No se pudieron cargar los permisos.' };
  }
}

export async function updateRolePermissionAction(
  key: ConfigurablePermissionKey,
  enabled: boolean
) {
  try {
    const actor = await requireCapability('manage_permissions');
    if (!CONFIGURABLE_PERMISSION_KEYS.includes(key)) {
      return { success: false as const, error: 'Permiso desconocido.' };
    }

    const supabase = await getAdminSupabase();
    const { data: previous } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    const { error } = await supabase.from('system_settings').upsert(
      { key, value: enabled ? 'true' : 'false', updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if (error) return { success: false as const, error: error.message };

    const permissionLabel = CONFIGURABLE_PERMISSION_LABELS[key];
    const targetRoleLabel = configurablePermissionRoleLabel(key);
    const { error: auditError } = await supabase.from('activity_logs').insert({
      user_name: actor.name,
      user_role: roleDisplayName(actor),
      action_type: 'Permisos',
      description: `${enabled ? 'Habilitó' : 'Deshabilitó'} “${permissionLabel}” para ${targetRoleLabel}`,
      details: JSON.stringify({
        context: `${permissionLabel}: ${enabled ? 'habilitado' : 'deshabilitado'} para ${targetRoleLabel}`,
        key,
        permissionLabel,
        targetRole: targetRoleLabel,
        previous: previous?.value === 'true',
        enabled,
      }),
      target_id: actor.userId,
    });

    if (auditError) {
      const rollback = previous
        ? await supabase.from('system_settings').upsert(
            { key, value: previous.value, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          )
        : await supabase.from('system_settings').delete().eq('key', key);

      console.error('[PERMISSIONS] Audit write failed; permission change rolled back:', auditError.message);
      if (rollback.error) {
        console.error('[PERMISSIONS] Permission rollback also failed:', rollback.error.message);
      }
      return {
        success: false as const,
        error: 'No se guardó el cambio porque no fue posible registrar la auditoría.',
      };
    }

    revalidatePath('/settings');
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'No se pudo actualizar el permiso.',
    };
  }
}

export async function resetRolePermissionsAction() {
  try {
    const actor = await requireCapability('manage_permissions');
    const supabase = await getAdminSupabase();
    const { data: previousRows, error: previousRowsError } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', CONFIGURABLE_PERMISSION_KEYS);
    if (previousRowsError) {
      return { success: false as const, error: previousRowsError.message };
    }

    const previousByKey = new Map((previousRows || []).map(row => [row.key, row.value]));
    const rows = Object.entries(CONFIGURABLE_PERMISSION_DEFAULTS).map(([key, enabled]) => ({
      key,
      value: enabled ? 'true' : 'false',
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('system_settings').upsert(rows, { onConflict: 'key' });
    if (error) return { success: false as const, error: error.message };

    const { error: auditError } = await supabase.from('activity_logs').insert({
      user_name: actor.name,
      user_role: roleDisplayName(actor),
      action_type: 'Permisos',
      description: 'Restableció los permisos por rol',
      details: JSON.stringify({
        context: 'Restableció todos los permisos configurables a sus valores predeterminados',
        permissions: Object.entries(CONFIGURABLE_PERMISSION_DEFAULTS).map(([key, enabled]) => ({
          key,
          label: CONFIGURABLE_PERMISSION_LABELS[key as ConfigurablePermissionKey],
          role: configurablePermissionRoleLabel(key as ConfigurablePermissionKey),
          enabled,
        })),
      }),
      target_id: actor.userId,
    });

    if (auditError) {
      const keysWithoutPreviousValue = CONFIGURABLE_PERMISSION_KEYS.filter(key => !previousByKey.has(key));
      const rollbackRows = CONFIGURABLE_PERMISSION_KEYS
        .filter(key => previousByKey.has(key))
        .map(key => ({
          key,
          value: previousByKey.get(key)!,
          updated_at: new Date().toISOString(),
        }));

      if (rollbackRows.length > 0) {
        const rollback = await supabase.from('system_settings').upsert(rollbackRows, { onConflict: 'key' });
        if (rollback.error) console.error('[PERMISSIONS] Reset rollback failed:', rollback.error.message);
      }
      if (keysWithoutPreviousValue.length > 0) {
        const cleanup = await supabase.from('system_settings').delete().in('key', keysWithoutPreviousValue);
        if (cleanup.error) console.error('[PERMISSIONS] Reset cleanup failed:', cleanup.error.message);
      }

      console.error('[PERMISSIONS] Reset audit write failed; reset rolled back:', auditError.message);
      return {
        success: false as const,
        error: 'No se restablecieron los permisos porque no fue posible registrar la auditoría.',
      };
    }

    revalidatePath('/settings');
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'No se pudieron restablecer los permisos.',
    };
  }
}
