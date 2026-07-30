import Link from 'next/link';

export const metadata = {
  title: 'Términos y Condiciones | Volunteer Manager Templo Managua',
  description: 'Términos y Condiciones de Uso del Servicio de Voluntariado para Puertas Abiertas Templo de Managua.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#070d19] text-slate-100 font-sans flex flex-col justify-between p-4 sm:p-8 md:p-12">
      <div className="max-w-4xl mx-auto w-full space-y-8 my-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/15">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/30 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[28px]">gavel</span>
            </div>
            <div>
              <h1 className="font-inter font-black text-2xl sm:text-3xl tracking-tight text-white">
                Términos y Condiciones de Uso
              </h1>
              <p className="text-xs sm:text-sm font-bold text-slate-400 mt-1">
                Volunteer Manager &bull; Puertas Abiertas Templo de Managua 2026
              </p>
            </div>
          </div>
          <Link
            href="/login"
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-bold transition-all border border-white/10 shrink-0"
          >
            &larr; Volver a la plataforma
          </Link>
        </div>

        {/* Content */}
        <div className="space-y-6 text-slate-300 text-sm sm:text-base leading-relaxed font-inter">
          <div className="p-5 rounded-2xl bg-[#4d7cfe]/10 border border-[#4d7cfe]/20 text-[#4d7cfe] text-sm font-bold">
            📋 Al ingresar y colaborar en la plataforma, aceptas las condiciones generales del servicio de voluntariado para las Puertas Abiertas del Templo.
          </div>

          <div className="bg-[#0f172a] p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="font-extrabold text-white text-base sm:text-lg">
              1. Aceptación del Servicio Voluntario
            </h2>
            <p>
              Al hacer uso de este sistema, confirmas tu disposición de participar libremente como voluntario o coordinador con responsabilidad, honradez y espíritu de servicio durante el evento Puertas Abiertas.
            </p>
          </div>

          <div className="bg-[#0f172a] p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="font-extrabold text-white text-base sm:text-lg">
              2. Confidencialidad y Seguridad del Acceso
            </h2>
            <p>
              Tanto el PIN de verificación enviado por WhatsApp como tus credenciales de usuario son estrictamente personales. Es responsabilidad de cada usuario resguardar el acceso a su sesión.
            </p>
          </div>

          <div className="bg-[#0f172a] p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="font-extrabold text-white text-base sm:text-lg">
              3. Código de Conducta
            </h2>
            <p>
              Los voluntarios se comprometen a mantener los principios de respeto, amabilidad, puntualidad y excelencia en el trato hacia los visitantes y compañeros de servicio en cada comité.
            </p>
          </div>

          <div className="bg-[#0f172a] p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="font-extrabold text-white text-base sm:text-lg">
              4. Flexibilidad Operativa
            </h2>
            <p>
              La coordinación del evento se reserva la facultad de realizar ajustes de programación o reasignar turnos de forma oportuna para atender las exigencias de aforo y seguridad del templo.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>&copy; 2026 Volunteer Manager. Templo de Managua.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Política de Privacidad
            </Link>
            <Link href="/login" className="hover:text-white transition-colors">
              Iniciar Sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
