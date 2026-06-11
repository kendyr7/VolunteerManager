'use client'

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginWithPin } from "@/app/actions/auth";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, KeyRound, ArrowUpRight } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Unified Login Fields
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      } else if (result.success) {
        localStorage.setItem("volunteer_phone", phone);
        if (result.role) {
          localStorage.setItem("mock_role", result.role);
        }
        if (result.committee) {
          localStorage.setItem("mock_committee", result.committee);
        }
        router.push(result.redirectTo || "/calendar");
      }
    });
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
            Número de Teléfono
          </Label>
          <div className="relative group">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[#0084d1] transition-colors" />
            <input
              id="phone"
              type="tel"
              placeholder="8888 8888"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 text-slate-900 font-semibold focus:bg-white focus:border-[#0084d1] focus:ring-4 focus:ring-[#0084d1]/10 outline-none transition-all"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pin" className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
            PIN de Acceso
          </Label>
          <div className="relative group">
            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[#0084d1] transition-colors" />
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
              className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 text-slate-900 font-bold tracking-[0.5em] focus:bg-white focus:border-[#0084d1] focus:ring-4 focus:ring-[#0084d1]/10 outline-none transition-all"
              disabled={isPending}
            />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <p className="text-sm font-bold text-red-600">{error}</p>
          </div>
        )}

        <button 
          type="submit" 
          className="w-full h-12 bg-[#0084d1] hover:bg-[#006eb3] text-white rounded-xl font-bold shadow-lg shadow-[#0084d1]/20 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 group"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Verificando...</span>
            </>
          ) : (
            <>
              <span>Ingresar a la Plataforma</span>
              <ArrowUpRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
