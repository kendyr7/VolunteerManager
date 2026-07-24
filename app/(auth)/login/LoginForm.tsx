'use client'

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginWithPin } from "@/app/actions/auth";
import { updateInitialPin } from "@/app/actions/update-pin";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { createPortal } from "react-dom";
import { startAuthentication } from "@simplewebauthn/browser";
import Image from "next/image";

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return isMobileUA || (isTouch && window.innerWidth < 1024);
};

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);

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

  // Remember User State
  const [savedUserMode, setSavedUserMode] = useState(false);
  const [savedName, setSavedName] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const [authMode, setAuthMode] = useState<'biometrics' | 'pin'>('pin');
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Auto-dismiss error banner after 4 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    const mobileCheck = isMobileDevice();
    setIsMobile(mobileCheck);

    const savedPhone = localStorage.getItem("volunteer_phone");
    if (savedPhone) {
      setPhone(savedPhone);
    }
    const savedName = localStorage.getItem("volunteer_name");
    if (savedName && savedPhone) {
      setSavedUserMode(true);
      setSavedName(savedName);
    }

    setIsMounted(true);
  }, []);

  // Check if current phone has registered passkeys (huella/Face ID)
  useEffect(() => {
    if (!phone || phone.length < 8) {
      setHasPasskey(false);
      setAuthMode('pin');
      return;
    }

    let isSubscribed = true;
    fetch(`/api/webauthn/check-has-passkey?phone=${encodeURIComponent(phone)}`)
      .then(res => res.json())
      .then(data => {
        if (!isSubscribed) return;
        const passkeyAvailable = !!data.hasPasskey && isMobileDevice();
        setHasPasskey(passkeyAvailable);
        if (passkeyAvailable && savedUserMode) {
          setAuthMode('biometrics');
        } else {
          setAuthMode('pin');
        }
      })
      .catch(() => {
        if (isSubscribed) {
          setHasPasskey(false);
          setAuthMode('pin');
        }
      });

    return () => { isSubscribed = false; };
  }, [phone, savedUserMode]);

  const handleBiometricLogin = async () => {
    if (!isMobile) {
      setError("El ingreso con huella solo está disponible desde dispositivos móviles.");
      return;
    }

    if (!phone) {
      setError("Ingresa tu número de teléfono primero.");
      return;
    }
    
    setError(null);
    setIsBiometricLoading(true);
    try {
      const resp = await fetch('/api/webauthn/authenticate/generate-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      
      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || 'Error al generar opciones de autenticación');
      }

      const options = await resp.json();
      const asseResp = await startAuthentication(options);

      // Desactivamos el loading de la huella puesto que el lector nativo ya terminó
      setIsBiometricLoading(false);

      // Sólo mostrar el overlay de carga DESPUÉS de que pone la huella
      startTransition(async () => {
        try {
          const verifyResp = await fetch('/api/webauthn/authenticate/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(asseResp)
          });

          const verifyData = await verifyResp.json();
          
          if (verifyData.verified) {
            localStorage.setItem("preferred_auth_method", "biometrics");
            finishLogin(verifyData);
          } else {
            throw new Error('La huella no pudo ser verificada.');
          }
        } catch (err: any) {
          setError(err.message || "Error al verificar la huella");
        }
      });
    } catch (err: any) {
      setIsBiometricLoading(false);
      if (err.name === 'NotAllowedError') {
        // Cancelación voluntaria del usuario, limpiamos el error sin molestar
        setError(null);
      } else {
        setError(err.message || "Huella no reconocida, inténtelo de nuevo.");
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (phone.length < 8) {
      setError("El número de teléfono debe tener 8 dígitos.");
      return;
    }

    if (pin.length !== 4) {
      setError("El PIN debe tener exactamente 4 dígitos.");
      return;
    }

    startTransition(async () => {
      try {
        const minDelay = new Promise(resolve => setTimeout(resolve, 600));
        const formData = new FormData();
        formData.append("phone", phone);
        formData.append("pin", pin);

        const [result] = await Promise.all([loginWithPin({}, formData), minDelay]);

        if (result.error) {
          setError(result.error);
          setPin("");
        } else if (result.force_pin_change) {
          setUserData({ id: result.user_id!, type: result.user_type! });
          setNeedsNewPin(true);
        } else if (result.success) {
          finishLogin(result);
        }
      } catch (err: any) {
        console.error("Login transition error:", err);
        setError("Error de conexión con el servidor. Inténtalo de nuevo.");
      }
    });
  };

  const handleUpdatePin = (e: React.FormEvent) => {
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

    startTransition(async () => {
      try {
        const minDelay = new Promise(resolve => setTimeout(resolve, 600));
        const [result] = await Promise.all([updateInitialPin(userData!.id, userData!.type, newPin), minDelay]);

        if (result.error) {
          setError(result.error);
        } else if (result.success) {
          finishLogin(result);
        }
      } catch (err: any) {
        console.error("PIN update transition error:", err);
        setError("Error de conexión con el servidor. Inténtalo de nuevo.");
      }
    });
  };

  const finishLogin = (result: any) => {
    setIsRedirecting(true);
    localStorage.setItem("volunteer_phone", phone || result.phone);
    if (result.name) {
      localStorage.setItem("volunteer_name", result.name);
    }
    if (!localStorage.getItem("preferred_auth_method")) {
      localStorage.setItem("preferred_auth_method", "pin");
    }
    if (result.role) {
      localStorage.setItem("mock_role", result.role);
    }
    if (result.committee) {
      localStorage.setItem("mock_committee", result.committee);
    }
    
    window.location.href = result.redirectTo || "/calendar";
  };

  return (
    <div className="relative">
      {(isPending || isRedirecting) && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] bg-dark flex items-center justify-center animate-in fade-in duration-200">
          <AnimatedLogo className="w-16 h-16 md:w-20 md:h-20 text-text" isLooping={true} />
        </div>,
        document.body
      )}

      <AnimatePresence mode="wait">
        {!needsNewPin ? (
          <motion.form 
            key="login"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            onSubmit={handleSubmit} 
            className="space-y-5"
          >
            {!savedUserMode ? (
              /* Usuario nuevo / No recordado: Solo Teléfono + PIN + Ingresar */
              <>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-[11px] font-dela uppercase tracking-wider text-slate-400 ml-1">
                    Número de Teléfono
                  </Label>
                  <div className="relative group">
                    <span className="material-symbols-outlined text-[20px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">call</span>
                    <input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="username tel"
                      maxLength={8}
                      placeholder="88888888"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      className="w-full h-12 bg-white/5 border border-white/10 rounded-sm pl-12 pr-4 text-white font-inter font-bold focus:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all placeholder:text-slate-500"
                      disabled={isPending}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pin" className="text-[11px] font-dela uppercase tracking-wider text-slate-400 ml-1">
                    PIN de Acceso
                  </Label>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 group">
                      <span className="material-symbols-outlined text-[20px] absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">vpn_key</span>
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
                        className="w-full h-12 bg-white/5 border border-white/10 rounded-sm pl-11 pr-3 text-white text-lg font-inter font-bold focus:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all leading-normal placeholder:text-slate-500"
                        disabled={isPending}
                      />
                    </div>

                    <button 
                      type="submit" 
                      className="flex-1 h-12 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-sm font-bold shadow-lg shadow-[#4d7cfe]/20 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center group shrink-0 text-center"
                      disabled={isPending}
                      onClick={() => {
                        localStorage.setItem("preferred_auth_method", "pin");
                      }}
                    >
                      {isPending ? (
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
              </>
            ) : (
              /* Usuario Recordado (savedUserMode === true) */
              <>
                <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#4d7cfe]/20 text-[#4d7cfe] flex items-center justify-center font-bold font-inter">
                      {savedName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white font-inter">{savedName}</p>
                      <p className="text-[11px] text-slate-400 font-inter">{phone}</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => { 
                      setSavedUserMode(false); 
                      localStorage.removeItem('volunteer_name'); 
                      localStorage.removeItem('volunteer_phone');
                      setPhone(''); 
                      setAuthMode('pin');
                    }}
                    className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
                  >
                    Cambiar
                  </button>
                </div>

                {authMode === 'biometrics' && isMobile && hasPasskey ? (
                  <div className="space-y-3 pt-2 text-center flex flex-col items-center justify-center">
                    {/* 1. Texto arriba */}
                    <p className="text-sm font-bold font-inter text-slate-300">
                      Ingresar con huella
                    </p>

                    {/* 2. Ícono con Logo de la App + Insignia de Huella */}
                    <button
                      type="button"
                      onClick={handleBiometricLogin}
                      suppressHydrationWarning
                      className="group flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-300 active:scale-95 disabled:opacity-40 my-1 hover:bg-white/5"
                      disabled={!isMounted || isPending || isBiometricLoading || !phone}
                      title="Ingresar con Huella / Face ID"
                    >
                      <div className="relative mb-2">
                        <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/20 shadow-xl bg-dark2 flex items-center justify-center group-hover:scale-105 transition-all">
                          <Image
                            src="/icon-192.png"
                            alt="Volunteer Manager"
                            width={56}
                            height={56}
                            className="object-contain"
                          />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#4d7cfe] border-2 border-dark flex items-center justify-center text-white shadow-md">
                          <span className="material-symbols-outlined text-[15px]">fingerprint</span>
                        </div>
                      </div>
                    </button>

                    {error && (
                      <div className="w-full p-4 bg-red-50 border border-red-100 rounded-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2 text-left">
                        <div className="w-2 h-2 rounded-full bg-red animate-pulse" />
                        <p className="text-sm font-inter font-bold text-red">{error}</p>
                      </div>
                    )}

                    {/* 3. Texto debajo */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setAuthMode('pin')}
                        className="text-xs font-bold text-slate-400 hover:text-white transition-colors underline underline-offset-4"
                      >
                        O ingresa con tu PIN
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="pin" className="text-[11px] font-dela uppercase tracking-wider text-slate-400 ml-1">
                        PIN de Acceso
                      </Label>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1 group">
                          <span className="material-symbols-outlined text-[20px] absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">vpn_key</span>
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
                            className="w-full h-12 bg-white/5 border border-white/10 rounded-sm pl-11 pr-3 text-white text-lg font-inter font-bold focus:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all leading-normal placeholder:text-slate-500"
                            disabled={isPending}
                          />
                        </div>

                        <button 
                          type="submit" 
                          className="flex-1 h-12 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-sm font-bold shadow-lg shadow-[#4d7cfe]/20 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center group shrink-0 text-center"
                          disabled={isPending}
                          onClick={() => {
                            localStorage.setItem("preferred_auth_method", "pin");
                          }}
                        >
                          {isPending ? (
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

                    {isMobile && hasPasskey && (
                      <div className="pt-3 flex flex-col items-center justify-center">
                        <button
                          type="button"
                          onClick={() => setAuthMode('biometrics')}
                          className="text-xs font-bold text-slate-400 hover:text-white transition-colors underline underline-offset-4 flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">fingerprint</span>
                          <span>O ingresa con tu huella dactilar</span>
                        </button>
                      </div>
                    )}
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
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Por seguridad, debes crear un nuevo PIN personal para reemplazar el asignado temporalmente.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPin" className="text-xs font-inter font-bold uppercase tracking-wider text-slate-400 ml-1">
                Nuevo PIN Personal
              </Label>
              <div className="relative group">
                <span className="material-symbols-outlined text-[20px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">lock</span>
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
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-sm pl-12 pr-4 text-white text-lg font-inter font-bold focus:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all leading-normal placeholder:text-slate-500"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPin" className="text-xs font-inter font-bold uppercase tracking-wider text-slate-400 ml-1">
                Confirmar Nuevo PIN
              </Label>
              <div className="relative group">
                <span className="material-symbols-outlined text-[20px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">check_circle</span>
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
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-sm pl-12 pr-4 text-white text-lg font-inter font-bold focus:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all leading-normal placeholder:text-slate-500"
                  disabled={isPending}
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
              disabled={isPending}
            >
              {isPending ? (
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
