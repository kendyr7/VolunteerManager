'use client'

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginWithPin } from "@/app/actions/auth";
import { updateInitialPin } from "@/app/actions/update-pin";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";

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

  useEffect(() => {
    const savedPhone = localStorage.getItem("volunteer_phone");
    if (savedPhone) {
      setPhone(savedPhone);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length < 4) {
      setError("El PIN debe tener al menos 4 dígitos.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("phone", phone);
      formData.append("pin", pin);

      const result = await loginWithPin({}, formData);

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
      const result = await updateInitialPin(userData!.id, userData!.type, newPin);

      if (result.error) {
        setError(result.error);
      } else if (result.success) {
        finishLogin(result);
      }
    });
  };

  const finishLogin = (result: any) => {
    localStorage.setItem("volunteer_phone", phone);
    if (result.role) {
      localStorage.setItem("mock_role", result.role);
    }
    if (result.committee) {
      localStorage.setItem("mock_committee", result.committee);
    }
    router.push(result.redirectTo || "/calendar");
  };

  return (
    <div className="w-full">
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
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
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
                  className="w-full h-12 bg-slate-50 border border-slate-200 rounded-sm pl-12 pr-4 text-slate-900 font-semibold focus:bg-white focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/10 outline-none transition-all"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pin" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
                PIN de Acceso
              </Label>
              <div className="relative group">
                <span className="material-symbols-outlined text-[20px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">vpn_key</span>
                  <input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="••••"
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full h-12 bg-slate-50 border border-slate-200 rounded-sm pl-12 pr-4 text-slate-900 text-lg focus:bg-white focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/10 outline-none transition-all leading-normal"
                    disabled={isPending}
                  />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <div className="w-2 h-2 rounded-full bg-red animate-pulse" />
                <p className="text-sm font-bold text-red">{error}</p>
              </div>
            )}

            <button 
              type="submit" 
              className="w-full h-12 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-sm font-bold shadow-lg shadow-[#4d7cfe]/20 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 group"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <span>Ingresar</span>
                  <span className="material-symbols-outlined text-[18px] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">north_east</span>
                </>
              )}
            </button>
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
              <Label htmlFor="newPin" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
                Nuevo PIN Personal
              </Label>
              <div className="relative group">
                <span className="material-symbols-outlined text-[20px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">lock</span>
                <input
                  id="newPin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Mínimo 4 dígitos"
                  required
                  value={newPin}
                  onChange={(e) => setNewNewPin(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full h-12 bg-slate-50 border border-slate-200 rounded-sm pl-12 pr-4 text-slate-900 text-lg focus:bg-white focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/10 outline-none transition-all leading-normal"
                  disabled={isPending}
                />
                </div>
                </div>

                <div className="space-y-2">
                <Label htmlFor="confirmPin" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
                Confirmar Nuevo PIN
                </Label>
                <div className="relative group">
                <span className="material-symbols-outlined text-[20px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4d7cfe] transition-colors">check_circle</span>
                <input
                  id="confirmPin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Repite tu nuevo PIN"
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full h-12 bg-slate-50 border border-slate-200 rounded-sm pl-12 pr-4 text-slate-900 text-lg focus:bg-white focus:border-[#4d7cfe] focus:ring-4 focus:ring-[#4d7cfe]/10 outline-none transition-all leading-normal"
                  disabled={isPending}
                />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-sm flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red animate-pulse" />
                <p className="text-sm font-bold text-red">{error}</p>
              </div>
            )}

            <button 
              type="submit" 
              className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-sm font-bold shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 group"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
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
