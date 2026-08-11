"use client";

import React, { useState, useEffect } from 'react';
import { notFound } from 'next/navigation';
import { AdminCreateSessionModal } from '@/components/AdminCreateSessionModal';
import { AdminSessionCorrectionModal } from '@/components/AdminSessionCorrectionModal';
import { Button } from '@/components/ui/button';

export default function DevAttendanceModalsHarnessPage() {
  // Protect route: dev mode only
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  useEffect(() => {
    // Ensure mock_role is Admin in client localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('mock_role', 'Admin');
    }
  }, []);

  // Modal visibility states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);

  // Active scenario data for Create Modal
  const [createModalProps, setCreateModalProps] = useState<{
    volunteerId: string;
    volunteerName: string;
    assignedShiftRecords: { day_key: string; shift_key: string }[];
    initialDayKey: string;
  }>({
    volunteerId: 'mock-vol-1',
    volunteerName: 'María Fernanda de los Ángeles Hernández González',
    assignedShiftRecords: [
      { day_key: 'vie 11', shift_key: 'T2' },
      { day_key: 'vie 11', shift_key: 'T4' }
    ],
    initialDayKey: 'vie 11'
  });

  // Active scenario data for Correction Modal
  const [correctionModalProps, setCorrectionModalProps] = useState<{
    session: any;
    volunteerName: string;
    assignedShiftKeys: string[];
  }>({
    session: {
      id: 'mock-session-1',
      volunteer_id: 'mock-vol-1',
      day_key: 'vie 11',
      started_at: '2026-09-11T16:58:00.000Z', // 10:58 AM
      ended_at: null,
      status: 'open',
      auto_closed: false
    },
    volunteerName: 'María Fernanda de los Ángeles Hernández González',
    assignedShiftKeys: ['T2', 'T4']
  });

  // Toast feedback state for zero-persistence actions
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showMockToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Launch handlers for the 4 explicit scenarios
  const launchScenario1 = () => {
    setCreateModalProps({
      volunteerId: 'vol-scen-1',
      volunteerName: 'María Fernanda de los Ángeles Hernández González',
      assignedShiftRecords: [
        { day_key: 'vie 11', shift_key: 'T2' },
        { day_key: 'vie 11', shift_key: 'T4' }
      ],
      initialDayKey: 'vie 11'
    });
    setIsCreateModalOpen(true);
  };

  const launchScenario2 = () => {
    setCreateModalProps({
      volunteerId: 'vol-scen-2',
      volunteerName: 'Carlos Alberto Mendoza Silva',
      assignedShiftRecords: [
        { day_key: 'sáb 12', shift_key: 'T1' },
        { day_key: 'sáb 12', shift_key: 'T2' },
        { day_key: 'sáb 12', shift_key: 'T3' }
      ],
      initialDayKey: 'sáb 12'
    });
    setIsCreateModalOpen(true);
  };

  const launchScenario3 = () => {
    setCorrectionModalProps({
      session: {
        id: 'mock-late-scan-sess',
        volunteer_id: 'vol-scen-3',
        day_key: 'vie 11',
        started_at: '2026-09-11T21:03:00.000Z', // 3:03 PM late scan
        ended_at: null,
        status: 'open',
        auto_closed: false
      },
      volunteerName: 'Ana Lucía Rodríguez Valle',
      assignedShiftKeys: ['T2']
    });
    setIsCorrectionModalOpen(true);
  };

  const launchScenario4 = () => {
    setCorrectionModalProps({
      session: {
        id: 'mock-forgotten-exit-sess',
        volunteer_id: 'vol-scen-4',
        day_key: 'vie 11',
        started_at: '2026-09-11T16:58:00.000Z', // 10:58 AM
        ended_at: null,
        status: 'open',
        auto_closed: false
      },
      volunteerName: 'María Fernanda de los Ángeles Hernández González',
      assignedShiftKeys: ['T2', 'T4']
    });
    setIsCorrectionModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="p-5 rounded-3xl bg-card border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-wider">
              DEV / MOCK HARNESS
            </span>
            <span className="text-xs font-bold text-primary">0 Persistencia en Supabase</span>
          </div>
          <h1 className="text-xl font-black mt-1">Harness Visual: Modales de Asistencia</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Prueba responsive (375px / 768px / 1280px+) y auditoría visual de modales sin afectar la BD.
          </p>
        </div>
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center justify-between animate-in fade-in shadow-md">
          <span>{toastMessage}</span>
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
        </div>
      )}

      {/* Scenarios Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        
        {/* Scenario 1 */}
        <div className="p-5 rounded-3xl bg-card border border-border space-y-3 flex flex-col justify-between shadow-sm hover:border-border-strong transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#4d7cfe]">ESCENARIO 1</span>
              <span className="text-[10px] text-text-dim font-mono">Nombre Largo + 2 Bloques</span>
            </div>
            <h3 className="font-bold text-sm text-text mt-1">María Fernanda de los Ángeles...</h3>
            <p className="text-xs text-text-dim mt-1 leading-relaxed">
              Turnos asignados: <strong>T2 (11-15) + T4 (17-22)</strong> en vie 11.
            </p>
          </div>
          <button
            onClick={launchScenario1}
            className="min-h-[44px] w-full py-2.5 px-4 rounded-2xl bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">more_time</span>
            Probar Entrada Olvidada (2 Bloques)
          </button>
        </div>

        {/* Scenario 2 */}
        <div className="p-5 rounded-3xl bg-card border border-border space-y-3 flex flex-col justify-between shadow-sm hover:border-border-strong transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#4d7cfe]">ESCENARIO 2</span>
              <span className="text-[10px] text-text-dim font-mono">1 Bloque Continuo (T1+T2+T3)</span>
            </div>
            <h3 className="font-bold text-sm text-text mt-1">Carlos Alberto Mendoza Silva</h3>
            <p className="text-xs text-text-dim mt-1 leading-relaxed">
              Turnos continuos: <strong>T1 + T2 + T3 (7:00 AM – 6:00 PM)</strong> en sáb 12.
            </p>
          </div>
          <button
            onClick={launchScenario2}
            className="min-h-[44px] w-full py-2.5 px-4 rounded-2xl bg-[#4d7cfe] hover:bg-[#3b66e0] text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">more_time</span>
            Probar Entrada Olvidada (Continuo)
          </button>
        </div>

        {/* Scenario 3 */}
        <div className="p-5 rounded-3xl bg-card border border-border space-y-3 flex flex-col justify-between shadow-sm hover:border-border-strong transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-amber-400">ESCENARIO 3</span>
              <span className="text-[10px] text-text-dim font-mono">Escaneo Tardío de Salida</span>
            </div>
            <h3 className="font-bold text-sm text-text mt-1">Ana Lucía Rodríguez Valle</h3>
            <p className="text-xs text-text-dim mt-1 leading-relaxed">
              Sesión OPEN iniciada por escaneo a las 3:03 PM en T2 (11-15).
            </p>
          </div>
          <button
            onClick={launchScenario3}
            className="min-h-[44px] w-full py-2.5 px-4 rounded-2xl bg-surface border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px] text-amber-400">edit_calendar</span>
            Probar Corrección Escaneo Tardío
          </button>
        </div>

        {/* Scenario 4 */}
        <div className="p-5 rounded-3xl bg-card border border-border space-y-3 flex flex-col justify-between shadow-sm hover:border-border-strong transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#4d7cfe]">ESCENARIO 4</span>
              <span className="text-[10px] text-text-dim font-mono">Salida Olvidada</span>
            </div>
            <h3 className="font-bold text-sm text-text mt-1">María Fernanda de los Ángeles...</h3>
            <p className="text-xs text-text-dim mt-1 leading-relaxed">
              Entrada a las 10:58 AM, salida vacía. Sugiere fin oficial a las 3:00 PM.
            </p>
          </div>
          <button
            onClick={launchScenario4}
            className="min-h-[44px] w-full py-2.5 px-4 rounded-2xl bg-surface border border-border text-text hover:bg-surface-hover font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
            Probar Corregir Salida Olvidada
          </button>
        </div>

      </div>

      {/* Manual Checklist UI */}
      <div className="p-6 rounded-3xl bg-card border border-border space-y-4">
        <h2 className="text-base font-extrabold text-text flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-400">checklist</span>
          Checklist Visual Manual de Inspección
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* 375px */}
          <div className="p-4 rounded-2xl bg-surface border border-border space-y-2">
            <span className="font-black text-amber-400 block border-b border-border pb-1">375px (Móvil)</span>
            <ul className="space-y-1.5 text-text-dim font-medium">
              <li>☐ Sin overflow horizontal (no scroll en X)</li>
              <li>☐ Tarjetas de bloques dispuestas en 1 columna</li>
              <li>☐ Botones principales min 44px de alto</li>
              <li>☐ Scroll vertical de modal funcional</li>
              <li>☐ Nombre largo hace wrap adecuadamente</li>
              <li>☐ Botón Confirmar alcanzable con scroll</li>
              <li>☐ Teclado móvil no oculta inputs/botones</li>
            </ul>
          </div>

          {/* 768px */}
          <div className="p-4 rounded-2xl bg-surface border border-border space-y-2">
            <span className="font-black text-amber-400 block border-b border-border pb-1">768px (Tablet)</span>
            <ul className="space-y-1.5 text-text-dim font-medium">
              <li>☐ Grid de bloques en 2 columnas</li>
              <li>☐ Campos legibles y no demasiado estrechos</li>
              <li>☐ Sin clipping de texto ni títulos</li>
              <li>☐ Acciones dispuestas cómodamente</li>
            </ul>
          </div>

          {/* 1280px */}
          <div className="p-4 rounded-2xl bg-surface border border-border space-y-2">
            <span className="font-black text-amber-400 block border-b border-border pb-1">1280px (Desktop)</span>
            <ul className="space-y-1.5 text-text-dim font-medium">
              <li>☐ Modal centrado flotante</li>
              <li>☐ Ancho máximo balanceado (512px)</li>
              <li>☐ Acciones principales visibles en fila</li>
              <li>☐ Botón X de cierre visible y funcional</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Render Modals with Mock Callbacks and isMockMode enabled */}
      {isCreateModalOpen && (
        <AdminCreateSessionModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          volunteerId={createModalProps.volunteerId}
          volunteerName={createModalProps.volunteerName}
          assignedShiftRecords={createModalProps.assignedShiftRecords}
          initialDayKey={createModalProps.initialDayKey}
          isMockMode={true}
          onSuccess={() => {
            showMockToast('✓ MOCK: Entrada/jornada registrada visualmente (0 escrituras en Supabase).');
          }}
        />
      )}

      {isCorrectionModalOpen && (
        <AdminSessionCorrectionModal
          isOpen={isCorrectionModalOpen}
          onClose={() => setIsCorrectionModalOpen(false)}
          session={correctionModalProps.session}
          volunteerName={correctionModalProps.volunteerName}
          assignedShiftKeys={correctionModalProps.assignedShiftKeys}
          isMockMode={true}
          onSuccess={() => {
            showMockToast('✓ MOCK: Corrección de salida registrada visualmente (0 escrituras en Supabase).');
          }}
        />
      )}

    </div>
  );
}
