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
      className="w-full mx-auto space-y-6 md:space-y-10 pb-20"
    >
      {step === 1 && (
        <motion.div variants={itemVariants}>
          <Card className="border border-border bg-dark2 rounded-3xl shadow-sm overflow-hidden">
            <CardHeader className="bg-dark3 border-b border-border p-6 sm:p-8">
              <CardTitle className="font-bold text-text text-lg">1. Pegar datos CSV</CardTitle>
              <CardDescription className="text-text-dim font-medium mt-3 flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold mr-1">Formato:</span>
                {['Nombre', 'Apellido', 'Edad', 'Barrio', 'Estaca', 'Teléfono', 'Comité'].map(f => (
                  <Badge key={f} variant="secondary" className="bg-dark2 border border-border text-text-dim font-bold px-2 py-0.5 text-[10px] uppercase tracking-wider">{f}</Badge>
                ))}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-8">
              <textarea
                className="w-full h-64 sm:h-80 p-4 sm:p-6 rounded-2xl border border-border bg-dark3 font-mono text-sm focus:ring-4 focus:ring-[#4d7cfe]/10 focus:border-[#4d7cfe] outline-none transition-all resize-none text-text"
                placeholder="Juan, Pérez, 35, Las Colinas, Managua Sur, 88881111, Seguridad&#10;María, García, 28, El Dorado, Managua Este, 88882222, Guía"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </CardContent>
            <CardFooter className="flex-col sm:flex-row justify-end p-6 sm:p-8 bg-dark3 border-t border-border gap-4">
              <Button onClick={handleParse} disabled={!csvText.trim()} className="w-full sm:w-auto bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-xl h-12 px-8 font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-[0.97]">
                <span className="material-symbols-outlined text-[20px] mr-2">description</span>
                Procesar Datos
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      )}

      {step === 2 && (
        <motion.div variants={itemVariants}>
          <Card className="border border-border bg-dark2 rounded-3xl shadow-sm overflow-hidden">
            <CardHeader className="bg-dark3 border-b border-border p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="font-bold text-text flex items-center gap-3 text-lg">
                  <span className="material-symbols-outlined text-[24px] text-accent">check_circle</span>
                  Vista Previa de Datos
                </CardTitle>
                <CardDescription className="text-text-dim font-medium mt-1">
                  Se detectaron {parsedData.length} registros válidos.
                </CardDescription>
              </div>
              <Button variant="ghost" onClick={() => setStep(1)} className="w-full sm:w-auto text-text hover:text-text font-bold border border-border sm:border-transparent bg-dark2 sm:bg-transparent">
                Volver y Corregir
              </Button>
            </CardHeader>
            <CardContent className="p-0 bg-dark2">
              <div className="max-h-[500px] overflow-y-auto divide-y divide-border">
                {/* Desktop Header */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-8 py-4 bg-dark3 sticky top-0 z-10 border-b border-border font-bold text-[10px] uppercase tracking-widest text-text-dim">
                  <div className="col-span-4">Voluntario</div>
                  <div className="col-span-4">Ubicación</div>
                  <div className="col-span-2 text-center">Comité</div>
                  <div className="col-span-2 text-right">Contacto</div>
                </div>
                {/* Rows / Cards */}
                {parsedData.map((vol, i) => (
                  <div key={i} className="flex flex-col md:grid md:grid-cols-12 gap-4 px-5 sm:px-8 py-5 md:py-4 bg-dark2 hover:bg-dark3 transition-colors">
                    {/* User Info */}
                    <div className="md:col-span-4 flex justify-between md:block items-start">
                      <div>
                        <p className="font-bold text-text">{vol.firstName} {vol.lastName}</p>
                        <p className="text-[10px] font-bold text-text-dim uppercase mt-0.5 tracking-wider">{vol.age} años</p>
                      </div>
                      <div className="md:hidden">
                        {vol.error ? (
                          <Badge variant="outline" className="bg-[#fe4d97]/10 text-[#fe4d97] border-[#fe4d97]/20 font-bold text-[10px]">Error</Badge>
                        ) : vol.committeeId ? (
                          <Badge variant="outline" className="bg-[#4d7cfe]/10 text-[#4d7cfe] border-[#4d7cfe]/20 font-bold text-[10px]">{vol.committeeName}</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red/10 text-red border-red/20 font-bold text-[10px]">Inválido</Badge>
                        )}
                      </div>
                    </div>
                    {/* Location Info */}
                    <div className="md:col-span-4 flex items-center md:items-start text-sm font-medium text-text-dim gap-2 md:gap-0 md:flex-col">
                      <span className="material-symbols-outlined text-[18px] md:hidden text-text-dim">location_on</span>
                      <div>
                        <p>{vol.ward}</p>
                        <p className="text-[11px] font-bold text-text-dim leading-none mt-0.5 uppercase tracking-wider">{vol.stake}</p>
                      </div>
                    </div>
                    {/* Committee Desktop */}
                    <div className="hidden md:flex md:col-span-2 justify-center items-center">
                        {vol.error ? (
                          <div className="flex flex-col items-center gap-1 text-center">
                            <Badge variant="outline" className="bg-red-faint text-red border-red/20 font-bold text-[11px]">No Permitido</Badge>
                            <span className="text-[10px] text-red font-bold leading-tight">{vol.error}</span>
                          </div>
                        ) : vol.committeeId ? (
                          <Badge variant="outline" className="bg-[#4d7cfe]/10 text-[#4d7cfe] border-[#4d7cfe]/20 font-bold text-[11px]">
                            {vol.committeeName}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red/10 text-red border-red/20 font-bold text-[11px] text-center">
                            Inválido: {vol.committeeName}
                          </Badge>
                        )}
                    </div>
                    {/* Phone & Footer Mobile */}
                    <div className="md:col-span-2 flex justify-between md:justify-end items-center md:items-start pt-3 md:pt-0 border-t border-border md:border-none mt-2 md:mt-0">
                      <span className="text-[10px] font-bold text-text-dim uppercase tracking-widest md:hidden">Teléfono</span>
                      <span className="font-mono text-[13px] md:text-xs text-text font-bold bg-dark3 md:bg-transparent px-2 py-1 md:p-0 rounded border border-border md:border-none">{vol.phone}</span>
                    </div>
                    {/* Error display on mobile */}
                    {vol.error && (
                      <div className="md:hidden mt-2 p-3 bg-red-faint rounded-xl border border-red/20">
                        <p className="text-[11px] text-red font-bold flex items-center gap-1.5 leading-tight">
                          <span className="material-symbols-outlined text-[16px]">error</span> {vol.error}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="p-6 sm:p-8 bg-dark3 border-t border-border">
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
          <Card className="border border-accent/20 bg-dark2 shadow-xl shadow-accent/5 rounded-3xl overflow-hidden">
            <CardHeader className="bg-accent/5 p-8 sm:p-10 text-center border-b border-accent/10">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-accent rounded-full flex items-center justify-center text-white mx-auto mb-6 shadow-lg shadow-accent/30">
                <span className="material-symbols-outlined text-[32px] sm:text-[40px]">task_alt</span>
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold text-text">¡Importación Exitosa!</CardTitle>
              <CardDescription className="text-text-dim text-base sm:text-lg mt-2 font-medium">
                Se han registrado los voluntarios y generado sus PINs de acceso.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 sm:p-10 space-y-4">
              <p className="text-xs font-bold text-text-dim uppercase tracking-widest mb-6 text-center">Lista de Envíos Pendientes</p>
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
              <Button variant="outline" className="w-full h-12 rounded-2xl border-border bg-dark2 text-text font-bold hover:bg-dark3" onClick={() => { setCsvText(""); setParsedData([]); setStep(1); }}>
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
