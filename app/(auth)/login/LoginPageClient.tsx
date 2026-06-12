"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { LoginForm } from "./LoginForm";
import { motion, useAnimation } from "framer-motion";

export function LoginPageClient() {
  const [page, setPage] = useState(0);
  const [vw, setVw] = useState(0);
  const controls = useAnimation();

  useEffect(() => {
    setVw(window.innerWidth);
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

  return (
    <>
      {/* ── Desktop layout (md+) ── */}
      <div className="hidden md:flex min-h-screen bg-white">
        <div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-16 z-10 bg-white">
          <div className="w-full max-w-sm">
            <div className="mb-10">
              <h1 className="text-3xl tracking-tight text-slate-900 mb-2 flex items-center gap-3">
                <Image
                  src="/icon-192.png"
                  alt="Templo Managua"
                  width={32}
                  height={32}
                  className="object-contain"
                />
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

        <div className="md:w-1/2 lg:w-3/5 relative overflow-hidden">
          <div className="absolute inset-0 bg-[#0084d1]/10 z-10" />
          <div className="absolute bottom-12 left-12 right-12 z-20 text-white">
            <div className="backdrop-blur-md bg-black/20 p-8 rounded-sm border border-white/20 shadow-2xl">
              <h2 className="tracking-tight mb-4 text-white">
                &ldquo;El servicio es el lenguaje del amor en acción.&rdquo;
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
          <div className="relative h-full w-1/2 shrink-0">
            <Image
              src="/templo.jpg"
              alt="Templo de Managua"
              fill
              className="object-cover"
              priority
            />

            <div className="absolute inset-x-6 bottom-6 z-10">
              <div className="backdrop-blur-md bg-black/20 p-5 rounded-sm border border-white/20 shadow-2xl">
                <h2 className="text-white text-lg font-bold tracking-tight leading-tight">
                  &ldquo;El servicio es el lenguaje del amor en acción.&rdquo;
                </h2>
                <div className="flex items-center gap-3 mt-3">
                  <div className="h-px w-6 bg-white/50" />
                  <p className="text-white/70 font-bold uppercase tracking-widest text-[11px]">
                    Puertas Abiertas 2026
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* ── Page 1 — Login form ── */}
          <div className="relative h-full w-1/2 shrink-0 overflow-y-auto bg-white">
            <div className="flex min-h-full flex-col justify-center px-6 py-12">
              <div className="mx-auto w-full max-w-sm">
                <div className="mb-10">
                  <h1 className="text-2xl tracking-tight text-slate-900 mb-1 flex items-center gap-3">
                    <Image
                      src="/icon-192.png"
                      alt="Templo Managua"
                      width={28}
                      height={28}
                      className="object-contain"
                    />
                    Bienvenido de nuevo
                  </h1>
                  <p className="text-slate-500 text-sm font-medium">
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
          <div className={`flex items-center gap-2 ${page === 0 ? "" : "ml-auto"}`}>
            <div
              className={`rounded-full transition-all duration-300 ${
                page === 0 ? "bg-white w-6 h-2" : "bg-white/30 w-2 h-2"
              }`}
            />
            <div
              className={`rounded-full transition-all duration-300 ${
                page === 1 ? "bg-white w-6 h-2" : "bg-white/30 w-2 h-2"
              }`}
            />
          </div>
        </div>
      </div>
    </>
  );
}
