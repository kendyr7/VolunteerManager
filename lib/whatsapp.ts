/**
 * Formatea y sanitiza un número de teléfono al formato E.164 estricto (+[Código de País][Número Local]).
 * Elimina espacios, guiones, paréntesis y ceros iniciales (00).
 * Agrega el prefijo de país por defecto (+505 para Nicaragua si falta).
 * 
 * @example
 * formatE164("8888-9999") // "+50588889999"
 * formatE164("+505 8888 9999") // "+50588889999"
 * formatE164("0050588889999") // "+50588889999"
 */
export function formatE164(phone: string, defaultCountryCode: string = '505'): string {
  if (!phone) return '';

  const trimmed = phone.trim();
  if (!trimmed) return '';

  // Verificar si la entrada ya venía explícitamente con '+' (indica que trae su propio código de país)
  const hadPlus = trimmed.startsWith('+');
  let cleaned = hadPlus ? trimmed.slice(1) : trimmed;

  // Quitar cualquier caracter que no sea dígito
  cleaned = cleaned.replace(/\D/g, '');

  // Eliminar prefijo de salida internacional "00" si está presente (ej: 0050588889999 -> 50588889999)
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  }

  if (!cleaned) return '';

  // Solo agregar el código de país por defecto (505) si el número no traía '+' y es un número local de 8 dígitos
  if (!hadPlus && !cleaned.startsWith(defaultCountryCode) && cleaned.length === 8) {
    cleaned = `${defaultCountryCode}${cleaned}`;
  }

  return `+${cleaned}`;
}

/**
 * Normalización canónica de teléfonos para comparaciones y validaciones.
 * Convierte formatos locales de 8 dígitos, 505XXXXXXXX y +505XXXXXXXX a E.164 (+505XXXXXXXX).
 * Retorna cadena vacía si es inválido o nulo.
 */
export function normalizePhoneE164(phone: string | null | undefined): string {
  if (!phone) return '';
  const validation = validatePhone8Digits(phone);
  if (!validation.isValid) return '';
  return validation.formatted;
}

/**
 * Valida que un número telefónico tenga exactamente 8 dígitos en su número local (ej. Nicaragua).
 * Devuelve un objeto con isValid, error y el número sanitizado en formato E.164.
 * 
 * @example
 * validatePhone8Digits("88889999") // { isValid: true, formatted: "+50588889999" }
 * validatePhone8Digits("+50588889999") // { isValid: true, formatted: "+50588889999" }
 * validatePhone8Digits("8888999") // { isValid: false, error: "El número telefónico debe tener exactamente 8 dígitos." }
 */
export function validatePhone8Digits(phone: string, defaultCountryCode: string = '505'): {
  isValid: boolean;
  error?: string;
  formatted: string;
} {
  if (!phone || !phone.trim()) {
    return {
      isValid: false,
      error: "El número telefónico es obligatorio.",
      formatted: ""
    };
  }

  const formatted = formatE164(phone, defaultCountryCode);
  const digitsOnly = formatted.replace(/\D/g, '');

  // Extraer la parte del número local quitando el código de país si está presente
  let localDigits = digitsOnly;
  if (digitsOnly.startsWith(defaultCountryCode)) {
    localDigits = digitsOnly.slice(defaultCountryCode.length);
  }

  if (localDigits.length !== 8) {
    return {
      isValid: false,
      error: "El número telefónico debe tener exactamente 8 dígitos.",
      formatted
    };
  }

  return {
    isValid: true,
    formatted
  };
}

export function getLocal8Digits(phone: string): string {
  if (!phone) return '';
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length === 8) return digitsOnly;
  if (digitsOnly.startsWith('505') && digitsOnly.length === 11) return digitsOnly.slice(3);
  if (digitsOnly.length > 8) return digitsOnly.slice(-8);
  return digitsOnly;
}

export function formatPhoneNumber(phone: string): string {
  const e164 = formatE164(phone);
  return e164.replace('+', '');
}

export function generateWaMeLink(phone: string, message: string): string {
  const cleanPhone = formatPhoneNumber(phone);
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
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
  isHoliday?: boolean
): string {
  return `Querido(a) hermano(a) *${name}*, le recordamos su turno de servicio como voluntario del comite de *${committeeName}*.\n\n*${shiftName} _(${timeStr})_*\n*${dateStr}*\n\nAgradecemos su apoyo.`;
}
