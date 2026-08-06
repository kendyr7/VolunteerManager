'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VolunteerProfileView } from './VolunteerProfileView';
import { useCoordinatorData } from '@/lib/coordinator-data-context';
import { canEditShifts } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/client';
import { Toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getActiveEventDays, formatDateShort } from '@/lib/dates';

export interface VolunteerProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  volunteer: any | null;
  mode?: 'coordinator' | 'volunteer';
}

export function VolunteerProfileDrawer({
  isOpen,
  onClose,
  volunteer,
  mode = 'coordinator',
}: VolunteerProfileDrawerProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit_profile'>('view');
  const [isEditingShifts, setIsEditingShifts] = useState(false);

  // Edit Profile Form States
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStake, setEditStake] = useState('');
  const [editWard, setEditWard] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editCommitteeId, setEditCommitteeId] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false,
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type, isVisible: true });
  };

  const {
    rawVolunteers = [],
    committeesList = [],
    shiftsData = [],
    globalShifts = {},
    checkedInMap = {},
    checkedOutMap = {},
    refresh,
  } = useCoordinatorData();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync volunteer object with latest data from context
  const activeVolunteer = useMemo(() => {
    if (!volunteer) return null;
    const volId = volunteer.id || volunteer.volunteer_id || volunteer.volunteerId;
    const volName = (volunteer.name || volunteer.volunteerName || `${volunteer.first_name || ''} ${volunteer.last_name || ''}`).trim().toLowerCase();

    const match = rawVolunteers.find((v: any) => {
      if (volId && v.id === volId) return true;
      const vName = (v.name || `${v.first_name || ''} ${v.last_name || ''}`).trim().toLowerCase();
      if (volName && vName === volName) return true;
      return false;
    });

    const target = match || volunteer;

    let commName = target.committee || target.committeeName || target.committees?.name || '';
    if (!commName && target.committee_id && committeesList.length > 0) {
      const foundComm = committeesList.find((c: any) => c.id === target.committee_id);
      if (foundComm) commName = foundComm.name;
    }

    return {
      ...target,
      id: volId || target.id,
      name: target.name || target.volunteerName || `${target.first_name || ''} ${target.last_name || ''}`.trim(),
      first_name: target.first_name || (target.name || target.volunteerName || '').split(' ')[0] || '',
      last_name: target.last_name || (target.name || target.volunteerName || '').split(' ').slice(1).join(' ') || '',
      committee: commName,
      ward: target.ward || target.neighborhood || target.barrio || '',
      stake: target.stake || '',
      phone: target.phone || '',
      reliability: target.reliability ?? target.computedReliability ?? 100,
      age: target.age ?? undefined,
    };
  }, [volunteer, rawVolunteers, committeesList]);

  // Compute shifts by day for active volunteer
  const shiftsByDay = useMemo(() => {
    if (!activeVolunteer) return {};
    if (globalShifts[activeVolunteer.id]) {
      return globalShifts[activeVolunteer.id];
    }
    const result: Record<string, string[]> = {};
    shiftsData.forEach((s: any) => {
      if (s.volunteer_id === activeVolunteer.id) {
        if (!result[s.day_key]) result[s.day_key] = [];
        if (!result[s.day_key].includes(s.shift_key)) {
          result[s.day_key].push(s.shift_key);
        }
      }
    });
    return result;
  }, [activeVolunteer, globalShifts, shiftsData]);

  // Reset drawer state when volunteer changes
  useEffect(() => {
    if (isOpen && activeVolunteer) {
      setDrawerMode('view');
      setIsEditingShifts(false);

      const parts = (activeVolunteer.name || `${activeVolunteer.first_name || ''} ${activeVolunteer.last_name || ''}`).trim().split(/\s+/);
      const fn = activeVolunteer.first_name || (parts.length >= 2 ? parts.slice(0, Math.ceil(parts.length / 2)).join(' ') : parts[0] || '');
      const ln = activeVolunteer.last_name || (parts.length >= 2 ? parts.slice(Math.ceil(parts.length / 2)).join(' ') : '');

      setEditFirstName(fn);
      setEditLastName(ln);
      setEditPhone(activeVolunteer.phone || '');
      setEditStake(activeVolunteer.stake || '');
      setEditWard(activeVolunteer.ward || '');
      setEditAge(activeVolunteer.age ? String(activeVolunteer.age) : '');

      const comm = committeesList.find((c: any) => c.name === activeVolunteer.committee);
      setEditCommitteeId(comm ? comm.id : '');
    }
  }, [isOpen, activeVolunteer, committeesList]);

  if (!isOpen || !activeVolunteer) return null;

  const handleToggleShift = async (dayKey: string, shiftKey: string) => {
    const isCurrentlyAssigned = shiftsByDay[dayKey]?.includes(shiftKey);
    const supabase = createClient();

    try {
      if (isCurrentlyAssigned) {
        await supabase
          .from('shifts')
          .delete()
          .eq('volunteer_id', activeVolunteer.id)
          .eq('day_key', dayKey)
          .eq('shift_key', shiftKey);
      } else {
        await supabase
          .from('shifts')
          .upsert({
            volunteer_id: activeVolunteer.id,
            day_key: dayKey,
            shift_key: shiftKey,
          });
      }
      await refresh(true);
    } catch (e: any) {
      showToast(e?.message || 'Error al actualizar turno', 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVolunteer) return;

    const trimmedFirstName = editFirstName.trim();
    const trimmedLastName = editLastName.trim();
    const trimmedPhone = editPhone.trim();
    const trimmedStake = editStake.trim();
    const trimmedWard = editWard.trim();
    const trimmedAge = editAge.trim();

    if (!trimmedFirstName || trimmedFirstName.length < 2) {
      showToast('Ingresa un nombre válido (mínimo 2 caracteres)', 'error');
      return;
    }

    if (!trimmedLastName || trimmedLastName.length < 2) {
      showToast('Ingresa un apellido válido (mínimo 2 caracteres)', 'error');
      return;
    }

    const phoneDigits = trimmedPhone.replace(/[^\d]/g, '');
    if (!trimmedPhone || phoneDigits.length < 7) {
      showToast('Ingresa un número de teléfono válido (mínimo 7 dígitos)', 'error');
      return;
    }

    let ageNum: number | null = null;
    if (trimmedAge) {
      const parsedAge = parseInt(trimmedAge, 10);
      if (isNaN(parsedAge) || parsedAge < 10 || parsedAge > 120) {
        showToast('La edad debe ser un número entre 10 y 120 años', 'error');
        return;
      }
      ageNum = parsedAge;
    }

    setIsSavingProfile(true);
    const supabase = createClient();

    const commObj = committeesList.find((c: any) => c.id === editCommitteeId || c.name === editCommitteeId);

    const { error } = await supabase
      .from('volunteers')
      .update({
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        phone: trimmedPhone,
        stake: trimmedStake,
        neighborhood: trimmedWard,
        committee_id: commObj ? commObj.id : (editCommitteeId || null),
        age: ageNum,
      })
      .eq('id', activeVolunteer.id);

    setIsSavingProfile(false);

    if (error) {
      showToast('Error al guardar cambios del perfil', 'error');
    } else {
      showToast('Perfil de voluntario actualizado correctamente');
      setDrawerMode('view');
      await refresh(true);
    }
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-[110] flex transition-all duration-300',
        isMobile ? 'flex-col justify-end' : 'justify-end',
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      )}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div
        id="unified-volunteer-drawer"
        className={cn(
          'relative flex flex-col overflow-x-hidden overflow-y-auto transition-transform duration-300 ease-out bg-dark2 text-text shadow-2xl border-l border-border max-w-full z-10',
          isMobile
            ? `w-full h-[94dvh] rounded-t-[40px] border-0 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`
            : `w-[450px] max-w-full h-full ${isOpen ? 'translate-x-0' : 'translate-x-full'}`
        )}
        style={{ willChange: 'transform' }}
      >
        <div className="relative z-10 flex flex-col h-full w-full max-w-full overflow-x-hidden">
          {/* Mobile Drag Handle */}
          {isMobile && (
            <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
          )}

          {/* Floating Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-dark3/80 hover:bg-dark border border-border text-text-dim hover:text-text flex items-center justify-center transition-colors cursor-pointer backdrop-blur-md"
            title="Cerrar"
          >
            ✕
          </button>

          <div
            className={cn(
              'flex-1 overflow-y-auto overflow-x-hidden max-w-full scrollbar-hide px-4 pb-6 overscroll-contain',
              !isMobile && 'pt-4 px-6'
            )}
          >
            <AnimatePresence mode="wait">
              {drawerMode === 'view' ? (
                <motion.div
                  key="view"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                >
                  <VolunteerProfileView
                    volunteer={activeVolunteer}
                    mode={mode}
                    shiftsByDay={shiftsByDay}
                    checkedInMap={checkedInMap}
                    checkedOutMap={checkedOutMap}
                    onToggleShift={handleToggleShift}
                    isEditingShifts={isEditingShifts}
                    canEditShifts={canEditShifts()}
                    onStartEditShifts={() => setIsEditingShifts(prev => !prev)}
                    onStartEditProfile={() => setDrawerMode('edit_profile')}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="edit"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                  className="py-2"
                >
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-1">
                          Nombres:
                        </label>
                        <input
                          type="text"
                          required
                          value={editFirstName}
                          onChange={e => setEditFirstName(e.target.value)}
                          className="w-full bg-dark3 border border-border text-text text-xs p-3 rounded-xl focus:outline-none focus:border-[#4d7cfe]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-1">
                          Apellidos:
                        </label>
                        <input
                          type="text"
                          required
                          value={editLastName}
                          onChange={e => setEditLastName(e.target.value)}
                          className="w-full bg-dark3 border border-border text-text text-xs p-3 rounded-xl focus:outline-none focus:border-[#4d7cfe]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-1">
                        Teléfono (Celular WhatsApp):
                      </label>
                      <input
                        type="text"
                        required
                        value={editPhone}
                        onChange={e => setEditPhone(e.target.value)}
                        className="w-full bg-dark3 border border-border text-text text-xs p-3 rounded-xl focus:outline-none focus:border-[#4d7cfe]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-1">
                        Comité:
                      </label>
                      <select
                        value={editCommitteeId}
                        onChange={e => setEditCommitteeId(e.target.value)}
                        className="w-full bg-dark3 border border-border text-text text-xs p-3 rounded-xl focus:outline-none focus:border-[#4d7cfe]"
                      >
                        <option value="">Selecciona un comité</option>
                        {committeesList.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-1">
                          Estaca:
                        </label>
                        <input
                          type="text"
                          value={editStake}
                          onChange={e => setEditStake(e.target.value)}
                          className="w-full bg-dark3 border border-border text-text text-xs p-3 rounded-xl focus:outline-none focus:border-[#4d7cfe]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-1">
                          Barrio:
                        </label>
                        <input
                          type="text"
                          value={editWard}
                          onChange={e => setEditWard(e.target.value)}
                          className="w-full bg-dark3 border border-border text-text text-xs p-3 rounded-xl focus:outline-none focus:border-[#4d7cfe]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider block mb-1">
                        Edad:
                      </label>
                      <input
                        type="number"
                        value={editAge}
                        onChange={e => setEditAge(e.target.value)}
                        className="w-full bg-dark3 border border-border text-text text-xs p-3 rounded-xl focus:outline-none focus:border-[#4d7cfe]"
                      />
                    </div>

                    <div className="pt-4 border-t border-border flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDrawerMode('view')}
                        className="flex-1 h-11 rounded-full text-xs font-bold border-border text-text bg-dark3 hover:bg-dark cursor-pointer"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={isSavingProfile}
                        className="flex-1 bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full h-11 text-xs font-bold shadow-lg cursor-pointer"
                      >
                        {isSavingProfile ? 'Guardando...' : 'Guardar Cambios'}
                      </Button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />
    </div>
  );
}
