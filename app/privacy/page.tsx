import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidad | Volunteer Manager Templo Managua',
  description: 'Política de Privacidad y Protección de Datos Personales para Voluntarios de Puertas Abiertas Templo de Managua.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#070d19] text-slate-100 font-sans flex flex-col justify-between p-4 sm:p-8 md:p-12">
      <div className="max-w-4xl mx-auto w-full space-y-8 my-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/15">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/30 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[28px]">shield_lock</span>
            </div>
            <div>
              <h1 className="font-inter font-black text-2xl sm:text-3xl tracking-tight text-white">
                Política de Privacidad y Protección de Datos
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
            🔒 Tu privacidad es fundamental para nosotros. Esta política describe cómo manejamos y protegemos la información personal de los voluntarios del evento.
          </div>

          <div className="bg-[#0f172a] p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="font-extrabold text-white text-base sm:text-lg">
              1. Recopilación de Información
            </h2>
            <p>
              Recopilamos únicamente los datos necesarios para la logística y asignación eficiente de turnos de voluntariado, incluyendo nombre completo, número de teléfono de contacto, estaca, barrio y comité asignado.
            </p>
          </div>

          <div className="bg-[#0f172a] p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="font-extrabold text-white text-base sm:text-lg">
              2. Uso Exclusivo de los Datos
            </h2>
            <p>
              Tus datos personales se utilizan <strong>exclusivamente</strong> para la organización de turnos, verificación de asistencia mediante el escaneo de pases de acceso QR y para enviar recordatorios operativos importantes a través de la API oficial de WhatsApp.
            </p>
          </div>

          <div className="bg-[#0f172a] p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="font-extrabold text-white text-base sm:text-lg">
              3. Confidencialidad y No Divulgación
            </h2>
            <p>
              Bajo ninguna circunstancia venderemos, alquilaremos o compartiremos tu información personal con empresas o terceros externos. El acceso a los registros está estrictamente restringido a coordinadores y administradores autorizados del Templo de Managua.
            </p>
          </div>

          <div className="bg-[#0f172a] p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="font-extrabold text-white text-base sm:text-lg">
              4. Registro de Asistencia y Estadísticas
            </h2>
            <p>
              Los registros de entrada y salida (check-in/check-out) se procesan de forma segura para generar informes analíticos del evento y reconocer las horas de servicio prestadas por cada voluntario.
            </p>
          </div>

          <div className="bg-[#0f172a] p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="font-extrabold text-white text-base sm:text-lg">
              5. Eliminación y Derechos de Datos
            </h2>
            <p>
              Cualquier voluntario tiene derecho a solicitar la actualización o eliminación de sus datos de contacto de nuestro sistema en cualquier momento comunicándose con los coordinadores autorizados del evento.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>&copy; 2026 Volunteer Manager. Templo de Managua.</p>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-white transition-colors">
              Iniciar Sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
