"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Square, Asterisk, Triangle, Circle } from "lucide-react";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import styles from "./mobile-login.module.css";

type Profile = {
  id: string;
  firstName: string;
  lastName: string;
  committee: string;
  userType: "profile" | "volunteer";
};

type Props = {
  phone: string;
  pin: string;
  name: string;
  rememberMe: boolean;
  busy: boolean;
  biometricLoading: boolean;
  lookingUpProfile: boolean;
  pinRejected: boolean;
  pinAccepted: boolean;
  canChangeProfile: boolean;
  error: string | null;
  profiles: Profile[];
  onPhoneChange: (value: string) => void;
  onPinChange: (value: string) => void;
  onRememberChange: (value: boolean) => void;
  onChangeAccount: () => void;
  onSubmitPin: (value: string) => void;
  onBiometricLogin: () => void;
  onSelectProfile: (profile: Profile) => void;
  onContinuePhone: () => Promise<boolean>;
  onChangeProfile: () => void;
};

export function MobilePinLogin({
  phone, pin, name, rememberMe, busy, biometricLoading, error, profiles,
  onPhoneChange, onPinChange, onRememberChange, onChangeAccount,
  onSubmitPin, onBiometricLogin, onSelectProfile,
  lookingUpProfile, pinRejected, pinAccepted, canChangeProfile, onContinuePhone, onChangeProfile,
}: Props) {
  const [step, setStep] = useState<"phone" | "pin">(rememberMe && phone.length === 8 ? "pin" : "phone");
  const restoreRememberedPhone = useRef(rememberMe && phone.length === 8);
  const checkedRememberedPhone = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [symbolRevisions, setSymbolRevisions] = useState([0, 0, 0, 0]);
  const firstName = name.trim().split(/\s+/)[0];

  useEffect(() => {
    if (!restoreRememberedPhone.current || checkedRememberedPhone.current || phone.length !== 8 || !window.matchMedia("(max-width: 767px)").matches) return;
    checkedRememberedPhone.current = true;
    void onContinuePhone().then(found => { setStep(found ? "pin" : "phone"); });
  }, [phone, onContinuePhone]);

  const changePin = useCallback((value: string) => {
    if (busy) return;
    const nextPin = value.replace(/\D/g, "").slice(0, 4);
    setSymbolRevisions(revisions => revisions.map((revision, index) =>
      nextPin[index] && nextPin[index] !== pin[index] ? revision + 1 : revision));
    onPinChange(nextPin);
    if (nextPin.length === 4 && nextPin !== pin) onSubmitPin(nextPin);
  }, [busy, pin, onPinChange, onSubmitPin]);

  useEffect(() => {
    if (step !== "pin" || busy || profiles.length) return;

    const canUseKeyboard = (target: EventTarget | null) => {
      const input = inputRef.current;
      if (!input || document.hidden || !window.matchMedia("(max-width: 767px)").matches ||
          !input.getClientRects().length || input.closest('[inert], [aria-hidden="true"]')) return false;
      // A dialog (including legal information) owns the keyboard while open.
      if (Array.from(document.querySelectorAll('[aria-modal="true"], dialog[open]'))
        .some(dialog => dialog.getClientRects().length)) return false;
      const element = target as HTMLElement | null;
      // The actual password input uses native selection, deletion and paste.
      // Never capture typing meant for another editable control.
      if (element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return false;
      return element === document.body || element === document.documentElement ||
        !!input.closest('[data-mobile-login-panel]')?.contains(element);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
          !canUseKeyboard(event.target)) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        if (!event.repeat && pin.length < 4) changePin(pin + event.key);
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        changePin(pin.slice(0, -1));
      }
    };
    const handlePaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || !canUseKeyboard(event.target)) return;
      const value = event.clipboardData?.getData("text").trim() || "";
      if (!/^[0-9]{1,4}$/.test(value)) return;
      event.preventDefault();
      changePin(value);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("paste", handlePaste);
    };
  }, [step, busy, profiles.length, pin, changePin]);

  function changeAccount() {
    onChangeAccount();
    setStep("phone");
  }

  if (step === "phone") {
    return (
      <form className={styles.phoneForm} aria-busy={busy} onSubmit={async (event) => {
        event.preventDefault();
        if (phone.length === 8 && !busy && await onContinuePhone()) setStep("pin");
      }}>
        <div className={styles.heading}>
          <div className={styles.welcomeLogo} aria-hidden="true"><AnimatedLogo /></div>
          <h1>Bienvenido de nuevo</h1>
          <p>Ingresa tu teléfono para continuar.</p>
        </div>
        <div className={styles.phoneField}>
          <label htmlFor="mobile-phone">Número de teléfono</label>
          <div className={styles.phoneInput}>
            <span aria-hidden="true">+505</span>
            <input id="mobile-phone" type="tel" inputMode="numeric" autoComplete="tel-national"
              placeholder="8888 8888" maxLength={8} minLength={8} pattern="[0-9]{8}" required
              value={phone} disabled={busy}
              onChange={(event) => onPhoneChange(event.target.value.replace(/\D/g, "").slice(0, 8))} />
          </div>
          <label className={styles.remember}>
            <input type="checkbox" checked={rememberMe} disabled={busy}
              onChange={(event) => onRememberChange(event.target.checked)} />
            Recordar mi teléfono
          </label>
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <button type="submit" className={styles.continueButton} disabled={busy || phone.length !== 8}>
          {lookingUpProfile ? "Buscando tu perfil…" : "Continuar"} <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </button>
        <p className={styles.help}>¿Necesitas ayuda? Contacta a tu coordinador de comité.</p>
      </form>
    );
  }

  return (
    <form className={styles.pinForm} aria-busy={busy} onSubmit={(event) => {
      event.preventDefault();
      if (!busy && pin.length === 4 && !profiles.length) onSubmitPin(pin);
    }}>
      <div className={styles.account}>
        <div className={styles.identity}>
          {profiles.length ? <p>Selecciona tu perfil</p> : name ? <p>{name}</p> : null}
          <span>+505 {phone.slice(0, 4)} {phone.slice(4)}</span>
        </div>
        <button type="button" className={styles.changeButton} disabled={busy} onClick={changeAccount}>
          Cambiar
        </button>
      </div>
      {canChangeProfile && <button type="button" className={styles.changeProfile} disabled={busy} onClick={onChangeProfile}>
        Elegir otra persona de este teléfono
      </button>}

      {profiles.length > 0 ? (
        <section className={styles.profileSection} aria-labelledby="mobile-profile-heading">
          <div className={styles.heading}>
            <h1 id="mobile-profile-heading">Elige tu perfil</h1>
            <p>Varios voluntarios comparten este teléfono y PIN.</p>
          </div>
          <div className={styles.profiles}>
            {profiles.map((profile) => (
              <button type="button" key={`${profile.userType}-${profile.id}`} disabled={busy}
                onClick={() => onSelectProfile(profile)}>
                <span><strong>{profile.firstName} {profile.lastName}</strong>
                  <small>{profile.committee || (profile.userType === "profile" ? "Coordinador" : "Voluntario")}</small>
                </span>
                <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
              </button>
            ))}
          </div>
          <p role={error ? "alert" : "status"} className={error ? styles.error : styles.status}>
            {error || (busy ? "Verificando tu perfil…" : "Selecciona la cuenta con la que deseas ingresar.")}
          </p>
        </section>
      ) : (
        <>
          <div className={styles.pinEntry}>
            <div className={styles.heading}>
              <h1>{firstName ? `Tu PIN, ${firstName}` : "Ingresa tu PIN"}</h1>
              <p>Un paso más para seguir sirviendo.</p>
            </div>
            <div className={styles.pinControl} data-invalid={pinRejected} data-valid={pinAccepted}>
              <label htmlFor="mobile-pin" className="sr-only">PIN de acceso de 4 dígitos</label>
              <input ref={inputRef} id="mobile-pin" type="password" inputMode="none"
                autoComplete="current-password" maxLength={4} value={pin} disabled={busy}
                aria-describedby="mobile-pin-status" aria-invalid={pinRejected}
                onChange={(event) => changePin(event.target.value)} />
              <div className={styles.pinSlots} aria-hidden="true">
                {[Square, Asterisk, Triangle, Circle].map((Symbol, index) => (
                  <span key={index} className={styles.pinSlot} data-filled={pinAccepted || pin.length > index}>
                    <Symbol key={symbolRevisions[index]} className={styles.pinSymbol} data-shape={index} strokeWidth={index === 1 ? 4 : 2.5} />
                  </span>
                ))}
              </div>
            </div>
            <p id="mobile-pin-status" role={error ? "alert" : "status"}
              className={error ? styles.error : styles.status} data-valid={pinAccepted}>
              {error || (pinAccepted ? "PIN correcto" : biometricLoading ? "Confirma tu identidad en el dispositivo…" : busy ? "Verificando tu PIN…" : "Ingresa los 4 dígitos para acceder")}
            </p>
          </div>

          <div className={styles.keypad} role="group" aria-label="Teclado numérico del PIN">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button type="button" key={digit} disabled={busy || pin.length === 4}
                onClick={() => changePin(pin + digit)}>{digit}</button>
            ))}
            <button type="button" className={styles.biometricKey} disabled={busy}
              aria-label="Ingresar con huella o passkey" title="Ingresar con huella o passkey"
              onClick={onBiometricLogin}>
              <span className="material-symbols-outlined" aria-hidden="true">fingerprint</span>
              <span className={styles.keyLabel}>Huella</span>
            </button>
            <button type="button" disabled={busy || pin.length === 4} onClick={() => changePin(pin + "0")}>0</button>
            <button type="button" className={styles.deleteKey} disabled={busy || !pin}
              aria-label="Borrar último dígito" onClick={() => {
                onPinChange(pin.slice(0, -1));
                inputRef.current?.focus({ preventScroll: true });
              }}>
              <span className="material-symbols-outlined" aria-hidden="true">backspace</span>
              <span className={styles.keyLabel}>Borrar</span>
            </button>
          </div>
        </>
      )}
    </form>
  );
}
