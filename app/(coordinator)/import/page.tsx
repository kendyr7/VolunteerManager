'use client'

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { generatePinMessage, generateWaMeLink, formatE164, validatePhone8Digits } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/ui/toast";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from 'xlsx';
import { sendWelcomeWhatsAppAction } from "@/app/actions/whatsapp";

interface ParsedVolunteer {
  rowNum: number;
  firstName: string;
  lastName: string;
  age: string;
  ward: string;
  stake: string;
  phone: string;
  committeeName: string;
  committeeId?: string;
  pin?: string;
  waLink?: string;
  error?: string;
  isDuplicate?: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0 }
};

export default function ImportPage() {
  const [parsedData, setParsedData] = useState<ParsedVolunteer[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [committees, setCommittees] = useState<{ id: string, name: string }[]>([]);
  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor'>('Admin');
  const [userCommittee, setUserCommittee] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'valid' | 'error' | 'duplicate'>('all');
  const [sendWelcomeMessage, setSendWelcomeMessage] = useState(true);
  const [toast, setToast] = useState({ message: '', type: 'success' as 'success' | 'error' | 'info', isVisible: false });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type, isVisible: true });
  };

  useEffect(() => {
    const role = localStorage.getItem('mock_role') as any;
    const comm = localStorage.getItem('mock_committee') || '';
    if (role) setCurrentRole(role);
    setUserCommittee(comm);

    const fetchCommittees = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('committees').select('id, name');
      if (data) setCommittees(data);
    };
    fetchCommittees();
  }, []);

  const downloadExcelTemplate = () => {
    const committeeExample = userCommittee || "Seguridad";

    // Row data — 7 data cols + 1 note col
    const headerRow = [
      "Nombres y Apellidos", "Edad", "Barrio", "Estaca", "Teléfono", "Comité",
      "", // empty spacer col G
      "Nota",
    ];
    const sampleRow = [
      "Juan Pérez", "25", "Las Colinas", "Managua Sur", "88881111", committeeExample,
      "",
      "⚠ EJEMPLO — PUEDES BORRAR ESTA FILA",
    ];

    const ws = XLSX.utils.aoa_to_sheet([headerRow, sampleRow]);

    // --- Column widths ---
    ws['!cols'] = [
      { wch: 28 }, // A - Nombres
      { wch: 8 },  // B - Edad
      { wch: 20 }, // C - Barrio
      { wch: 20 }, // D - Estaca
      { wch: 16 }, // E - Teléfono
      { wch: 20 }, // F - Comité
      { wch: 2 },  // G - spacer
      { wch: 40 }, // H - Nota
    ];

    // --- Style header row (row 1) ---
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { fgColor: { rgb: "2563EB" } }, // blue-600
      alignment: { horizontal: "center", vertical: "center", wrapText: false },
      border: {
        bottom: { style: "medium", color: { rgb: "1D4ED8" } },
      },
    };
    const headerCols = ["A", "B", "C", "D", "E", "F"];
    headerCols.forEach(col => {
      const cellRef = `${col}1`;
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    });

    // --- Style sample row (row 2) in amber ---
    const sampleStyle = {
      font: { color: { rgb: "92400E" }, italic: true, sz: 10 }, // amber-800 text
      fill: { fgColor: { rgb: "FEF3C7" } }, // amber-100 fill
      alignment: { horizontal: "left", vertical: "center" },
    };
    const sampleCols = ["A", "B", "C", "D", "E", "F"];
    sampleCols.forEach(col => {
      const cellRef = `${col}2`;
      if (ws[cellRef]) ws[cellRef].s = sampleStyle;
    });

    // Style note column header (H1)
    if (ws["H1"]) ws["H1"].s = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { fgColor: { rgb: "374151" } }, // gray-700
      alignment: { horizontal: "center" },
    };

    // Style note cell (H2)
    if (ws["H2"]) ws["H2"].s = {
      font: { bold: true, color: { rgb: "92400E" }, sz: 10 },
      fill: { fgColor: { rgb: "FEF3C7" } },
      alignment: { horizontal: "left", vertical: "center" },
    };

    // Row heights
    ws['!rows'] = [
      { hpt: 22 }, // header row
      { hpt: 18 }, // sample row
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Voluntarios");
    XLSX.writeFile(wb, "plantilla_importar_voluntarios.xlsx", { cellStyles: true });
    showToast("Plantilla Excel descargada", "info");
  };

  const processFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) return;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Parse rows as raw arrays to preserve positions
        const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        if (rawRows.length <= 1) {
          showToast("El archivo no contiene suficientes filas de datos.", "error");
          return;
        }

        const headers = (rawRows[0] as any[]).map(h => String(h || '').trim().toLowerCase());
        
        const cleanVal = (val: any) => {
          if (val === undefined || val === null) return '';
          return String(val).trim().replace(/^["']|["']$/g, '');
        };

        // Find headers matching standard fields
        const nameIdx = headers.findIndex(h => h.includes('nombre') || h.includes('voluntario') || h.includes('apellido') || h.includes('full name'));
        const ageIdx = headers.findIndex(h => h.includes('edad') || h.includes('año') || h.includes('age'));
        const wardIdx = headers.findIndex(h => h.includes('barrio') || h.includes('ward') || h.includes('colonia') || h.includes('vecindario') || h.includes('localidad') || h.includes('direc'));
        const stakeIdx = headers.findIndex(h => h.includes('estaca') || h.includes('stake'));
        const phoneIdx = headers.findIndex(h => h.includes('tel') || h.includes('cel') || h.includes('phone') || h.includes('contacto') || h.includes('móvil') || h.includes('movil'));
        const committeeIdx = headers.findIndex(h => h.includes('comit') || h.includes('grupo') || h.includes('seccion') || h.includes('area'));

        if (nameIdx === -1 || phoneIdx === -1) {
          showToast("Columnas requeridas no encontradas. Asegúrese de incluir 'Nombres y Apellidos' y 'Teléfono'.", "error");
          return;
        }

        // Fetch current volunteers to pre-validate duplicate phone numbers
        const supabase = createClient();
        const { data: existingVols } = await supabase.from('volunteers').select('phone');
        const existingPhones = new Set(existingVols?.map(v => formatE164(v.phone || '')) || []);

        const parsedList: ParsedVolunteer[] = [];

        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0) continue;
          
          // Check if the entire row is empty
          const isRowEmpty = row.every(cell => cell === undefined || cell === null || String(cell).trim() === '');
          if (isRowEmpty) continue;

          const fullName = nameIdx !== -1 ? cleanVal(row[nameIdx]) : '';
          const nameParts = fullName.split(/\s+/);
          const firstName = nameParts.length > 0 ? nameParts[0] : '';
          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
          const age = ageIdx !== -1 ? cleanVal(row[ageIdx]) : '';
          const ward = wardIdx !== -1 ? cleanVal(row[wardIdx]) : '';
          const stake = stakeIdx !== -1 ? cleanVal(row[stakeIdx]) : '';
          const phoneRaw = phoneIdx !== -1 ? cleanVal(row[phoneIdx]) : '';
          const committeeName = committeeIdx !== -1 ? cleanVal(row[committeeIdx]) : '';

          const match = committees.find(c => c.name.toLowerCase() === committeeName.toLowerCase());
          const isRoleAdmin = currentRole === 'Admin';
          const isMyCommittee = match?.name.toLowerCase() === userCommittee.toLowerCase();
          const isValidCommittee = isRoleAdmin || isMyCommittee;
          
          // Validar que el teléfono sea válido E.164 y tenga 8 dígitos
          const phoneValidation = validatePhone8Digits(phoneRaw);
          const formattedPhone = phoneValidation.formatted;
          const isDuplicate = formattedPhone ? existingPhones.has(formattedPhone) : false;

          let errorMsg = '';
          if (!fullName) {
            errorMsg = "El nombre es obligatorio.";
          } else if (!phoneRaw) {
            errorMsg = "El número telefónico es obligatorio.";
          } else if (!phoneValidation.isValid) {
            errorMsg = phoneValidation.error || "El número telefónico debe tener exactamente 8 dígitos.";
          } else if (!committeeName) {
            errorMsg = "El nombre del comité es obligatorio.";
          } else if (!match) {
            errorMsg = `El comité '${committeeName}' no existe en el sistema.`;
          } else if (!isValidCommittee) {
            errorMsg = `Acceso denegado: solo puedes importar voluntarios para tu comité ('${userCommittee}').`;
          }

          parsedList.push({
            rowNum: i + 1,
            firstName,
            lastName,
            age,
            ward,
            stake,
            phone: formattedPhone || phoneRaw,
            committeeName: match?.name || committeeName,
            committeeId: isValidCommittee ? match?.id : undefined,
            error: errorMsg || undefined,
            isDuplicate: isDuplicate
          });
        }

        if (parsedList.length === 0) {
          showToast("No se encontraron registros de voluntarios en el archivo.", "error");
        } else {
          setParsedData(parsedList);
          setStep(2);
          showToast(`Archivo procesado. Se cargaron ${parsedList.length} registros.`, "success");
        }
      } catch (err) {
        console.error(err);
        showToast("Error al procesar el archivo. Formato inválido o corrupto.", "error");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleImport = async () => {
    setIsImporting(true);
    const supabase = createClient();
    
    try {
      const results: ParsedVolunteer[] = [];
      let skippedCount = 0;

      // Filter only valid ones (without errors or duplicates)
      const toImport = parsedData.filter(v => !v.error && !v.isDuplicate);

      if (toImport.length === 0) {
        showToast("No hay registros válidos para importar.", "error");
        setIsImporting(false);
        return;
      }

      for (const vol of toImport) {
        const pin = String(Math.floor(1000 + Math.random() * 9000)); // Generate a random 4-digit PIN for improved security
        const sanitizedPhone = formatE164(vol.phone);
        
        const { data: inserted, error } = await supabase
          .from('volunteers')
          .insert({
            first_name: vol.firstName,
            last_name: vol.lastName,
            age: parseInt(vol.age) || null,
            neighborhood: vol.ward,
            stake: vol.stake,
            phone: sanitizedPhone,
            committee_id: vol.committeeId,
            pin: pin,
            status: 'active'
          })
          .select()
          .single();

        if (error) {
          console.error(`Error importing ${vol.firstName}:`, error);
          continue;
        }

        const message = generatePinMessage(`${vol.firstName} ${vol.lastName}`, pin, "https://volunteermanager.org");
        const waLink = generateWaMeLink(sanitizedPhone, message);
        
        if (sendWelcomeMessage) {
          // Send automatic WhatsApp message
          await sendWelcomeWhatsAppAction(sanitizedPhone, vol.firstName, pin);
        }
        
        results.push({ ...vol, phone: sanitizedPhone, pin, waLink });
      }

      const totalDuplicatesCount = parsedData.filter(v => v.isDuplicate).length;

      if (results.length > 0) {
        setParsedData(results);
        setStep(3);
        const skippedMsg = totalDuplicatesCount > 0 ? ` (${totalDuplicatesCount} duplicados omitidos)` : '';
        showToast(`Importados ${results.length} voluntarios exitosamente${skippedMsg}.`, "success");
      } else {
        showToast("No se pudo importar ningún voluntario. Verifique los datos.", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Error crítico durante la importación", "error");
    } finally {
      setIsImporting(false);
    }
  };

  // Filter parsed data for preview
  const filteredData = parsedData.filter(vol => {
    if (filterType === 'valid') return !vol.error && !vol.isDuplicate;
    if (filterType === 'error') return !!vol.error;
    if (filterType === 'duplicate') return !!vol.isDuplicate;
    return true;
  });

  const totalErrors = parsedData.filter(v => v.error).length;
  const totalDuplicates = parsedData.filter(v => v.isDuplicate).length;
  const totalValids = parsedData.filter(v => !v.error && !v.isDuplicate).length;

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full mx-auto pb-32 lg:pb-12 flex flex-col"
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 mb-4 pointer-events-auto shrink-0">
        <motion.div variants={itemVariants} className="w-full flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Importación
          </h1>
          <div className="flex items-center gap-2">
            {step === 1 && (
              <Button 
                onClick={downloadExcelTemplate}
                className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-9 px-4 text-xs font-bold transition-all active:scale-[0.97] flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                <span>Plantilla</span>
              </Button>
            )}
            {step === 2 && (
              <Button variant="ghost" onClick={() => { setParsedData([]); setStep(1); }} className="text-text-dim hover:text-text font-bold border border-border/50 bg-dark3 rounded-xl px-4 py-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Volver
              </Button>
            )}
          </div>
        </motion.div>
      </div>

      <div className="flex flex-col gap-6 md:gap-10 items-start w-full min-w-0 px-4 sm:px-6 lg:px-8">
        {step === 1 && (
          <motion.div variants={itemVariants} className="w-full space-y-5">

            {/* Drag & Drop File Zone */}
            <div className="flex flex-col gap-3">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={triggerFileSelect}
                className={`border-2 border-dashed rounded-2xl p-8 md:p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
                  isDragging
                    ? 'border-[#4d7cfe] bg-[#4d7cfe]/5'
                    : 'border-white/8 hover:border-white/20 bg-dark2 hover:bg-dark2/60'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls"
                  className="hidden"
                />
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-all duration-200 ${
                  isDragging ? 'scale-110 bg-[#4d7cfe]/15 text-[#4d7cfe]' : 'bg-dark3 text-text-dim'
                }`}>
                  <span className="material-symbols-outlined text-[30px]">
                    {isDragging ? 'upload_file' : 'cloud_upload'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-text mb-1">
                  {isDragging ? 'Suelta el archivo aquí' : 'Arrastra tu archivo aquí'}
                </h3>
                <p className="text-xs text-text-dim max-w-xs mb-4">
                  o{' '}
                  <span className="text-[#4d7cfe] underline font-semibold cursor-pointer">
                    selecciona desde tu dispositivo
                  </span>
                </p>
                <Badge variant="secondary" className="bg-white/5 border border-white/10 text-text-dim text-[11px] px-3 py-1">
                  Excel (.xlsx / .xls)
                </Badge>
              </div>
            </div>

            {/* Permissions notice */}
            <div className="p-3.5 bg-blue-500/5 rounded-xl border border-blue-500/10 flex gap-2.5 text-xs text-text-dim leading-relaxed">
              <span className="material-symbols-outlined text-blue-400 text-[16px] shrink-0 mt-px">info</span>
              <div>
                <span className="font-bold text-text">Permisos:</span>{' '}
                {currentRole === 'Admin'
                  ? 'Como administrador, puedes subir voluntarios de cualquier comité.'
                  : <>Como coordinador de <strong className="text-text">{userCommittee || 'tu comité'}</strong>, solo puedes importar voluntarios asignados a ese comité.</>}
              </div>
            </div>

          </motion.div>
        )}

        {step === 2 && (
          <motion.div variants={itemVariants} className="w-full space-y-6">
            
            {/* KPI cards — click to filter */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
              {([
                { key: 'all',       label: 'Cargados',    value: parsedData.length, color: 'text-text',      ring: 'ring-white/20',       bg: 'bg-dark2'          },
                { key: 'valid',     label: 'Válidos',     value: totalValids,       color: 'text-green-400', ring: 'ring-green-500/40',   bg: 'bg-dark2'          },
                { key: 'error',     label: 'Con Errores', value: totalErrors,       color: 'text-red',       ring: 'ring-red/40',         bg: 'bg-dark2'          },
                { key: 'duplicate', label: 'Duplicados',  value: totalDuplicates,   color: 'text-amber-500', ring: 'ring-amber-500/40',   bg: 'bg-dark2'          },
              ] as { key: typeof filterType; label: string; value: number; color: string; ring: string; bg: string }[]).map(({ key, label, value, color, ring }) => (
                <button
                  key={key}
                  onClick={() => setFilterType(prev => prev === key ? 'all' : key)}
                  disabled={key !== 'all' && value === 0}
                  className={`text-left p-4 rounded-xl border transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-default ${
                    filterType === key
                      ? `${ring} ring-2 border-transparent bg-white/[0.03]`
                      : 'border-white/5 bg-dark2 hover:bg-white/[0.03]'
                  }`}
                >
                  <p className={`text-[10px] uppercase font-bold tracking-wider ${color}`}>{label}</p>
                  <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
                </button>
              ))}
            </div>

            {/* Description outside the card */}
            <p className="text-xs text-text-dim leading-relaxed">
              Solo los registros <span className="text-green-400 font-semibold">Válidos</span> se guardarán.
              {filterType !== 'all' && <span className="ml-1 text-text-dim/60">— Filtrando por: <span className="font-semibold text-text-dim">{filterType === 'valid' ? 'Válidos' : filterType === 'error' ? 'Errores' : 'Duplicados'}</span></span>}
            </p>

            {/* Validation Data Display */}
            <Card className="border border-white/10 bg-dark2 rounded-[20px] shadow-lg overflow-hidden flex flex-col w-full">
              <CardContent className="p-0">
                {filteredData.length === 0 ? (
                  <div className="p-12 text-center text-text-dim flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-[40px] text-text-dim/40">find_in_page</span>
                    <p className="text-sm font-medium">No hay registros para mostrar en este filtro.</p>
                  </div>
                ) : (
                  <>
                    {/* ====== DESKTOP TABLE (md+) ====== */}
                    <div className="hidden md:block max-h-[500px] overflow-y-auto">
                      <table className="w-full text-sm text-left border-separate border-spacing-0">
                        <thead className="bg-dark3/90 sticky top-0 z-10 backdrop-blur-md text-[10px] font-bold text-text-dim uppercase tracking-wider">
                          <tr>
                            <th className="px-5 py-3">#</th>
                            <th className="px-3 py-3">Nombre</th>
                            <th className="px-3 py-3">Barrio / Estaca</th>
                            <th className="px-3 py-3 text-center">Comité</th>
                            <th className="px-3 py-3 text-center">Estado</th>
                            <th className="px-3 py-3 text-right">Teléfono</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {filteredData.map((vol, i) => (
                            <tr
                              key={i}
                              className={`transition-colors hover:bg-white/[0.02] ${
                                vol.error
                                  ? 'bg-red-500/[0.04]'
                                  : vol.isDuplicate
                                    ? 'bg-amber-500/[0.04]'
                                    : ''
                              }`}
                            >
                              <td className="px-5 py-3 font-mono text-[11px] text-text-dim w-px whitespace-nowrap">#{vol.rowNum}</td>
                              <td className="px-3 py-3 w-full">
                                <p className="font-inter font-bold text-text text-[13px] tracking-wide">
                                  {vol.firstName} {vol.lastName || ''}
                                </p>
                                {vol.age && <p className="text-[11px] text-text-dim font-inter">{vol.age} años</p>}
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <p className="font-inter font-bold text-[13px] text-text-dim">{vol.ward || <span className="italic opacity-40">—</span>}</p>
                                {vol.stake && <p className="font-inter font-bold text-[11px] text-text-dim/60 uppercase tracking-wider">{vol.stake}</p>}
                              </td>
                              <td className="px-3 py-3 text-center w-px whitespace-nowrap">
                                {vol.committeeName && !vol.error ? (
                                  <Badge variant="outline" className="font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full shrink-0 bg-[#4d7cfe]/10 text-[#4d7cfe] border-[#4d7cfe]/20">
                                    {vol.committeeName}
                                  </Badge>
                                ) : vol.error ? (
                                  <Badge variant="outline" className="font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full bg-red/10 text-red border-red/20">
                                    {vol.committeeName || '—'}
                                  </Badge>
                                ) : <span className="text-text-dim/30">—</span>}
                              </td>
                              <td className="px-3 py-3 text-center w-px whitespace-nowrap">
                                {vol.error ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <Badge className="font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full bg-red/10 text-red border-red/20">
                                      Error
                                    </Badge>
                                    <span className="text-[10px] text-red leading-tight max-w-[180px] text-center">{vol.error}</span>
                                  </div>
                                ) : vol.isDuplicate ? (
                                  <Badge className="font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full bg-amber-500/10 text-amber-500 border-amber-500/20">
                                    Duplicado
                                  </Badge>
                                ) : (
                                  <Badge className="font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full bg-green-500/10 text-green-400 border-green-500/20">
                                    Válido
                                  </Badge>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right w-px whitespace-nowrap">
                                <span className="font-inter font-bold text-xs text-text-dim">{vol.phone}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* ====== MOBILE CARDS (under md) ====== */}
                    <div className="block md:hidden divide-y divide-white/5 max-h-[70dvh] overflow-y-auto">
                      {filteredData.map((vol, i) => (
                        <div
                          key={i}
                          className={`relative pl-5 pr-4 py-3.5 flex gap-3 ${
                            vol.error
                              ? 'bg-red-500/[0.04]'
                              : vol.isDuplicate
                                ? 'bg-amber-500/[0.04]'
                                : 'bg-dark2'
                          }`}
                        >
                          {/* Left color stripe */}
                          <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full ${
                            vol.error ? 'bg-red/60' : vol.isDuplicate ? 'bg-amber-500/60' : 'bg-green-500/60'
                          }`} />

                          {/* Card content */}
                          <div className="flex flex-col gap-1.5 flex-1 min-w-0">

                            {/* ROW 1: Name + comité badge + status badge */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="font-inter font-bold text-text text-[13px] tracking-wide truncate shrink">
                                {vol.firstName} {vol.lastName || ''}
                              </p>
                              {/* Comité badge (only if valid and has committee) */}
                              {!vol.error && vol.committeeName && (
                                <Badge className="font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full shrink-0 bg-[#4d7cfe]/10 text-[#4d7cfe] border-[#4d7cfe]/20">
                                  {vol.committeeName}
                                </Badge>
                              )}
                              {/* Status badge */}
                              <div className="shrink-0 ml-auto">
                                {vol.error ? (
                                  <Badge className="font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full bg-red/10 text-red border-red/20">Error</Badge>
                                ) : vol.isDuplicate ? (
                                  <Badge className="font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full bg-amber-500/10 text-amber-500 border-amber-500/20">Duplicado</Badge>
                                ) : (
                                  <Badge className="font-inter text-[9px] px-1.5 py-0 h-[18px] font-semibold border rounded-full bg-green-500/10 text-green-400 border-green-500/20">Válido</Badge>
                                )}
                              </div>
                            </div>

                            {/* ROW 2: Phone (left) + Ward · Stake (right) */}
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-inter font-bold text-xs text-text-dim shrink-0">
                                {vol.phone || 'Sin teléfono'}
                              </p>
                              {(vol.ward || vol.stake) && (
                                <p className="text-[10px] text-text-dim/60 font-inter text-right truncate">
                                  {[vol.ward, vol.stake].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>

                            {/* ROW 3: error/duplicate message */}
                            {vol.error && (
                              <p className="text-[10.5px] text-red font-semibold leading-tight">{vol.error}</p>
                            )}
                            {vol.isDuplicate && (
                              <p className="text-[10.5px] text-amber-500 font-semibold leading-tight">Teléfono ya registrado. Se omitirá.</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>

              <CardFooter className="p-5 bg-dark3 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-xs text-text-dim text-center sm:text-left leading-relaxed">
                  Total de registros a importar: <strong className="text-green-400 text-sm">{totalValids}</strong> de {parsedData.length}.
                  {totalErrors > 0 && <span className="block text-red font-medium">Existen {totalErrors} registros con errores que deben corregirse en tu archivo.</span>}
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                  <label className="flex items-center gap-2 cursor-pointer bg-dark2 border border-white/10 px-4 py-2.5 rounded-xl transition-all hover:bg-dark3 w-full sm:w-auto">
                    <input
                      type="checkbox"
                      checked={sendWelcomeMessage}
                      onChange={(e) => setSendWelcomeMessage(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/10 text-[#4d7cfe] focus:ring-[#4d7cfe] focus:ring-offset-0 focus:ring-offset-transparent cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-text">Enviar WhatsApp Automático</span>
                    </div>
                  </label>

                  <Button 
                    onClick={handleImport} 
                    disabled={isImporting || totalValids === 0} 
                    className="w-full sm:w-auto bg-[#4d7cfe] hover:bg-[#3b66e0] disabled:bg-white/5 disabled:text-text-dim/50 text-white rounded-xl h-11 px-8 font-bold shadow-lg shadow-blue-500/10 transition-all active:scale-[0.98]"
                  >
                    {isImporting ? (
                      <><span className="material-symbols-outlined text-[18px] mr-2 animate-spin">progress_activity</span> Importando...</>
                    ) : (
                      <><span className="material-symbols-outlined text-[18px] mr-2">cloud_upload</span> Cargar {totalValids} Válidos</>
                    )}
                  </Button>
                </div>
              </CardFooter>
            </Card>

          </motion.div>
        )}

        {step === 3 && (
          <motion.div variants={itemVariants} className="w-full">
            <Card className="border border-white/10 bg-dark2 rounded-[20px] shadow-lg overflow-hidden flex flex-col w-full">
              <CardHeader className="bg-accent/5 p-8 sm:p-10 text-center border-b border-accent/10">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-accent rounded-full flex items-center justify-center text-white mx-auto mb-6 shadow-lg shadow-accent/30 animate-bounce">
                  <span className="material-symbols-outlined text-[32px] sm:text-[40px]">task_alt</span>
                </div>
                <CardTitle className="text-xl sm:text-2xl font-bold text-text">¡Importación Exitosa!</CardTitle>
                <CardDescription className="text-text-dim text-base sm:text-lg mt-2 font-medium">
                  Se han registrado los nuevos voluntarios y generado sus PINs de acceso.
                </CardDescription>
              </CardHeader>
              
              <CardContent className="p-6 sm:p-10 space-y-4">
                <p className="text-xs font-bold text-text-dim uppercase tracking-widest mb-6 text-center">Lista de Envíos Pendientes (WhatsApp)</p>
                <div className="max-h-[600px] overflow-auto sm:pr-2 space-y-3">
                  {parsedData.map((vol, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 sm:p-6 bg-dark3 rounded-2xl border border-border gap-5 sm:gap-6 group hover:bg-dark2 hover:shadow-md transition-all">
                      <div>
                        <h4 className="font-bold text-text text-lg sm:text-base group-hover:text-[#4d7cfe] transition-colors">{vol.firstName} {vol.lastName}</h4>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-3 sm:mt-1.5">
                          <p className="text-xs sm:text-sm text-text-dim font-mono flex items-center gap-1.5 bg-dark2 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-lg border sm:border-none border-border">
                            <span className="material-symbols-outlined text-[16px] text-text-dim">call</span> {vol.phone}
                          </p>
                          <p className="text-xs sm:text-sm text-text-dim font-mono flex items-center gap-1.5 bg-dark2 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-lg border sm:border-none border-border">
                            <span className="material-symbols-outlined text-[16px] text-text-dim">key</span> PIN: <span className="font-bold text-text">{vol.pin}</span>
                          </p>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        className="w-full sm:w-auto bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-xl px-6 font-bold shadow-sm shadow-green-500/20 h-12 sm:h-10 transition-all active:scale-[0.95]"
                        onClick={() => window.open(vol.waLink, '_blank')}
                      >
                        <span className="material-symbols-outlined text-[20px] sm:text-[18px] mr-2">send</span>
                        Enviar PIN
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>

              <CardFooter className="p-6 sm:p-10 bg-dark3 border-t border-border">
                <Button variant="outline" className="w-full h-12 rounded-2xl border-border bg-dark2 text-text font-bold hover:bg-dark3" onClick={() => { setParsedData([]); setStep(1); }}>
                  Realizar otra importación
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}
      </div>

      <Toast 
        message={toast.message} 
        type={toast.type} 
        isVisible={toast.isVisible} 
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} 
      />
    </motion.div>
  );
}
