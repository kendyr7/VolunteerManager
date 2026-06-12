'use client'

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { generatePinMessage, generateWaMeLink } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/ui/toast";
import { motion } from "framer-motion";

interface ParsedVolunteer {
  firstName: string;
  lastName: string;
  age: string;
  ward: string;
  stake: string;
  phone: string;
  committeeName?: string;
  committeeId?: string;
  pin?: string;
  waLink?: string;
  error?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function ImportPage() {
  const [csvText, setCsvText] = useState("");
  const [parsedData, setParsedData] = useState<ParsedVolunteer[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [committees, setCommittees] = useState<{ id: string, name: string }[]>([]);
  const [currentRole, setCurrentRole] = useState<'Admin' | 'Editor'>('Admin');
  const [userCommittee, setUserCommittee] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' as 'success' | 'error' | 'info', isVisible: false });

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

  const handleParse = () => {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    const data = lines.map(line => {
      const parts = line.split(',');
      return {
        firstName: parts[0]?.trim() || '',
        lastName: parts[1]?.trim() || '',
        age: parts[2]?.trim() || '',
        ward: parts[3]?.trim() || '',
        stake: parts[4]?.trim() || '',
        phone: parts[5]?.trim() || '',
        committeeName: parts[6]?.trim() || ''
      };
    }).filter(v => v.firstName && v.phone);

    if (data.length > 0) {
      const enriched = data.map(v => {
        const match = committees.find(c => c.name.toLowerCase() === v.committeeName?.toLowerCase());
        const isValidCommittee = currentRole === 'Admin' || (match?.name === userCommittee);
        
        return { 
          ...v, 
          committeeId: isValidCommittee ? match?.id : undefined, 
          committeeName: match?.name || v.committeeName,
          error: !isValidCommittee ? `No tienes permiso para importar a '${v.committeeName}'` : undefined
        };
      });
      setParsedData(enriched);
      setStep(2);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    const supabase = createClient();
    
    try {
      // 1. Fetch existing phones to prevent duplicates
      const { data: existingVols } = await supabase.from('volunteers').select('phone');
      const existingPhones = new Set(existingVols?.map(v => (v.phone || '').replace(/\s+/g, '')) || []);

      const results = [];
      let skippedCount = 0;

      for (const vol of parsedData) {
        const cleanPhone = vol.phone.replace(/\s+/g, '');
        
        if (existingPhones.has(cleanPhone)) {
          skippedCount++;
          continue;
        }

        const pin = "1234"; // Initial validation PIN
        
        const { data: inserted, error } = await supabase
          .from('volunteers')
          .insert({
            first_name: vol.firstName,
            last_name: vol.lastName,
            age: parseInt(vol.age) || null,
            neighborhood: vol.ward,
            stake: vol.stake,
            phone: vol.phone,
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

        const message = generatePinMessage(`${vol.firstName} ${vol.lastName}`, pin, "https://app.templomanagua.org");
        const waLink = generateWaMeLink(vol.phone, message);
        results.push({ ...vol, pin, waLink });
      }

      if (results.length > 0) {
        setParsedData(results);
        setStep(3);
        const skippedMsg = skippedCount > 0 ? ` (${skippedCount} duplicados omitidos)` : '';
        showToast(`Importados ${results.length} voluntarios${skippedMsg}`);
      } else {
        const msg = skippedCount > 0 ? `Se omitieron ${skippedCount} duplicados. Ningún registro nuevo.` : "No se pudo importar ningún voluntario";
        showToast(msg, skippedCount > 0 ? "info" : "error");
      }
    } catch (e) {
      showToast("Error crítico en la importación", "error");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-6xl mx-auto space-y-10 pb-20"
    >
      <motion.div variants={itemVariants} className="pb-6 border-b border-slate-200/60">
        <h1 className="tracking-tight text-slate-900 leading-none mb-2 text-2xl font-bold">Importación Masiva</h1>
        <p className="text-base font-medium text-slate-500">Carga múltiples voluntarios al sistema de forma instantánea.</p>
      </motion.div>

      {step === 1 && (
        <motion.div variants={itemVariants}>
          <Card className="border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
              <CardTitle className="font-bold text-slate-800 text-lg">Pegar datos CSV</CardTitle>
              <CardDescription className="text-slate-500 font-medium">
                Formato: Nombre, Apellido, Edad, Barrio, Estaca, Teléfono, Comité
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <textarea
                className="w-full h-80 p-6 rounded-2xl border border-slate-200 bg-white font-mono text-sm focus:ring-4 focus:ring-[#4d7cfe]/10 focus:border-[#4d7cfe] outline-none transition-all resize-none text-slate-800"
                placeholder="Juan, Pérez, 35, Las Colinas, Managua Sur, 88881111, Seguridad&#10;María, García, 28, El Dorado, Managua Este, 88882222, Guía"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </CardContent>
            <CardFooter className="justify-end p-8 bg-slate-50/50 border-t border-slate-100">
              <Button onClick={handleParse} disabled={!csvText.trim()} className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-xl h-12 px-8 font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-[0.97]">
                <span className="material-symbols-outlined text-[20px] mr-2">description</span>
                Procesar Datos
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      )}

      {step === 2 && (
        <motion.div variants={itemVariants}>
          <Card className="border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-bold text-slate-800 flex items-center gap-3 text-lg">
                  <span className="material-symbols-outlined text-[24px] text-[#6dd230]">check_circle</span>
                  Vista Previa de Datos
                </CardTitle>
                <CardDescription className="text-slate-500 font-medium mt-1">
                  Se detectaron {parsedData.length} registros válidos.
                </CardDescription>
              </div>
              <Button variant="ghost" onClick={() => setStep(1)} className="text-slate-500 hover:text-slate-800 font-bold">Corregir</Button>
            </CardHeader>
            <CardContent className="p-0 max-h-[500px] overflow-auto">
              <Table>
                <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent border-slate-100 text-slate-800">
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-400 pl-8 h-12">Voluntario</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-400 h-12">Ubicación</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-400 h-12 text-center">Comité</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-400 h-12 pr-8 text-right">Contacto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.map((vol, i) => (
                    <TableRow key={i} className="border-slate-50 hover:bg-slate-50 transition-colors">
                      <TableCell className="font-bold text-slate-800 pl-8 py-4">
                        {vol.firstName} {vol.lastName}
                        <span className="block text-[10px] font-medium text-slate-400 uppercase mt-0.5">{vol.age} años</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium text-slate-600">{vol.ward}</span>
                        <span className="block text-[11px] text-slate-400">{vol.stake}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {vol.error ? (
                          <div className="flex flex-col items-center gap-1">
                            <Badge variant="outline" className="bg-[#fe4d97]/15 text-[#fe4d97] border-[#fe4d97]/20 font-bold">
                              No Permitido
                            </Badge>
                            <span className="text-[10px] text-red-500 font-medium">{vol.error}</span>
                          </div>
                        ) : vol.committeeId ? (
                          <Badge variant="outline" className="bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20 font-bold">
                            {vol.committeeName}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red/10 text-red border-red/20 font-bold">
                            Inválido: {vol.committeeName}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-8 font-mono text-xs text-slate-500">{vol.phone}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="p-8 bg-slate-50/50 border-t border-slate-100">
              <Button 
                onClick={handleImport} 
                disabled={isImporting || parsedData.some(v => !v.committeeId)} 
                className="w-full bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-xl h-12 font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
              >
                {isImporting ? (
                  <><span className="material-symbols-outlined text-[20px] mr-2 animate-spin">progress_activity</span> Importando...</>
                ) : (
                  <><span className="material-symbols-outlined text-[20px] mr-2">cloud_upload</span> Confirmar e Iniciar Importación</>
                )}
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      )}

      {step === 3 && (
        <motion.div variants={itemVariants}>
          <Card className="border border-[#6dd230]/20 bg-white shadow-xl shadow-[#6dd230]/5 rounded-3xl overflow-hidden">
            <CardHeader className="bg-[#6dd230]/5 p-10 text-center border-b border-[#6dd230]/10">
              <div className="w-20 h-20 bg-[#6dd230] rounded-full flex items-center justify-center text-white mx-auto mb-6 shadow-lg shadow-[#6dd230]/30">
                <span className="material-symbols-outlined text-[40px]">task_alt</span>
              </div>
              <CardTitle className="text-2xl font-bold text-slate-900">¡Importación Exitosa!</CardTitle>
              <CardDescription className="text-slate-500 text-lg mt-2 font-medium">
                Se han registrado los voluntarios y generado sus PINs de acceso.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-10 space-y-4">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 text-center">Lista de Envíos Pendientes</p>
              <div className="max-h-[600px] overflow-auto pr-2 space-y-3">
                {parsedData.map((vol, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 gap-6 group hover:bg-white hover:shadow-md transition-all">
                    <div>
                      <h4 className="font-bold text-slate-800 group-hover:text-[#4d7cfe] transition-colors">{vol.firstName} {vol.lastName}</h4>
                      <div className="flex items-center gap-4 mt-1.5">
                        <p className="text-sm text-slate-400 font-mono flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">call</span> {vol.phone}
                        </p>
                        <p className="text-sm text-slate-400 font-mono flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">key</span> PIN: <span className="font-bold text-slate-700">{vol.pin}</span>
                        </p>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      className="bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-xl px-6 font-bold shadow-sm shadow-green-500/20 h-10 transition-all active:scale-[0.95]"
                    >
                      <a href={vol.waLink} target="_blank" rel="noopener noreferrer" className="flex items-center">
                        <span className="material-symbols-outlined text-[18px] mr-2">send</span>
                        Enviar PIN
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="p-10 bg-slate-50/50 border-t border-slate-100">
              <Button variant="outline" className="w-full h-12 rounded-2xl border-slate-200 text-slate-600 font-bold" onClick={() => { setCsvText(""); setParsedData([]); setStep(1); }}>
                Realizar otra importación
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      )}

      <Toast 
        message={toast.message} 
        type={toast.type} 
        isVisible={toast.isVisible} 
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} 
      />
    </motion.div>
  );
}
