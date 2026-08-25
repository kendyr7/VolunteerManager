import assert from 'node:assert/strict';

const whatsappSafetyModule = '../lib/whatsapp-interactive-safety' + '.ts';
const {
  buildInteractiveFallbackText,
  WHATSAPP_MESSAGE_LIMITS,
  limitWhatsAppText,
  planWhatsAppInteractiveBody,
  prepareWhatsAppButtons,
  prepareWhatsAppListSections,
  whatsappTextLength,
} = await import(whatsappSafetyModule);

const longText = 'á🙂'.repeat(700);
const exactBody = Array.from(longText).slice(0, WHATSAPP_MESSAGE_LIMITS.interactiveBody).join('');
assert.equal(whatsappTextLength(exactBody), 1024);
assert.equal(planWhatsAppInteractiveBody(exactBody).supplementalText, undefined);

const overflowPlan = planWhatsAppInteractiveBody(`${exactBody}x`);
assert.ok(overflowPlan.supplementalText);
assert.ok(whatsappTextLength(overflowPlan.bodyText) <= WHATSAPP_MESSAGE_LIMITS.interactiveBody);
assert.ok(whatsappTextLength(overflowPlan.supplementalText) <= WHATSAPP_MESSAGE_LIMITS.textBody);

// Confirmación: una descripción extrema nunca puede desbordar el body interactivo.
const confirmationPlan = planWhatsAppInteractiveBody(
  `Ana, vas a confirmar:\n\n*vie 11* · Turno 1\nÁrea: ${'Parqueo '.repeat(180)}`,
);
assert.ok(whatsappTextLength(confirmationPlan.bodyText) <= WHATSAPP_MESSAGE_LIMITS.interactiveBody);

// Áreas: el detalle largo se separa como texto y conserva un control interactivo corto.
const areasPlan = planWhatsAppInteractiveBody(
  `📍 *Áreas de servicio*\n\n${'Área y descripción operativa. '.repeat(100)}`,
);
assert.ok(areasPlan.supplementalText);
assert.equal(areasPlan.bodyText, 'Selecciona una opción para continuar.');

// PIN: incluso nombres anómalamente largos quedan dentro de los límites de Meta.
const pinPlan = planWhatsAppInteractiveBody(
  `El PIN de *${'Nombre '.repeat(300)}* es *4829*. No lo compartas.`,
);
assert.ok(whatsappTextLength(pinPlan.bodyText) <= WHATSAPP_MESSAGE_LIMITS.interactiveBody);

const buttons = prepareWhatsAppButtons([
  { id: 'x'.repeat(400), title: 'Confirmar asistencia de inmediato' },
  { id: 'home', title: 'Volver al menú principal' },
  { id: 'areas', title: 'Consultar áreas asignadas' },
  { id: 'extra', title: 'No debe aparecer' },
]);
assert.equal(buttons.length, 3);
assert.ok(buttons.every((button: { id: string; title: string }) => (
  whatsappTextLength(button.id) <= WHATSAPP_MESSAGE_LIMITS.replyButtonId
  && whatsappTextLength(button.title) <= WHATSAPP_MESSAGE_LIMITS.replyButtonTitle
)));

// Perfiles compartidos: máximo diez filas totales y límites por nombre/descripción.
const sharedProfiles = prepareWhatsAppListSections([
  {
    title: 'Perfiles asociados al número compartido con un título muy largo',
    rows: Array.from({ length: 15 }, (_, index) => ({
      id: `profile_${index}_${'x'.repeat(250)}`,
      title: `Perfil compartido número ${index + 1} con nombre largo`,
      description: 'Voluntario asociado al mismo número con una descripción deliberadamente extensa. '.repeat(2),
    })),
  },
]);
assert.equal(sharedProfiles.flatMap((section: { rows: unknown[] }) => section.rows).length, 10);
for (const section of sharedProfiles) {
  assert.ok(whatsappTextLength(section.title) <= WHATSAPP_MESSAGE_LIMITS.listSectionTitle);
  for (const row of section.rows) {
    assert.ok(whatsappTextLength(row.id) <= WHATSAPP_MESSAGE_LIMITS.listRowId);
    assert.ok(whatsappTextLength(row.title) <= WHATSAPP_MESSAGE_LIMITS.listRowTitle);
    assert.ok(!row.description || whatsappTextLength(row.description) <= WHATSAPP_MESSAGE_LIMITS.listRowDescription);
  }
}

assert.equal(whatsappTextLength(limitWhatsAppText('🙂'.repeat(5000), 4096)), 4096);

const fallbackText = buildInteractiveFallbackText(
  `📅 *Turnos*\n${'vie 11 · Turno 1 · Área Parqueo\n'.repeat(200)}`,
  ['Confirmar turno', 'Ver mis áreas', 'Volver al menú'],
);
assert.match(fallbackText, /Confirmar turno/);
assert.match(fallbackText, /Ver mis áreas/);
assert.ok(whatsappTextLength(fallbackText) <= WHATSAPP_MESSAGE_LIMITS.textBody);

console.log('Seguridad interactiva de WhatsApp verificada: confirmación, áreas, PIN, perfiles compartidos y fallback #131009.');
