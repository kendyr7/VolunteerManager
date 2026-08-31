import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validatePhone8Digits } from "@/lib/whatsapp";
import { sendVolunteerCredentialsAction } from "@/app/actions/whatsapp";
import { createVolunteerAction } from "@/app/actions/volunteer-actions";
import { SharedPhoneWarning } from "@/components/SharedPhoneWarning";
import { normalizeVolunteerIdentity, volunteerIdentityError } from "@/lib/volunteer-identity";

interface AddVolunteerFormProps {
  committeesList?: { id: string; name: string }[];
  onSuccess?: () => void;
  onClose?: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function AddVolunteerForm({ committeesList = [], onSuccess, onClose, showToast }: AddVolunteerFormProps) {
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newStake, setNewStake] = useState('');
  const [newWard, setNewWard] = useState('');
  const [newCommitteeId, setNewCommitteeId] = useState('');
  const [sendWelcomeMessage, setSendWelcomeMessage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneConflicts, setPhoneConflicts] = useState<string[]>([]);

  const resetForm = () => {
    setNewFirstName('');
    setNewLastName('');
    setNewPhone('');
    setNewAge('');
    setNewStake('');
    setNewWard('');
    setNewCommitteeId('');
    setSendWelcomeMessage(false);
    setPhoneConflicts([]);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose?.();
  };

  const submitVolunteer = async (allowSharedPhone = false) => {

    const identity = normalizeVolunteerIdentity({
      firstName: newFirstName, lastName: newLastName, stake: newStake, neighborhood: newWard,
    });
    const identityError = volunteerIdentityError(identity);
    if (identityError) {
      showToast(identityError, "error");
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

    try {
      const result = await createVolunteerAction({
        ...identity,
        phone: sanitizedPhone,
        age: ageNum,
        committeeId: newCommitteeId || null,
        allowSharedPhone,
      });

      if (!result.success || !result.volunteer) {
        if (result.reason === 'phone_conflict' && result.conflictingVolunteers?.length) {
          setPhoneConflicts(result.conflictingVolunteers.map(volunteer => volunteer.name));
          return;
        }
        showToast(result.error || "Error al añadir voluntario", "error");
        return;
      }

      if (sendWelcomeMessage) {
        try {
          const waResult = await sendVolunteerCredentialsAction({ volunteerId: result.volunteer.id });
          if (!waResult.success) {
            showToast("Voluntario añadido, pero falló el envío de WhatsApp", "info");
          } else {
            showToast("Voluntario añadido y credenciales enviadas");
          }
        } catch {
          showToast("Voluntario añadido, pero falló el envío de WhatsApp", "info");
        }
      } else {
        showToast(allowSharedPhone ? "Voluntario añadido con teléfono compartido" : "Voluntario añadido");
      }

      resetForm();
      onSuccess?.();
      onClose?.();
    } catch (error) {
      console.error("Error al añadir voluntario:", error);
      showToast("Error al añadir voluntario", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitVolunteer(false);
  };

  return (
    <form onSubmit={handleAddVolunteer} className="flex flex-col h-full">
      <div data-mobile-drawer-scroll className="flex-1 overflow-y-auto px-6 py-4 space-y-6 overscroll-contain">
        <div className="space-y-2">
            <label htmlFor="volunteer-given-names" className="block text-xs font-extrabold text-text">Nombres</label>
            <Input id="volunteer-given-names" autoComplete="given-name" required className="h-10 rounded-lg border-border bg-dark3 text-text text-sm font-bold" placeholder="Ej. Juan Carlos" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} aria-describedby="volunteer-name-help" />
            <p id="volunteer-name-help" className="text-xs text-text">Incluye todos sus nombres; por ejemplo, María del Carmen.</p>
        </div>
        <div className="space-y-2">
            <label htmlFor="volunteer-family-names" className="block text-xs font-extrabold text-text">Apellidos</label>
            <Input id="volunteer-family-names" autoComplete="family-name" required className="h-10 rounded-lg border-border bg-dark3 text-text text-sm font-bold" placeholder="Ej. Pérez López" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
              <label className="block text-xs font-extrabold text-text">Celular</label>
              <Input
                required
                type="tel"
                inputMode="numeric"
                maxLength={8}
                className="h-10 rounded-lg border-border bg-dark3 text-text text-sm font-bold"
                placeholder="Ej. 88888888"
                value={newPhone}
                onChange={(e) => {
                  setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 8));
                  setPhoneConflicts([]);
                }}
              />
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
        {phoneConflicts.length > 0 && (
          <SharedPhoneWarning
            phone={newPhone}
            names={phoneConflicts}
            isConfirming={isSubmitting}
            onDismiss={() => setPhoneConflicts([])}
            onConfirm={() => void submitVolunteer(true)}
          />
        )}
        <div className="space-y-2">
            <label htmlFor="volunteer-stake" className="block text-xs font-extrabold text-text">Estaca / Distrito</label>
            <Input id="volunteer-stake" required className="h-10 rounded-lg border-border bg-dark3 text-text text-sm font-bold" placeholder="Ej. Managua o Granada" value={newStake} onChange={(e) => setNewStake(e.target.value)} />
        </div>
        <div className="space-y-2">
            <label htmlFor="volunteer-ward" className="block text-xs font-extrabold text-text">Barrio / Rama</label>
            <Input id="volunteer-ward" required className="h-10 rounded-lg border-border bg-dark3 text-text text-sm font-bold" placeholder="Ej. Ciudad Sandino" value={newWard} onChange={(e) => setNewWard(e.target.value)} />
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
      <div className="grid grid-cols-2 gap-3 border-t border-border p-4 sm:p-6">
        <Button type="button" variant="outline" onClick={handleClose} className="flex-1 rounded-full">Cancelar</Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1 rounded-full bg-[#4d7cfe] text-white">Añadir</Button>
      </div>
    </form>
  );
}
