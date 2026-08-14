'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VolunteerProfileView } from './VolunteerProfileView';
import { useCoordinatorData } from '@/lib/coordinator-data-context';
import { canEditShifts } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/client';
import { Toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from '@/lib/utils';
import { getActiveEventDays, formatDateShort } from '@/lib/dates';
import { validatePhone8Digits } from '@/lib/whatsapp';

import { useVolunteerStore } from '@/lib/store/use-volunteer-store';
import { updateVolunteerAction, toggleShiftAction } from '@/app/actions/volunteer-actions';
import { realtimeDebugLogger } from '@/lib/services/realtime-debug-logger';
import { useMobileDrawerNavigation } from '@/lib/use-mobile-drawer-navigation';


export interface VolunteerProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  volunteer?: any | null;
  volunteerId?: string | null;
  mode?: 'coordinator' | 'volunteer';
  initialMode?: 'view' | 'edit_profile';
}

export function VolunteerProfileDrawer({
  isOpen,
  onClose,
  volunteer: propVolunteer,
  volunteerId: propVolunteerId,
  mode = 'coordinator',
  initialMode = 'view',
}: VolunteerProfileDrawerProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit_profile'>(initialMode);
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
  const { drawerRef, scrollAreaRef } = useMobileDrawerNavigation({
    isOpen,
    onClose,
    disabled: isSavingProfile,
  });

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

  useEffect(() => {
    if (isOpen) {
      const volId = propVolunteerId || propVolunteer?.id || 'unknown';
      performance.mark(`profile-open-${volId}`);
      console.log(`[Profile Drawer Telemetry] Open mark recorded for ${volId}`);
      return () => {
        try {
          performance.mark(`profile-close-${volId}`);
          performance.measure(`profile-visible-duration-${volId}`, `profile-open-${volId}`, `profile-close-${volId}`);
        } catch (e) {
          // ignore if mark missing
        }
      };
    }
  }, [isOpen, propVolunteerId, propVolunteer]);

  const targetId = propVolunteerId || propVolunteer?.id || propVolunteer?.volunteer_id || propVolunteer?.volunteerId;
  const storeVolunteer = useVolunteerStore(s => targetId ? s.volunteersMap.get(targetId) : undefined);
  // storeShifts is undefined when the volunteer has NO entry in the map yet.
  // storeShifts is an array (possibly empty []) when the store IS the source of truth.
  // This selector is reactive: any change to shiftsByVolunteerMap triggers a re-render.
  const storeShifts = useVolunteerStore(s => targetId ? s.shiftsByVolunteerMap.get(targetId) : undefined);
  // Reactive: true when the volunteer has an entry in the store (even with 0 shifts).
  const hasStoreEntry = useVolunteerStore(s => targetId ? s.shiftsByVolunteerMap.has(targetId) : false);

  // Sync volunteer object with latest data from context or store
  const activeVolunteer = useMemo(() => {
    const source = storeVolunteer ? 'storeVolunteer' : (targetId ? (rawVolunteers.find((v: any) => v.id === targetId) ? 'rawVolunteers' : 'propVolunteer') : 'propVolunteer');
    const target = storeVolunteer || (targetId ? rawVolunteers.find((v: any) => v.id === targetId) : null) || propVolunteer;
    if (!target) return null;

    let commName = target.committee || target.committeeName || target.committees?.name || '';
    if (!commName && target.committee_id && committeesList.length > 0) {
      const foundComm = committeesList.find((c: any) => c.id === target.committee_id);
      if (foundComm) commName = foundComm.name;
    }

    // Canonical precedence: Prefer Database field 'neighborhood' over pre-mapped string 'ward'
    const resolvedWard = target.neighborhood ?? target.ward ?? target.barrio ?? '';

    console.log('[RT-TRACE][REACT_SOURCE_STATE]', {
      clientId: realtimeDebugLogger.getClientSessionId(),
      recordId: target.id || targetId,
      source,
      rawVolunteerNeighborhood: target.neighborhood,
      rawVolunteerStake: target.stake,
      resolvedWard,
      timestamp: new Date().toISOString()
    });

    return {
      ...target,
      id: target.id || targetId,
      name: target.name || target.volunteerName || `${target.first_name || ''} ${target.last_name || ''}`.trim(),
      first_name: target.first_name || (target.name || target.volunteerName || '').split(' ')[0] || '',
      last_name: target.last_name || (target.name || target.volunteerName || '').split(' ').slice(1).join(' ') || '',
      committee: commName,
      ward: resolvedWard,
      stake: target.stake || '',
      phone: target.phone || '',
      reliability: target.reliability ?? target.computedReliability ?? 100,
      age: target.age ?? undefined,
    };
  }, [propVolunteer, propVolunteerId, storeVolunteer, rawVolunteers, committeesList, targetId]);

  // Compute shifts by day for active volunteer.
  // Layer 1 (reactive): Zustand store via `storeShifts` and `hasStoreEntry` selectors.
  // Layer 2 (fallback): globalShifts from CoordinatorData.
  // Layer 3 (fallback): flat shiftsData array.
  // NOTE: hasStoreEntry must be the reactive selector (above), NOT useVolunteerStore.getState(),
  // otherwise React will not re-render when shifts are added/removed.
  const shiftsByDay = useMemo(() => {
    if (!activeVolunteer) return {};
    const result: Record<string, string[]> = {};

    console.log('[RT-TRACE][DRAWER_SHIFTS_MEMO]', {
      volunteerId: activeVolunteer.id,
      hasStoreEntry,
      storeShiftsCount: storeShifts?.length ?? 'undefined',
      timestamp: new Date().toISOString()
    });

    // If the store has an entry for this volunteer (even an empty array after all shifts deleted),
    // use Zustand as the single source of truth. This prevents stale fallback data.
    if (hasStoreEntry) {
      (storeShifts || []).forEach((s: any) => {
        if (!result[s.day_key]) result[s.day_key] = [];
        if (!result[s.day_key].includes(s.shift_key)) {
          result[s.day_key].push(s.shift_key);
        }
      });
      return result;
    }

    if (globalShifts[activeVolunteer.id]) {
      return globalShifts[activeVolunteer.id];
    }

    shiftsData.forEach((s: any) => {
      if (s.volunteer_id === activeVolunteer.id) {
        if (!result[s.day_key]) result[s.day_key] = [];
        if (!result[s.day_key].includes(s.shift_key)) {
          result[s.day_key].push(s.shift_key);
        }
      }
    });
    return result;
  }, [activeVolunteer, hasStoreEntry, storeShifts, globalShifts, shiftsData]);

  const prevVolunteerIdRef = useRef<string | null>(null);

  // Reset drawer state when volunteer changes
  useEffect(() => {
    if (!isOpen) {
      prevVolunteerIdRef.current = null;
      return;
    }

    if (isOpen && activeVolunteer) {
      const isNewVolunteer = prevVolunteerIdRef.current !== activeVolunteer.id;
      if (isNewVolunteer) {
        prevVolunteerIdRef.current = activeVolunteer.id;
        setDrawerMode(initialMode);
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

        const comm = committeesList.find((c: any) => c.id === activeVolunteer.committee_id || c.name === activeVolunteer.committee);
        setEditCommitteeId(comm ? comm.id : (activeVolunteer.committee_id || ''));
      }
    }
  }, [isOpen, activeVolunteer?.id, committeesList, initialMode]);

  if (!isOpen || !activeVolunteer) return null;

  const handleToggleShift = async (dayKey: string, shiftKey: string) => {
    const isCurrentlyAssigned = shiftsByDay[dayKey]?.includes(shiftKey);

    try {
      const result = await toggleShiftAction(
        activeVolunteer.id,
        dayKey,
        shiftKey,
        !isCurrentlyAssigned
      );
      if (!result.success) {
        showToast(result.error || 'Error al actualizar turno', 'error');
        return;
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

    const phoneValidation = validatePhone8Digits(trimmedPhone);
    if (!phoneValidation.isValid) {
      showToast(phoneValidation.error || 'Ingresa un número de teléfono válido de 8 dígitos', 'error');
      return;
    }
    const sanitizedPhone = phoneValidation.formatted;

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

    const commObj = committeesList.find((c: any) => c.id === editCommitteeId || c.name === editCommitteeId);

    const result = await updateVolunteerAction(activeVolunteer.id, {
      firstName:    trimmedFirstName,
      lastName:     trimmedLastName,
      phone:        sanitizedPhone,
      stake:        trimmedStake || null,
      neighborhood: trimmedWard || null,
      committeeId:  commObj ? commObj.id : (editCommitteeId || null),
      age:          ageNum,
    });

    setIsSavingProfile(false);

    if (!result.success) {
      showToast(result.error || 'Error al guardar cambios del perfil', 'error');
    } else {
      showToast('Perfil de voluntario actualizado correctamente');
      setDrawerMode('view');
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
        ref={drawerRef}
        id="unified-volunteer-drawer"
        className={cn(
          'relative flex flex-col overflow-hidden transition-transform duration-300 ease-out bg-dark2 text-text shadow-2xl border-l border-border max-w-full z-10',
          isMobile
            ? `w-full h-[90dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] rounded-t-[40px] border-0 pb-[env(safe-area-inset-bottom)] ${isOpen ? 'translate-y-0' : 'translate-y-full'}`
            : `w-[450px] max-w-full h-full ${isOpen ? 'translate-x-0' : 'translate-x-full'}`
        )}
        style={{ willChange: 'transform' }}
      >
        <div className="relative z-10 flex flex-col h-full w-full max-w-full overflow-x-hidden">
          {/* Mobile Drag Handle */}
          {isMobile && (
            <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />
          )}



          <div
            ref={scrollAreaRef}
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
                    onSaveShifts={() => {
                      console.log('[SHIFT SAVE] clicked / onSaveShifts triggered in Drawer');
                      setIsEditingShifts(false);
                      showToast('Turnos actualizados correctamente');
                    }}
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
                      <Select value={editCommitteeId} onValueChange={(v) => v && setEditCommitteeId(v)}>
                        <SelectTrigger className="w-full h-11 border border-border bg-dark3 text-text font-inter font-bold flex items-center justify-between px-3.5 rounded-xl text-xs focus:border-[#4d7cfe] focus:ring-1 focus:ring-[#4d7cfe]">
                          <SelectValue placeholder="Selecciona un subcomité">
                            {committeesList.find((c: any) => c.id === editCommitteeId || c.name === editCommitteeId)?.name}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-dark2 border border-border text-text shadow-2xl z-[250]">
                          {committeesList.map((c: any) => (
                            <SelectItem key={c.id} value={c.id} className="font-inter font-bold text-xs text-text hover:bg-dark3 focus:bg-dark3 cursor-pointer py-2.5 px-3">
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                        type="text"
                        inputMode="numeric"
                        value={editAge}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d{0,3}$/.test(val)) {
                            setEditAge(val);
                          }
                        }}
                        className="w-full bg-dark3 border border-border text-text text-xs p-3 rounded-xl focus:outline-none focus:border-[#4d7cfe] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="Ej. 25"
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
