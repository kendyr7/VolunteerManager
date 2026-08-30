'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'other';
type Browser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'other';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_STORAGE_KEY = 'volunteer-manager-install-dismissed-until';
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  );
}

function detectDevice(): { platform: Platform; browser: Browser } {
  const userAgent = navigator.userAgent;
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  const platform: Platform = /iPhone|iPad|iPod/i.test(userAgent) || isIPadOS
    ? 'ios'
    : /Android/i.test(userAgent)
      ? 'android'
      : /Windows/i.test(userAgent)
        ? 'windows'
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? 'macos'
          : 'other';

  const browser: Browser = /Edg\//i.test(userAgent)
    ? 'edge'
    : /Firefox|FxiOS/i.test(userAgent)
      ? 'firefox'
      : /Chrome|CriOS/i.test(userAgent)
        ? 'chrome'
        : /Safari/i.test(userAgent)
          ? 'safari'
          : 'other';

  return { platform, browser };
}

function MaterialIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

export function AppInstallPrompt({ enabled = true }: { enabled?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [device, setDevice] = useState<{ platform: Platform; browser: Browser }>({
    platform: 'other',
    browser: 'other',
  });

  const hideAsInstalled = useCallback(() => {
    window.localStorage.removeItem(DISMISS_STORAGE_KEY);
    setVisible(false);
    setGuideOpen(false);
    setInstallPrompt(null);
  }, []);

  useEffect(() => {
    if (!enabled || isStandalone()) return;

    const initializePrompt = window.setTimeout(() => {
      setDevice(detectDevice());

      const dismissedUntil = Number(window.localStorage.getItem(DISMISS_STORAGE_KEY) || 0);
      if (!Number.isFinite(dismissedUntil) || dismissedUntil <= Date.now()) {
        setVisible(true);
      }
    }, 0);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const handleAppInstalled = () => hideAsInstalled();
    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      if (event.matches) hideAsInstalled();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    standaloneMedia.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.clearTimeout(initializePrompt);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      standaloneMedia.removeEventListener('change', handleDisplayModeChange);
    };
  }, [enabled, hideAsInstalled]);

  const deviceLabel = useMemo(() => {
    if (device.platform === 'ios') return 'iPhone o iPad';
    if (device.platform === 'android') return 'Android';
    if (device.platform === 'windows') return 'Windows';
    if (device.platform === 'macos') return 'Mac';
    return 'este dispositivo';
  }, [device.platform]);

  const instructions = useMemo(() => {
    if (device.platform === 'ios') {
      return [
        { icon: 'ios_share', text: 'Abre esta página en Safari y toca el botón Compartir.' },
        { icon: 'add_box', text: 'Desliza el menú y elige “Agregar a pantalla de inicio”.' },
        { icon: 'check_circle', text: 'Confirma con “Agregar”. La app aparecerá junto a tus otras aplicaciones.' },
      ];
    }

    if (device.platform === 'android') {
      return [
        { icon: 'more_vert', text: 'Abre el menú del navegador, normalmente identificado con tres puntos.' },
        { icon: 'install_mobile', text: 'Selecciona “Instalar aplicación” o “Agregar a pantalla principal”.' },
        { icon: 'check_circle', text: 'Confirma la instalación para crear el acceso directo.' },
      ];
    }

    if (device.platform === 'windows') {
      return [
        { icon: 'install_desktop', text: 'En Edge o Chrome, busca el icono de instalación al final de la barra de direcciones.' },
        { icon: 'apps', text: 'Si no aparece, abre el menú del navegador y busca “Aplicaciones” o “Instalar Volunteer Manager”.' },
        { icon: 'check_circle', text: 'Confirma para abrirla después como una aplicación independiente.' },
      ];
    }

    if (device.platform === 'macos') {
      if (device.browser === 'safari') {
        return [
          { icon: 'web', text: 'En Safari, abre el menú Archivo.' },
          { icon: 'add_to_home_screen', text: 'Selecciona “Agregar al Dock”.' },
          { icon: 'check_circle', text: 'Confirma el nombre y la app quedará disponible desde el Dock y Spotlight.' },
        ];
      }

      return [
        { icon: 'install_desktop', text: 'En Chrome o Edge, busca el icono de instalación en la barra de direcciones.' },
        { icon: 'apps', text: 'También puedes abrir el menú del navegador y elegir “Instalar Volunteer Manager”.' },
        { icon: 'check_circle', text: 'Confirma para agregarla a tus aplicaciones.' },
      ];
    }

    return [
      { icon: 'more_vert', text: 'Abre el menú principal de tu navegador.' },
      { icon: 'add_to_home_screen', text: 'Busca “Instalar aplicación” o “Agregar a pantalla de inicio”.' },
      { icon: 'check_circle', text: 'Confirma para crear un acceso directo a Volunteer Manager.' },
    ];
  }, [device.browser, device.platform]);

  const requestNativeInstall = useCallback(async () => {
    if (!installPrompt) {
      setGuideOpen(true);
      return;
    }

    setIsInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'accepted') {
        setVisible(false);
        setGuideOpen(false);
      }
    } finally {
      setIsInstalling(false);
    }
  }, [installPrompt]);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now() + DISMISS_FOR_MS));
    setVisible(false);
    setGuideOpen(false);
  }, []);

  if (!enabled || !visible) return null;

  const canInstallDirectly = Boolean(installPrompt);

  return (
    <>
      <aside
        className="fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-40 overflow-hidden rounded-xl bg-dark2 p-4 text-text shadow-lg sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[390px]"
        aria-label="Instalar Volunteer Manager"
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-sm text-text-dim transition-colors hover:bg-dark3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]"
          aria-label="Recordarme después"
          title="Recordarme en una semana"
        >
          <MaterialIcon name="close" className="text-[18px]" />
        </button>

        <div className="flex gap-3 pr-7">
          <Image
            src="/app-icon-192.png"
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold leading-5 text-text">Ten la gestión siempre a mano</p>
            <p className="mt-1 text-[13px] font-medium leading-5 text-text-dim">
              Instala Volunteer Manager para abrir turnos, solicitudes y avisos como una app.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {canInstallDirectly && (
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="h-9 rounded-sm px-3 text-[13px] font-bold text-text-dim transition-colors hover:bg-dark3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]"
            >
              Ver pasos
            </button>
          )}
          <button
            type="button"
            onClick={requestNativeInstall}
            disabled={isInstalling}
            className="flex h-9 items-center gap-2 rounded-sm bg-[#4d7cfe] px-4 text-[13px] font-extrabold text-white transition-colors hover:bg-[#3f6fec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] focus-visible:ring-offset-2 focus-visible:ring-offset-dark2 active:scale-[0.97] disabled:cursor-wait disabled:opacity-70"
          >
            <MaterialIcon name={canInstallDirectly ? 'download' : 'help'} className="text-[18px]" />
            {isInstalling ? 'Abriendo…' : canInstallDirectly ? 'Instalar ahora' : 'Cómo instalar'}
          </button>
        </div>
      </aside>

      <Dialog.Root open={guideOpen} onOpenChange={setGuideOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/55 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <Dialog.Popup className="fixed inset-x-4 bottom-4 z-[61] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl bg-dark2 p-5 text-text shadow-lg transition duration-200 ease-out data-ending-style:translate-y-4 data-ending-style:opacity-0 data-starting-style:translate-y-4 data-starting-style:opacity-0 sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:w-[460px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:data-ending-style:translate-y-[calc(-50%+1rem)] sm:data-starting-style:translate-y-[calc(-50%+1rem)]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4d7cfe]/15 text-[#4d7cfe]">
                <MaterialIcon name={device.platform === 'ios' || device.platform === 'android' ? 'install_mobile' : 'install_desktop'} className="text-[22px]" />
              </div>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-[18px] font-extrabold leading-6 text-text">
                  Instalar en {deviceLabel}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-[13px] font-medium leading-5 text-text-dim">
                  Toma menos de un minuto y no necesitas descargar nada desde una tienda.
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-dim transition-colors hover:bg-dark3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]"
                aria-label="Cerrar instrucciones"
              >
                <MaterialIcon name="close" className="text-[18px]" />
              </Dialog.Close>
            </div>

            {device.platform === 'ios' && device.browser !== 'safari' && (
              <div className="mt-4 flex gap-2 rounded-lg bg-[#4d7cfe]/10 px-3 py-2.5 text-[13px] font-semibold leading-5 text-text">
                <MaterialIcon name="info" className="mt-0.5 shrink-0 text-[18px] text-[#4d7cfe]" />
                En iPhone o iPad, abre esta página en Safari antes de continuar.
              </div>
            )}

            <ol className="mt-5 space-y-3">
              {instructions.map((instruction, index) => (
                <li key={instruction.text} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dark3 text-[#4d7cfe]">
                    <MaterialIcon name={instruction.icon} className="text-[19px]" />
                  </div>
                  <div className="pt-0.5">
                    <p className="text-[12px] font-extrabold text-text-dim">Paso {index + 1}</p>
                    <p className="mt-0.5 text-[14px] font-semibold leading-5 text-text">{instruction.text}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close className="h-10 rounded-sm px-4 text-[13px] font-bold text-text-dim transition-colors hover:bg-dark3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]">
                Entendido
              </Dialog.Close>
              {canInstallDirectly && (
                <button
                  type="button"
                  onClick={requestNativeInstall}
                  disabled={isInstalling}
                  className="flex h-10 items-center gap-2 rounded-sm bg-[#4d7cfe] px-4 text-[13px] font-extrabold text-white transition-colors hover:bg-[#3f6fec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] focus-visible:ring-offset-2 focus-visible:ring-offset-dark2 active:scale-[0.97] disabled:cursor-wait disabled:opacity-70"
                >
                  <MaterialIcon name="download" className="text-[18px]" />
                  Instalar ahora
                </button>
              )}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
