import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validatePhone8Digits } from "@/lib/whatsapp";
import { sendWelcomeWhatsAppAction } from "@/app/actions/whatsapp";
import { createVolunteerAction } from "@/app/actions/volunteer-actions";

interface AddVolunteerFormProps {
  committeesList?: { id: string; name: string }[];
  onSuccess?: () => void;
  onClose?: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function AddVolunteerForm({ committeesList = [], onSuccess, onClose, showToast }: AddVolunteerFormProps) {
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newStake, setNewStake] = useState('');
  const [newWard, setNewWard] = useState('');
  const [newCommitteeId, setNewCommitteeId] = useState('');
  const [sendWelcomeMessage, setSendWelcomeMessage] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();

    const parts = newName.trim().split(/\s+/);
    const first_name = parts[0] || '';
    const last_name = parts.slice(1).join(' ') || '';

    if (parts.length < 2 || !last_name) {
      showToast("Por favor, introduce al menos un nombre y un apellido.", "error");
      return;
    }

    const phoneValidation = validatePhone8Digits(newPhone);
    if (!phoneValidation.isValid) {
      showToast(phoneValidation.error || "El celular debe tener exactamente 8 dígitos.", "error");
      return;
    }

    let ageNum: number | null = null;
    if (newAge.trim()) {
      const parsedAge = parseInt(newAge.trim(), 10);
      if (isNaN(parsedAge) || parsedAge < 10 || parsedAge > 120) {
        showToast("La edad debe ser un número entre 10 y 120 años.", "error");
        return;
      }
      ageNum = parsedAge;
    }

    const sanitizedPhone = phoneValidation.formatted;
    setIsSubmitting(true);

    const result = await createVolunteerAction({
      firstName: first_name,
      lastName: last_name,
      phone: sanitizedPhone,
      age: ageNum,
      committeeId: newCommitteeId || null,
      stake: newStake,
      neighborhood: newWard,
    });

    if (!result.success || !result.volunteer) {
      showToast(result.error || "Error al añadir voluntario", "error");
      setIsSubmitting(false);
      return;
    }

    const pin = result.volunteer.pin;

    if (sendWelcomeMessage) {
      const waResult = await sendWelcomeWhatsAppAction(sanitizedPhone, first_name, pin);
      if (!waResult.success) {
        showToast("Voluntario añadido, pero falló el envío de WhatsApp", "info");
      } else {
        showToast("Voluntario añadido y credenciales enviadas");
      }
    } else {
      showToast("Voluntario añadido");
    }

    if (onSuccess) onSuccess();
    if (onClose) onClose();
  };

  return (
    <form onSubmit={handleAddVolunteer} className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        <div className="space-y-2">
            <label className="block text-xs font-extrabold text-text">Nombre y Apellido</label>
            <Input required minLength={3} className="h-10 rounded-lg border-border bg-dark3 text-text text-sm font-bold" placeholder="Ej. Juan Pérez" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
              <label className="block text-xs font-extrabold text-text">Celular</label>
              <Input required type="tel" maxLength={8} className="h-10 rounded-lg border-border bg-dark3 text-text text-sm font-bold" placeholder="Ej. 88888888" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
              <label className="block text-xs font-extrabold text-text">Edad</label>
              <Input
                type="text"
                inputMode="numeric"
                className="h-10 rounded-lg border-border bg-dark3 text-text text-sm font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="Ej. 24"
                value={newAge}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d{0,3}$/.test(val)) {
                    setNewAge(val);
                  }
                }}
              />
          </div>
        </div>
        <div className="space-y-2">
            <label className="block text-xs font-extrabold text-text">Estaca</label>
            <Input required className="h-10 rounded-lg border-border bg-dark3 text-text text-sm font-bold" placeholder="Ej. Managua Sur" value={newStake} onChange={(e) => setNewStake(e.target.value)} />
        </div>
        <div className="space-y-2">
            <label className="block text-xs font-extrabold text-text">Barrio / Rama</label>
            <Input required className="h-10 rounded-lg border-border bg-dark3 text-text text-sm font-bold" placeholder="Ej. Barrio / Rama 1" value={newWard} onChange={(e) => setNewWard(e.target.value)} />
        </div>
        <div className="space-y-2">
            <label className="block text-xs font-extrabold text-text">Comité</label>
            <Select value={newCommitteeId} onValueChange={(val: string | null) => setNewCommitteeId(val || '')}>
                <SelectTrigger className="h-10 rounded-lg border-border bg-dark3 text-text text-sm font-bold">
                    <SelectValue placeholder="Selecciona">
                        {committeesList.find(c => c.id === newCommitteeId)?.name}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-dark2 border-border text-text">
                    {committeesList.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
        <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-dark3 cursor-pointer">
            <input type="checkbox" checked={sendWelcomeMessage} onChange={(e) => setSendWelcomeMessage(e.target.checked)} className="w-4 h-4 rounded border-border bg-dark3" />
            <span className="text-xs font-bold text-text">Enviar credenciales por WhatsApp</span>
        </label>
      </div>
      <div className="p-6 border-t border-border flex gap-3">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-full">Cancelar</Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1 rounded-full bg-[#4d7cfe] text-white">Añadir</Button>
      </div>
    </form>
  );
}
