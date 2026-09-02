'use client'

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { loginWithPin } from "@/app/actions/auth";
import { getDashboardOperationalDataAction } from "@/app/actions/dashboard";
import { getLoginProfiles } from "@/app/actions/login-profiles";
import { updateInitialPin } from "@/app/actions/update-pin";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { createPortal } from "react-dom";
import { startAuthentication } from "@simplewebauthn/browser";
import Image from "next/image";
import { MobilePinLogin } from "./MobilePinLogin";
import mobileStyles from "./mobile-login.module.css";
import { loginDisplayName, normalizeLoginPhone, rememberLoginPhone } from "@/lib/login-experience";
import {
  clearPreparedDashboardSession,
  DASHBOARD_SIMULATION_STORAGE_KEY,
  writePreparedDashboardSession,
} from "@/lib/dashboard-session-cache";

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return isMobileUA || (isTouch && window.innerWidth < 1024);
};

export function LoginForm({ mobile = false }: { mobile?: boolean }) {
  const router = useRouter();
  const authAttemptRef = useRef(false);
  const activeRef = useRef(true);
  const cancelPinSuccessRef = useRef<(() => void) | null>(null);
  const [isSubmittingPin, setIsSubmittingPin] = useState(false);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const [isLookingUpProfile, setIsLookingUpProfile] = useState(false);
  const [pinRejected, setPinRejected] = useState(false);
  const [pinAccepted, setPinAccepted] = useState(false);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      cancelPinSuccessRef.current?.();
      cancelPinSuccessRef.current = null;
    };
  }, []);

  const showPinSuccess = () => {
    if (!activeRef.current) return Promise.resolve(false);
    if (!mobile) return Promise.resolve(true);
    setPinAccepted(true);
    // Only a verified PIN gets this short confirmation. Failed attempts and
    // profile selection never wait for an animation or show a success state.
    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        cancelPinSuccessRef.current = null;
        resolve(true);
      }, 420);
      cancelPinSuccessRef.current = () => {
        clearTimeout(timer);
        resolve(false);
      };
    });
  };

  // Unified Login Fields
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // New PIN States
  const [needsNewPin, setNeedsNewPin] = useState(false);
  const [newPin, setNewNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [userData, setUserData] = useState<{ id: string, type: 'profile' | 'volunteer' } | null>(null);

  // Multi-Profile Selection States
  const [requireProfileSelection, setRequireProfileSelection] = useState(false);
  const [candidateProfiles, setCandidateProfiles] = useState<Array<{
    id: string;
    firstName: string;
    lastName: string;
    committee: string;
    userType: 'profile' | 'volunteer';
  }>>([]);
  const [selectedProfile, setSelectedProfile] = useState<{
    id: string;
    name: string;
    type: 'profile' | 'volunteer';
  } | null>(null);

  // Remember User State
  const [rememberMe, setRememberMe] = useState(false);
  const [savedUserMode, setSavedUserMode] = useState(false);
  const [savedName, setSavedName] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const [authMode, setAuthMode] = useState<'biometrics' | 'pin'>('pin');
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Auto-dismiss error banner after 4 seconds
  useEffect(() => {
    if (error && !mobile) {
      const timer = setTimeout(() => {
        setError(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error, mobile]);

  useEffect(() => {
    const mobileCheck = isMobileDevice();
    setIsMobile(mobileCheck);

    try {
      const isRemembered = localStorage.getItem("remember_me") === "true";
      setRememberMe(isRemembered);

      if (isRemembered) {
        const savedPhone = normalizeLoginPhone(localStorage.getItem("volunteer_phone") || "");
        const savedName = localStorage.getItem("volunteer_name") || "";
        if (savedPhone.length === 8) {
          setPhone(savedPhone);
          setSavedUserMode(!!savedName);
          setSavedName(savedName);
          // Migrate old +505/505 storage before mounting the mobile PIN step.
          rememberLoginPhone(savedPhone, true, savedName);
        } else {
          setRememberMe(false);
          rememberLoginPhone("", false);
        }
      } else {
        localStorage.removeItem("volunteer_name");
        localStorage.removeItem("volunteer_phone");
        setSavedUserMode(false);
      }
    } catch {
      // Storage may be blocked; the normal login must remain available.
    }

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('expired') === 'true') {
        setError('Tu sesión ha expirado por seguridad. Ingresa tu PIN de nuevo.');
      }
    }

    setIsMounted(true);
  }, []);

  // Check if current phone has registered passkeys (huella/Face ID)
  useEffect(() => {
    if (mobile) return;
    if (!phone || phone.length < 8) {
      setHasPasskey(false);
      return;
    }

    let isSubscribed = true;
    fetch(`/api/webauthn/check-has-passkey?phone=${encodeURIComponent(phone)}`)
      .then(res => res.json())
      .then(data => {
        if (!isSubscribed) return;
        const passkeyAvailable = !!data.hasPasskey;
        setHasPasskey(passkeyAvailable);
      })
      .catch(() => {
        if (isSubscribed) {
          setHasPasskey(false);
        }
      });

    return () => { isSubscribed = false; };
  }, [phone, savedUserMode, mobile]);

  const handleBiometricLogin = async () => {
    if (authAttemptRef.current || isRedirecting) return;
    if (!phone || phone.length < 8) {
      setError("Ingresa tu número de teléfono primero para autenticarte con Passkey.");
      return;
    }
    
    authAttemptRef.current = true;
    setError(null);
    setPinRejected(false);
    setIsBiometricLoading(true);
    try {
      const resp = await fetch('/api/webauthn/authenticate/generate-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, ...(mobile && selectedProfile ? {
          selectedUserId: selectedProfile.id,
          selectedUserType: selectedProfile.type,
        } : {}) })
      });
      
      if (!resp.ok) {
        const errData = await resp.json();
        if (resp.status === 400 || errData.error?.includes('huella') || errData.error?.includes('dispositivo')) {
          throw new Error('No tienes ninguna huella o Passkey registrada para este número. Ingresa con tu PIN de 4 dígitos.');
        }
        throw new Error(errData.error || 'Error al generar opciones de autenticación');
      }

      const options = await resp.json();
      const asseResp = await startAuthentication(options);

      const verifyResp = await fetch('/api/webauthn/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asseResp)
      });

      const verifyData = await verifyResp.json();
      setIsBiometricLoading(false);
      
      if (verifyData.verified) {
        localStorage.setItem("preferred_auth_method", "biometrics");
        await finishLogin(verifyData);
      } else {
        setError('La huella no pudo ser verificada.');
      }
    } catch (err: any) {
      setIsBiometricLoading(false);
      if (err.name === 'NotAllowedError') {
        setError(null);
      } else {
        setError(err.message || "Huella o Passkey no reconocida. Inténtelo con su PIN.");
      }
    } finally {
      authAttemptRef.current = false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPin(pin);
  };

  const submitPin = async (pinValue: string, profile = selectedProfile) => {
    if (authAttemptRef.current || isRedirecting) return;
    setError(null);
    setPinRejected(false);
    setPinAccepted(false);

    if (phone.length < 8) {
      setError("El número de teléfono debe tener 8 dígitos.");
      return;
    }

    if (pinValue.length !== 4) {
      setError("El PIN debe tener exactamente 4 dígitos.");
      return;
    }

    authAttemptRef.current = true;
    setIsSubmittingPin(true);
    try {
      const formData = new FormData();
      formData.append("phone", phone);
      formData.append("pin", pinValue);
      if (profile) {
        formData.append("selectedUserId", profile.id);
        formData.append("selectedUserType", profile.type);
      }

      const result = await loginWithPin({}, formData);

      if (result.require_profile_selection && result.profiles) {
        setSelectedProfile(null);
        setCandidateProfiles(result.profiles);
        setRequireProfileSelection(true);
        setIsSubmittingPin(false);
      } else if (result.error) {
        setError(result.error);
        setPinRejected(true);
        setPin("");
        setIsSubmittingPin(false);
      } else if (result.force_pin_change) {
        setUserData({ id: result.user_id!, type: result.user_type! });
        setNeedsNewPin(true);
        setIsSubmittingPin(false);
      } else if (result.success) {
        if (await showPinSuccess()) await finishLogin(result);
      } else {
        setIsSubmittingPin(false);
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError("Error de conexión con el servidor. Inténtalo de nuevo.");
      if (mobile) setPin("");
      setIsSubmittingPin(false);
    } finally {
      authAttemptRef.current = false;
    }
  };

  const lookupMobileProfiles = async () => {
    if (authAttemptRef.current || isRedirecting) return false;
    authAttemptRef.current = true;
    setIsLookingUpProfile(true);
    setError(null);
    setPinRejected(false);
    setPin("");
    try {
      const result = await getLoginProfiles(phone);
      if (result.error || !result.profiles?.length) {
        setError(result.error || "No pudimos encontrar tu perfil.");
        return false;
      }
      setCandidateProfiles(result.profiles);
      // Let the PIN distinguish a coordinator from a volunteer. The server
      // asks for a person only when volunteer credentials are shared.
      setRequireProfileSelection(false);
      const person = result.profiles[0];
      setSelectedProfile(result.profiles.length === 1 ? {
        id: person.id, name: `${person.firstName} ${person.lastName}`.trim(), type: person.userType,
      } : null);
      rememberLoginPhone(phone, rememberMe, loginDisplayName(result.profiles, savedName));
      return true;
    } catch {
      setError("No pudimos consultar tu perfil. Revisa tu conexión e inténtalo de nuevo.");
      return false;
    } finally {
      authAttemptRef.current = false;
      setIsLookingUpProfile(false);
    }
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPin.length !== 4) {
      setError("El nuevo PIN debe tener exactamente 4 dígitos.");
      return;
    }

    if (newPin !== confirmPin) {
      setError("Los PINs no coinciden.");
      return;
    }

    if (newPin === "1234") {
      setError("Debes elegir un PIN diferente a 1234.");
      return;
    }

    setIsSubmittingPin(true);
    try {
      const result = await updateInitialPin(userData!.id, userData!.type, newPin);

      if (result.error) {
        setError(result.error);
        setIsSubmittingPin(false);
      } else if (result.success) {
        await finishLogin(result);
      } else {
        setIsSubmittingPin(false);
      }
    } catch (err: any) {
      console.error("PIN update error:", err);
      setError("Error de conexión con el servidor. Inténtalo de nuevo.");
      setIsSubmittingPin(false);
    }
  };

  const finishLogin = async (result: any) => {
    setIsRedirecting(true);

    rememberLoginPhone(phone || result.phone, rememberMe, result.name);
    try {
      if (!localStorage.getItem("preferred_auth_method")) {
        localStorage.setItem("preferred_auth_method", "pin");
      }
      if (result.role) {
        localStorage.setItem("mock_role", result.role);
      }
      if (result.committee) {
        localStorage.setItem("mock_committee", result.committee);
      }
    } catch {
      // The authenticated session does not depend on optional local storage.
    }

    clearPreparedDashboardSession();
    if ((result.redirectTo || '') === '/dashboard') {
      try {
        const includeSimulation = localStorage.getItem(DASHBOARD_SIMULATION_STORAGE_KEY) === 'true';
        const prepared = await getDashboardOperationalDataAction('todos', includeSimulation, true, 'instant');
        if (prepared.data) {
          writePreparedDashboardSession({
            includeSimulation,
            data: prepared.data,
            insight: prepared.insight || null,
          });
        }
      } catch {
        // Preparation is an optimization. Login must continue if it is unavailable.
      }
    }
    
    window.location.href = result.redirectTo || "/calendar";
  };

  return (
    <div className={mobile ? mobileStyles.formHost : "relative"}>
      {isRedirecting && typeof document !== "undefined" && createPortal(
        <div role="status" aria-label="Cargando tu espacio" className="fixed inset-0 z-[9999] bg-dark flex items-center justify-center animate-in fade-in duration-200">
          <AnimatedLogo className="w-16 h-16 md:w-20 md:h-20 text-text" isLooping={true} />
        </div>,
        document.body
      )}

      <AnimatePresence mode="wait">
        {mobile && !needsNewPin ? (
          isMounted ? <MobilePinLogin
            key="mobile-login"
            phone={phone}
            pin={pin}
            name={selectedProfile?.name || loginDisplayName(candidateProfiles, savedUserMode ? savedName : "") || (!candidateProfiles.length && savedUserMode ? savedName : "")}
            rememberMe={rememberMe}
            busy={isSubmittingPin || isBiometricLoading || isRedirecting || isLookingUpProfile}
            lookingUpProfile={isLookingUpProfile}
            biometricLoading={isBiometricLoading}
            error={error}
            pinRejected={pinRejected}
            pinAccepted={pinAccepted}
            onContinuePhone={lookupMobileProfiles}
            canChangeProfile={candidateProfiles.length > 1 && !!selectedProfile}
            onChangeProfile={() => {
              setPin(""); setError(null); setPinRejected(false);
              setSelectedProfile(null); setRequireProfileSelection(true);
            }}
            profiles={requireProfileSelection && !selectedProfile ? candidateProfiles : []}
            onPhoneChange={(value) => {
              setPhone(value);
              setPin("");
              setError(null);
              setRequireProfileSelection(false);
              setSelectedProfile(null);
              setCandidateProfiles([]);
            }}
            onPinChange={(value) => { setPin(value); setError(null); setPinRejected(false); }}
            onRememberChange={(value) => {
              setRememberMe(value);
              rememberLoginPhone(phone, value, loginDisplayName(candidateProfiles, savedName));
            }}
            onChangeAccount={() => {
              setSavedUserMode(false);
              setSavedName("");
              setPhone("");
              setPin("");
              setError(null);
              setSelectedProfile(null);
              setRequireProfileSelection(false);
              setCandidateProfiles([]);
              setPinRejected(false);
              setRememberMe(false);
              localStorage.removeItem("volunteer_name");
              localStorage.removeItem("volunteer_phone");
              localStorage.removeItem("remember_me");
            }}
            onSubmitPin={(value) => { void submitPin(value); }}
            onBiometricLogin={handleBiometricLogin}
            onSelectProfile={(profile) => {
              const choice = { id: profile.id, name: `${profile.firstName} ${profile.lastName}`.trim(), type: profile.userType };
              setSelectedProfile(choice);
              setRequireProfileSelection(false);
              setError(null);
              setPinRejected(false);
              if (pin.length === 4) void submitPin(pin, choice);
            }}
          /> : <p role="status" className={mobileStyles.status}>Preparando tu acceso…</p>
        ) : !needsNewPin ? (
          <motion.form 
            key="login"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            onSubmit={handleSubmit} 
            className="space-y-5"
          >
            {!savedUserMode ? (
              /* Usuario nuevo / No recordado */
              <>
                {requireProfileSelection && !selectedProfile ? (
                  <div className="p-4 bg-dark2/90 dark:bg-white/[0.04] border border-border dark:border-white/10 rounded-2xl shadow-2xl space-y-3 mb-4 backdrop-blur-md">
                    <div className="flex items-center gap-3 pb-1 border-b border-border/50 dark:border-white/5">
                      <div className="w-9 h-9 rounded-full bg-[#4d7cfe]/15 border border-[#4d7cfe]/30 text-[#4d7cfe] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px]">badge</span>
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                          Selecciona tu Perfil
                        </h4>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-text-dim">
                          Este número de teléfono está compartido por varias personas:
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      {candidateProfiles.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={async () => {
                            const choice = { id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), type: p.userType };
                            setSelectedProfile(choice);
                            setError(null);

                            if (pin && pin.length === 4) {
                              setIsSubmittingPin(true);
                              try {
                                const formData = new FormData();
                                formData.append("phone", phone);
                                formData.append("pin", pin);
                                formData.append("selectedUserId", choice.id);
                                formData.append("selectedUserType", choice.type);

                                const result = await loginWithPin({}, formData);
                                if (result.error) {
                                  setError(result.error);
                                  setPin("");
                                  setIsSubmittingPin(false);
                                } else if (result.force_pin_change) {
                                  setUserData({ id: result.user_id!, type: result.user_type! });
                                  setNeedsNewPin(true);
                                  setIsSubmittingPin(false);
                                } else if (result.success) {
                                  await finishLogin(result);
                                } else {
                                  setIsSubmittingPin(false);
                                }
                              } catch (err) {
                                setError("Error de conexión con el servidor.");
                                setIsSubmittingPin(false);
                              }
                            }
                          }}
                          className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-dark3/70 hover:border-[#4d7cfe] hover:bg-[#4d7cfe]/10 transition-all flex items-center justify-between group shadow-sm cursor-pointer"
                        >
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[#4d7cfe] transition-colors">
                              {p.firstName} {p.lastName}
                            </p>
                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                              {p.committee || (p.userType === 'profile' ? 'Coordinador' : 'Voluntario')}
                            </p>
                          </div>
                          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/5 group-hover:bg-[#4d7cfe]/20 flex items-center justify-center transition-colors">
                            <span className="material-symbols-outlined text-slate-400 group-hover:text-[#4d7cfe] text-[18px] transition-transform group-hover:translate-x-0.5">
                              arrow_forward
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : selectedProfile ? (
                  <div className="flex items-center justify-between p-3.5 bg-[#4d7cfe]/10 border border-[#4d7cfe]/25 rounded-2xl mb-3 shadow-md backdrop-blur-md">
                    <div>
                      <p className="text-[10px] font-extrabold text-[#4d7cfe] uppercase tracking-wider">Perfil Seleccionado</p>
                      <p className="text-sm font-extrabold text-slate-900 dark:text-white">{selectedProfile.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProfile(null);
                      }}
                      className="px-3 py-1 text-xs font-bold text-[#4d7cfe] hover:bg-[#4d7cfe]/15 rounded-lg transition-colors border border-[#4d7cfe]/30 cursor-pointer"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-[11px] font-dela uppercase tracking-wider text-slate-600 dark:text-slate-400 ml-1">
                    Número de Teléfono
                  </Label>
                  <div className="relative group">
                    <span className="material-symbols-outlined text-[20px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">call</span>
                    <input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={20}
                      minLength={8}
                      pattern="[0-9]{8}"
                      placeholder="88888888"
                      required
                      value={phone}
                      onChange={(e) => {
                        setPhone(normalizeLoginPhone(e.target.value).slice(0, 8));
                        setRequireProfileSelection(false);
                        setSelectedProfile(null);
                      }}
                      className="w-full h-12 bg-white/80 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-sm pl-12 pr-4 text-slate-900 dark:text-white font-inter font-bold focus:bg-white focus:dark:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm"
                      disabled={isSubmittingPin || isRedirecting}
                    />
                  </div>
                </div>

                {authMode === 'biometrics' && hasPasskey ? (
                  <div className="space-y-3 pt-2 text-center flex flex-col items-center justify-center">
                    <p className="text-sm font-bold font-inter text-slate-700 dark:text-slate-300">
                      {isMobile ? 'Ingresar con huella' : 'Ingresar con passkey'}
                    </p>

                    <button
                      type="button"
                      onClick={handleBiometricLogin}
                      suppressHydrationWarning
                      className="group flex flex-col items-center justify-center p-4 rounded-3xl transition-all duration-300 active:scale-95 disabled:opacity-40 my-2"
                      disabled={!isMounted || isSubmittingPin || isBiometricLoading || isRedirecting || !phone}
                      title="Ingresar con Huella / Passkey"
                    >
                      <div className="w-20 h-20 rounded-full bg-[#4d7cfe]/10 border-2 border-[#4d7cfe]/30 flex items-center justify-center text-[#4d7cfe] group-hover:bg-[#4d7cfe]/20 group-hover:scale-105 group-hover:border-[#4d7cfe]/60 shadow-lg shadow-[#4d7cfe]/10 transition-all">
                        <span className="material-symbols-outlined text-[42px] group-hover:scale-110 transition-transform">
                          fingerprint
                        </span>
                      </div>
                    </button>

                    {error && (
                      <div className="w-full p-4 bg-red-50 border border-red-100 rounded-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2 text-left">
                        <div className="w-2 h-2 rounded-full bg-red animate-pulse" />
                        <p className="text-sm font-inter font-bold text-red">{error}</p>
                      </div>
                    )}

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setAuthMode('pin')}
                        className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors underline underline-offset-4"
                      >
                        O ingresa con tu PIN
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="pin" className="text-[11px] font-dela uppercase tracking-wider text-slate-600 dark:text-slate-400 ml-1">
                        PIN de Acceso
                      </Label>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1 group">
                          <span className="material-symbols-outlined text-[20px] absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">vpn_key</span>
                          <input
                            id="pin"
                            type="password"
                            inputMode="numeric"
                            autoComplete="current-password"
                            maxLength={4}
                            placeholder="••••"
                            required
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            className="w-full h-12 bg-white/80 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-sm pl-11 pr-3 text-slate-900 dark:text-white text-lg font-inter font-bold focus:bg-white focus:dark:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all leading-normal placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm"
                            disabled={isSubmittingPin || isRedirecting}
                          />
                        </div>

                        <button 
                          type="submit" 
                          className="flex-1 h-12 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-sm font-bold shadow-lg shadow-[#4d7cfe]/20 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center group shrink-0 text-center"
                          disabled={isSubmittingPin || isRedirecting}
                          onClick={() => {
                            localStorage.setItem("preferred_auth_method", "pin");
                          }}
                        >
                          {isSubmittingPin ? (
                            <span>Verificando...</span>
                          ) : (
                            <span>Ingresar</span>
                          )}
                        </button>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 dark:border-white/20 bg-white/80 dark:bg-white/5 text-[#4d7cfe] focus:ring-[#4d7cfe] cursor-pointer"
                          />
                          <span>Recordar mi teléfono</span>
                        </label>
                      </div>
                    </div>

                    {error && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                        <div className="w-2 h-2 rounded-full bg-red animate-pulse" />
                        <p className="text-sm font-inter font-bold text-red">{error}</p>
                      </div>
                    )}

                    <div className="pt-3 flex flex-col items-center justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('biometrics');
                          if (phone && phone.length >= 8) {
                            handleBiometricLogin();
                          }
                        }}
                        className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors underline underline-offset-4 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">fingerprint</span>
                        <span>{isMobile ? 'O ingresa con tu huella dactilar' : 'O ingresa con passkey / Windows Hello'}</span>
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (

              /* Usuario Recordado (savedUserMode === true) */
              <>
                <div className="flex items-center justify-between p-4 bg-white/80 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-sm shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#4d7cfe]/20 text-[#4d7cfe] flex items-center justify-center font-bold font-inter">
                      {savedName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white font-inter">{savedName}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-inter">{phone}</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => { 
                      setSavedUserMode(false); 
                      localStorage.removeItem('volunteer_name'); 
                      localStorage.removeItem('volunteer_phone');
                      localStorage.removeItem('remember_me');
                      setRememberMe(false);
                      setPhone(''); 
                      setAuthMode('pin');
                    }}
                    className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    Cambiar
                  </button>
                </div>

                {authMode === 'biometrics' && hasPasskey ? (
                  <div className="space-y-3 pt-2 text-center flex flex-col items-center justify-center">
                    <p className="text-sm font-bold font-inter text-slate-700 dark:text-slate-300">
                      {isMobile ? 'Ingresar con huella' : 'Ingresar con passkey'}
                    </p>

                    <button
                      type="button"
                      onClick={handleBiometricLogin}
                      suppressHydrationWarning
                      className="group flex flex-col items-center justify-center p-4 rounded-3xl transition-all duration-300 active:scale-95 disabled:opacity-40 my-2"
                      disabled={!isMounted || isSubmittingPin || isBiometricLoading || isRedirecting || !phone}
                      title="Ingresar con Huella / Passkey"
                    >
                      <div className="w-20 h-20 rounded-full bg-[#4d7cfe]/10 border-2 border-[#4d7cfe]/30 flex items-center justify-center text-[#4d7cfe] group-hover:bg-[#4d7cfe]/20 group-hover:scale-105 group-hover:border-[#4d7cfe]/60 shadow-lg shadow-[#4d7cfe]/10 transition-all">
                        <span className="material-symbols-outlined text-[42px] group-hover:scale-110 transition-transform">
                          fingerprint
                        </span>
                      </div>
                    </button>

                    {error && (
                      <div className="w-full p-4 bg-red-50 border border-red-100 rounded-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2 text-left">
                        <div className="w-2 h-2 rounded-full bg-red animate-pulse" />
                        <p className="text-sm font-inter font-bold text-red">{error}</p>
                      </div>
                    )}

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setAuthMode('pin')}
                        className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors underline underline-offset-4"
                      >
                        O ingresa con tu PIN
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="pin" className="text-[11px] font-dela uppercase tracking-wider text-slate-600 dark:text-slate-400 ml-1">
                        PIN de Acceso
                      </Label>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1 group">
                          <span className="material-symbols-outlined text-[20px] absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">vpn_key</span>
                          <input
                            id="pin"
                            type="password"
                            inputMode="numeric"
                            autoComplete="current-password"
                            maxLength={4}
                            placeholder="••••"
                            required
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            className="w-full h-12 bg-white/80 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-sm pl-11 pr-3 text-slate-900 dark:text-white text-lg font-inter font-bold focus:bg-white focus:dark:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all leading-normal placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm"
                            disabled={isSubmittingPin || isRedirecting}
                          />
                        </div>

                        <button 
                          type="submit" 
                          className="flex-1 h-12 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-sm font-bold shadow-lg shadow-[#4d7cfe]/20 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center group shrink-0 text-center"
                          disabled={isSubmittingPin || isRedirecting}
                          onClick={() => {
                            localStorage.setItem("preferred_auth_method", "pin");
                          }}
                        >
                          {isSubmittingPin ? (
                            <span>Verificando...</span>
                          ) : (
                            <span>Ingresar</span>
                          )}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                        <div className="w-2 h-2 rounded-full bg-red animate-pulse" />
                        <p className="text-sm font-inter font-bold text-red">{error}</p>
                      </div>
                    )}

                    <div className="pt-3 flex flex-col items-center justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('biometrics');
                          if (phone && phone.length >= 8) {
                            handleBiometricLogin();
                          }
                        }}
                        className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors underline underline-offset-4 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">fingerprint</span>
                        <span>{isMobile ? 'O ingresa con tu huella dactilar' : 'O ingresa con passkey / Windows Hello'}</span>
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </motion.form>
        ) : (
          <motion.form 
            key="new-pin"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onSubmit={handleUpdatePin} 
            className="space-y-5"
          >
            <div className="p-4 bg-[#4d7cfe]/10 rounded-xl border border-[#4d7cfe]/20 mb-6">
              <p className="text-sm font-bold text-[#4d7cfe] flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">security</span>
                Primer Acceso Detectado
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Por seguridad, debes crear un nuevo PIN personal para reemplazar el asignado temporalmente.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPin" className="text-xs font-inter font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 ml-1">
                Nuevo PIN Personal
              </Label>
              <div className="relative group">
                <span className="material-symbols-outlined text-[20px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">lock</span>
                <input
                  id="newPin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                  placeholder="Exactamente 4 dígitos"
                  required
                  value={newPin}
                  onChange={(e) => setNewNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full h-12 bg-white/80 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-sm pl-12 pr-4 text-slate-900 dark:text-white text-lg font-inter font-bold focus:bg-white focus:dark:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all leading-normal placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm"
                  disabled={isSubmittingPin || isRedirecting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPin" className="text-xs font-inter font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 ml-1">
                Confirmar Nuevo PIN
              </Label>
              <div className="relative group">
                <span className="material-symbols-outlined text-[20px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">check_circle</span>
                <input
                  id="confirmPin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                  placeholder="Repite tu nuevo PIN"
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full h-12 bg-white/80 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-sm pl-12 pr-4 text-slate-900 dark:text-white text-lg font-inter font-bold focus:bg-white focus:dark:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all leading-normal placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm"
                  disabled={isSubmittingPin || isRedirecting}
                />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-sm flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red animate-pulse" />
                <p className="text-sm font-inter font-bold text-red">{error}</p>
              </div>
            )}

            <button 
              type="submit" 
              className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-sm font-bold shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 group"
              disabled={isSubmittingPin || isRedirecting}
            >
              {isSubmittingPin ? (
                <>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <span>Establecer PIN y Acceder</span>
                  <span className="material-symbols-outlined text-[18px] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">task_alt</span>
                </>
              )}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
