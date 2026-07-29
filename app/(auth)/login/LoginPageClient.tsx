"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { LoginForm } from "./LoginForm";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { cn } from "@/lib/utils";

const TEMPLE_QUOTES = [
  {
    quote: "Cuando os halláis en el servicio de vuestros semejantes, sólo estáis en el servicio de vuestro Dios.",
    author: "Mosíah 2:17"
  },
  {
    quote: "No podemos dirigir el viento, pero podemos ajustar las velas. Al elevarnos unos a otros, alcanzamos las alturas.",
    author: "Presidente Thomas S. Monson"
  },
  {
    quote: "Si tenéis deseos de servir a Dios, sois llamados a la obra.",
    author: "Doctrina y Convenios 4:2"
  },
  {
    quote: "Nuestras manos son las manos del Salvador en la tierra; nuestros pies son Sus pies y nuestro amor es Su amor.",
    author: "Presidente Dieter F. Uchtdorf"
  },
  {
    quote: "Por tanto, no os canséis de hacer el bien, porque estáis asentando el fundamento de una gran obra.",
    author: "Doctrina y Convenios 64:33"
  },
  {
    quote: "El gozo que sentimos tiene poco que ver con las circunstancias de nuestra vida y mucho que ver con el enfoque de nuestra vida.",
    author: "Presidente Russell M. Nelson"
  },
  {
    quote: "Las cosas pequeñas y sencillas son las que marcan una gran diferencia en la vida de los demás.",
    author: "Presidente M. Russell Ballard"
  },
  {
    quote: "El servicio consagrado en el templo trae gozo, paz y perspectiva eterna a nuestras vidas.",
    author: "Puertas Abiertas 2026"
  }
];

function TempleQuoteRotator({ isMobile = false }: { isMobile?: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % TEMPLE_QUOTES.length);
    }, 14000);
    return () => clearInterval(timer);
  }, []);

  const current = TEMPLE_QUOTES[index];

  return (
    <div className="relative overflow-hidden backdrop-blur-xl bg-gradient-to-t from-black/85 via-black/50 to-black/20 p-6 md:p-9 rounded-3xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.6)] transition-all">
      {/* Background Watermark Quote Mark */}
      <span className="absolute -top-4 -left-1 text-8xl font-serif text-white/10 select-none pointer-events-none leading-none">
        &ldquo;
      </span>

      <div className="relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >
            <p className={cn("text-white font-inter font-medium leading-relaxed drop-shadow-md tracking-tight", isMobile ? "text-base sm:text-lg" : "text-xl lg:text-2xl")}>
              &ldquo;{current.quote}&rdquo;
            </p>

            <div className="flex items-center gap-3 pt-1">
              <div className="h-px w-8 bg-gradient-to-r from-white/60 to-transparent" />
              <p className="text-white/90 font-bold uppercase tracking-widest text-[11px] sm:text-xs">
                {current.author}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Smooth 14-Second Progress Line */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10 overflow-hidden">
        <motion.div
          key={index}
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 14, ease: "linear" }}
          className="h-full bg-gradient-to-r from-[#4d7cfe] via-sky-400 to-emerald-400"
        />
      </div>
    </div>
  );
}

