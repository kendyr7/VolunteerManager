export function formatPhoneNumber(phone: string): string {
  // Remover todos los caracteres no numéricos
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Asumimos que si no tiene código de país, es de Nicaragua (+505)
  // Ajusta esto según las necesidades reales del proyecto
  if (cleanPhone.length === 8) {
    return `505${cleanPhone}`;
  }
  
  return cleanPhone;
}

export function generateWaMeLink(phone: string, message: string): string {
  const formattedPhone = formatPhoneNumber(phone);
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
}

export function generatePinMessage(name: string, pin: string, appUrl: string): string {
  return `Hola ${name}, has sido registrado/a como voluntario/a de Puertas Abiertas del Templo de Managua.\n\nTu PIN de acceso es: *${pin}*\n\nEntra aquí para ver y registrarte en tus turnos:\n${appUrl}\n\nUsa tu número de teléfono y tu PIN para ingresar. Guarda tu PIN.`;
}

export function generateReminderMessage(
  name: string, 
  dateStr: string, 
  shiftName: string, 
  timeStr: string, 
  committeeName: string, 
  isHoliday: boolean
): string {
  const holidayNote = isHoliday ? " *(Día feriado — horario extendido)*" : "";
  
  return `Hola ${name}, te recordamos que tienes turno de voluntaria/o:\n\n📅 ${dateStr}${holidayNote}\n⏰ ${shiftName}: ${timeStr}\n🏛️ Comité: ${committeeName} — Templo de Managua\n\n¡Gracias por tu servicio!`;
}
