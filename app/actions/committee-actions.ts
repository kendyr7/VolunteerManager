'use server'

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifySessionToken } from '@/lib/auth';

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

async function verifyAdminSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;
  if (!sessionCookie) return false;

  const session = verifySessionToken(sessionCookie);
  if (!session || session.role !== 'Admin') return false;

  return true;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createCommitteeAction(name: string) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return { error: "Solo los administradores pueden crear nuevos comités." };
  }

  const cleanName = (name || '').trim();
  if (!cleanName || cleanName.length < 2) {
    return { error: "Ingresa un nombre válido de al menos 2 caracteres." };
  }

  const slug = slugify(cleanName);
  const supabase = getAdminClient();

  // Check if committee already exists
  const { data: existing } = await supabase
    .from('committees')
    .select('id')
    .ilike('name', cleanName)
    .maybeSingle();

  if (existing) {
    return { error: "Ya existe un comité con este nombre." };
  }

  // Insert committee (using name payload for maximum schema compatibility)
  const { data: newComm, error: commErr } = await supabase
    .from('committees')
    .insert({ name: cleanName })
    .select('*')
    .single();

  if (commErr || !newComm) {
    // If slug is required by schema constraints, try with slug
    const { data: retryComm, error: retryErr } = await supabase
      .from('committees')
      .insert({ name: cleanName, slug })
      .select('*')
      .single();

    if (retryErr || !retryComm) {
      console.error("Error creating committee:", commErr || retryErr);
      return { error: `Error al crear el comité: ${commErr?.message || retryErr?.message || 'Error desconocido'}` };
    }
    return { success: true, committee: retryComm };
  }

  // Automatically insert default requirements (4 per shift T1-T4)
  const shiftKeys: Array<'T1' | 'T2' | 'T3' | 'T4'> = ['T1', 'T2', 'T3', 'T4'];
  const reqRows = shiftKeys.map(sk => ({
    committee_id: newComm.id,
    shift_key: sk,
    required: 4,
    updated_at: new Date().toISOString(),
  }));

  const { error: reqErr } = await supabase
    .from('committee_shift_requirements')
    .upsert(reqRows, { onConflict: 'committee_id,shift_key' });

  if (reqErr) {
    console.warn("Notice: committee_shift_requirements default upsert warning:", reqErr.message);
  }

  // Audit log
  await supabase.from('activity_logs').insert({
    user_name: 'Administrador',
    user_role: 'Admin',
    action_type: 'Creación',
    description: `Creó el nuevo comité "${cleanName}"`,
    details: `ID de comité: ${newComm.id}`
  });

  return { success: true, committee: newComm };
}

export async function archiveCommitteeAction(
  committeeId: string,
  expectedName: string,
  inputName: string,
  deleteText: string
) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return { error: "Solo los administradores pueden archivar comités." };
  }

  if (!committeeId) {
    return { error: "ID de comité no proporcionado." };
  }

  if (inputName.trim() !== expectedName.trim()) {
    return { error: "El nombre del comité ingresado no coincide exactamente." };
  }

  if (deleteText.trim().toLowerCase() !== 'delete') {
    return { error: 'Debes escribir la palabra "delete" para confirmar la archivación.' };
  }

  const supabase = getAdminClient();

  // 1. Unlink volunteers by setting committee_id to NULL
  const { error: volErr } = await supabase
    .from('volunteers')
    .update({ committee_id: null })
    .eq('committee_id', committeeId);

  if (volErr) {
    console.error("Error unlinking volunteers from committee:", volErr);
  }

  // 2. Unlink profiles by setting committee_id to NULL
  const { error: profErr } = await supabase
    .from('profiles')
    .update({ committee_id: null })
    .eq('committee_id', committeeId);

  if (profErr) {
    console.error("Error unlinking profiles from committee:", profErr);
  }

  // 3. Update committee status to 'archived'
  const { error: archiveErr } = await supabase
    .from('committees')
    .update({ status: 'archived' })
    .eq('id', committeeId);

  if (archiveErr) {
    // If status column is not in DB yet, clean requirements and delete row
    await supabase
      .from('committee_shift_requirements')
      .delete()
      .eq('committee_id', committeeId);

    const { error: delErr } = await supabase
      .from('committees')
      .delete()
      .eq('id', committeeId);

    if (delErr) {
      console.error("Error deleting committee:", delErr);
      return { error: `No se pudo archivar el comité: ${delErr.message}` };
    }
  }

  // Audit log
  await supabase.from('activity_logs').insert({
    user_name: 'Administrador',
    user_role: 'Admin',
    action_type: 'Eliminación',
    description: `Archivó el comité "${expectedName}"`,
    details: `Desvinculó los voluntarios asignados a este comité.`
  });

  return { success: true };
}

export async function unarchiveCommitteeAction(committeeId: string) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return { error: "Solo los administradores pueden desarchivar comités." };
  }

  if (!committeeId) {
    return { error: "ID de comité no proporcionado." };
  }

  const supabase = getAdminClient();
  const { error } = await supabase
    .from('committees')
    .update({ status: 'active' })
    .eq('id', committeeId);

  if (error) {
    console.error("Error unarchiving committee:", error);
    return { error: `No se pudo desarchivar el comité: ${error.message}` };
  }

  // Audit log
  await supabase.from('activity_logs').insert({
    user_name: 'Administrador',
    user_role: 'Admin',
    action_type: 'Edición',
    description: `Desarchivó y restauró el comité`,
    details: `ID de comité: ${committeeId}`
  });

  return { success: true };
}