function PrivacyTermsModal({
  activeModal,
  onClose,
  isDark
}: {
  activeModal: 'privacy' | 'terms' | null;
  onClose: () => void;
  isDark: boolean;
}) {
  if (!activeModal) return null;

  const isPrivacy = activeModal === 'privacy';

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-6 md:p-10">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Container — 100% Fullscreen */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "relative z-10 w-full h-full rounded-2xl md:rounded-3xl p-5 sm:p-8 md:p-10 shadow-2xl border flex flex-col overflow-hidden",
          isDark
            ? "bg-[#0b1329] border-white/15 text-slate-100 shadow-black/80"
            : "bg-white border-slate-300 text-slate-900 shadow-slate-900/30"
        )}
      >
        {/* Header */}
        <div className={cn("flex items-center justify-between pb-4 sm:pb-6 border-b shrink-0", isDark ? "border-white/10" : "border-slate-200")}>
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0", isDark ? "bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/30" : "bg-blue-50 text-[#4d7cfe] border-blue-200")}>
              <span className="material-symbols-outlined text-[24px]">
                {isPrivacy ? 'shield_lock' : 'gavel'}
              </span>
            </div>
            <div>
              <h3 className={cn("font-inter font-black text-lg sm:text-xl md:text-2xl tracking-tight", isDark ? "text-white" : "text-slate-900")}>
                {isPrivacy ? 'Política de Privacidad y Protección de Datos' : 'Términos y Condiciones de Uso'}
              </h3>
              <p className={cn("text-xs font-inter font-bold mt-0.5", isDark ? "text-slate-400" : "text-slate-500")}>
                Gestión de Voluntarios &bull; Puertas Abiertas Templo de Managua 2026
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn("w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer active:scale-95", isDark ? "bg-white/10 hover:bg-white/20 text-white/90" : "bg-slate-100 hover:bg-slate-200 text-slate-700")}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content Scroll */}
        <div className="flex-1 overflow-y-auto pt-6 pb-4 pr-2 space-y-6 text-sm sm:text-base leading-relaxed font-inter scrollbar-thin">
          {isPrivacy ? (
            <>
              <div className={cn("p-4 rounded-2xl border", isDark ? "bg-white/5 border-white/10" : "bg-blue-50/60 border-blue-100")}>
                <p className={cn("text-xs sm:text-sm font-bold leading-relaxed", isDark ? "text-blue-300" : "text-blue-900")}>
                  🔒 Tu privacidad es fundamental para nosotros. Esta política describe cómo manejamos y protegemos la información personal de los voluntarios del evento.
                </p>
              </div>

              <div>
                <h4 className={cn("font-bold text-sm sm:text-base mb-1.5", isDark ? "text-white" : "text-slate-900 font-extrabold")}>
                  1. Recopilación de Información
                </h4>
                <p className={cn("text-xs sm:text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-700 font-medium")}>
                  Recopilamos únicamente los datos necesarios para la logística y asignación eficiente de turnos de voluntariado, incluyendo nombre completo, número de teléfono de contacto, estaca, barrio y comité asignado.
                </p>
              </div>

              <div>
                <h4 className={cn("font-bold text-sm sm:text-base mb-1.5", isDark ? "text-white" : "text-slate-900 font-extrabold")}>
                  2. Uso Exclusivo de los Datos
                </h4>
                <p className={cn("text-xs sm:text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-700 font-medium")}>
                  Tus datos personales se utilizan <strong>exclusivamente</strong> para la organización de turnos, verificación de asistencia mediante el escaneo de pases de acceso QR y para enviar recordatorios operativos importantes a través de WhatsApp.
                </p>
              </div>

              <div>
                <h4 className={cn("font-bold text-sm sm:text-base mb-1.5", isDark ? "text-white" : "text-slate-900 font-extrabold")}>
                  3. Confidencialidad y No Divulgación
                </h4>
                <p className={cn("text-xs sm:text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-700 font-medium")}>
                  Bajo ninguna circunstancia venderemos, alquilaremos o compartiremos tu información personal con empresas o terceros externos. El acceso a los registros está estrictamente restringido a coordinadores y administradores autorizados.
                </p>
              </div>

              <div>
                <h4 className={cn("font-bold text-sm sm:text-base mb-1.5", isDark ? "text-white" : "text-slate-900 font-extrabold")}>
                  4. Registro de Asistencia y Estadísticas
                </h4>
                <p className={cn("text-xs sm:text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-700 font-medium")}>
                  Los registros de entrada y salida (check-in/check-out) se procesan de forma segura para generar informes analíticos del evento y reconocer las horas de servicio prestadas por cada voluntario.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className={cn("p-4 rounded-2xl border", isDark ? "bg-white/5 border-white/10" : "bg-blue-50/60 border-blue-100")}>
                <p className={cn("text-xs sm:text-sm font-bold leading-relaxed", isDark ? "text-blue-300" : "text-blue-900")}>
                  📋 Al ingresar y colaborar en la plataforma, aceptas las condiciones generales del servicio de voluntariado para las Puertas Abiertas del Templo.
                </p>
              </div>

              <div>
                <h4 className={cn("font-bold text-sm sm:text-base mb-1.5", isDark ? "text-white" : "text-slate-900 font-extrabold")}>
                  1. Aceptación del Servicio Voluntario
                </h4>
                <p className={cn("text-xs sm:text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-700 font-medium")}>
                  Al hacer uso de este sistema, confirmas tu disposición de participar libremente como voluntario o coordinador con responsabilidad, honradez y espíritu de servicio durante el evento Puertas Abiertas.
                </p>
              </div>

              <div>
                <h4 className={cn("font-bold text-sm sm:text-base mb-1.5", isDark ? "text-white" : "text-slate-900 font-extrabold")}>
                  2. Confidencialidad y Seguridad del Acceso
                </h4>
                <p className={cn("text-xs sm:text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-700 font-medium")}>
                  Tanto el PIN de verificación enviado por WhatsApp como tus credenciales de usuario son estrictamente personales. Es responsabilidad de cada usuario resguardar el acceso a su sesión.
                </p>
              </div>

              <div>
                <h4 className={cn("font-bold text-sm sm:text-base mb-1.5", isDark ? "text-white" : "text-slate-900 font-extrabold")}>
                  3. Código de Conducta
                </h4>
                <p className={cn("text-xs sm:text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-700 font-medium")}>
                  Los voluntarios se comprometen a mantener los principios de respeto, amabilidad, puntualidad y excelencia en el trato hacia los visitantes y compañeros de servicio en cada comité.
                </p>
              </div>

              <div>
                <h4 className={cn("font-bold text-sm sm:text-base mb-1.5", isDark ? "text-white" : "text-slate-900 font-extrabold")}>
                  4. Flexibilidad Operativa
                </h4>
                <p className={cn("text-xs sm:text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-700 font-medium")}>
                  La coordinación del evento se reserva la facultad de realizar ajustes de programación o reasignar turnos de forma oportuna para atender las exigencias de aforo y seguridad del templo.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer Accept Button */}
        <div className={cn("pt-4 border-t flex justify-end shrink-0", isDark ? "border-white/10" : "border-slate-200")}>
          <button
            onClick={onClose}
            className="px-8 h-11 rounded-full bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-bold text-sm shadow-lg shadow-blue-500/25 active:scale-95 transition-all cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function LoginPageClient() {
  const [page, setPage] = useState(0);
  const [vw, setVw] = useState(0);
  const [isDark, setIsDark] = useState(true);
  const [activeLegalModal, setActiveLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const controls = useAnimation();

  useEffect(() => {
    setVw(window.innerWidth);
  }, []);

  useEffect(() => {
    const applyTheme = (dark: boolean) => {
      setIsDark(dark);
      if (dark) {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
        document.documentElement.style.backgroundColor = "#050505";
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.style.colorScheme = "light";
        document.documentElement.style.backgroundColor = "#f8fafc";
      }
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => {
      applyTheme(e.matches);
    };

    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (vw) {
      controls.start({ x: page === 0 ? 0 : -vw });
    }
  }, [page, vw, controls]);

  const onDragEnd = useCallback(
    (_e: any, info: { offset: { x: number }; velocity: { x: number } }) => {
      if (!vw) return;
      const threshold = vw * 0.2;
      const velocityThreshold = 500;

      let newPage = page;

      if ((info.offset.x < -threshold || info.velocity.x < -velocityThreshold) && page === 0) {
        newPage = 1;
      } else if ((info.offset.x > threshold || info.velocity.x > velocityThreshold) && page === 1) {
        newPage = 0;
      }

      if (newPage !== page) {
        setPage(newPage);
      } else {
        controls.start({ x: page === 0 ? 0 : -vw });
      }
    },
    [vw, page, controls],
  );

  const templeImageSrc = isDark ? "/templodark.jpg" : "/templo.jpg";

  return (
    <>
      {/* ── Desktop layout (md+) ── */}
      <div className={`hidden md:flex min-h-screen relative ${isDark ? 'bg-[#030014]' : 'bg-slate-50'}`}>
        <div className="absolute inset-0 w-1/2 lg:w-2/5 z-0">
          <MeshGradientBackground
            colors={isDark ? ["#4d7cfe", "#1e3a8a", "#0ea5e9", "#2563eb"] : ["#60a5fa", "#3b82f6", "#93c5fd", "#2563eb"]}
            backgroundColor={isDark ? "#050a15" : "#f8fafc"}
          />
        </div>
        <div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-16 z-10 relative">
          <div className="w-full max-w-sm">
            <div className="mb-10 flex flex-col items-center text-center">
              <AnimatedLogo className={`w-16 h-16 mb-5 ${isDark ? 'text-white' : 'text-[#4d7cfe]'}`} />
              <div className={`text-[18px] tracking-wider mb-2 uppercase whitespace-nowrap font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Bienvenido de nuevo
              </div>
              <p className={`font-inter font-bold text-[13px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Gestión de Voluntarios &bull; Templo de Managua
              </p>
            </div>

            <LoginForm />

            <div className={`mt-10 pt-8 border-t text-center ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <p className={`text-sm font-inter font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                ¿Tienes problemas para ingresar? <br />
                <button className="text-[#0084d1] font-inter font-bold hover:underline mt-1">
                  Contacta a tu coordinador de comité
                </button>
              </p>
              <div className={`mt-4 pt-4 border-t flex items-center justify-center gap-3 text-xs font-inter font-bold ${isDark ? 'border-slate-800/60 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
                <button
                  type="button"
                  onClick={() => setActiveLegalModal('privacy')}
                  className="hover:text-[#4d7cfe] transition-colors cursor-pointer"
                >
                  Política de Privacidad
                </button>
                <span>&bull;</span>
                <button
                  type="button"
                  onClick={() => setActiveLegalModal('terms')}
                  className="hover:text-[#4d7cfe] transition-colors cursor-pointer"
                >
                  Términos de Uso
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="md:w-1/2 lg:w-3/5 relative overflow-hidden bg-black">
          <Image
            src={templeImageSrc}
            alt="Templo de Managua"
            fill
            className="object-cover transition-opacity duration-500"
            priority
          />
          <div className="absolute inset-0 bg-[#0084d1]/10 z-10" />
          <div className="absolute bottom-12 left-12 right-12 z-20">
            <TempleQuoteRotator />
          </div>
        </div>
      </div>

      {/* ── Mobile layout (<md) ── */}
      <div className="md:hidden fixed inset-0 overflow-hidden bg-black select-none">
        <motion.div
          drag="x"
          dragConstraints={{ left: -(vw || 0), right: 0 }}
          dragElastic={0.05}
          dragMomentum={false}
          onDragEnd={onDragEnd}
          animate={controls}
          transition={{ type: "spring", damping: 40, stiffness: 400 }}
          className="flex h-full"
          style={{
            touchAction: "pan-y",
            width: vw ? `${vw * 2}px` : "200%",
          }}
        >
          {/* ── Page 0 — Hero image + quote ── */}
          <div className="relative h-full w-1/2 shrink-0 bg-black touch-pan-y">
            <Image
              src={templeImageSrc}
              alt="Templo de Managua"
              fill
              className="object-cover transition-opacity duration-500"
              priority
            />

            <div className="absolute inset-x-6 bottom-6 z-10">
              <TempleQuoteRotator isMobile />
            </div>

          </div>

          {/* ── Page 1 — Login form ── */}
          <div className={`relative h-full w-1/2 shrink-0 overflow-y-auto touch-pan-y ${isDark ? 'bg-[#050a15]' : 'bg-slate-50'}`}>
            <MeshGradientBackground
              colors={isDark ? ["#4d7cfe", "#1e3a8a", "#0ea5e9", "#2563eb"] : ["#60a5fa", "#3b82f6", "#93c5fd", "#2563eb"]}
              backgroundColor={isDark ? "#050a15" : "#f8fafc"}
            />
            <div className="relative z-10 flex min-h-full flex-col justify-center px-6 py-12">
              <div className="mx-auto w-full max-w-sm">
                <div className="mb-10 flex flex-col items-center text-center">
                  <AnimatedLogo className={`w-14 h-14 mb-4 ${isDark ? 'text-white' : 'text-[#4d7cfe]'}`} />
                  <div className={`text-[16px] tracking-wider mb-1 uppercase whitespace-nowrap font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Bienvenido de nuevo
                  </div>
                  <p className={`font-inter font-bold text-[12px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Gestión de Voluntarios &bull; Templo de Managua
                  </p>
                </div>

                <LoginForm />

                <div className={`mt-10 pt-8 border-t text-center ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                  <p className={`text-sm font-inter font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    ¿Tienes problemas para ingresar? <br />
                    <button className="text-[#0084d1] font-inter font-bold hover:underline mt-1">
                      Contacta a tu coordinador de comité
                    </button>
                  </p>
                  <div className={`mt-4 pt-4 border-t flex items-center justify-center gap-3 text-xs font-inter font-bold ${isDark ? 'border-slate-800/60 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
                    <button
                      type="button"
                      onClick={() => setActiveLegalModal('privacy')}
                      className="hover:text-[#4d7cfe] transition-colors cursor-pointer"
                    >
                      Política de Privacidad
                    </button>
                    <span>&bull;</span>
                    <button
                      type="button"
                      onClick={() => setActiveLegalModal('terms')}
                      className="hover:text-[#4d7cfe] transition-colors cursor-pointer"
                    >
                      Términos de Uso
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Top bar: swipe hint + page dots */}
        <div className="absolute top-6 inset-x-6 z-30 flex items-center justify-between pointer-events-none">
          {page === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: [0, 4, 0] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
              className="flex items-center gap-1"
            >
              <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest">
                Desliza
              </span>
              <span className="material-symbols-outlined text-white/60 text-lg">
                chevron_right
              </span>
            </motion.div>
          )}
          <div className={`flex items-center gap-2 pointer-events-auto ${page === 0 ? "" : "ml-auto"}`}>
            <button
              onClick={() => setPage(0)}
              title="Ver imagen"
              className={`rounded-full transition-all duration-300 focus:outline-none ${page === 0 ? "bg-white w-6 h-2" : "bg-white/30 w-2 h-2"
                }`}
            />
            <button
              onClick={() => setPage(1)}
              title="Iniciar sesión"
              className={`rounded-full transition-all duration-300 focus:outline-none ${page === 1 ? "bg-white w-6 h-2" : "bg-white/30 w-2 h-2"
                }`}
            />
          </div>
        </div>
      </div>

      {/* ── Privacy / Terms Legal Modal ── */}
      <AnimatePresence>
        {activeLegalModal && (
          <PrivacyTermsModal
            activeModal={activeLegalModal}
            onClose={() => setActiveLegalModal(null)}
            isDark={isDark}
          />
        )}
      </AnimatePresence>
    </>
  );
}
