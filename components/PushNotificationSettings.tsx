'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ensureBrowserPushSubscription,
  getBrowserPushSubscription,
  restoreBrowserPushSubscription,
  setBrowserPushPreference,
} from '@/lib/push/browser';

type PushState = { configured: boolean; active: boolean; serverActive?: boolean; publicKey?: string; requests?: boolean; coverage?: boolean };
const focusStyle = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] focus-visible:ring-offset-2 focus-visible:ring-offset-dark2';

async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api/push/${path}`, { method, credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo conectar con las notificaciones.');
  return result;
}

function browserSupport() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !installed) return 'En iPhone o iPad, abre esta página en Safari, toca Compartir → Agregar a pantalla de inicio y entra desde el nuevo icono para activar las notificaciones.';
  if (!window.isSecureContext) return 'Las notificaciones necesitan una conexión HTTPS segura.';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'Este navegador no admite Web Push. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari.';
  if (Notification.permission === 'denied') return 'Las notificaciones están bloqueadas. Permítelas en los ajustes de este sitio en tu navegador y vuelve a intentarlo.';
  return '';
}

export function PushNotificationSettings() {
  const [state, setState] = useState<PushState | null>(null);
  const [support, setSupport] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      setSupport(browserSupport());
      let result = await api('subscription') as PushState;
      if (await restoreBrowserPushSubscription(result)) result = await api('subscription') as PushState;
      const subscription = await getBrowserPushSubscription();
      setState({ ...result, serverActive: result.active, active: result.active && Boolean(subscription) && 'Notification' in window && Notification.permission === 'granted' });
      setError('');
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo cargar la configuración.'); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    window.addEventListener('focus', load);
    return () => { clearTimeout(timer); window.removeEventListener('focus', load); };
  }, [load]);

  const enable = async () => {
    if (!state?.publicKey || support || busy) return;
    setBusy(true); setError(''); setNotice('');
    let created: PushSubscription | null = null;
    try {
      // Request immediately in the click handler (required by iOS).
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setSupport(browserSupport()); setNotice('No se activaron las notificaciones. Puedes hacerlo cuando quieras.'); return; }
      const ensured = await ensureBrowserPushSubscription(state.publicKey);
      const subscription = ensured.subscription;
      if (ensured.created) created = subscription;
      await api('subscription', 'POST', subscription.toJSON());
      setBrowserPushPreference(true);
      await load();
      setNotice('Notificaciones activadas en este dispositivo.');
      window.dispatchEvent(new Event('push-settings-changed'));
    } catch (error) {
      if (created) await created.unsubscribe().catch(() => false);
      setError(error instanceof Error ? error.message : 'No se pudieron activar las notificaciones.');
    } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api('subscription', 'DELETE');
      setState(previous => previous ? { ...previous, active: false, serverActive: false } : previous);
      // Server revocation is authoritative even if the browser has lost permission/support.
      try {
        const subscription = await getBrowserPushSubscription();
        await subscription?.unsubscribe();
      } catch { /* No server sends remain; local cleanup can be retried on activation. */ }
      setBrowserPushPreference(false);
      setNotice('Ya no se enviarán notificaciones a este dispositivo.');
      window.dispatchEvent(new Event('push-settings-changed'));
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudieron desactivar.'); }
    finally { setBusy(false); }
  };
  const preferences = async (key: 'requests' | 'coverage', value: boolean) => {
    if (!state) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const next = { requests: state.requests ?? true, coverage: state.coverage ?? true, [key]: value };
      await api('subscription', 'PUT', next); setState({ ...state, ...next }); setNotice('Preferencias guardadas para este dispositivo.');
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudieron guardar.'); }
    finally { setBusy(false); }
  };

  return <section id="settings-notifications" aria-labelledby="push-settings-title" className="scroll-mt-44 p-4 sm:p-6 text-text">
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="material-symbols-outlined mt-0.5 text-[24px] text-[#4d7cfe]">notifications_active</span>
      <div><h3 id="push-settings-title" className="font-bold text-text">Notificaciones operativas</h3>
        <p className="mt-1 max-w-prose text-sm leading-6 text-slate-600 dark:text-slate-300">Recibe avisos de solicitudes y turnos que necesitan atención, incluso sin tener la app abierta.</p></div>
    </div>
    {!state && !error && <p role="status" className="mt-4 text-sm text-text">Comprobando este dispositivo…</p>}
    {state && !state.configured && <p className="mt-4 rounded-lg bg-dark3 p-3 text-sm leading-6 text-text">Las notificaciones todavía no están habilitadas en el servidor. El administrador debe completar la configuración Web Push.</p>}
    {state?.configured && <div className="mt-4 space-y-4">
      <p className="text-sm font-bold text-text">{state.active ? 'Activas en este dispositivo' : 'Sin activar en este dispositivo'}</p>
      {support && <p className="max-w-prose text-sm leading-6 text-slate-600 dark:text-slate-300">{support}</p>}
      {state.active && <div className="space-y-3">
        {(['requests', 'coverage'] as const).map(key => <label key={key} className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={state[key] ?? true} disabled={busy} onChange={event => void preferences(key, event.target.checked)} className={`mt-1 size-4 accent-[#4d7cfe] ${focusStyle}`} />
          <span><span className="block font-bold">{key === 'requests' ? 'Nuevas solicitudes' : 'Cobertura crítica'}</span><span className="mt-0.5 block text-slate-600 dark:text-slate-300">{key === 'requests' ? 'Cambios de turno pendientes, según tu comité y permisos.' : 'Turnos de las próximas 48 horas debajo del mínimo. Máximo un aviso por turno al día.'}</span></span>
        </label>)}
      </div>}
      <div className="flex flex-wrap gap-2">
        {!state.active && !support && <button type="button" onClick={() => void enable()} disabled={busy} className={`min-h-11 rounded-lg bg-[#315ee0] px-4 text-sm font-bold text-white hover:bg-[#284ec2] disabled:opacity-60 ${focusStyle}`}>{busy ? 'Activando…' : 'Activar notificaciones'}</button>}
        {state.serverActive && <button type="button" onClick={() => void disable()} disabled={busy} className={`min-h-11 rounded-lg px-4 text-sm font-bold hover:bg-dark3 disabled:opacity-60 ${focusStyle}`}>Desactivar en este dispositivo</button>}
      </div>
    </div>}
    {error && <div role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300"><p>{error}</p><button type="button" onClick={() => void load()} className={`mt-2 min-h-10 rounded px-2 font-bold underline ${focusStyle}`}>Volver a comprobar</button></div>}
    {notice && <p role="status" className="mt-4 text-sm leading-6 text-text">{notice}</p>}
  </section>;
}

