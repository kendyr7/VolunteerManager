export const WHATSAPP_MESSAGE_LIMITS = {
  textBody: 4096,
  interactiveBody: 1024,
  interactiveHeader: 60,
  interactiveFooter: 60,
  replyButtonTitle: 20,
  replyButtonId: 256,
  listButtonTitle: 20,
  listSectionTitle: 24,
  listRowTitle: 24,
  listRowDescription: 72,
  listRowId: 200,
  listSections: 10,
  listRowsTotal: 10,
} as const;

export type InteractiveButton = { id: string; title: string };
export type InteractiveListSection = {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
};

export function whatsappTextLength(value: string): number {
  return Array.from(value || '').length;
}

export function limitWhatsAppText(
  value: string | null | undefined,
  maxLength: number,
  fallback = '',
  appendEllipsis = true,
): string {
  const normalized = String(value || '').trim() || fallback;
  const characters = Array.from(normalized);
  if (characters.length <= maxLength) return normalized;
  if (maxLength <= 0) return '';
  if (!appendEllipsis || maxLength === 1) return characters.slice(0, maxLength).join('');
  return `${characters.slice(0, maxLength - 1).join('').trimEnd()}…`;
}

export function planWhatsAppInteractiveBody(bodyText: string): {
  bodyText: string;
  supplementalText?: string;
} {
  const normalized = String(bodyText || '').trim() || 'Selecciona una opción para continuar.';
  if (whatsappTextLength(normalized) <= WHATSAPP_MESSAGE_LIMITS.interactiveBody) {
    return { bodyText: normalized };
  }
  return {
    bodyText: 'Selecciona una opción para continuar.',
    supplementalText: limitWhatsAppText(
      normalized,
      WHATSAPP_MESSAGE_LIMITS.textBody,
      'Consulta la información y selecciona una opción para continuar.',
    ),
  };
}

export function prepareWhatsAppButtons(buttons: InteractiveButton[]): InteractiveButton[] {
  return buttons.slice(0, 3).map((button, index) => ({
    id: limitWhatsAppText(
      button.id,
      WHATSAPP_MESSAGE_LIMITS.replyButtonId,
      `option_${index + 1}`,
      false,
    ),
    title: limitWhatsAppText(
      button.title,
      WHATSAPP_MESSAGE_LIMITS.replyButtonTitle,
      `Opción ${index + 1}`,
    ),
  }));
}

export function prepareWhatsAppListSections(
  sections: InteractiveListSection[],
): InteractiveListSection[] {
  const prepared: InteractiveListSection[] = [];
  let remainingRows = WHATSAPP_MESSAGE_LIMITS.listRowsTotal;

  for (const section of sections.slice(0, WHATSAPP_MESSAGE_LIMITS.listSections)) {
    if (remainingRows <= 0) break;
    const rows = section.rows.slice(0, remainingRows).map((row, index) => ({
      id: limitWhatsAppText(
        row.id,
        WHATSAPP_MESSAGE_LIMITS.listRowId,
        `option_${prepared.length + 1}_${index + 1}`,
        false,
      ),
      title: limitWhatsAppText(
        row.title,
        WHATSAPP_MESSAGE_LIMITS.listRowTitle,
        `Opción ${index + 1}`,
      ),
      description: row.description
        ? limitWhatsAppText(row.description, WHATSAPP_MESSAGE_LIMITS.listRowDescription)
        : undefined,
    }));
    if (rows.length === 0) continue;
    prepared.push({
      title: limitWhatsAppText(
        section.title,
        WHATSAPP_MESSAGE_LIMITS.listSectionTitle,
        `Opciones ${prepared.length + 1}`,
      ),
      rows,
    });
    remainingRows -= rows.length;
  }

  return prepared;
}

export function buildInteractiveFallbackText(bodyText: string, optionTitles: string[]): string {
  const optionsText = optionTitles.length > 0
    ? `Opciones disponibles:\n${optionTitles.map((title, index) => `${index + 1}. ${title}`).join('\n')}\n\nEscribe el nombre de la opción para continuar.`
    : 'Escribe tu solicitud para continuar.';
  const reservedLength = whatsappTextLength(optionsText) + 2;
  const bodyLimit = Math.max(1, WHATSAPP_MESSAGE_LIMITS.textBody - reservedLength);
  const safeBody = limitWhatsAppText(bodyText, bodyLimit, 'No pudimos mostrar los controles interactivos.');
  return limitWhatsAppText(
    `${safeBody}\n\n${optionsText}`,
    WHATSAPP_MESSAGE_LIMITS.textBody,
    optionsText,
  );
}
