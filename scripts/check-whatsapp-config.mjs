import fs from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';

function loadLocalEnvironment() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function state(name) {
  return process.env[name]?.trim() ? 'configurado' : 'FALTA';
}

function normalizeVersion(version) {
  const selected = version?.trim() || 'v20.0';
  return selected.startsWith('v') ? selected : `v${selected}`;
}

loadLocalEnvironment();

const shouldSubscribe = process.argv.includes('--subscribe');

const required = [
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_WABA_ID',
  'META_APP_SECRET'
];

console.log('Configuración de WhatsApp (los valores secretos no se muestran):');
for (const name of required) {
  console.log(`- ${name}: ${state(name)}`);
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
if (!appUrl) {
  console.log('- URL pública: FALTA NEXT_PUBLIC_APP_URL');
} else {
  try {
    const parsed = new URL(appUrl);
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    const isPublicHttps = parsed.protocol === 'https:' && !isLocal;
    console.log(`- URL pública HTTPS: ${isPublicHttps ? 'correcta' : 'NO disponible para webhooks de Meta'}`);
  } catch {
    console.log('- URL pública: inválida');
  }
}

const token = process.env.WHATSAPP_TOKEN?.trim();
const wabaId = process.env.WHATSAPP_WABA_ID?.trim();
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const appSecret = process.env.META_APP_SECRET?.trim();

if (!token || !wabaId) {
  console.log('\nNo se comprobó la suscripción WABA porque falta WHATSAPP_TOKEN o WHATSAPP_WABA_ID.');
  process.exitCode = 1;
} else {
  const version = normalizeVersion(process.env.WHATSAPP_GRAPH_VERSION);
  const appSecretProof = appSecret
    ? createHmac('sha256', appSecret).update(token, 'utf8').digest('hex')
    : null;

  async function graphGet(pathname, fields) {
    const endpoint = new URL(`https://graph.facebook.com/${version}/${pathname}`);
    if (fields) endpoint.searchParams.set('fields', fields);
    if (appSecretProof) endpoint.searchParams.set('appsecret_proof', appSecretProof);

    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();
    return { response, body };
  }

  async function subscribeCurrentApp() {
    const endpoint = new URL(
      `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/subscribed_apps`
    );
    if (appSecretProof) endpoint.searchParams.set('appsecret_proof', appSecretProof);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();
    return { response, body };
  }

  try {
    const wabaResult = await graphGet(encodeURIComponent(wabaId), 'id');

    if (!wabaResult.response.ok) {
      const reason = wabaResult.body?.error?.message || `HTTP ${wabaResult.response.status}`;
      console.error(`\nAcceso a WABA o META_APP_SECRET incorrecto: ${reason}`);
      process.exitCode = 1;
      process.exit();
    }

    console.log('\n- Acceso a WABA: correcto');
    if (appSecretProof) {
      console.log('- META_APP_SECRET y WHATSAPP_TOKEN: combinación aceptada por Meta');
    }

    const phoneResult = await graphGet(`${encodeURIComponent(wabaId)}/phone_numbers`, 'id');
    if (!phoneResult.response.ok) {
      const reason = phoneResult.body?.error?.message || `HTTP ${phoneResult.response.status}`;
      console.error(`- No se pudo comprobar el número remitente: ${reason}`);
      process.exitCode = 1;
    } else {
      const phoneBelongsToWaba = Array.isArray(phoneResult.body?.data)
        && phoneResult.body.data.some(item => String(item?.id) === phoneNumberId);
      console.log(`- WHATSAPP_PHONE_NUMBER_ID pertenece a la WABA: ${phoneBelongsToWaba ? 'sí' : 'NO'}`);
      if (!phoneBelongsToWaba) process.exitCode = 1;
    }

    const subscriptionResult = await graphGet(`${encodeURIComponent(wabaId)}/subscribed_apps`);
    const { response, body } = subscriptionResult;

    if (!response.ok) {
      const reason = body?.error?.message || `HTTP ${response.status}`;
      console.error(`\nNo se pudo comprobar la suscripción WABA: ${reason}`);
      process.exitCode = 1;
    } else if (Array.isArray(body?.data) && body.data.length > 0) {
      console.log('\nSuscripción WABA: activa. Meta reporta al menos una aplicación suscrita.');
    } else if (shouldSubscribe) {
      console.log('\nSuscripción WABA: no existe; solicitando la suscripción de la aplicación actual...');
      const subscribeResult = await subscribeCurrentApp();

      if (!subscribeResult.response.ok || subscribeResult.body?.success !== true) {
        const reason = subscribeResult.body?.error?.message
          || `HTTP ${subscribeResult.response.status}`;
        console.error(`No se pudo suscribir la aplicación: ${reason}`);
        process.exitCode = 1;
      } else {
        const verification = await graphGet(`${encodeURIComponent(wabaId)}/subscribed_apps`);
        const isNowSubscribed = verification.response.ok
          && Array.isArray(verification.body?.data)
          && verification.body.data.length > 0;

        console.log(`Suscripción WABA después del cambio: ${isNowSubscribed ? 'activa' : 'NO confirmada'}`);
        if (!isNowSubscribed) process.exitCode = 1;
      }
    } else {
      console.error('\nSuscripción WABA: NO hay aplicaciones suscritas.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`\nNo se pudo consultar Meta: ${error instanceof Error ? error.message : 'error desconocido'}`);
    process.exitCode = 1;
  }
}
