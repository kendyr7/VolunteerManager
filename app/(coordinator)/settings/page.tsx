'use client'

import { useState } from "react";
import { Save, Users, Plus, Minus } from "lucide-react";

export default function SettingsPage() {
  const [capacities, setCapacities] = useState({
    T1: 42,
    T2: 42,
    T3: 42,
    T4: 42,
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    // Simular guardado
    setTimeout(() => {
      setIsSaving(false);
      alert("Cupos actualizados correctamente");
    }, 800);
  };

  const updateCapacity = (shiftId: keyof typeof capacities, increment: number) => {
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
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-5 w-5 text-gold" />
            <h3 className="text-title-md text-text">Cupos por Turno</h3>
          </div>
          <p className="text-body-sm text-muted">
            Define la cantidad de voluntarios requeridos para cada turno. Esto afectará el semáforo de riesgo en tu Dashboard y el límite de inscripciones para los voluntarios.
          </p>
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
