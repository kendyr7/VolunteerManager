'use client'

import { useState, useEffect } from "react";
import { Save, Users, Plus, Minus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COMMITTEES = ['Historia', 'Seguridad', 'Guía', 'Traducción', 'Transporte', 'Primeros Auxilios'];

const DEFAULT_COMMITTEE_REQUIREMENTS: Record<string, Record<string, number>> = {
  'Historia': { T1: 3, T2: 2, T3: 3, T4: 2 },
  'Seguridad': { T1: 4, T2: 4, T3: 4, T4: 4 },
  'Guía': { T1: 5, T2: 5, T3: 5, T4: 5 },
  'Traducción': { T1: 2, T2: 1, T3: 2, T4: 1 },
  'Transporte': { T1: 3, T2: 2, T3: 3, T4: 2 },
  'Primeros Auxilios': { T1: 2, T2: 2, T3: 2, T4: 2 }
};

export default function SettingsPage() {
  const [selectedCommittee, setSelectedCommittee] = useState<string>('Historia');
  const [capacities, setCapacities] = useState({
    T1: 3,
    T2: 2,
    T3: 3,
    T4: 2,
  });

  const [isSaving, setIsSaving] = useState(false);

  // Load capacities when committee changes or component mounts
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("committee_requirements");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed[selectedCommittee]) {
            setCapacities(parsed[selectedCommittee]);
            return;
          }
        } catch (e) {
          console.error("Error parsing committee requirements", e);
        }
      }
      // Fallback to default
      setCapacities(DEFAULT_COMMITTEE_REQUIREMENTS[selectedCommittee] || { T1: 5, T2: 5, T3: 5, T4: 5 });
    }
  }, [selectedCommittee]);

  const handleSave = () => {
    setIsSaving(true);
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("committee_requirements");
      let currentRequirements: Record<string, any> = { ...DEFAULT_COMMITTEE_REQUIREMENTS };
      if (stored) {
        try {
          currentRequirements = JSON.parse(stored);
        } catch (e) {
          console.error("Error parsing existing requirements", e);
        }
      }
      currentRequirements[selectedCommittee] = capacities;
      localStorage.setItem("committee_requirements", JSON.stringify(currentRequirements));
    }

    setTimeout(() => {
      setIsSaving(false);
      alert(`Cupos para el comité "${selectedCommittee}" actualizados correctamente`);
    }, 800);
  };

  const updateCapacity = (shiftId: "T1" | "T2" | "T3" | "T4", increment: number) => {
    setCapacities(prev => ({
      ...prev,
      [shiftId]: Math.max(0, prev[shiftId] + increment)
    }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-display-md text-text tracking-tight mb-1">Configuración del Comité</h2>
        <p className="text-body-md text-muted">Ajusta los cupos y parámetros de tu comité.</p>
      </div>

      <div className="card-premium">
        <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-gold" />
              <h3 className="text-title-md text-text">Cupos por Turno</h3>
            </div>
            <p className="text-body-sm text-muted">
              Define la cantidad de voluntarios requeridos para cada turno. Esto afectará el semáforo de riesgo y el límite de inscripciones.
            </p>
          </div>
          <div className="w-full md:w-56 shrink-0">
            <label className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-1.5">Comité a Configurar</label>
            <Select value={selectedCommittee} onValueChange={setSelectedCommittee}>
              <SelectTrigger className="w-full bg-dark text-text border-border h-10">
                <SelectValue placeholder="Selecciona un comité" />
              </SelectTrigger>
              <SelectContent className="bg-dark2 text-text border-border">
                {COMMITTEES.map(c => (
                  <SelectItem key={c} value={c} className="hover:bg-dark3 focus:bg-dark3">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            <div className="p-4 rounded-xl border border-border bg-dark flex flex-col gap-3">
              <label className="text-body-sm font-medium text-text block">Turno 1 (8:00 AM - 12:00 PM)</label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-dark2 border border-border rounded-lg p-1 shadow-sm">
                  <button 
                    onClick={() => updateCapacity("T1", -1)}
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-dark3 text-muted hover:text-text transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="w-12 text-center font-mono text-text font-medium">
                    {capacities.T1}
                  </div>
                  <button 
                    onClick={() => updateCapacity("T1", 1)}
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-dark3 text-muted hover:text-text transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-body-sm text-muted">voluntarios</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-dark flex flex-col gap-3">
              <label className="text-body-sm font-medium text-text block">Turno 2 (11:00 AM - 3:00 PM)</label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-dark2 border border-border rounded-lg p-1 shadow-sm">
                  <button 
                    onClick={() => updateCapacity("T2", -1)}
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-dark3 text-muted hover:text-text transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="w-12 text-center font-mono text-text font-medium">
                    {capacities.T2}
                  </div>
                  <button 
                    onClick={() => updateCapacity("T2", 1)}
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-dark3 text-muted hover:text-text transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-body-sm text-muted">voluntarios</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-dark flex flex-col gap-3">
              <label className="text-body-sm font-medium text-text block">Turno 3 (2:00 PM - 6:00 PM)</label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-dark2 border border-border rounded-lg p-1 shadow-sm">
                  <button 
                    onClick={() => updateCapacity("T3", -1)}
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-dark3 text-muted hover:text-text transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="w-12 text-center font-mono text-text font-medium">
                    {capacities.T3}
                  </div>
                  <button 
                    onClick={() => updateCapacity("T3", 1)}
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-dark3 text-muted hover:text-text transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-body-sm text-muted">voluntarios</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-dark flex flex-col gap-3">
              <label className="text-body-sm font-medium text-text block">Turno 4 (5:00 PM - 10:00 PM)</label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-dark2 border border-border rounded-lg p-1 shadow-sm">
                  <button 
                    onClick={() => updateCapacity("T4", -1)}
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-dark3 text-muted hover:text-text transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="w-12 text-center font-mono text-text font-medium">
                    {capacities.T4}
                  </div>
                  <button 
                    onClick={() => updateCapacity("T4", 1)}
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-dark3 text-muted hover:text-text transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-body-sm text-muted">voluntarios</span>
              </div>
            </div>
            
          </div>
        </div>

        <div className="p-6 border-t border-border flex justify-end">
          <button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="btn-base btn-primary w-full sm:w-auto"
          >
            {isSaving ? "Guardando..." : (
              <>
                <Save className="h-4 w-4" />
                Guardar Configuración
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
