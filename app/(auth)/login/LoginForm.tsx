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

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Unified Login Fields
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  // New PIN States
  const [needsNewPin, setNeedsNewPin] = useState(false);
  const [newPin, setNewNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [userData, setUserData] = useState<{ id: string, type: 'profile' | 'volunteer' } | null>(null);
  const [preferredAuthMethod, setPreferredAuthMethod] = useState<'pin' | 'biometrics'>('pin');

  // Remember User State
  const [savedUserMode, setSavedUserMode] = useState(false);
  const [savedName, setSavedName] = useState("");

  useEffect(() => {
    const savedPhone = localStorage.getItem("volunteer_phone");
    if (savedPhone) {
      setPhone(savedPhone);
    }
    const savedMethod = localStorage.getItem("preferred_auth_method");
    if (savedMethod === 'biometrics') {
      setPreferredAuthMethod('biometrics');
    }
    const savedName = localStorage.getItem("volunteer_name");
    if (savedName && savedPhone) {
      setSavedUserMode(true);
      setSavedName(savedName);
    }
  }, []);

  const handleBiometricLogin = async () => {
    if (!phone) {
      setError("Ingresa tu número de teléfono primero.");
      return;
    }
    
    setError(null);
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
      setError("Huella no reconocida, inténtelo de nuevo.");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length < 4) {
      setError("El PIN debe tener al menos 4 dígitos.");
      return;
    }

    startTransition(async () => {
      const minDelay = new Promise(resolve => setTimeout(resolve, 2500));
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
    });
  };

  const handleUpdatePin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPin.length < 4) {
      setError("El nuevo PIN debe tener al menos 4 dígitos.");
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
      const minDelay = new Promise(resolve => setTimeout(resolve, 2500));
      const [result] = await Promise.all([updateInitialPin(userData!.id, userData!.type, newPin), minDelay]);

      if (result.error) {
        setError(result.error);
      } else if (result.success) {
        finishLogin(result);
      }
    });
  };

  const finishLogin = (result: any) => {
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
    router.push(result.redirectTo || "/calendar");
  };

  return (
    <div className="relative">
      {isPending && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] bg-dark flex items-center justify-center animate-in fade-in duration-300">
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
            {savedUserMode ? (
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
                  }}
                  className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-[11px] font-dela uppercase tracking-wider text-slate-400 ml-1">
                  Número de Teléfono
                </Label>
                <div className="relative group">
                  <span className="material-symbols-outlined text-[20px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">call</span>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="8888 8888"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-sm pl-12 pr-4 text-white font-inter font-bold focus:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all placeholder:text-slate-500"
                    disabled={isPending}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="pin" className="text-[11px] font-dela uppercase tracking-wider text-slate-400 ml-1">
                PIN de Acceso
              </Label>
              <div className="relative group">
                <span className="material-symbols-outlined text-[20px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">vpn_key</span>
                  <input
                    id="pin"
                    type="tel"
                    style={{ WebkitTextSecurity: "disc" } as any}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="••••"
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full h-12 bg-white/5 border border-white/10 rounded-sm pl-12 pr-4 text-white text-lg font-inter font-bold focus:bg-white/10 focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/20 outline-none transition-all leading-normal placeholder:text-slate-500"
                    disabled={isPending}
                  />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <div className="w-2 h-2 rounded-full bg-red animate-pulse" />
                <p className="text-sm font-inter font-bold text-red">{error}</p>
              </div>
            )}

            <div className="flex lg:block gap-2">
              <button 
                type="submit" 
                className="w-full h-12 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-sm font-bold shadow-lg shadow-[#4d7cfe]/20 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 group"
                disabled={isPending}
                onClick={() => {
                  localStorage.setItem("preferred_auth_method", "pin");
                }}
              >
                {isPending ? (
                  <span>Verificando...</span>
                ) : (
                  <>
                    <span>Ingresar</span>
                    <span className="material-symbols-outlined text-[18px] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">north_east</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleBiometricLogin}
                className={`lg:hidden h-12 px-4 rounded-sm font-bold shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 shrink-0 border ${preferredAuthMethod === 'biometrics' ? 'bg-[#4d7cfe] border-[#4d7cfe] text-white shadow-[#4d7cfe]/20' : 'bg-dark2 border-white/10 text-white hover:bg-white/10'}`}
                disabled={isPending || !phone}
                title="Iniciar sesión con huella dactilar"
              >
                <span className="material-symbols-outlined text-[20px]">fingerprint</span>
              </button>
            </div>
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
                  type="tel"
                  style={{ WebkitTextSecurity: "disc" } as any}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Mínimo 4 dígitos"
                  required
                  value={newPin}
                  onChange={(e) => setNewNewPin(e.target.value.replace(/[^0-9]/g, ''))}
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
                  type="tel"
                  style={{ WebkitTextSecurity: "disc" } as any}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Repite tu nuevo PIN"
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ''))}
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
