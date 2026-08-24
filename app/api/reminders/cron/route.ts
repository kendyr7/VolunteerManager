import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { isWhatsAppCapacityError, sendShiftReminderTemplate } from '@/lib/whatsapp-api';
import { formatE164 } from '@/lib/whatsapp';
import { getOfficialShiftTime } from '@/lib/dates';
import { buildAndPersistReminderCapacityPlan } from '@/lib/reminder-capacity-service';
import { fetchAllRowsStrict } from '@/lib/supabase-helpers';
import type { ReminderPlanAssignment } from '@/lib/reminder-capacity-planner';
import { getShiftAreaName } from '@/lib/shift-area';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const REMINDER_TIME_ZONE = 'America/Guatemala';
const CAPACITY_ERROR_MESSAGE = 'Se superó el límite de WhatsApp. No fue posible enviar este recordatorio manteniendo un mínimo de 24 horas de anticipación.';

type VolunteerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string | null;
  committees: { name?: string | null } | Array<{ name?: string | null }> | null;
};

type RecentReminderRow = {
  volunteer_id: string;
  recipient_phone: string | null;
  status: string;
  delivery_status: string | null;
  sent_at: string;
};

type ShiftAreaRow = {
  volunteer_id: string;
  day_key: string;
  shift_key: string;
  area_id: string | null;
  committee_areas: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  return Boolean(cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`);
}

function getTodayIsoInTimeZone(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REMINDER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function committeeName(volunteer: VolunteerRow): string {
  const relation = Array.isArray(volunteer.committees)
    ? volunteer.committees[0]
    : volunteer.committees;
  return relation?.name?.trim() || 'Servicio';
}

function reminderDeadline(assignment: ReminderPlanAssignment): Date {
  const shift = getOfficialShiftTime(assignment.eventDate, assignment.shiftKey);
  const startHour = String(Math.floor(shift.startHour)).padStart(2, '0');
  const startMinute = String(Math.round((shift.startHour % 1) * 60)).padStart(2, '0');
  const eventStart = new Date(`${assignment.eventDate}T${startHour}:${startMinute}:00-06:00`);
  return new Date(eventStart.getTime() - 24 * 60 * 60 * 1000);
}

async function markCapacityFailure(
  supabase: Awaited<ReturnType<typeof getAdminSupabase>>,
  assignment: ReminderPlanAssignment,
  nowIso: string,
) {
  const automationKey = `capacity-limit:${assignment.scheduleKey}`;
  const { error: insertError } = await supabase.from('reminder_logs').insert({
    volunteer_id: assignment.volunteerId,
    shift_key: assignment.shiftKey,
    day_key: assignment.dayKey,
    recipient_phone: assignment.recipientPhone,
    preferred_send_date: assignment.preferredSendDate,
    scheduled_send_date: assignment.scheduledSendDate,
    whatsapp_message_id: null,
    status: 'error',
    sent_at: nowIso,
    delivery_status: 'failed',
    delivery_updated_at: nowIso,
    failed_at: nowIso,
    delivery_error_code: 'CAPACITY_LIMIT',
    delivery_error_title: 'Límite de WhatsApp superado',
    delivery_error_message: CAPACITY_ERROR_MESSAGE,
    send_source: 'automatic',
    automation_key: automationKey,
    raw_payload: {
      automatic: true,
      state: 'capacity_exceeded',
      preferredSendDate: assignment.preferredSendDate,
      scheduledSendDate: assignment.scheduledSendDate,
    },
  });
  if (insertError && insertError.code !== '23505') {
    throw new Error(`No se pudo registrar el error de capacidad: ${insertError.message}`);
  }

  const { error: scheduleError } = await supabase
    .from('whatsapp_reminder_schedule')
    .update({
      allocation_status: 'overflow',
      allocation_reason: 'capacity_exceeded',
      scheduled_send_date: null,
      scheduled_lead_days: null,
      updated_at: nowIso,
    })
    .eq('schedule_key', assignment.scheduleKey);
  if (scheduleError) throw new Error(`No se pudo actualizar el plan excedido: ${scheduleError.message}`);
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.WHATSAPP_ENABLED === 'false') {
    return NextResponse.json({ success: true, skipped: true, reason: 'whatsapp_disabled' });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const requestedTarget = dryRun ? request.nextUrl.searchParams.get('targetDate') : null;
  if (requestedTarget && !/^\d{4}-\d{2}-\d{2}$/.test(requestedTarget)) {
    return NextResponse.json({ error: 'Invalid targetDate.' }, { status: 400 });
  }

  const supabase = await getAdminSupabase();
  const plan = await buildAndPersistReminderCapacityPlan(supabase);
  const todayIso = getTodayIsoInTimeZone();
  const selectedAssignments = requestedTarget
    ? plan.assignments.filter(item =>
        item.eventDate === requestedTarget || item.scheduledSendDate === requestedTarget)
    : plan.assignments.filter(item =>
        item.scheduledSendDate !== null && item.scheduledSendDate <= todayIso);

  if (dryRun) {
    const scheduled = selectedAssignments.filter(item => item.allocationStatus === 'scheduled');
    return NextResponse.json({
      success: true,
      dryRun: true,
      targetDate: requestedTarget || todayIso,
      preferredLeadDays: plan.preferredLeadDays,
      messagingLimit: plan.messagingLimit,
      automaticCapacity: plan.automaticCapacity,
      reservePercent: plan.reservePercent,
      scheduledMessages: scheduled.length,
      uniqueRecipients: new Set(scheduled.map(item => item.recipientPhone).filter(Boolean)).size,
      redistributedRecipients: new Set(
        scheduled
          .filter(item => item.scheduledSendDate !== item.preferredSendDate)
          .map(item => `${item.eventDate}:${item.recipientPhone}`),
      ).size,
      overflowRecipients: plan.overflowRecipients,
      invalidPhoneVolunteers: plan.invalidPhoneVolunteers,
      assignments: scheduled.map(item => ({
        eventDate: item.eventDate,
        shiftKey: item.shiftKey,
        preferredSendDate: item.preferredSendDate,
        scheduledSendDate: item.scheduledSendDate,
        allocationReason: item.allocationReason,
      })),
    });
  }

  const activeVolunteers = await fetchAllRowsStrict<VolunteerRow>(
    supabase,
    'volunteers',
    'id, first_name, last_name, phone, status, committees(name)',
    query => query.or('status.is.null,status.neq.archived'),
  );
  const volunteers = new Map(activeVolunteers.map(volunteer => [volunteer.id, volunteer]));
  const selectedVolunteerIds = Array.from(new Set(selectedAssignments.map(item => item.volunteerId)));
  const selectedShiftAreas = selectedVolunteerIds.length > 0
    ? await fetchAllRowsStrict<ShiftAreaRow>(
        supabase,
        'shifts',
        'volunteer_id, day_key, shift_key, area_id, committee_areas(name)',
        query => query.in('volunteer_id', selectedVolunteerIds),
      )
    : [];
  const areaNameByShift = new Map(
    selectedShiftAreas.map(shift => [
      `${shift.volunteer_id}:${shift.day_key}:${shift.shift_key}`,
      getShiftAreaName(shift),
    ]),
  );
  const rollingWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentRows = await fetchAllRowsStrict<RecentReminderRow>(
    supabase,
    'reminder_logs',
    'volunteer_id, recipient_phone, status, delivery_status, sent_at',
    query => query.gte('sent_at', rollingWindowStart),
  );
  const rollingRecipients = new Set<string>();
  for (const row of recentRows) {
    const countsTowardCapacity = (row.status === 'contactado' || row.status === 'confirmado')
      && row.delivery_status !== 'failed';
    if (!countsTowardCapacity) continue;
    const fallbackPhone = volunteers.get(row.volunteer_id)?.phone || '';
    const phone = formatE164(row.recipient_phone || fallbackPhone);
    if (phone) rollingRecipients.add(phone);
  }

  const assignmentsByPhone = new Map<string, ReminderPlanAssignment[]>();
  for (const assignment of selectedAssignments) {
    if (assignment.allocationStatus !== 'scheduled' || !assignment.recipientPhone) continue;
    const group = assignmentsByPhone.get(assignment.recipientPhone) || [];
    group.push(assignment);
    assignmentsByPhone.set(assignment.recipientPhone, group);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferredByCapacity = 0;
  let capacityFailures = 0;
  let trackingFailures = 0;
  const now = new Date();

  for (const [recipientPhone, assignments] of assignmentsByPhone) {
    const earliestDeadline = assignments
      .map(reminderDeadline)
      .sort((left, right) => left.getTime() - right.getTime())[0];

    // A daily Hobby-compatible cron may retry a reminder on the following day.
    // Never send that retry once fewer than 24 hours remain before the shift.
    if (now >= earliestDeadline) {
      for (const assignment of assignments) {
        try {
          await markCapacityFailure(supabase, assignment, now.toISOString());
          capacityFailures += 1;
        } catch (error) {
          trackingFailures += 1;
          console.error('[REMINDER CRON] Could not persist capacity failure:', error);
        }
      }
      continue;
    }

    const consumesNewSlot = !rollingRecipients.has(recipientPhone);
    if (consumesNewSlot && rollingRecipients.size >= plan.automaticCapacity) {
      deferredByCapacity += assignments.length;
      continue;
    }

    rollingRecipients.add(recipientPhone);

    for (const assignment of assignments) {
      const volunteer = volunteers.get(assignment.volunteerId);
      if (!volunteer) {
        skipped += 1;
        continue;
      }

      const automationKey = `shift-reminder:${assignment.scheduleKey}`;
      const claimedAt = new Date().toISOString();
      let claimId: string | null = null;
      const { data: insertedClaim, error: claimError } = await supabase
        .from('reminder_logs')
        .insert({
          volunteer_id: volunteer.id,
          shift_key: assignment.shiftKey,
          day_key: assignment.dayKey,
          recipient_phone: recipientPhone,
          preferred_send_date: assignment.preferredSendDate,
          scheduled_send_date: assignment.scheduledSendDate,
          whatsapp_message_id: null,
          status: 'contactado',
          sent_at: claimedAt,
          delivery_status: 'pending',
          delivery_updated_at: claimedAt,
          send_source: 'automatic',
          automation_key: automationKey,
          raw_payload: {
            automatic: true,
            state: 'claimed',
            allocationReason: assignment.allocationReason,
            preferredSendDate: assignment.preferredSendDate,
            scheduledSendDate: assignment.scheduledSendDate,
          },
        })
        .select('id')
        .single();

      if (claimError?.code === '23505') {
        const { data: existingClaim } = await supabase
          .from('reminder_logs')
          .select('id, delivery_status')
          .eq('automation_key', automationKey)
          .maybeSingle();
        if (existingClaim?.delivery_status === 'failed') {
          const { error: retryClaimError } = await supabase
            .from('reminder_logs')
            .update({
              status: 'contactado',
              sent_at: claimedAt,
              delivery_status: 'pending',
              delivery_updated_at: claimedAt,
              failed_at: null,
              delivery_error_code: null,
              delivery_error_title: null,
              delivery_error_message: null,
              delivery_error_details: null,
            })
            .eq('id', existingClaim.id);
          if (!retryClaimError) claimId = existingClaim.id;
          else trackingFailures += 1;
        } else {
          skipped += 1;
        }
      } else if (claimError) {
        trackingFailures += 1;
        console.error('[REMINDER CRON] Could not claim automatic reminder:', claimError.message);
      } else {
        claimId = insertedClaim?.id || null;
      }

      if (!claimId) continue;

      const fullName = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim() || 'Hermano(a)';
      const officialShift = getOfficialShiftTime(assignment.eventDate, assignment.shiftKey);
      const shiftDate = format(new Date(`${assignment.eventDate}T12:00:00.000Z`), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
      const areaName = areaNameByShift.get(
        `${assignment.volunteerId}:${assignment.dayKey}:${assignment.shiftKey}`,
      ) || null;
      const result = await sendShiftReminderTemplate({
        to: recipientPhone,
        volunteerName: fullName,
        committeeName: committeeName(volunteer),
        shiftName: officialShift.name,
        shiftHours: officialShift.timeLabel,
        shiftDate,
        areaName,
      });
      const completedAt = new Date().toISOString();
      const capacityError = isWhatsAppCapacityError(result);
      const normalizedError = capacityError
        ? `Se superó el límite de WhatsApp. ${result.error || 'Meta rechazó temporalmente el envío.'}`
        : result.error || 'Meta rechazó el envío.';

      const update = result.success
        ? {
            whatsapp_message_id: result.messageId || null,
            status: 'contactado',
            delivery_status: result.messageId ? 'pending' : null,
            delivery_updated_at: completedAt,
            raw_payload: {
              automatic: true,
              state: 'sent',
              allocationReason: assignment.allocationReason,
              preferredSendDate: assignment.preferredSendDate,
              scheduledSendDate: assignment.scheduledSendDate,
            },
          }
        : {
            status: 'error',
            delivery_status: 'failed',
            delivery_updated_at: completedAt,
            failed_at: completedAt,
            delivery_error_code: capacityError ? 'CAPACITY_LIMIT' : result.errorCode || null,
            delivery_error_title: capacityError ? 'Límite de WhatsApp superado' : null,
            delivery_error_message: normalizedError,
            delivery_error_details: result.errorDetails || null,
            raw_payload: {
              automatic: true,
              state: capacityError ? 'capacity_exceeded' : 'failed',
              metaErrorCode: result.errorCode || null,
              metaHttpStatus: result.httpStatus || null,
            },
          };

      const { error: updateError } = await supabase
        .from('reminder_logs')
        .update(update)
        .eq('id', claimId);
      if (updateError) {
        trackingFailures += 1;
        console.error('[REMINDER CRON] Could not finalize automatic reminder log:', updateError.message);
      }

      if (result.success) {
        sent += 1;
        const { error: scheduleError } = await supabase
          .from('whatsapp_reminder_schedule')
          .update({ allocation_status: 'sent', sent_at: completedAt, updated_at: completedAt })
          .eq('schedule_key', assignment.scheduleKey);
        if (scheduleError) trackingFailures += 1;
      } else if (capacityError) {
        capacityFailures += 1;
        const { error: scheduleError } = await supabase
          .from('whatsapp_reminder_schedule')
          .update({
            allocation_status: 'overflow',
            allocation_reason: 'capacity_exceeded',
            scheduled_send_date: null,
            scheduled_lead_days: null,
            updated_at: completedAt,
          })
          .eq('schedule_key', assignment.scheduleKey);
        if (scheduleError) trackingFailures += 1;
      } else {
        failed += 1;
      }
    }
  }

  const overflowToday = plan.assignments.filter(item =>
    item.allocationStatus === 'overflow' && item.preferredSendDate === todayIso).length;
  const exceeded = capacityFailures > 0 || overflowToday > 0;
  const error = exceeded
    ? 'Se superó el límite de WhatsApp. Revisa Ajustes > Recordatorios automáticos para ver la distribución y la cercanía al límite.'
    : undefined;

  console.info('[REMINDER CRON] Automatic reminder run completed.', {
    sendDate: todayIso,
    automaticCapacity: plan.automaticCapacity,
    rollingUniqueRecipients: rollingRecipients.size,
    sent,
    failed,
    skipped,
    deferredByCapacity,
    capacityFailures,
    overflowToday,
    trackingFailures,
  });

  return NextResponse.json({
    success: failed === 0 && trackingFailures === 0 && !exceeded,
    error,
    sendDate: todayIso,
    messagingLimit: plan.messagingLimit,
    automaticCapacity: plan.automaticCapacity,
    rollingUniqueRecipients: rollingRecipients.size,
    sent,
    failed,
    skipped,
    deferredByCapacity,
    capacityFailures,
    overflowToday,
    trackingFailures,
  }, { status: trackingFailures > 0 ? 500 : 200 });
}
