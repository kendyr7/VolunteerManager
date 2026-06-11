'use client'

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generatePinMessage, generateWaMeLink } from "@/lib/whatsapp";
import { motion, AnimatePresence } from "framer-motion";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 400,
      damping: 30
    }
  }
};

const COMMITTEES = ['Historia', 'Seguridad', 'Guía', 'Traducción', 'Transporte', 'Primeros Auxilios'];

type ShiftCapacities = { T1: number; T2: number; T3: number; T4: number; };

const DEFAULT_COMMITTEE_REQUIREMENTS: Record<string, ShiftCapacities> = {
  'Historia': { T1: 3, T2: 2, T3: 3, T4: 2 },
  'Seguridad': { T1: 4, T2: 4, T3: 4, T4: 4 },
  'Guía': { T1: 5, T2: 5, T3: 5, T4: 5 },
  'Traducción': { T1: 2, T2: 1, T3: 2, T4: 1 },
  'Transporte': { T1: 3, T2: 2, T3: 3, T4: 2 },
  'Primeros Auxilios': { T1: 2, T2: 2, T3: 2, T4: 2 }
};

// ─── Types ────────────────────────────────────────────────────────────────────
type FieldErrors = Partial<Record<'firstName' | 'lastName' | 'ward' | 'stake' | 'phone' | 'age', string>>;

interface ParsedRow {
  id: number;
  firstName: string;
  lastName: string;
  age: string;
  ward: string;
  stake: string;
  phone: string;
  errors: FieldErrors;
  rawLine: string;
  pin?: string;
  waLink?: string;
}

type Tab = 'config' | 'import';

