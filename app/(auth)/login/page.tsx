import { LoginForm } from "./LoginForm";
import Image from "next/image";

export const metadata = {
  title: "Iniciar Sesión | Volunteer Manager",
  description: "Acceso para voluntarios del Templo de Managua",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* Left Side: Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-16 z-10 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <div className="w-12 h-12 bg-[#0084d1] rounded-sm flex items-center justify-center text-white font-bold text-xl mb-6 shadow-lg shadow-[#0084d1]/20">
              V
            </div>
            <h1 className="text-3xl tracking-tight text-slate-900 mb-2">
              Bienvenido de nuevo
            </h1>
            <p className="text-slate-500 font-medium">
              Gestión de Voluntarios &bull; Templo de Managua
            </p>
          </div>
          
          <LoginForm />
          
          <div className="mt-10 pt-8 border-t border-slate-100">
            <p className="text-sm text-slate-400 font-medium">
              ¿Tienes problemas para ingresar? <br />
              <button className="text-[#0084d1] font-bold hover:underline mt-1">
                Contacta a tu coordinador de comité
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Right Side: Image Hero */}
      <div className="hidden md:block md:w-1/2 lg:w-3/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#0084d1]/10 z-10" />
        <div className="absolute bottom-12 left-12 right-12 z-20 text-white">
          <div className="backdrop-blur-md bg-black/20 p-8 rounded-sm border border-white/20 shadow-2xl">
            <h2 className="tracking-tight mb-4">
              "El servicio es el lenguaje del amor en acción."
            </h2>
            <div className="flex items-center gap-3">
              <div className="h-px w-8 bg-white/50" />
              <p className="text-white/80 font-bold uppercase tracking-widest text-xs">
                Puertas Abiertas 2026
              </p>
            </div>
          </div>
        </div>
        <Image
          src="/templo.jpg"
          alt="Templo de Managua"
          fill
          className="object-cover"
          priority
        />
      </div>

      {/* Mobile Image (shown only on small screens at top) */}
      <div className="md:hidden h-48 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent z-10" />
        <Image
          src="/templo.jpg"
          alt="Templo de Managua"
          fill
          className="object-cover"
        />
      </div>
    </div>
  );
}
