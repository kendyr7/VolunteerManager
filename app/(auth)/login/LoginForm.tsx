'use client'

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginWithPin } from "@/app/actions/auth";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, KeyRound } from "lucide-react";

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
    <div className="card-premium overflow-hidden">
      <div className="space-y-1 pb-4 pt-6 px-8">
        <h2 className="text-display-sm text-center text-text font-bold">
          Iniciar Sesión
        </h2>
        <p className="text-center text-body-sm text-muted">
          Ingresa con tu número de teléfono y PIN de acceso
        </p>
      </div>
      
      <div className="px-8 pb-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2 relative">
            <Label htmlFor="phone" className="text-body-sm font-semibold text-text ml-1">Teléfono</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-5 w-5 text-muted" />
              <input
                id="phone"
                type="tel"
                placeholder="Ej. 8888 8888"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-base pl-10 h-12 w-full text-body-md"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2 relative">
            <Label htmlFor="pin" className="text-body-sm font-semibold text-text ml-1">PIN de Acceso</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 h-5 w-5 text-muted" />
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
                className="input-base pl-10 h-12 w-full text-lg tracking-[0.5em] font-mono text-text"
                disabled={isPending}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 text-body-sm text-red bg-red-faint border border-red/20 rounded-lg animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="btn-base bg-[#0084d1] hover:bg-[#006eb3] text-white w-full h-12 text-base mt-2"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Ingresando...
              </>
            ) : (
              "Ingresar a la plataforma"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
