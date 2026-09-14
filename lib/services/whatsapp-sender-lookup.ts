import { fetchAllRowsStrict } from '@/lib/supabase-helpers';

type PhoneRecord = { phone?: string | null };

export function phoneMatchesSender(phone: string | null | undefined, senderDigits: string): boolean {
  const savedDigits = (phone || '').replace(/\D/g, '');
  if (!savedDigits || !senderDigits) return false;
  if (savedDigits === senderDigits) return true;
  if (savedDigits.length === 8) return senderDigits === `505${savedDigits}`;
  if (senderDigits.length === 8) return savedDigits === `505${senderDigits}`;
  return false;
}

/** Include legacy phone formats and every profile sharing the sender's number. */
export async function findWhatsAppSenderProfiles<T extends PhoneRecord>(
  supabase: Parameters<typeof fetchAllRowsStrict>[0],
  tableName: 'volunteers' | 'profiles',
  columns: string,
  senderDigits: string,
): Promise<T[]> {
  const activeFilter = tableName === 'volunteers'
    ? 'status.is.null,status.neq.archived'
    : 'status.is.null,status.eq.active';
  const profiles = await fetchAllRowsStrict<T>(
    supabase, tableName, columns,
    query => query.or(activeFilter).order('id'),
  );
  return profiles.filter(profile => phoneMatchesSender(profile.phone, senderDigits));
}
