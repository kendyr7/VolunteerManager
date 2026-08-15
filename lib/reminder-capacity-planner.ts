export type ReminderScheduleCandidate = {
  scheduleKey: string;
  volunteerId: string;
  eventDate: string;
  dayKey: string;
  shiftKey: string;
  recipientPhone: string | null;
};

export type ReminderAllocationStatus = 'scheduled' | 'overflow' | 'invalid';
export type ReminderAllocationReason =
  | 'preferred'
  | 'capacity_early'
  | 'capacity_late'
  | 'capacity_exceeded'
  | 'invalid_phone';

export type ReminderPlanAssignment = ReminderScheduleCandidate & {
  preferredSendDate: string;
  scheduledSendDate: string | null;
  preferredLeadDays: number;
  scheduledLeadDays: number | null;
  allocationStatus: ReminderAllocationStatus;
  allocationReason: ReminderAllocationReason;
};

export type ReminderCapacityDayStatus = 'available' | 'warning' | 'at_limit' | 'exceeded';

export type ReminderCapacityDay = {
  sendDate: string;
  eventDates: string[];
  originalRecipients: number;
  plannedRecipients: number;
  originalMessages: number;
  plannedMessages: number;
  movedInRecipients: number;
  movedOutRecipients: number;
  overflowRecipients: number;
  invalidPhoneVolunteers: number;
  usagePercent: number;
  automaticUsagePercent: number;
  remainingAutomaticCapacity: number;
  status: ReminderCapacityDayStatus;
};

export type ReminderCapacityPlan = {
  preferredLeadDays: number;
  leadDayCandidates: number[];
  messagingLimit: number;
  reservePercent: number;
  automaticCapacity: number;
  totalPendingMessages: number;
  scheduledMessages: number;
  redistributedRecipients: number;
  overflowRecipients: number;
  invalidPhoneVolunteers: number;
  maxUsagePercent: number;
  datesAtRisk: number;
  datesAtOrAboveCapacity: number;
  assignments: ReminderPlanAssignment[];
  days: ReminderCapacityDay[];
};

type AllocationGroup = {
  eventDate: string;
  recipientPhone: string;
  candidates: ReminderScheduleCandidate[];
};

type MutableDay = {
  sendDate: string;
  eventDates: Set<string>;
  originalPhones: Set<string>;
  plannedPhones: Set<string>;
  movedInPhones: Set<string>;
  movedOutPhones: Set<string>;
  overflowPhones: Set<string>;
  invalidVolunteerIds: Set<string>;
  originalMessages: number;
  plannedMessages: number;
};