export function PushNotificationInvite() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const refresh = async () => {
      try {
        let state = await api('subscription') as PushState;
        if (await restoreBrowserPushSubscription(state)) state = await api('subscription') as PushState;
        if (sessionStorage.getItem('push-invite-dismissed') === '1') {
          setVisible(false);
          return;
        }
        setVisible(state.configured && !state.active);
      } catch { /* Settings shows configuration errors; no interruptions here. */ }
    };
    void refresh();
    window.addEventListener('push-settings-changed', refresh);
    return () => window.removeEventListener('push-settings-changed', refresh);
  }, []);
  if (!visible) return null;
  return <aside aria-label="Activar notificaciones" className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-border bg-dark2 p-3 sm:mx-6">
    <span aria-hidden="true" className="material-symbols-outlined text-[#4d7cfe]">notifications</span>
    <div className="min-w-0 flex-1"><p className="text-sm font-bold text-text">Entérate cuando una solicitud necesite atención</p><Link href="/settings?section=notifications" className={`inline-flex min-h-9 items-center rounded text-sm font-bold text-blue-700 dark:text-blue-300 hover:underline ${focusStyle}`}>Configurar notificaciones</Link></div>
    <button type="button" aria-label="Ocultar sugerencia por esta sesión" onClick={() => { sessionStorage.setItem('push-invite-dismissed', '1'); setVisible(false); }} className={`flex size-10 shrink-0 items-center justify-center rounded hover:bg-dark3 ${focusStyle}`}><span aria-hidden="true" className="material-symbols-outlined">close</span></button>
  </aside>;
}
