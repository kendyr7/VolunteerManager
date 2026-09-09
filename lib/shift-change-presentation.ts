export type ShiftChangeNotificationStatus = 'sent' | 'failed' | 'unavailable';

export function shiftChangeResolutionMessage(
  status: 'approved' | 'rejected',
  notification: ShiftChangeNotificationStatus,
): string {
  const result = status === 'approved'
    ? 'Solicitud aprobada. El turno se actualizó en el portal.'
    : 'Solicitud rechazada. El estado se actualizó en el portal.';
  const notice = notification === 'sent'
    ? 'El aviso se envió a WhatsApp; la entrega aún no está confirmada.'
    : notification === 'unavailable'
      ? 'No se envió el aviso por WhatsApp porque el voluntario no tiene un teléfono disponible.'
      : 'No se pudo enviar el aviso por WhatsApp. La resolución quedó guardada.';
  return `${result} ${notice}`;
}
