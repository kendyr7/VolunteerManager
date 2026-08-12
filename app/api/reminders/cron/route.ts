import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sendShiftReminderTemplate } from '@/lib/whatsapp-api';
import { formatE164 } from '@/lib/whatsapp';
import { formatDateShort, getOfficialShiftTime } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const REMINDER_TIME_ZONE = 'America/Guatemala';
const DEFAULT_LEAD_DAYS = 3;

type ShiftRow = {
  volunteer_id: string;
  day_key: string;
  shift_key: string;
};

type VolunteerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string | null;
  committees: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  return Boolean(cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`);
}

function getLeadDays(): number {
  const configured = Number.parseInt(process.env.WHATSAPP_REMINDER_LEAD_DAYS || '', 10);
  return Number.isInteger(configured) && configured >= 1 && configured <= 14
    ? configured
    : DEFAULT_LEAD_DAYS;
}

function getTodayInTimeZone(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REMINDER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value || 0);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day'), 12));
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function committeeName(volunteer: VolunteerRow): string {
  const relation = Array.isArray(volunteer.committees)
    ? volunteer.committees[0]
    : volunteer.committees;
  return relation?.name?.trim() || 'Servicio';
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.WHATSAPP_ENABLED === 'false') {
    return NextResponse.json({ success: true, skipped: true, reason: 'whatsapp_disabled' });
  }

  const leadDays = getLeadDays();
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const requestedTarget = dryRun ? request.nextUrl.searchParams.get('targetDate') : null;
  const targetDate = requestedTarget && /^\d{4}-\d{2}-\d{2}$/.test(requestedTarget)
    ? new Date(`${requestedTarget}T12:00:00.000Z`)
    : addUtcDays(getTodayInTimeZone(), leadDays);
  if (Number.isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: 'Invalid targetDate.' }, { status: 400 });
  }
  const targetIso = isoDate(targetDate);
  const targetShort = formatDateShort(targetDate).toLowerCase();
  const targetShortTitle = `${targetShort.charAt(0).toUpperCase()}${targetShort.slice(1)}`;
  const targetKeys = Array.from(new Set([targetIso, targetShort, targetShortTitle]));
  const supabase = await getAdminSupabase();

  const { data: shiftData, error: shiftsError } = await supabase
    .from('shifts')
    .select('volunteer_id, day_key, shift_key')
    .in('day_key', targetKeys)
    .in('shift_key', ['T1', 'T2', 'T3', 'T4']);

  if (shiftsError) {
    console.error('[REMINDER CRON] Could not load target shifts:', shiftsError.message);
    return NextResponse.json({ error: 'Could not load target shifts.' }, { status: 500 });
  }

  const uniqueShifts = Array.from(
    new Map(
      ((shiftData || []) as ShiftRow[])
        .filter(row => row.volunteer_id)
        .map(row => [`${row.volunteer_id}:${row.shift_key}`, row])
    ).values()
  );

  if (uniqueShifts.length === 0) {
    return NextResponse.json({
      success: true,
      targetDate: targetIso,
      leadDays,
      scheduled: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    });
  }

  const volunteerIds = Array.from(new Set(uniqueShifts.map(row => row.volunteer_id)));
  const { data: existingReminderData, error: existingReminderError } = await supabase
    .from('reminder_logs')
    .select('volunteer_id, shift_key, status, delivery_status')
    .in('volunteer_id', volunteerIds)
    .in('day_key', targetKeys)
    .in('shift_key', ['T1', 'T2', 'T3', 'T4']);

  if (existingReminderError) {
    console.error('[REMINDER CRON] Could not check existing reminders:', existingReminderError.message);
    return NextResponse.json({ error: 'Could not verify existing reminders.' }, { status: 500 });
  }

  const alreadyContacted = new Set(
    (existingReminderData || [])
      .filter(row =>
        (row.status === 'contactado' || row.status === 'confirmado') &&
        row.delivery_status !== 'failed'
      )
      .map(row => `${row.volunteer_id}:${row.shift_key}`)
  );

  const { data: volunteerData, error: volunteersError } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, status, committees(name)')
    .in('id', volunteerIds)
    .or('status.is.null,status.neq.archived');

  if (volunteersError) {
    console.error('[REMINDER CRON] Could not load target volunteers:', volunteersError.message);
    return NextResponse.json({ error: 'Could not load target volunteers.' }, { status: 500 });
  }

  const volunteers = new Map(
    ((volunteerData || []) as VolunteerRow[]).map(volunteer => [volunteer.id, volunteer])
  );
  const shiftsPerVolunteer = new Map<string, number>();
  for (const shift of uniqueShifts) {
    shiftsPerVolunteer.set(shift.volunteer_id, (shiftsPerVolunteer.get(shift.volunteer_id) || 0) + 1);
  }
  const invalidRecipientsPreview = uniqueShifts.filter(shift => {
    const volunteer = volunteers.get(shift.volunteer_id);
    return !alreadyContacted.has(`${shift.volunteer_id}:${shift.shift_key}`) &&
      (!volunteer || !formatE164(volunteer.phone || ''));
  }).length;
  const alreadyContactedCount = uniqueShifts.filter(shift =>
    alreadyContacted.has(`${shift.volunteer_id}:${shift.shift_key}`)
  ).length;

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      targetDate: targetIso,
      leadDays,
      scheduled: uniqueShifts.length,
      volunteers: volunteers.size,
      volunteersWithMultipleShifts: Array.from(shiftsPerVolunteer.values()).filter(count => count > 1).length,
      invalidRecipients: invalidRecipientsPreview,
      alreadyContacted: alreadyContactedCount,
      wouldSend: uniqueShifts.length - alreadyContactedCount - invalidRecipientsPreview,
    });
  }

  const shiftDate = format(targetDate, "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let invalidRecipients = 0;
  let trackingFailures = 0;

  for (const shift of uniqueShifts) {
    if (alreadyContacted.has(`${shift.volunteer_id}:${shift.shift_key}`)) {
      skipped += 1;
      continue;
    }

    const volunteer = volunteers.get(shift.volunteer_id);
    const phone = volunteer ? formatE164(volunteer.phone || '') : null;
    if (!volunteer || !phone) {
      invalidRecipients += 1;
      continue;
    }

    const automationKey = `shift-reminder:${targetIso}:${volunteer.id}:${shift.shift_key}:${leadDays}d`;
    const claimedAt = new Date().toISOString();
    const { data: claim, error: claimError } = await supabase
      .from('reminder_logs')
      .insert({
        volunteer_id: volunteer.id,
        shift_key: shift.shift_key,
        day_key: targetShort,
        whatsapp_message_id: null,
        status: 'contactado',
        sent_at: claimedAt,
        delivery_status: 'pending',
        delivery_updated_at: claimedAt,
        send_source: 'automatic',
        automation_key: automationKey,
        raw_payload: { automatic: true, leadDays, targetDate: targetIso, state: 'claimed' },
      })
      .select('id')
      .single();

    if (claimError) {
      if (claimError.code === '23505') {
        skipped += 1;
      } else {
        trackingFailures += 1;
        console.error('[REMINDER CRON] Could not claim automatic reminder:', {
          volunteerId: volunteer.id,
          shiftKey: shift.shift_key,
          error: claimError.message,
        });
      }
      continue;
    }

    const fullName = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim() || 'Hermano(a)';
    const officialShift = getOfficialShiftTime(shift.day_key, shift.shift_key);
    const result = await sendShiftReminderTemplate({
      to: phone,
      volunteerName: fullName,
      committeeName: committeeName(volunteer),
      shiftName: officialShift.name,
      shiftHours: officialShift.timeLabel,
      shiftDate,
    });
    const completedAt = new Date().toISOString();

    const update = result.success
      ? {
          whatsapp_message_id: result.messageId || null,
          status: 'contactado',
          delivery_status: result.messageId ? 'pending' : null,
          delivery_updated_at: completedAt,
          raw_payload: { automatic: true, leadDays, targetDate: targetIso, state: 'sent' },
        }
      : {
          status: 'error',
          delivery_status: 'failed',
          delivery_updated_at: completedAt,
          failed_at: completedAt,
          delivery_error_message: result.error || 'Meta rechazó el envío.',
          raw_payload: { automatic: true, leadDays, targetDate: targetIso, state: 'failed' },
        };

    const { error: updateError } = await supabase
      .from('reminder_logs')
      .update(update)
      .eq('id', claim.id);
    if (updateError) {
      trackingFailures += 1;
      console.error('[REMINDER CRON] Could not finalize automatic reminder log:', {
        reminderId: claim.id,
        error: updateError.message,
      });
    }

    if (result.success) sent += 1;
    else failed += 1;
  }

  console.info('[REMINDER CRON] Automatic reminder run completed.', {
    targetDate: targetIso,
    leadDays,
    scheduled: uniqueShifts.length,
    sent,
    failed,
    skipped,
    invalidRecipients,
    trackingFailures,
  });

  return NextResponse.json({
    success: failed === 0 && trackingFailures === 0,
    targetDate: targetIso,
    leadDays,
    scheduled: uniqueShifts.length,
    sent,
    failed,
    skipped,
    invalidRecipients,
    trackingFailures,
  }, { status: trackingFailures > 0 ? 500 : 200 });
}