function shiftIsoDate(isoDate: string, days: number): string {
  const value = new Date(`${isoDate}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function sendDateFor(eventDate: string, leadDays: number): string {
  return shiftIsoDate(eventDate, -leadDays);
}

function getMutableDay(days: Map<string, MutableDay>, sendDate: string): MutableDay {
  const current = days.get(sendDate);
  if (current) return current;
  const created: MutableDay = {
    sendDate,
    eventDates: new Set(),
    originalPhones: new Set(),
    plannedPhones: new Set(),
    movedInPhones: new Set(),
    movedOutPhones: new Set(),
    overflowPhones: new Set(),
    invalidVolunteerIds: new Set(),
    originalMessages: 0,
    plannedMessages: 0,
  };
  days.set(sendDate, created);
  return created;
}

export function buildReminderCapacityPlan(options: {
  candidates: ReminderScheduleCandidate[];
  forcedOverflowScheduleKeys?: Set<string>;
  preferredLeadDays: number;
  leadDayCandidates: number[];
  messagingLimit: number;
  reservePercent: number;
  automaticCapacity: number;
}): ReminderCapacityPlan {
  const preferredLeadDays = options.preferredLeadDays;
  const leadDayCandidates = Array.from(new Set([
    preferredLeadDays,
    ...options.leadDayCandidates,
  ])).filter(days => days >= 1 && days <= 3);
  const recipientPhonesByDate = new Map<string, Set<string>>();
  const groups = new Map<string, AllocationGroup>();
  const assignments: ReminderPlanAssignment[] = [];

  for (const candidate of options.candidates) {
    const preferredSendDate = sendDateFor(candidate.eventDate, preferredLeadDays);
    if (!candidate.recipientPhone) {
      assignments.push({
        ...candidate,
        preferredSendDate,
        scheduledSendDate: null,
        preferredLeadDays,
        scheduledLeadDays: null,
        allocationStatus: 'invalid',
        allocationReason: 'invalid_phone',
      });
      continue;
    }

    if (options.forcedOverflowScheduleKeys?.has(candidate.scheduleKey)) {
      assignments.push({
        ...candidate,
        preferredSendDate,
        scheduledSendDate: null,
        preferredLeadDays,
        scheduledLeadDays: null,
        allocationStatus: 'overflow',
        allocationReason: 'capacity_exceeded',
      });
      continue;
    }

    const groupKey = `${candidate.eventDate}:${candidate.recipientPhone}`;
    const group = groups.get(groupKey) || {
      eventDate: candidate.eventDate,
      recipientPhone: candidate.recipientPhone,
      candidates: [],
    };
    group.candidates.push(candidate);
    groups.set(groupKey, group);
  }

  const sortedGroups = Array.from(groups.values()).sort((left, right) => {
    const leftPreferred = sendDateFor(left.eventDate, preferredLeadDays);
    const rightPreferred = sendDateFor(right.eventDate, preferredLeadDays);
    return leftPreferred.localeCompare(rightPreferred)
      || left.eventDate.localeCompare(right.eventDate)
      || left.recipientPhone.localeCompare(right.recipientPhone);
  });

  for (const group of sortedGroups) {
    let scheduledLeadDays: number | null = null;
    let scheduledSendDate: string | null = null;

    for (const leadDays of leadDayCandidates) {
      const candidateSendDate = sendDateFor(group.eventDate, leadDays);
      const recipients = recipientPhonesByDate.get(candidateSendDate) || new Set<string>();
      const consumesCapacity = !recipients.has(group.recipientPhone);
      if (!consumesCapacity || recipients.size < options.automaticCapacity) {
        recipients.add(group.recipientPhone);
        recipientPhonesByDate.set(candidateSendDate, recipients);
        scheduledLeadDays = leadDays;
        scheduledSendDate = candidateSendDate;
        break;
      }
    }

    for (const candidate of group.candidates) {
      const preferredSendDate = sendDateFor(candidate.eventDate, preferredLeadDays);
      assignments.push({
        ...candidate,
        preferredSendDate,
        scheduledSendDate,
        preferredLeadDays,
        scheduledLeadDays,
        allocationStatus: scheduledSendDate ? 'scheduled' : 'overflow',
        allocationReason: !scheduledSendDate || scheduledLeadDays === null
          ? 'capacity_exceeded'
          : scheduledLeadDays === preferredLeadDays
            ? 'preferred'
            : scheduledLeadDays > preferredLeadDays
              ? 'capacity_early'
              : 'capacity_late',
      });
    }
  }

  assignments.sort((left, right) =>
    (left.scheduledSendDate || left.preferredSendDate).localeCompare(right.scheduledSendDate || right.preferredSendDate)
    || left.eventDate.localeCompare(right.eventDate)
    || (left.recipientPhone || '').localeCompare(right.recipientPhone || '')
    || left.shiftKey.localeCompare(right.shiftKey));

  const mutableDays = new Map<string, MutableDay>();
  const redistributedGroups = new Set<string>();
  const overflowGroups = new Set<string>();
  const invalidVolunteerIds = new Set<string>();

  for (const assignment of assignments) {
    const preferredDay = getMutableDay(mutableDays, assignment.preferredSendDate);
    preferredDay.eventDates.add(assignment.eventDate);
    preferredDay.originalMessages += 1;

    if (!assignment.recipientPhone) {
      preferredDay.invalidVolunteerIds.add(assignment.volunteerId);
      invalidVolunteerIds.add(assignment.volunteerId);
      continue;
    }

    preferredDay.originalPhones.add(assignment.recipientPhone);
    const groupKey = `${assignment.eventDate}:${assignment.recipientPhone}`;

    if (!assignment.scheduledSendDate) {
      preferredDay.overflowPhones.add(assignment.recipientPhone);
      overflowGroups.add(groupKey);
      continue;
    }

    const scheduledDay = getMutableDay(mutableDays, assignment.scheduledSendDate);
    scheduledDay.eventDates.add(assignment.eventDate);
    scheduledDay.plannedPhones.add(assignment.recipientPhone);
    scheduledDay.plannedMessages += 1;

    if (assignment.scheduledSendDate !== assignment.preferredSendDate) {
      preferredDay.movedOutPhones.add(assignment.recipientPhone);
      scheduledDay.movedInPhones.add(assignment.recipientPhone);
      redistributedGroups.add(groupKey);
    }
  }

  const days = Array.from(mutableDays.values())
    .sort((left, right) => left.sendDate.localeCompare(right.sendDate))
    .map<ReminderCapacityDay>(day => {
      const plannedRecipients = day.plannedPhones.size;
      const usagePercent = options.messagingLimit > 0
        ? Math.round((plannedRecipients / options.messagingLimit) * 1000) / 10
        : 0;
      const automaticUsagePercent = options.automaticCapacity > 0
        ? Math.round((plannedRecipients / options.automaticCapacity) * 1000) / 10
        : 0;
      const status: ReminderCapacityDayStatus = day.overflowPhones.size > 0
        ? 'exceeded'
        : plannedRecipients >= options.automaticCapacity
          ? 'at_limit'
          : usagePercent >= 80
            ? 'warning'
            : 'available';

      return {
        sendDate: day.sendDate,
        eventDates: Array.from(day.eventDates).sort(),
        originalRecipients: day.originalPhones.size,
        plannedRecipients,
        originalMessages: day.originalMessages,
        plannedMessages: day.plannedMessages,
        movedInRecipients: day.movedInPhones.size,
        movedOutRecipients: day.movedOutPhones.size,
        overflowRecipients: day.overflowPhones.size,
        invalidPhoneVolunteers: day.invalidVolunteerIds.size,
        usagePercent,
        automaticUsagePercent,
        remainingAutomaticCapacity: Math.max(options.automaticCapacity - plannedRecipients, 0),
        status,
      };
    });

  return {
    preferredLeadDays,
    leadDayCandidates,
    messagingLimit: options.messagingLimit,
    reservePercent: options.reservePercent,
    automaticCapacity: options.automaticCapacity,
    totalPendingMessages: assignments.filter(item => item.allocationStatus !== 'invalid').length,
    scheduledMessages: assignments.filter(item => item.allocationStatus === 'scheduled').length,
    redistributedRecipients: redistributedGroups.size,
    overflowRecipients: overflowGroups.size,
    invalidPhoneVolunteers: invalidVolunteerIds.size,
    maxUsagePercent: Math.max(0, ...days.map(day => day.usagePercent)),
    datesAtRisk: days.filter(day => day.status === 'warning').length,
    datesAtOrAboveCapacity: days.filter(day => day.status === 'at_limit' || day.status === 'exceeded').length,
    assignments,
    days,
  };
}