// ─── Validators ───────────────────────────────────────────────────────────────
function validateRow(row: Omit<ParsedRow, 'errors' | 'id' | 'rawLine' | 'pin' | 'waLink'>): FieldErrors {
  const errors: FieldErrors = {};
  if (!row.firstName.trim()) errors.firstName = "Nombre requerido";
  else if (row.firstName.trim().length < 2) errors.firstName = "Demasiado corto";
  if (!row.lastName.trim()) errors.lastName = "Apellido requerido";
  if (!row.ward.trim()) errors.ward = "Barrio requerido";
  if (!row.stake.trim()) errors.stake = "Estaca requerida";
  if (!row.phone.trim()) errors.phone = "Teléfono requerido";
  else if (!/^\d{7,8}$/.test(row.phone.replace(/\s/g, ''))) errors.phone = "Debe ser 7–8 dígitos";
  if (row.age && !/^\d+$/.test(row.age.trim())) errors.age = "Debe ser un número";
  else if (row.age && (parseInt(row.age) < 14 || parseInt(row.age) > 100)) errors.age = "Edad fuera de rango";
  return errors;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor' | 'Lector'>('Admin');
  const [selectedCommittee, setSelectedCommittee] = useState<string>('Historia');

  useEffect(() => {
    const role = localStorage.getItem('mock_role') as any;
    const comm = localStorage.getItem('mock_committee');
    if (role) setCurrentRole(role);
    if (comm && role !== 'Admin') setSelectedCommittee(comm);
  }, []);

  // ─── Config state ─────────────────────────────────────────────────────────
  const [capacities, setCapacities] = useState<ShiftCapacities>({ T1: 3, T2: 2, T3: 3, T4: 2 });
  const [isSaving, setIsSaving] = useState(false);
  const [linkAll, setLinkAll] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("committee_requirements");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed[selectedCommittee]) { setCapacities(parsed[selectedCommittee]); return; }
        } catch (e) { /* ignore */ }
      }
      setCapacities(DEFAULT_COMMITTEE_REQUIREMENTS[selectedCommittee] || { T1: 5, T2: 5, T3: 5, T4: 5 });
    }
  }, [selectedCommittee]);

  const handleSave = () => {
    setIsSaving(true);
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("committee_requirements");
      let current: Record<string, ShiftCapacities> = { ...DEFAULT_COMMITTEE_REQUIREMENTS };
      if (stored) { try { current = JSON.parse(stored); } catch (e) { /* ignore */ } }
      current[selectedCommittee] = capacities;
      localStorage.setItem("committee_requirements", JSON.stringify(current));
    }
    setTimeout(() => setIsSaving(false), 800);
  };

  const updateCapacity = (shiftId: "T1" | "T2" | "T3" | "T4", increment: number) => {
    if (linkAll) {
      const newVal = Math.max(0, capacities[shiftId] + increment);
      setCapacities({ T1: newVal, T2: newVal, T3: newVal, T4: newVal });
    } else {
      setCapacities(prev => ({ ...prev, [shiftId]: Math.max(0, prev[shiftId] + increment) }));
    }
  };

  // ─── Permissions state ────────────────────────────────────────────────────
  const ROLES = ['Admin', 'Editor', 'Lector'] as const;
  type Role = typeof ROLES[number];
  type Permission = 'Ver voluntarios' | 'Editar turnos' | 'Enviar mensajes' | 'Ver reportes' | 'Importar datos' | 'Configurar ajustes';
  const ALL_PERMISSIONS: Permission[] = ['Ver voluntarios', 'Editar turnos', 'Enviar mensajes', 'Ver reportes', 'Importar datos', 'Configurar ajustes'];

  const ROLE_DESCRIPTIONS: Record<Role, string> = {
    'Admin':  'Acceso total — no restringible',
    'Editor': 'Coordinadores con acceso operacional',
    'Lector': 'Voluntarios con acceso de solo lectura',
  };

  const [permissions, setPermissions] = useState<Record<Role, Record<Permission, boolean>>>({
    'Admin':  { 'Ver voluntarios': true,  'Editar turnos': true,  'Enviar mensajes': true,  'Ver reportes': true,  'Importar datos': true,  'Configurar ajustes': true  },
    'Editor': { 'Ver voluntarios': true,  'Editar turnos': true,  'Enviar mensajes': true,  'Ver reportes': true,  'Importar datos': false, 'Configurar ajustes': false },
    'Lector': { 'Ver voluntarios': true,  'Editar turnos': false, 'Enviar mensajes': false, 'Ver reportes': false, 'Importar datos': false, 'Configurar ajustes': false },
  });
  const togglePermission = (role: Role, perm: Permission) => {
    if (role === 'Admin') return; // Admin is always full access
    setPermissions(prev => ({ ...prev, [role]: { ...prev[role], [perm]: !prev[role][perm] } }));
  };

  // ─── Import state ─────────────────────────────────────────────────────────
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<ParsedRow>>({});

  const errorCount = rows.filter(r => Object.keys(r.errors).length > 0).length;
  const validCount = rows.length - errorCount;

  const handleParse = () => {
    const lines = csvText.split('\n').filter(l => l.trim() !== '');
    const parsed: ParsedRow[] = lines.map((line, i) => {
      const parts = line.split(',');
      const fields = {
        firstName: parts[0]?.trim() || '',
        lastName: parts[1]?.trim() || '',
        age: parts[2]?.trim() || '',
        ward: parts[3]?.trim() || '',
        stake: parts[4]?.trim() || '',
        phone: parts[5]?.trim() || '',
      };
      return { id: i, ...fields, errors: validateRow(fields), rawLine: line };
    });
    setRows(parsed);
    setImportStep(2);
  };

  const startEdit = (row: ParsedRow) => {
    setEditingRowId(row.id);
    setEditValues({ firstName: row.firstName, lastName: row.lastName, age: row.age, ward: row.ward, stake: row.stake, phone: row.phone });
  };

  const saveEdit = (id: number) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, ...editValues } as ParsedRow;
      return { ...updated, errors: validateRow(updated) };
    }));
    setEditingRowId(null);
  };

  const removeRow = (id: number) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleImport = () => {
    const finalRows = rows
      .filter(r => Object.keys(r.errors).length === 0)
      .map(vol => {
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        const message = generatePinMessage(`${vol.firstName} ${vol.lastName}`, pin, "https://app.templomanagua.org");
        const waLink = generateWaMeLink(vol.phone, message);
        return { ...vol, pin, waLink };
      });
    setRows(finalRows);
    setImportStep(3);
  };

  const resetImport = () => { setCsvText(""); setRows([]); setImportStep(1); setEditingRowId(null); };

  const SHIFT_LABELS = [
    { id: "T1" as const, label: "Turno 1", time: "8:00 AM – 12:00 PM" },
    { id: "T2" as const, label: "Turno 2", time: "11:00 AM – 3:00 PM" },
    { id: "T3" as const, label: "Turno 3", time: "2:00 PM – 6:00 PM" },
    { id: "T4" as const, label: "Turno 4", time: "5:00 PM – 10:00 PM" },
  ];

  const FIELD_LABELS: Record<string, string> = {
    firstName: 'Nombre', lastName: 'Apellido', age: 'Edad', ward: 'Barrio', stake: 'Estaca', phone: 'Teléfono'
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-6xl mx-auto space-y-10 pb-12"
    >
      {/* Header Refinado */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-slate-200/60">
        <div className="space-y-1.5">
          <p className="text-base font-medium text-slate-500">Configuración técnica y gestión de datos maestros del evento.</p>
        </div>
      </motion.div>

      {/* Tabs con Motion */}
      <motion.div variants={itemVariants} className="flex gap-1 p-1 bg-slate-100 border border-slate-200 rounded-sm w-fit">
        {([
          { key: 'config' as Tab, label: 'Configuración', symbol: 'group' },
          { key: 'import' as Tab, label: 'Importación Masiva', symbol: 'upload' },
        ] as const).map(({ key, label, symbol }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-sm text-sm font-bold transition-all active:scale-[0.97] ${
              activeTab === key ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'
            }`}>
            <span className="material-symbols-outlined text-[18px]">{symbol}</span>
            {label}
          </button>
        ))}
      </motion.div>

      {/* ── Tab: Configuración ───────────────────────────────────────────────── */}
      {activeTab === 'config' && (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm">
          <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[20px] text-[#0084d1]">group</span>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">Cupos por Turno</h3>
              </div>
              <p className="text-sm font-medium text-slate-500">
                Define la cantidad mínima de voluntarios requeridos. Afecta el semáforo de riesgo en Turnos y Avisos.
              </p>
            </div>
            
            <div className="w-full lg:w-auto shrink-0">
              {currentRole === 'Admin' ? (
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-2">Seleccionar Comité</label>
                  <div className="flex flex-wrap gap-2">
                    {COMMITTEES.map(c => (
                      <button
                        key={c}
                        onClick={() => setSelectedCommittee(c)}
                        className={`px-3.5 py-1.5 rounded-sm text-xs font-bold transition-all border ${
                          selectedCommittee === c 
                            ? 'bg-[#0084d1]/10 border-[#0084d1]/30 text-[#0084d1]' 
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="inline-block bg-slate-50 px-4 py-2 rounded-sm border border-slate-200">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-0.5">Comité Asignado</label>
                  <span className="text-sm font-bold text-slate-800">{selectedCommittee}</span>
                </div>
              )}
            </div>
          </div>
          {/* Sync toggle */}
          <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Mínimos Requeridos</span>
            <button
              onClick={() => setLinkAll(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-bold border transition-all shadow-sm ${
                linkAll
                  ? 'bg-[#0084d1]/10 border-[#0084d1]/30 text-[#0084d1]'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              {linkAll ? <span className="material-symbols-outlined text-[16px]">link</span> : <span className="material-symbols-outlined text-[16px]">link_off</span>}
              {linkAll ? 'Edición Sincronizada' : 'Edición Individual'}
            </button>
          </div>

          {/* Grid Layout */}
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {SHIFT_LABELS.map(({ id, label, time }) => (
                <div key={id} className="flex flex-col p-4 rounded-sm border border-slate-200 bg-white shadow-sm hover:border-[#0084d1]/40 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-bold text-slate-800 tracking-tight">{label}</span>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{time}</span>
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Voluntarios</span>
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-sm p-1">
                      <button onClick={() => updateCapacity(id, -1)} className="h-7 w-7 flex items-center justify-center rounded-sm bg-white border border-slate-200 shadow-sm hover:bg-slate-100 text-slate-600 transition-colors">
                        <span className="material-symbols-outlined text-[16px]">remove</span>
                      </button>
                      <div className="w-10 text-center font-mono text-slate-800 font-bold text-lg leading-none">{capacities[id]}</div>
                      <button onClick={() => updateCapacity(id, 1)} className="h-7 w-7 flex items-center justify-center rounded-sm bg-white border border-slate-200 shadow-sm hover:bg-slate-100 text-slate-600 transition-colors">
                        <span className="material-symbols-outlined text-[16px]">add</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 pb-5 border-t border-slate-200 pt-4 flex justify-end">
            <button onClick={handleSave} disabled={isSaving} className="btn-base bg-[#0084d1] hover:bg-[#006eb3] text-white w-full sm:w-auto">
              {isSaving ? "Guardando..." : (<><span className="material-symbols-outlined text-[18px]">save</span>Guardar Configuración</>)}
            </button>
          </div>
        </div>
      )}

      {/* ── Permissions Section ─────────────────────────────────────────────── */}
      {activeTab === 'config' && currentRole === 'Admin' && (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#0084d1]">verified_user</span>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-slate-800">Permisos por Rol</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Define qué puede hacer cada tipo de usuario en la plataforma.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Permiso</th>
                  {ROLES.map(role => (
                    <th key={role} className="px-4 py-3 text-center">
                      <p className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">{role}</p>
                      <p className="text-[9px] text-slate-500 font-normal normal-case tracking-normal mt-0.5 hidden sm:block">{ROLE_DESCRIPTIONS[role]}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ALL_PERMISSIONS.map(perm => (
                  <tr key={perm} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm text-slate-800 font-medium">{perm}</td>
                    {ROLES.map(role => {
                      const isLocked = role === 'Admin';
                      const isOn = permissions[role][perm];
                      return (
                        <td key={role} className="px-4 py-3 text-center">
                          <button
                            onClick={() => togglePermission(role, perm)}
                            disabled={isLocked}
                            title={isLocked ? 'El rol Admin siempre tiene acceso completo' : undefined}
                            className={`w-9 h-5 rounded-full transition-all relative ${
                              isOn ? 'bg-accent' : 'bg-slate-100 border border-slate-200'
                            } ${isLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                              isOn ? 'left-[18px]' : 'left-0.5'
                            }`} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-slate-200 flex justify-end">
            <button className="btn-base bg-[#0084d1] hover:bg-[#006eb3] text-white w-full sm:w-auto">
              <span className="material-symbols-outlined text-[18px]">save</span>Guardar Permisos
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Importación Masiva ──────────────────────────────────────────── */}
      {activeTab === 'import' && (
        <div className="space-y-4">
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {[
              { n: 1, label: 'Pegar datos' },
              { n: 2, label: 'Revisar & corregir' },
              { n: 3, label: 'Enviar PINs' },
            ].map(({ n, label }, i, arr) => (
              <div key={n} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 ${importStep >= n ? 'text-slate-800' : 'text-slate-500'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all ${
                    importStep > n ? 'bg-accent border-accent text-white'
                    : importStep === n ? 'bg-[#0084d1] border-[#0084d1] text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    {importStep > n ? <span className="material-symbols-outlined text-[14px]">check_circle</span> : n}
                  </div>
                  <span className="text-xs font-semibold hidden sm:block">{label}</span>
                </div>
                {i < arr.length - 1 && <div className="w-8 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>

          {/* ── Step 1: CSV Input ─────────────────────────────────────────── */}
          {importStep === 1 && (
            <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[20px] text-[#0084d1]">description</span>
                  <h3 className="text-lg font-bold tracking-tight text-slate-800">Pegar datos CSV</h3>
                </div>
                <p className="text-xs font-medium text-slate-500 mb-3">Una fila por voluntario, campos separados por coma:</p>
                <code className="block text-[11px] font-mono bg-white border border-slate-200 text-slate-500 px-3 py-2 rounded-sm">
                  Nombre, Apellido, Edad, Barrio, Estaca, Teléfono
                </code>
              </div>
              <div className="p-6 space-y-4">
                <textarea
                  className="w-full h-52 p-4 rounded-sm border border-slate-200 bg-white text-slate-800 font-mono text-sm focus:ring-2 focus:ring-primary-cta/40 outline-none transition-all resize-none placeholder:text-slate-500"
                  placeholder={"Juan, Pérez, 35, Las Colinas, Managua Sur, 88881111\nMaría, García, 28, El Dorado, Managua Este, 88882222"}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-slate-500">
                    {csvText.trim()
                      ? `${csvText.split('\n').filter(l => l.trim()).length} filas detectadas`
                      : 'Sin datos aún'}
                  </p>
                  <Button onClick={handleParse} disabled={!csvText.trim()} className="bg-[#0084d1] hover:bg-[#006eb3] text-white">
                    <span className="material-symbols-outlined text-[18px] mr-2">description</span>
                    Procesar y Validar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview + Errors ──────────────────────────────────── */}
          {importStep === 2 && (
            <div className="space-y-3">
              {/* Summary banner */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded-sm border text-sm font-semibold ${
                errorCount > 0
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-teal-50 border-teal-200 text-teal-700'
              }`}>
                {errorCount > 0
                  ? <span className="material-symbols-outlined text-[18px] shrink-0">warning</span>
                  : <span className="material-symbols-outlined text-[18px] shrink-0">check_circle</span>
                }
                <span>
                  {errorCount > 0
                    ? `${errorCount} fila${errorCount > 1 ? 's tienen' : ' tiene'} errores — corrígelos antes de importar.`
                    : `Todo listo. ${validCount} voluntarios sin errores.`
                  }
                </span>
                <div className="ml-auto flex items-center gap-2 font-normal text-xs">
                  {errorCount > 0 && <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-bold">{errorCount} errores</span>}
                  <span className="bg-teal-100 text-accent px-2 py-0.5 rounded-full font-bold">{validCount} válidos</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_1fr_5rem] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
                  {['#', 'Nombre', 'Apellido', 'Barrio', 'Estaca', 'Teléfono', ''].map((h, i) => (
                    <span key={i} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</span>
                  ))}
                </div>

                {/* Rows */}
                <div className="divide-y divide-border max-h-[520px] overflow-auto">
                  {rows.map((row) => {
                    const hasError = Object.keys(row.errors).length > 0;
                    const isEditing = editingRowId === row.id;

                    return (
                      <div key={row.id} className={`transition-colors ${hasError ? 'bg-rose-50/30' : 'bg-transparent'}`}>
                        {/* Main row */}
                        <div className={`grid grid-cols-[2rem_1fr_1fr_1fr_1fr_1fr_5rem] gap-2 px-4 py-2.5 items-center`}>
                          {/* # */}
                          <span className={`text-[11px] font-bold ${hasError ? 'text-rose-500' : 'text-slate-500'}`}>
                            {hasError ? <span className="material-symbols-outlined text-[16px] text-rose-400">error</span> : row.id + 1}
                          </span>

                          {isEditing ? (
                            // ── Editing mode ──────────────────────────────
                            <>
                              {(['firstName', 'lastName', 'ward', 'stake', 'phone'] as const).map(field => (
                                <div key={field} className="relative">
                                  <input
                                    className={`w-full text-xs px-2 py-1.5 rounded-sm border bg-white text-slate-800 outline-none focus:ring-2 ${
                                      row.errors[field]
                                        ? 'border-rose-300 focus:ring-rose-300'
                                        : 'border-slate-200 focus:ring-primary-cta/40'
                                    }`}
                                    value={(editValues as any)[field] || ''}
                                    onChange={e => setEditValues(prev => ({ ...prev, [field]: e.target.value }))}
                                    placeholder={FIELD_LABELS[field]}
                                  />
                                </div>
                              ))}
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => saveEdit(row.id)}
                                  className="flex items-center justify-center w-7 h-7 rounded-sm bg-accent hover:bg-teal-600 text-white transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[16px]">check</span>
                                </button>
                                <button
                                  onClick={() => setEditingRowId(null)}
                                  className="flex items-center justify-center w-7 h-7 rounded-sm bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[16px]">close</span>
                                </button>
                              </div>
                            </>
                          ) : (
                            // ── View mode ─────────────────────────────────
                            <>
                              {(['firstName', 'lastName', 'ward', 'stake', 'phone'] as const).map(field => (
                                <span key={field} className={`text-xs truncate ${
                                  row.errors[field] ? 'text-rose-500 font-semibold' : 'text-slate-800'
                                }`}>
                                  {row[field] || <span className="text-rose-400 italic">vacío</span>}
                                </span>
                              ))}
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => startEdit(row)}
                                  className="flex items-center justify-center w-7 h-7 rounded-sm hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[14px]">edit</span>
                                </button>
                                <button
                                  onClick={() => removeRow(row.id)}
                                  className="flex items-center justify-center w-7 h-7 rounded-sm hover:bg-rose-50 text-slate-500 hover:text-rose-500 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[14px]">close</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Error pills — only when not editing */}
                        {hasError && !isEditing && (
                          <div className="flex gap-1.5 flex-wrap px-4 pb-2.5">
                            {Object.entries(row.errors).map(([field, msg]) => (
                              <span key={field} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200">
                                <span className="material-symbols-outlined text-[12px]">error</span>
                                {FIELD_LABELS[field]}: {msg}
                              </span>
                            ))}
                            <button
                              onClick={() => startEdit(row)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0084d1]/10 text-[#0084d1] border border-[#0084d1]/20 hover:bg-[#0084d1]/20 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[12px]">edit</span>
                              Corregir
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-3">
                  <Button variant="ghost" onClick={() => setImportStep(1)} className="text-slate-500 hover:text-slate-800">
                    ← Volver
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={validCount === 0 || editingRowId !== null}
                    className="bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px] mr-2">cloud_upload</span>
                    {errorCount > 0
                      ? `Importar ${validCount} válidos (omitir ${errorCount} con errores)`
                      : `Importar ${validCount} voluntarios`
                    }
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Send PINs ─────────────────────────────────────────── */}
          {importStep === 3 && (
            <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-[20px] text-accent">check_circle</span>
                    <h3 className="text-lg font-bold tracking-tight text-slate-800">¡Importación Exitosa!</h3>
                  </div>
                  <p className="text-xs font-medium text-slate-500">
                    PINs generados. Envía el acceso a cada voluntario por WhatsApp.
                  </p>
                </div>
                <Badge variant="outline" className="bg-accent/10 text-accent border-teal-200/50 font-bold">
                  {rows.length} importados
                </Badge>
              </div>
              <div className="divide-y divide-border max-h-[500px] overflow-auto">
                {rows.map((vol, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{vol.firstName} {vol.lastName}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-slate-500 font-mono">{vol.phone}</span>
                        <span className="text-[11px] text-slate-500">·</span>
                        <span className="text-[11px] text-slate-500">PIN: <span className="font-bold text-slate-800 tracking-widest">{vol.pin}</span></span>
                      </div>
                    </div>
                    <a
                      href={vol.waLink} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-bold text-white bg-[#25D366] hover:bg-[#1ebd5a] transition-colors shadow-sm shrink-0"
                    >
                      <span className="material-symbols-outlined text-[14px]">send</span>
                      Enviar PIN
                    </a>
                  </div>
                ))}
              </div>
              <div className="p-5 border-t border-slate-200">
                <Button variant="outline" className="w-full border-slate-200 text-slate-500 hover:text-slate-800" onClick={resetImport}>
                  <span className="material-symbols-outlined text-[18px] mr-2">close</span>
                  Nueva importación
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
