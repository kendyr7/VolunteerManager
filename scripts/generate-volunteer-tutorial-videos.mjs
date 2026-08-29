import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const playwrightPath = path.join(
  root,
  'outputs/01a03956-efab-7503-9f33-636203be060c/insert_work/node_modules/playwright',
);
const { chromium } = require(playwrightPath);

const outputDir = path.join(root, 'public', 'tutorials');
const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const regularFontPath = path.join(root, 'node_modules/@fontsource/public-sans/files/public-sans-latin-400-normal.woff2');
const boldFontPath = path.join(root, 'node_modules/@fontsource/public-sans/files/public-sans-latin-700-normal.woff2');
const templeBackgroundPath = path.join(outputDir, 'managua-temple-background-2d.png');

const tutorials = [
  { kind: 'whatsapp', duration: 22, filename: 'whatsapp-bot.mp4', posterTime: 4.8 },
  { kind: 'request', duration: 28, filename: 'shift-request.mp4', posterTime: 2.4 },
  { kind: 'attendance', duration: 49, filename: 'qr-attendance.mp4', posterTime: 6.6 },
];
const requestedKinds = new Set(process.argv.slice(2));

function installRenderer() {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  document.body.style.margin = '0';
  document.body.style.background = '#000';
  document.body.style.overflow = 'hidden';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const W = canvas.width;
  const H = canvas.height;
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const easeOut = value => 1 - Math.pow(1 - clamp(value), 4);
  const easeInOut = value => {
    const x = clamp(value);
    return x < 0.5 ? 8 * x ** 4 : 1 - ((-2 * x + 2) ** 4) / 2;
  };

  function roundRect(x, y, width, height, radius, fill, stroke, lineWidth = 1) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function line(x1, y1, x2, y2, color, width = 2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function text(value, x, y, size, weight = 400, color = '#fff', align = 'left') {
    ctx.font = `${weight} ${size}px "Public Sans", Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function wrappedText(value, x, y, maxWidth, lineHeight, size, weight, color, maxLines = 99) {
    ctx.font = `${weight} ${size}px "Public Sans", Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const words = value.split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    lines.slice(0, maxLines).forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
    return y + Math.min(lines.length, maxLines) * lineHeight;
  }

  function alphaIn(t, start, duration = 0.35) {
    return easeOut((t - start) / duration);
  }

  function withAlpha(alpha, draw) {
    ctx.save();
    ctx.globalAlpha = clamp(alpha);
    draw();
    ctx.restore();
  }

  function statusBar(background, foreground, time = '9:41') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, 42);
    text(time, 34, 28, 18, 700, foreground);
    line(624, 21, 641, 21, foreground, 3);
    line(630, 16, 641, 16, foreground, 3);
    roundRect(654, 13, 34, 16, 5, null, foreground, 2);
    roundRect(658, 17, 24, 8, 3, foreground);
    ctx.fillStyle = foreground;
    ctx.fillRect(690, 18, 3, 6);
  }

  function tutorialHint(label, t, start, end, accent = '#4d7cfe') {
    const enter = alphaIn(t, start, 0.25);
    const leave = end ? 1 - easeOut((t - end) / 0.25) : 1;
    const alpha = Math.min(enter, leave);
    if (alpha <= 0) return;
    withAlpha(alpha, () => {
      ctx.shadowColor = 'rgba(0,0,0,.28)';
      ctx.shadowBlur = 16;
      roundRect(46, 146, 628, 58, 29, 'rgba(10,17,22,.92)', 'rgba(255,255,255,.14)');
      ctx.shadowBlur = 0;
      roundRect(62, 162, 10, 26, 5, accent);
      text(label, 88, 183, 19, 700, '#f8fafb');
    });
  }

  function tap(x, y, t, at, color = '#4d7cfe') {
    const progress = clamp((t - at) / 0.7);
    if (progress <= 0 || progress >= 1) return;
    withAlpha(1 - progress, () => {
      ctx.beginPath();
      ctx.arc(x, y, 18 + progress * 48, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha *= 0.18;
      ctx.fill();
    });
    withAlpha(clamp(1 - progress * 0.7), () => {
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.38)';
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  }

  function drawWhatsAppWallpaper() {
    ctx.fillStyle = '#0b141a';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#8696a0';
    ctx.lineWidth = 2;
    for (let row = 0; row < 11; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        const x = 42 + col * 112 + (row % 2) * 34;
        const y = 154 + row * 102;
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 1.45);
        ctx.stroke();
        line(x + 30, y - 8, x + 49, y + 11, '#8696a0', 2);
        line(x + 49, y + 11, x + 35, y + 22, '#8696a0', 2);
      }
    }
    ctx.restore();
  }

  function whatsAppHeader() {
    statusBar('#202c33', '#e9edef');
    ctx.fillStyle = '#202c33';
    ctx.fillRect(0, 42, W, 88);
    text('‹', 24, 103, 55, 400, '#aebac1');
    ctx.beginPath();
    ctx.arc(92, 86, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#25d366';
    ctx.fill();
    text('VM', 92, 95, 19, 700, '#ffffff', 'center');
    text('Volunteer Manager', 138, 78, 22, 700, '#e9edef');
    text('cuenta de empresa', 138, 106, 15, 400, '#8696a0');
    text('◉', 552, 94, 26, 400, '#aebac1', 'center');
    text('☎', 616, 94, 23, 400, '#aebac1', 'center');
    text('⋮', 681, 96, 32, 700, '#aebac1', 'center');
  }

  function incomingBubble(x, y, width, height) {
    roundRect(x, y, width, height, 14, '#202c33');
    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x - 12, y + 1);
    ctx.lineTo(x, y + 21);
    ctx.fillStyle = '#202c33';
    ctx.fill();
  }

  function outgoingBubble(x, y, width, height) {
    roundRect(x, y, width, height, 14, '#005c4b');
    ctx.beginPath();
    ctx.moveTo(x + width, y + 5);
    ctx.lineTo(x + width + 12, y + 1);
    ctx.lineTo(x + width, y + 21);
    ctx.fillStyle = '#005c4b';
    ctx.fill();
  }

  function whatsAppComposer() {
    ctx.fillStyle = '#0b141a';
    ctx.fillRect(0, 1190, W, 90);
    roundRect(12, 1200, 632, 62, 31, '#202c33');
    text('☺', 42, 1240, 27, 400, '#8696a0', 'center');
    text('Mensaje', 76, 1240, 18, 400, '#8696a0');
    text('⌕', 558, 1241, 25, 400, '#8696a0', 'center');
    text('▣', 608, 1240, 22, 400, '#8696a0', 'center');
    ctx.beginPath();
    ctx.arc(682, 1231, 31, 0, Math.PI * 2);
    ctx.fillStyle = '#00a884';
    ctx.fill();
    text('●', 682, 1239, 19, 400, '#0b141a', 'center');
  }

  function drawWhatsAppMenuSheet(t) {
    const inProgress = easeOut((t - 6.4) / 0.5);
    const outProgress = easeInOut((t - 10.1) / 0.45);
    const visibility = clamp(Math.min(inProgress, 1 - outProgress));
    if (visibility <= 0) return;
    withAlpha(visibility * 0.54, () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    });
    const y = 1280 - 980 * inProgress + 980 * outProgress;
    roundRect(0, y, W, 1030, 28, '#111b21');
    roundRect(326, y + 12, 68, 6, 3, '#53636d');
    text('Tus opciones', 30, y + 70, 25, 700, '#e9edef');
    text('Menú principal', 30, y + 113, 15, 700, '#00a884');
    const rows = [
      ['Olvidé mi PIN', 'Recíbelo en este mismo número registrado'],
      ['Confirmar asistencia', 'Confirma uno de tus turnos asignados'],
      ['Consultar mis turnos', 'Mira tus fechas y horarios actuales'],
      ['Consultar mis áreas', 'Lee la descripción de tus áreas asignadas'],
      ['Solicitar un cambio', 'Envía una solicitud con su motivo'],
      ['Contactar coordinador', 'Consulta el contacto de tu comité'],
      ['Recibir mi código QR', 'Recibe la imagen de tu pase de entrada'],
      ['Finalizar conversación', 'Cierra esta atención por WhatsApp'],
    ];
    rows.forEach(([title, description], index) => {
      const rowY = y + 140 + index * 101;
      if (index === 2 && t > 9.1) roundRect(14, rowY - 8, 692, 92, 12, 'rgba(0,168,132,.16)');
      ctx.beginPath();
      ctx.arc(50, rowY + 31, 23, 0, Math.PI * 2);
      ctx.fillStyle = '#202c33';
      ctx.fill();
      text(index === 2 ? '▤' : index === 4 ? '↔' : '•', 50, rowY + 39, 20, 700, '#00a884', 'center');
      text(title, 92, rowY + 25, 18, 700, '#e9edef');
      text(description, 92, rowY + 53, 14, 400, '#8696a0');
      line(92, rowY + 77, 700, rowY + 77, '#25333b', 1);
    });
    tap(340, y + 140 + 2 * 101 + 33, t, 9.4, '#00a884');
  }

  function renderWhatsApp(t) {
    drawWhatsAppWallpaper();
    const afterMenu = t >= 10.4;
    const shift = afterMenu ? 360 : 0;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 130, W, 1060);
    ctx.clip();

    withAlpha(alphaIn(t, 0.8), () => {
      outgoingBubble(500, 218 - shift, 172, 62);
      text('Hola', 526, 254 - shift, 20, 400, '#e9edef');
      text('9:41', 605, 266 - shift, 12, 400, '#b4c6bf');
      text('✓✓', 646, 266 - shift, 13, 700, '#53bdeb');
    });

    withAlpha(alphaIn(t, 2.6), () => {
      incomingBubble(34, 310 - shift, 570, 252);
      text('Tus opciones', 58, 349 - shift, 20, 700, '#e9edef');
      wrappedText(
        'Hola Ana, ¿cómo podemos ayudarte el día de hoy? Selecciona una opción para continuar.',
        58,
        385 - shift,
        510,
        29,
        18,
        400,
        '#e9edef',
      );
      line(50, 478 - shift, 588, 478 - shift, '#35444c', 1);
      text('Mostrar menú', 319, 522 - shift, 18, 700, '#00a884', 'center');
      text('9:41', 543, 548 - shift, 12, 400, '#8696a0');
    });

    if (!afterMenu) tap(318, 514, t, 5.7, '#00a884');

    withAlpha(alphaIn(t, 10.5), () => {
      outgoingBubble(404, 510, 268, 70);
      text('Consultar mis turnos', 428, 549, 18, 400, '#e9edef');
      text('9:42', 607, 570, 12, 400, '#b4c6bf');
      text('✓✓', 646, 570, 13, 700, '#53bdeb');
    });

    withAlpha(alphaIn(t, 12.1), () => {
      incomingBubble(34, 610, 620, 370);
      text('📅  Turnos de Ana', 58, 651, 20, 700, '#e9edef');
      text('Comité: Seguridad', 58, 686, 17, 700, '#e9edef');
      text('jue 10 · Turno 2', 58, 738, 18, 700, '#e9edef');
      text('11:00 AM – 3:00 PM', 58, 768, 16, 400, '#d1d7db');
      text('vie 11 · Turno 1', 58, 816, 18, 700, '#e9edef');
      text('8:00 AM – 12:00 PM', 58, 846, 16, 400, '#d1d7db');
      line(48, 881, 640, 881, '#35444c', 1);
      text('Confirmar turno', 135, 922, 16, 700, '#00a884', 'center');
      text('Solicitar cambio', 337, 922, 16, 700, '#00a884', 'center');
      text('Ver mis áreas', 540, 922, 16, 700, '#00a884', 'center');
      text('9:42', 594, 965, 12, 400, '#8696a0');
    });
    ctx.restore();

    whatsAppHeader();
    whatsAppComposer();
    tutorialHint('1 · Escribe un mensaje desde tu número registrado', t, 0, 3.7, '#00a884');
    tutorialHint('2 · Toca “Mostrar menú”', t, 3.7, 7.1, '#00a884');
    tutorialHint('3 · Elige la opción que necesitas', t, 7.1, 11.2, '#00a884');
    tutorialHint('4 · Responde usando las listas y botones del chat', t, 11.2, 17.8, '#00a884');
    tutorialHint('PIN, turnos, cambios, áreas y QR desde el mismo menú', t, 17.8, 21.8, '#00a884');
    drawWhatsAppMenuSheet(t);
  }

  const portal = {
    bg: '#f8fafb',
    surface: '#ffffff',
    muted: '#f2f4f6',
    text: '#252631',
    dim: '#778ca2',
    border: '#e8ecef',
    blue: '#4d7cfe',
    green: '#10a562',
    pink: '#fe4d97',
  };

  function portalStatusBar() {
    statusBar(portal.bg, portal.text);
  }

  function portalButton(x, y, width, label, primary = false) {
    roundRect(x, y, width, 54, 27, primary ? portal.blue : portal.surface, primary ? portal.blue : portal.border, 2);
    text(label, x + width / 2, y + 35, 16, 700, primary ? '#fff' : portal.text, 'center');
  }

  function drawBottomNavigation(active = 'Solicitudes') {
    ctx.save();
    ctx.shadowColor = 'rgba(37,38,49,.16)';
    ctx.shadowBlur = 24;
    roundRect(22, 1174, 676, 82, 41, 'rgba(255,255,255,.96)', portal.border, 1);
    ctx.restore();
    const items = [
      ['Turnos', '✓'],
      ['Solicitudes', '↔'],
      ['Mi Perfil', '●'],
      ['Tema', '◐'],
      ['Salir', '↪'],
    ];
    items.forEach(([label, icon], index) => {
      const x = 90 + index * 135;
      if (label === active) roundRect(x - 51, 1182, 102, 66, 33, 'rgba(77,124,254,.12)');
      text(icon, x, 1212, 22, 700, label === active ? portal.blue : label === 'Salir' ? '#ef6c92' : portal.dim, 'center');
      text(label, x, 1238, 12, 700, label === active ? portal.blue : label === 'Salir' ? '#ef6c92' : portal.dim, 'center');
    });
  }

  function drawRequestsPage(withRequest = false) {
    ctx.fillStyle = portal.bg;
    ctx.fillRect(0, 0, W, H);
    portalStatusBar();
    text('Mis Solicitudes', 28, 96, 34, 700, portal.text);
    text('Consulta tus solicitudes o pide un cambio de turno.', 28, 128, 16, 400, portal.dim);
    line(28, 154, 692, 154, portal.border, 2);
    portalButton(28, 176, 230, '▣  Tutoriales', false);
    portalButton(274, 176, 418, '+  Reagendar turno', true);

    if (!withRequest) {
      roundRect(28, 262, 664, 430, 18, portal.surface, portal.border, 2);
      ctx.beginPath();
      ctx.arc(360, 392, 54, 0, Math.PI * 2);
      ctx.fillStyle = portal.muted;
      ctx.fill();
      text('↔', 360, 404, 34, 700, portal.dim, 'center');
      text('No tienes solicitudes enviadas', 360, 484, 24, 700, portal.text, 'center');
      wrappedText(
        'Para solicitar un cambio de fecha u horario, pulsa “Reagendar turno”.',
        126,
        528,
        468,
        28,
        17,
        400,
        portal.dim,
        3,
      );
    } else {
      roundRect(28, 266, 664, 314, 16, portal.surface, portal.border, 2);
      roundRect(48, 288, 132, 34, 17, 'rgba(245,158,11,.14)', 'rgba(245,158,11,.28)');
      ctx.beginPath();
      ctx.arc(66, 305, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      text('En revisión', 79, 311, 14, 700, '#b77908');
      text('27/08/2026', 654, 311, 13, 400, portal.dim, 'right');
      roundRect(48, 346, 624, 112, 12, portal.muted, portal.border);
      text('ORIGINAL', 68, 377, 12, 700, portal.dim);
      text('SOLICITADO', 652, 377, 12, 700, portal.dim, 'right');
      text('T2  (jue 10)', 68, 418, 18, 700, '#e54c7f');
      text('→', 360, 418, 28, 700, portal.dim, 'center');
      text('T3  (vie 11)', 652, 418, 18, 700, portal.green, 'right');
      line(48, 484, 672, 484, portal.border, 1);
      text('“Compromiso laboral o académico”', 48, 530, 16, 400, portal.dim);
    }
    drawBottomNavigation();
  }

  function dayCard(x, y, day, number, selected, color) {
    roundRect(x, y, 142, 76, 12, selected ? 'rgba(77,124,254,.11)' : portal.muted, selected ? portal.blue : portal.border, selected ? 3 : 1.5);
    roundRect(x, y, 7, 76, 4, color);
    text(day.toUpperCase(), x + 71, y + 29, 12, 700, selected ? portal.blue : portal.dim, 'center');
    text(number, x + 71, y + 58, 20, 700, selected ? portal.blue : portal.text, 'center');
  }

  function shiftButton(x, y, label, selected, selectionColor = portal.pink) {
    roundRect(x, y, 142, 58, 12, selected ? selectionColor : portal.muted, selected ? selectionColor : portal.border, 1.5);
    text(label, x + 71, y + 37, 17, 700, selected ? '#fff' : portal.text, 'center');
  }

  function modalHeader(y) {
    ctx.beginPath();
    ctx.arc(66, y + 44, 26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(77,124,254,.14)';
    ctx.fill();
    text('↔', 66, y + 52, 22, 700, portal.blue, 'center');
    text('Solicitar Reagendamiento', 108, y + 38, 22, 700, portal.text);
    text('Envía tu petición de cambio de fecha o turno.', 108, y + 65, 14, 400, portal.dim);
    ctx.beginPath();
    ctx.arc(656, y + 42, 22, 0, Math.PI * 2);
    ctx.fillStyle = portal.muted;
    ctx.fill();
    text('×', 656, y + 51, 28, 400, portal.dim, 'center');
    line(42, y + 92, 678, y + 92, portal.border, 2);
  }

  function reasonCard(x, y, width, label, selected) {
    roundRect(x, y, width, 76, 12, selected ? 'rgba(77,124,254,.13)' : portal.muted, selected ? portal.blue : portal.border, selected ? 2.5 : 1.5);
    roundRect(x + 12, y + 16, 44, 44, 10, selected ? 'rgba(77,124,254,.18)' : portal.surface);
    text('•', x + 34, y + 48, 22, 700, selected ? portal.blue : portal.dim, 'center');
    wrappedText(label, x + 68, y + 29, width - 112, 20, 14, 700, selected ? portal.blue : portal.text, 2);
    ctx.beginPath();
    ctx.arc(x + width - 22, y + 38, 10, 0, Math.PI * 2);
    ctx.fillStyle = selected ? portal.blue : portal.surface;
    ctx.fill();
    ctx.strokeStyle = selected ? portal.blue : '#cbd5df';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (selected) {
      ctx.beginPath();
      ctx.arc(x + width - 22, y + 38, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }

  function drawRequestModal(t) {
    const modalEnter = easeOut((t - 3.1) / 0.45);
    if (modalEnter <= 0) return;
    withAlpha(modalEnter * 0.48, () => {
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, W, H);
    });
    let modalHeight = 610;
    let restingY = 335;
    if (t >= 8.3) {
      const expand = easeOut((t - 8.3) / 0.55);
      modalHeight = 610 + 390 * expand;
      restingY = 335 - 215 * expand;
    }
    if (t >= 12) {
      const expand = easeOut((t - 12) / 0.55);
      modalHeight = 1000 + 145 * expand;
      restingY = 120 - 58 * expand;
    }
    const modalY = restingY + (1 - modalEnter) * 80;
    roundRect(18, modalY, 684, modalHeight, 26, portal.surface, portal.border, 2);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(18, modalY, 684, modalHeight, 26);
    ctx.clip();

    const scroll = t < 14 ? 0 : easeInOut((t - 14) / 1.1) * 420;
    ctx.translate(0, -scroll);
    modalHeader(modalY);
    const contentY = modalY + 132;
    text('1. SELECCIONA EL TURNO ACTUAL QUE DESEAS CAMBIAR:', 42, contentY, 13, 700, portal.dim);
    const sourceSelected = t >= 6.1;
    dayCard(42, contentY + 24, 'jue', '10', sourceSelected, '#10a562');
    dayCard(196, contentY + 24, 'vie', '11', false, '#4aa9df');
    dayCard(350, contentY + 24, 'sáb', '12', false, '#f1c130');
    dayCard(504, contentY + 24, 'dom', '13', false, '#d54134');
    if (sourceSelected) {
      withAlpha(alphaIn(t, 6.1), () => {
        text('TURNO DEL JUE 10:', 42, contentY + 136, 12, 700, portal.dim);
        shiftButton(42, contentY + 154, 'T1', false);
        shiftButton(196, contentY + 154, 'T2', t >= 7.2);
        shiftButton(350, contentY + 154, 'T3', false);
        shiftButton(504, contentY + 154, 'T4', false);
      });
    }

    if (t >= 8.3) {
      withAlpha(alphaIn(t, 8.3), () => {
        line(42, contentY + 238, 678, contentY + 238, portal.border, 2);
        text('2. SELECCIONA LA NUEVA FECHA DESEADA:', 42, contentY + 278, 13, 700, portal.dim);
        dayCard(42, contentY + 302, 'jue', '10', false, '#10a562');
        dayCard(196, contentY + 302, 'vie', '11', t >= 10, '#4aa9df');
        dayCard(350, contentY + 302, 'sáb', '12', false, '#f1c130');
        dayCard(504, contentY + 302, 'dom', '13', false, '#d54134');
      });
    }

    if (t >= 10) {
      withAlpha(alphaIn(t, 10), () => {
        text('NUEVO TURNO PARA VIE 11:', 42, contentY + 414, 12, 700, portal.dim);
        shiftButton(42, contentY + 432, 'T1', false, portal.green);
        shiftButton(196, contentY + 432, 'T2', false, portal.green);
        shiftButton(350, contentY + 432, 'T3', t >= 12, portal.green);
        shiftButton(504, contentY + 432, 'T4', false, portal.green);
      });
    }

    if (t >= 12) {
      withAlpha(alphaIn(t, 12), () => {
        line(42, contentY + 522, 678, contentY + 522, portal.border, 2);
        text('3. MOTIVO O RAZÓN DEL CAMBIO:', 42, contentY + 562, 13, 700, portal.dim);
        reasonCard(42, contentY + 584, 302, 'Compromiso laboral o académico', t >= 17);
        reasonCard(360, contentY + 584, 318, 'Motivo de salud', false);
        reasonCard(42, contentY + 674, 302, 'Compromiso o emergencia familiar', false);
        reasonCard(360, contentY + 674, 318, 'Dificultad de transporte', false);
        line(42, contentY + 786, 678, contentY + 786, portal.border, 2);
        portalButton(42, contentY + 816, 292, 'Cancelar', false);
        const enabled = t >= 17;
        roundRect(350, contentY + 816, 328, 54, 27, enabled ? portal.blue : portal.muted, enabled ? portal.blue : portal.border, 2);
        text('Enviar Solicitud', 514, contentY + 851, 16, 700, enabled ? '#fff' : portal.dim, 'center');
      });
    }
    ctx.restore();

    tap(482, 203, t, 2.7);
    tap(112, contentY + 63, t, 5.7);
    tap(267, contentY + 182, t, 7);
    tap(268, contentY + 341, t, 9.7);
    tap(421, contentY + 460, t, 11.7);
    tap(194, contentY + 622 - scroll, t, 16.7);
    tap(515, contentY + 843 - scroll, t, 20.2);
  }

  function drawSuccessModal(t) {
    const alpha = alphaIn(t, 21.2);
    if (alpha <= 0) return;
    drawRequestsPage(false);
    withAlpha(0.48 * alpha, () => {
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, W, H);
    });
    withAlpha(alpha, () => {
      roundRect(40, 262, 640, 524, 24, portal.surface, portal.border, 2);
      ctx.beginPath();
      ctx.arc(360, 412, 64, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16,165,98,.14)';
      ctx.fill();
      text('✓', 360, 435, 54, 700, portal.green, 'center');
      text('Solicitud enviada', 360, 524, 28, 700, portal.text, 'center');
      wrappedText(
        'El coordinador revisará tu solicitud. Tu turno actual se mantiene hasta recibir una respuesta.',
        104,
        570,
        512,
        31,
        18,
        400,
        portal.dim,
        4,
      );
      roundRect(104, 690, 512, 58, 29, 'rgba(16,165,98,.12)', 'rgba(16,165,98,.24)');
      text('Estado: En revisión', 360, 727, 17, 700, portal.green, 'center');
    });
  }

  function renderRequest(t) {
    if (t >= 24.5) {
      drawRequestsPage(true);
      tutorialHint('La solicitud aparece como “En revisión”', t, 24.5, 27.8);
      return;
    }
    drawRequestsPage(false);
    if (t < 3.2) {
      tutorialHint('1 · Abre Mis Solicitudes y pulsa “Reagendar turno”', t, 0, 3.2);
      tap(484, 203, t, 2.6);
    }
    if (t >= 3.1 && t < 21.2) {
      drawRequestModal(t);
      tutorialHint('2 · Selecciona el turno actual', t, 3.2, 8.3);
      tutorialHint('3 · Elige la nueva fecha y horario', t, 8.3, 14.1);
      tutorialHint('4 · Indica el motivo y envía', t, 14.1, 21.1);
    }
    if (t >= 21.2) {
      drawSuccessModal(t);
      tutorialHint('Tu turno no cambia hasta que aprueben la solicitud', t, 21.2, 24.5, portal.green);
    }
  }

  const attendance = {
    navy: '#101a2e',
    blue: '#4d7cfe',
    green: '#16a36a',
    gold: '#f3b94f',
    coral: '#ef6c78',
    ink: '#172033',
    paper: '#f8fafc',
  };

  function drawTempleBackground(tint = 0) {
    const image = window.templeBackground;
    if (image) ctx.drawImage(image, 0, 0, W, H);
    if (tint > 0) {
      ctx.fillStyle = `rgba(12,24,48,${tint})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function qrPattern(x, y, size) {
    roundRect(x, y, size, size, 14, '#ffffff');
    const modules = 25;
    const pad = size * 0.09;
    const cell = (size - pad * 2) / modules;
    const finder = (column, row) => {
      ctx.fillStyle = attendance.ink;
      ctx.fillRect(x + pad + column * cell, y + pad + row * cell, cell * 7, cell * 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + pad + (column + 1) * cell, y + pad + (row + 1) * cell, cell * 5, cell * 5);
      ctx.fillStyle = attendance.ink;
      ctx.fillRect(x + pad + (column + 2) * cell, y + pad + (row + 2) * cell, cell * 3, cell * 3);
    };
    const reserved = (column, row) => (
      (column < 8 && row < 8)
      || (column > 16 && row < 8)
      || (column < 8 && row > 16)
    );
    ctx.fillStyle = attendance.ink;
    for (let row = 0; row < modules; row += 1) {
      for (let column = 0; column < modules; column += 1) {
        if (reserved(column, row)) continue;
        if (((row * 7 + column * 11 + row * column) % 5) < 2) {
          ctx.fillRect(x + pad + column * cell, y + pad + row * cell, cell + 0.4, cell + 0.4);
        }
      }
    }
    finder(0, 0);
    finder(18, 0);
    finder(0, 18);
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.095, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    text('VM', x + size / 2, y + size / 2 + size * 0.026, size * 0.055, 700, attendance.blue, 'center');
  }

  function person(x, feetY, scale, options = {}) {
    const {
      shirt = attendance.blue,
      pants = '#27364f',
      skin = '#b96f4d',
      hair = '#2c1b17',
      facing = 1,
      walk = 0,
      phone = false,
      badge = false,
    } = options;
    ctx.save();
    ctx.translate(x, feetY);
    ctx.scale(scale * facing, scale);
    ctx.beginPath();
    ctx.ellipse(0, 4, 34, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15,23,42,.18)';
    ctx.fill();
    line(-14, -76, -19 - walk * 7, -6, pants, 18);
    line(14, -76, 19 + walk * 7, -6, pants, 18);
    line(-20 - walk * 7, -5, -3 - walk * 7, -5, '#182235', 9);
    line(18 + walk * 7, -5, 35 + walk * 7, -5, '#182235', 9);
    ctx.beginPath();
    ctx.moveTo(-31, -174);
    ctx.quadraticCurveTo(-48, -169, -49, -148);
    ctx.lineTo(-35, -79);
    ctx.quadraticCurveTo(0, -68, 35, -79);
    ctx.lineTo(49, -148);
    ctx.quadraticCurveTo(48, -169, 31, -174);
    ctx.closePath();
    ctx.fillStyle = shirt;
    ctx.fill();
    line(-37, -151, -55 + walk * 8, -84, skin, 15);
    line(37, -151, 52 - walk * 8, -84, skin, 15);
    roundRect(-11, -193, 22, 24, 8, skin);
    ctx.beginPath();
    ctx.arc(0, -216, 31, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-2, -228, 31, Math.PI, Math.PI * 2);
    ctx.fillStyle = hair;
    ctx.fill();
    if (phone) {
      roundRect(42, -111, 27, 45, 6, '#111827', '#526079', 2);
      roundRect(47, -105, 17, 30, 3, '#ecf3ff');
    }
    if (badge) {
      line(0, -157, 0, -128, '#f7d46a', 3);
      roundRect(-16, -130, 32, 39, 5, '#ffffff', attendance.gold, 2);
      roundRect(-11, -123, 22, 7, 3, attendance.blue);
      text('VM', 0, -101, 8, 700, attendance.ink, 'center');
    }
    ctx.restore();
  }

  function coordinatorBehindTable() {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, 790);
    ctx.clip();
    person(548, 910, 1.22, { shirt: '#243553', facing: -1, phone: true, badge: true, skin: '#9b5b3e' });
    ctx.restore();
  }

  function subtitleBand(lines, detail, step, accent = attendance.blue) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.3)';
    ctx.shadowBlur = 28;
    ctx.fillStyle = 'rgba(9,16,31,.97)';
    ctx.fillRect(0, 1038, W, 242);
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 1038, W, 6);
    ctx.font = '700 13px "Public Sans", Arial, sans-serif';
    const stepWidth = Math.max(62, ctx.measureText(step).width + 26);
    roundRect(32, 1072, stepWidth, 30, 15, `${accent}2e`, `${accent}70`, 1.5);
    text(step, 32 + stepWidth / 2, 1093, 13, 700, '#ffffff', 'center');
    lines.forEach((item, index) => text(item, 32, 1140 + index * 35, 27, 700, '#ffffff'));
    if (detail) text(detail, 32, 1239, 16, 400, '#b9c4d6');
    ctx.restore();
  }

  function titleCard(t) {
    drawTempleBackground(0.12);
    const alpha = alphaIn(t, 0.25, 0.6);
    withAlpha(alpha, () => {
      roundRect(38, 92, 644, 252, 28, 'rgba(9,16,31,.88)', 'rgba(255,255,255,.18)', 1.5);
      roundRect(70, 124, 88, 40, 20, 'rgba(77,124,254,.24)', 'rgba(126,162,255,.5)', 1.5);
      text('GUÍA', 114, 151, 16, 700, '#dbe6ff', 'center');
      text('Registro de entrada', 70, 220, 39, 700, '#ffffff');
      text('y salida con tu QR', 70, 270, 39, 700, '#ffffff');
      text('Templo de Managua, Nicaragua', 70, 316, 18, 400, '#cbd5e1');
    });
    subtitleBand(['Lleva tu código QR listo', 'para registrar tu jornada.'], null, 'INICIO');
  }

  function drawPhoneQr(closeProgress = 1) {
    const scale = 0.92 + closeProgress * 0.08;
    ctx.save();
    ctx.translate(360, 492);
    ctx.scale(scale, scale);
    roundRect(-202, -390, 404, 790, 48, '#0d1117', '#42516a', 5);
    roundRect(-179, -350, 358, 708, 32, '#0d1117');
    roundRect(-52, -375, 104, 14, 7, '#020617');
    text('Pase de Entrada', -146, -292, 25, 700, '#ffffff');
    text('Muestra este código al coordinador al llegar.', -146, -260, 13, 400, '#94a3b8');
    line(-150, -230, 150, -230, 'rgba(255,255,255,.1)', 2);
    qrPattern(-126, -186, 252);
    text('Ana Martínez', 0, 104, 22, 700, '#ffffff', 'center');
    roundRect(-84, 124, 168, 32, 16, 'rgba(77,124,254,.17)', 'rgba(77,124,254,.38)');
    text('COMITÉ DE GUÍAS', 0, 146, 11, 700, '#7ea2ff', 'center');
    roundRect(-110, 188, 220, 48, 24, attendance.blue);
    text('↻  Volver a cargar', 0, 219, 14, 700, '#ffffff', 'center');
    ctx.restore();
  }

  function drawScannerPhone(mode = 'scan') {
    roundRect(124, 76, 472, 900, 50, '#131b2c', '#46546b', 5);
    roundRect(144, 114, 432, 824, 32, '#f7f8fb');
    roundRect(302, 92, 116, 15, 8, '#020617');
    text('Escanear', 174, 175, 31, 700, attendance.ink);
    roundRect(406, 143, 138, 42, 21, '#e9edf3');
    text('Ver Historial', 475, 170, 13, 700, '#69778b', 'center');
    if (mode === 'scan') {
      roundRect(174, 218, 372, 372, 24, '#172033');
      ctx.save();
      ctx.globalAlpha = 0.34;
      for (let row = 0; row < 8; row += 1) {
        line(175, 240 + row * 45, 545, 240 + row * 45, '#62718c', 1);
      }
      ctx.restore();
      qrPattern(278, 305, 164);
      const corner = attendance.blue;
      line(232, 272, 288, 272, corner, 6);
      line(232, 272, 232, 328, corner, 6);
      line(488, 272, 432, 272, corner, 6);
      line(488, 272, 488, 328, corner, 6);
      line(232, 536, 288, 536, corner, 6);
      line(232, 536, 232, 480, corner, 6);
      line(488, 536, 432, 536, corner, 6);
      line(488, 536, 488, 480, corner, 6);
      text('●', 190, 638, 16, 700, attendance.green);
      text('Buscando código QR...', 214, 638, 15, 700, '#69778b');
      roundRect(174, 680, 372, 74, 18, '#edf1f7', '#dde3ec');
      text('Esta sesión', 194, 708, 12, 700, '#7b8798');
      text('0 registros', 194, 740, 22, 700, attendance.ink);
    } else if (mode === 'success') {
      ctx.beginPath();
      ctx.arc(360, 355, 76, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(22,163,106,.14)';
      ctx.fill();
      text('✓', 360, 382, 64, 700, attendance.green, 'center');
      text('¡Asistencia Confirmada!', 360, 480, 22, 700, attendance.ink, 'center');
      text('Ana Martínez', 360, 518, 17, 400, '#768397', 'center');
      roundRect(174, 580, 372, 62, 18, attendance.green);
      text('Escanear Siguiente', 360, 620, 16, 700, '#ffffff', 'center');
    } else {
      ctx.beginPath();
      ctx.arc(360, 310, 62, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(243,185,79,.18)';
      ctx.fill();
      text('✓', 360, 333, 50, 700, attendance.gold, 'center');
      text('Completar Turno', 360, 408, 25, 700, attendance.ink, 'center');
      wrappedText('¿Deseas marcar el turno de Ana Martínez como completado?', 198, 462, 324, 27, 17, 400, '#64748b', 3);
      line(188, 562, 532, 562, '#e1e6ed', 2);
      text('Tiempo transcurrido de servicio:', 360, 601, 14, 400, '#7b8798', 'center');
      roundRect(270, 620, 180, 38, 19, 'rgba(22,163,106,.12)', 'rgba(22,163,106,.3)');
      text('4 horas', 360, 645, 14, 700, attendance.green, 'center');
      roundRect(190, 702, 340, 62, 31, attendance.blue);
      text('Turno Completado', 360, 742, 17, 700, '#ffffff', 'center');
    }
  }

  function drawBadgeHandoff(progress, returning = false) {
    drawTempleBackground(returning ? 0.23 : 0.06);
    coordinatorBehindTable();
    person(184, 956, 1.38, {
      shirt: attendance.blue,
      phone: !returning,
      badge: returning ? progress < 0.5 : progress > 0.65,
    });
    const startX = returning ? 182 : 505;
    const endX = returning ? 505 : 182;
    const x = startX + (endX - startX) * easeInOut(progress);
    line(x, 668, x, 705, attendance.gold, 4);
    roundRect(x - 24, 705, 48, 60, 7, '#ffffff', attendance.gold, 3);
    roundRect(x - 17, 714, 34, 10, 4, attendance.blue);
    text('VM', x, 749, 11, 700, attendance.ink, 'center');
  }

  function renderAttendance(t) {
    if (t < 4.5) {
      titleCard(t);
      return;
    }

    if (t < 9.5) {
      drawTempleBackground(0.04);
      const progress = easeInOut((t - 4.5) / 4.4);
      coordinatorBehindTable();
      person(42 + progress * 336, 958 + Math.sin(t * 7) * 4, 1.36, {
        shirt: attendance.blue,
        phone: true,
        walk: Math.sin(t * 7) * 0.72,
      });
      subtitleBand(['Al llegar, acércate a la mesa', 'de Tecnología.'], 'Ten tu teléfono listo antes de llegar a la mesa.', 'PASO 1');
      return;
    }

    if (t < 14.5) {
      drawTempleBackground(0.62);
      drawPhoneQr(easeOut((t - 9.5) / 0.8));
      subtitleBand(['Abre tu pase y muestra', 'el código QR.'], 'Sostén el teléfono con la pantalla visible.', 'PASO 2');
      return;
    }

    if (t < 19.5) {
      ctx.fillStyle = attendance.navy;
      ctx.fillRect(0, 0, W, H);
      drawScannerPhone('scan');
      const scan = easeInOut((t - 15.2) / 2.8);
      withAlpha(0.75, () => {
        ctx.fillStyle = attendance.blue;
        ctx.fillRect(174, 300 + scan * 210, 372, 3);
      });
      subtitleBand(['El coordinador escaneará', 'tu código.'], 'Mantén el teléfono quieto durante unos segundos.', 'PASO 3');
      return;
    }

    if (t < 22.2) {
      ctx.fillStyle = attendance.navy;
      ctx.fillRect(0, 0, W, H);
      drawScannerPhone('success');
      subtitleBand(['Tu entrada quedará registrada.'], 'Espera la confirmación del coordinador.', 'ENTRADA', attendance.green);
      return;
    }

    if (t < 25.5) {
      drawBadgeHandoff((t - 22.2) / 2.3, false);
      subtitleBand(['Recibe tu gafete antes', 'de comenzar el servicio.'], 'Úsalo durante toda tu jornada.', 'GAFETE', attendance.gold);
      return;
    }

    if (t < 29.5) {
      drawTempleBackground(0.18);
      person(360, 956, 1.52, { shirt: attendance.blue, phone: true, badge: true });
      withAlpha(alphaIn(t, 25.5), () => {
        roundRect(94, 104, 532, 176, 28, 'rgba(9,16,31,.88)', 'rgba(255,255,255,.16)');
        text('TU TURNO', 360, 156, 15, 700, '#a9bce2', 'center');
        text('Servicio en progreso', 360, 217, 34, 700, '#ffffff', 'center');
        text('8:00 AM  →  12:00 PM', 360, 255, 18, 400, '#cbd5e1', 'center');
      });
      subtitleBand(['Realiza tu servicio con', 'el gafete visible.'], null, 'SERVICIO');
      return;
    }

    if (t < 34.2) {
      drawTempleBackground(0.2);
      const progress = easeInOut((t - 29.5) / 4);
      coordinatorBehindTable();
      const volunteerX = 55 + progress * 310;
      const volunteerBaseY = 958 + Math.sin(t * 7) * 4;
      person(volunteerX, volunteerBaseY, 1.36, {
        shirt: attendance.blue,
        phone: true,
        badge: true,
        walk: Math.sin(t * 7) * 0.72,
      });
      subtitleBand(['Al finalizar, regresa a la mesa', 'de Tecnología.'], 'No te retires sin registrar tu salida.', 'PASO 4', attendance.coral);
      return;
    }

    if (t < 38.2) {
      drawTempleBackground(0.62);
      drawPhoneQr(easeOut((t - 34.2) / 0.7));
      subtitleBand(['Muestra nuevamente el mismo QR.'], 'El coordinador lo escaneará para cerrar tu jornada.', 'SALIDA', attendance.coral);
      return;
    }

    if (t < 44.3) {
      ctx.fillStyle = attendance.navy;
      ctx.fillRect(0, 0, W, H);
      drawScannerPhone('checkout');
      tap(360, 735, t, 41.4, attendance.blue);
      subtitleBand(['El coordinador confirmará', 'que tu turno terminó.'], 'Espera hasta ver la confirmación de salida.', 'CONFIRMAR', attendance.blue);
      return;
    }

    drawBadgeHandoff(clamp((t - 44.3) / 2.1), true);
    withAlpha(alphaIn(t, 46.2), () => {
      roundRect(80, 100, 560, 180, 28, 'rgba(9,16,31,.9)', 'rgba(255,255,255,.18)');
      ctx.beginPath();
      ctx.arc(136, 190, 34, 0, Math.PI * 2);
      ctx.fillStyle = attendance.green;
      ctx.fill();
      text('✓', 136, 203, 32, 700, '#ffffff', 'center');
      text('Jornada completada', 190, 182, 30, 700, '#ffffff');
      text('Entrada y salida registradas', 190, 218, 17, 400, '#cbd5e1');
    });
    subtitleBand(['Devuelve tu gafete antes', 'de retirarte.'], 'Gracias por tu servicio.', 'FINAL', attendance.green);
  }

  function render(kind, time) {
    ctx.clearRect(0, 0, W, H);
    if (kind === 'whatsapp') renderWhatsApp(time);
    else if (kind === 'request') renderRequest(time);
    else renderAttendance(time);
  }

  async function record(kind, duration, filename) {
    const mimeCandidates = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
      'video/webm;codecs=vp9',
    ];
    const mimeType = mimeCandidates.find(candidate => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error('No compatible MediaRecorder format found.');
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_500_000 });
    const chunks = [];
    recorder.ondataavailable = event => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const completed = new Promise(resolve => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });
    const start = performance.now();
    recorder.start(500);
    const timer = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      render(kind, Math.min(duration, elapsed));
      if (elapsed >= duration) {
        clearInterval(timer);
        recorder.stop();
      }
    }, 1000 / 30);
    const blob = await completed;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return mimeType;
  }

  window.tutorialRenderer = {
    canvas,
    render,
    record,
    poster(kind, time) {
      render(kind, time);
      return canvas.toDataURL('image/png');
    },
  };
}

await fs.mkdir(outputDir, { recursive: true });
const [regularFont, boldFont, templeBackground] = await Promise.all([
  fs.readFile(regularFontPath, 'base64'),
  fs.readFile(boldFontPath, 'base64'),
  fs.readFile(templeBackgroundPath, 'base64'),
]);

const browser = await chromium.launch({
  headless: true,
  executablePath: edgePath,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

try {
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  await page.evaluate(async ({ regular, bold, temple }) => {
    const regularFace = new FontFace('Public Sans', `url(data:font/woff2;base64,${regular})`, { weight: '400' });
    const boldFace = new FontFace('Public Sans', `url(data:font/woff2;base64,${bold})`, { weight: '700' });
    await Promise.all([regularFace.load(), boldFace.load()]);
    document.fonts.add(regularFace);
    document.fonts.add(boldFace);
    await document.fonts.ready;
    const templeImage = new Image();
    templeImage.src = `data:image/png;base64,${temple}`;
    await templeImage.decode();
    window.templeBackground = templeImage;
  }, { regular: regularFont, bold: boldFont, temple: templeBackground });
  await page.evaluate(installRenderer);

  for (const tutorial of tutorials.filter(item => requestedKinds.size === 0 || requestedKinds.has(item.kind))) {
    const posterDataUrl = await page.evaluate(
      ({ kind, posterTime }) => window.tutorialRenderer.poster(kind, posterTime),
      tutorial,
    );
    const posterBuffer = Buffer.from(posterDataUrl.split(',')[1], 'base64');
    await fs.writeFile(path.join(outputDir, tutorial.filename.replace('.mp4', '.png')), posterBuffer);

    const downloadPromise = page.waitForEvent('download', { timeout: tutorial.duration * 1000 + 30_000 });
    await page.evaluate(
      ({ kind, duration, filename }) => window.tutorialRenderer.record(kind, duration, filename),
      tutorial,
    );
    const download = await downloadPromise;
    await download.saveAs(path.join(outputDir, tutorial.filename));
    console.log(`Generated ${tutorial.filename}`);
  }
} finally {
  await browser.close();
}
