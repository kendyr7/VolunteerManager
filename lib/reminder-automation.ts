const DEFAULT_REMINDER_LEAD_DAYS = 2;
const DEFAULT_WHATSAPP_MESSAGING_LIMIT = 250;
const DEFAULT_CAPACITY_RESERVE_PERCENT = 10;

export function getReminderLeadDays(): number {
  const configured = Number.parseInt(process.env.WHATSAPP_REMINDER_LEAD_DAYS || '', 10);
  return Number.isInteger(configured) && configured >= 1 && configured <= 3
    ? configured
    : DEFAULT_REMINDER_LEAD_DAYS;
}

export function getWhatsAppMessagingLimit(): number {
  const configured = Number.parseInt(process.env.WHATSAPP_MESSAGING_LIMIT || '', 10);
  return Number.isInteger(configured) && configured >= 1
    ? configured
    : DEFAULT_WHATSAPP_MESSAGING_LIMIT;
}

export function getWhatsAppCapacityReservePercent(): number {
  const configured = Number.parseInt(process.env.WHATSAPP_CAPACITY_RESERVE_PERCENT || '', 10);
  return Number.isInteger(configured) && configured >= 0 && configured <= 50
    ? configured
    : DEFAULT_CAPACITY_RESERVE_PERCENT;
}

export function getAutomaticReminderCapacity(): number {
  const messagingLimit = getWhatsAppMessagingLimit();
  const reservePercent = getWhatsAppCapacityReservePercent();
  return Math.max(1, Math.floor(messagingLimit * ((100 - reservePercent) / 100)));
}

export function getReminderLeadDayCandidates(): number[] {
  const preferred = getReminderLeadDays();
  return Array.from(new Set([preferred, 3, 2, 1]));
}
