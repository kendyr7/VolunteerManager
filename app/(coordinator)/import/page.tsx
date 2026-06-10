'use client'

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { generatePinMessage, generateWaMeLink } from "@/lib/whatsapp";

// Estructura esperada del voluntario
interface ParsedVolunteer {
  firstName: string;
  lastName: string;
  age: string;
  ward: string;
  stake: string;
  phone: string;
  pin?: string;
  waLink?: string;
}

export default function ImportPage() {
  const [csvText, setCsvText] = useState("");
  const [parsedData, setParsedData] = useState<ParsedVolunteer[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Input, 2: Preview, 3: Success/Links

  const handleParse = () => {
    // Parser super básico para demostración. 
    // En producción se usaría algo como papaparse
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    
    // Asumimos que no hay headers en este mock o los saltamos
    const data = lines.map(line => {
      const parts = line.split(',');
      return {
        firstName: parts[0]?.trim() || '',
        lastName: parts[1]?.trim() || '',
        age: parts[2]?.trim() || '',
        ward: parts[3]?.trim() || '',
        stake: parts[4]?.trim() || '',
        phone: parts[5]?.trim() || ''
      };
    }).filter(v => v.firstName && v.phone);

    if (data.length > 0) {
      setParsedData(data);
      setStep(2);
    }
  };

  const handleImport = () => {
    // Simular generación de PIN y guardado en DB
    const finalData = parsedData.map(vol => {
      const pin = Math.floor(1000 + Math.random() * 9000).toString(); // Random 4-digit
      const message = generatePinMessage(`${vol.firstName} ${vol.lastName}`, pin, "https://app.templomanagua.org");
      const waLink = generateWaMeLink(vol.phone, message);
      return { ...vol, pin, waLink };
    });

    setParsedData(finalData);
    setStep(3);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Importación Masiva</h2>
        <p className="text-slate-500 mt-1">Añade múltiples voluntarios copiando un archivo CSV.</p>
      </div>

      {step === 1 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Pegar datos CSV</CardTitle>
            <CardDescription>
              Formato esperado por fila: Nombre, Apellido, Edad, Barrio, Estaca, Teléfono
            </CardDescription>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full h-64 p-4 rounded-xl border border-slate-200 bg-slate-50 font-mono text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all"
              placeholder="Juan, Pérez, 35, Las Colinas, Managua Sur, 88881111&#10;María, García, 28, El Dorado, Managua Este, 88882222"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </CardContent>
          <CardFooter className="justify-end">
            <Button onClick={handleParse} disabled={!csvText.trim()} className="bg-[#0084d1] hover:bg-[#006eb3]">
              <FileText className="w-4 h-4 mr-2" />
              Procesar Datos
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-0 shadow-sm animate-in fade-in slide-in-from-bottom-4">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Vista Previa
            </CardTitle>
            <CardDescription>
              Se detectaron {parsedData.length} voluntarios. Revisa que los datos sean correctos antes de confirmar.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0 shadow-sm">
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Barrio / Estaca</TableHead>
                  <TableHead>Teléfono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedData.map((vol, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{vol.firstName} {vol.lastName}</TableCell>
                    <TableCell>{vol.ward}, {vol.stake}</TableCell>
                    <TableCell className="font-mono text-sm">{vol.phone}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="justify-between border-t border-slate-100 pt-6">
            <Button variant="ghost" onClick={() => setStep(1)}>Volver y editar</Button>
            <Button onClick={handleImport} className="bg-[#0084d1] hover:bg-[#006eb3] text-white">
              <UploadCloud className="w-4 h-4 mr-2" />
              Generar PINs e Importar
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 3 && (
        <Card className="border-0 shadow-sm border-t-4 border-t-emerald-500 animate-in fade-in slide-in-from-bottom-4">
          <CardHeader>
            <CardTitle className="text-lg">¡Importación Exitosa!</CardTitle>
            <CardDescription>
              Se han generado los PINs. Ahora envía los mensajes de WhatsApp a cada voluntario para que puedan acceder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {parsedData.map((vol, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 gap-4">
                <div>
                  <h4 className="font-semibold text-slate-800">{vol.firstName} {vol.lastName}</h4>
                  <p className="text-sm text-slate-500 font-mono mt-1">Tel: {vol.phone} • PIN: <span className="font-bold text-slate-700">{vol.pin}</span></p>
                </div>
                <Button render={<a href={vol.waLink} target="_blank" rel="noopener noreferrer" />} size="sm" className="bg-[#25D366] hover:bg-[#1ebd5a] text-white whitespace-nowrap shadow-sm">
                  <Send className="w-4 h-4 mr-2" />
                  Enviar PIN
                </Button>
              </div>
            ))}
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => { setCsvText(""); setParsedData([]); setStep(1); }}>
              Realizar otra importación
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
