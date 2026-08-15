import { formatDateShort, getActiveEventDays } from '@/lib/dates';
import { formatE164 } from '@/lib/whatsapp';
import {
  getAutomaticReminderCapacity,
  getReminderLeadDayCandidates,
  getReminderLeadDays,
  getWhatsAppCapacityReservePercent,
  getWhatsAppMessagingLimit,
} from '@/lib/reminder-automation';
import {
  buildReminderCapacityPlan,
  type ReminderCapacityPlan,
  type ReminderScheduleCandidate,
} from '@/lib/reminder-capacity-planner';
import { fetchAllRowsStrict } from '@/lib/supabase-helpers';

type PlanningShiftRow = {
  volunteer_id: string;
  day_key: string;
  shift_key: string;
};

type PlanningVolunteerRow = {
  id: string;
  phone: string | null;
  status: string | null;
};

type PlanningReminderRow = {
  volunteer_id: string;
  day_key: string;
  shift_key: string;
  status: string;
  delivery_status: string | null;
  delivery_error_code: string | null;
};

export type PersistedReminderCapacityPlan = ReminderCapacityPlan & {
  generatedAt: string;
  planVersion: string;
  alreadySentMessages: number;
};

function chunkRows<T>(rows: T[], size = 500): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

export async function buildAndPersistReminderCapacityPlan(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/admin').getAdminSupabase>>,
  options: { persist?: boolean } = {},
): Promise<PersistedReminderCapacityPlan> {
  const eventDays = getActiveEventDays();
  const eventDateByDayKey = new Map<string, string>();
  const acceptedDayKeys = new Set<string>();

  for (const eventDate of eventDays) {
    const iso = eventDate.toISOString().slice(0, 10);
    const short = formatDateShort(eventDate);
    for (const key of [iso, short, `${short.charAt(0).toUpperCase()}${short.slice(1)}`]) {
      acceptedDayKeys.add(key);
      eventDateByDayKey.set(key.trim().toLowerCase(), iso);
    }
  }

  const [shiftRows, activeVolunteerRows, reminderRows] = await Promise.all([
    fetchAllRowsStrict<PlanningShiftRow>(
      supabase,
      'shifts',
      'volunteer_id, day_key, shift_key',
      query => query
        .in('day_key', Array.from(acceptedDayKeys))
        .in('shift_key', ['T1', 'T2', 'T3', 'T4']),
    ),
    fetchAllRowsStrict<PlanningVolunteerRow>(
      supabase,
      'volunteers',
      'id, phone, status',
      query => query.or('status.is.null,status.neq.archived'),
    ),
    fetchAllRowsStrict<PlanningReminderRow>(
      supabase,
      'reminder_logs',
      'volunteer_id, day_key, shift_key, status, delivery_status, delivery_error_code',
      query => query
        .in('day_key', Array.from(acceptedDayKeys))
        .in('shift_key', ['T1', 'T2', 'T3', 'T4']),
    ),
  ]);

  const volunteers = new Map(activeVolunteerRows.map(volunteer => [volunteer.id, volunteer]));
  const alreadyContacted = new Set<string>();
  const forcedOverflowScheduleKeys = new Set<string>();
  for (const reminder of reminderRows) {
    const eventIso = eventDateByDayKey.get(reminder.day_key.trim().toLowerCase());
    const countsAsSent = (reminder.status === 'contactado' || reminder.status === 'confirmado')
      && reminder.delivery_status !== 'failed';
    if (eventIso && countsAsSent) {
      alreadyContacted.add(`${eventIso}:${reminder.volunteer_id}:${reminder.shift_key}`);
    } else if (eventIso && reminder.delivery_error_code === 'CAPACITY_LIMIT') {
      forcedOverflowScheduleKeys.add(`${eventIso}:${reminder.volunteer_id}:${reminder.shift_key}`);
    }
  }

  const uniqueShifts = Array.from(new Map(
    shiftRows.flatMap(shift => {
      const eventDate = eventDateByDayKey.get(shift.day_key.trim().toLowerCase());
      if (!eventDate || !shift.volunteer_id) return [];
      const scheduleKey = `${eventDate}:${shift.volunteer_id}:${shift.shift_key}`;
      return [[scheduleKey, { ...shift, eventDate, scheduleKey }] as const];
    }),
  ).values());

  const candidates: ReminderScheduleCandidate[] = uniqueShifts.flatMap(shift => {
    if (alreadyContacted.has(shift.scheduleKey)) return [];
    const volunteer = volunteers.get(shift.volunteer_id);
    return [{
      scheduleKey: shift.scheduleKey,
      volunteerId: shift.volunteer_id,
      eventDate: shift.eventDate,
      dayKey: shift.day_key,
      shiftKey: shift.shift_key,
      recipientPhone: volunteer ? formatE164(volunteer.phone || '') || null : null,
    }];
  });

  const plan = buildReminderCapacityPlan({
    candidates,
    forcedOverflowScheduleKeys,
    preferredLeadDays: getReminderLeadDays(),
    leadDayCandidates: getReminderLeadDayCandidates(),
    messagingLimit: getWhatsAppMessagingLimit(),
    reservePercent: getWhatsAppCapacityReservePercent(),
    automaticCapacity: getAutomaticReminderCapacity(),
  });
  const generatedAt = new Date().toISOString();
  const planVersion = crypto.randomUUID();

  if (options.persist !== false) {
    const rows = plan.assignments.map(assignment => ({
      schedule_key: assignment.scheduleKey,
      volunteer_id: assignment.volunteerId,
      event_date: assignment.eventDate,
      day_key: assignment.dayKey,
      shift_key: assignment.shiftKey,
      recipient_phone: assignment.recipientPhone,
      preferred_send_date: assignment.preferredSendDate,
      scheduled_send_date: assignment.scheduledSendDate,
      preferred_lead_days: assignment.preferredLeadDays,
      scheduled_lead_days: assignment.scheduledLeadDays,
      allocation_status: assignment.allocationStatus,
      allocation_reason: assignment.allocationReason,
      plan_version: planVersion,
      updated_at: generatedAt,
    }));

    for (const chunk of chunkRows(rows)) {
      const { error } = await supabase
        .from('whatsapp_reminder_schedule')
        .upsert(chunk, { onConflict: 'schedule_key' });
      if (error) throw new Error(`Error al guardar la distribución de recordatorios: ${error.message}`);
    }

    const { error: staleError } = await supabase
      .from('whatsapp_reminder_schedule')
      .update({ allocation_status: 'cancelled', updated_at: generatedAt })
      .in('allocation_status', ['scheduled', 'overflow', 'invalid'])
      .neq('plan_version', planVersion);
    if (staleError) throw new Error(`Error al actualizar la distribución anterior: ${staleError.message}`);
  }

  return {
    ...plan,
    generatedAt,
    planVersion,
    alreadySentMessages: alreadyContacted.size,
  };
}
