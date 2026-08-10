'use client'

import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from "react";
import { AlphabetScrubber } from "@/components/AlphabetScrubber";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  generateReminderMessage,
  generateWaMeLink
} from "@/lib/whatsapp";
import { ReassignShiftModal } from "@/components/ReassignShiftModal";
import { VolunteerProfileDrawer } from "@/components/VolunteerProfileDrawer";
import { sendShiftReminderAction } from "@/app/actions/whatsapp";
import { updateVolunteerStatusAction } from "@/app/actions/volunteer-actions";
import {
  getActiveEventDays,
  formatDateShort,
  SHIFT_TIMES,
  getOfficialShiftTime,
  isHoliday
} from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, normalizeSearch } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTableFilter } from "@/components/DataTableFilter";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/ui/toast";
import { useSearch } from "@/lib/search-context";
import { motion, AnimatePresence } from "framer-motion";
import { SwipeableMobileCard } from "@/components/SwipeableMobileCard";
import { USER_TABLE_STYLES } from "@/app/(coordinator)/users/page";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";
import { canEditShifts, canSendWhatsappMessages } from "@/lib/permissions";
import { useCoordinatorData } from "@/lib/coordinator-data-context";

// ─── tipos ────────────────────────────────────────────────────────────────────
type VolunteerType = {
  id: string; // UUID de Supabase
  name: string;
  stake: string;
  ward: string;
  phone: string;
  shifts: number;
  reliability: number;
  committee: string;
  committee_id?: string;
  age?: number;
};

const getCommitteeColor = (committee: string) => {
  const comm = committee.toLowerCase();
  if (comm.includes('seguridad')) return 'bg-[#fe4d97]/15 text-[#fe4d97] border-[#fe4d97]/20';
  if (comm.includes('guía')) return 'bg-[#6dd230]/15 text-[#6dd230] border-[#6dd230]/20';
  if (comm.includes('historia')) return 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20';
  if (comm.includes('traducción')) return 'bg-amber-500/15 text-amber-600 border-amber-500/20';
  if (comm.includes('transporte')) return 'bg-purple-500/15 text-purple-600 border-purple-500/20';
  if (comm.includes('auxilios')) return 'bg-teal-500/15 text-teal-600 border-teal-500/20';
  return 'bg-dark3 text-text-dim border-border';
};

export default function RemindersPage() {
  const supabase = createClient();
  const EVENT_DAYS_RAW = getActiveEventDays();
  const EVENT_DAYS = EVENT_DAYS_RAW.map(date => ({
    date,
    key: formatDateShort(date),
    label: formatDateShort(date).split(' ')[0],
    dateNum: formatDateShort(date).split(' ')[1],
  }));

  const buildEmptyShifts = () =>
    Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));

  // ── Shared context (no per-page fetch) ────────────────────────────────────
  const {
    rawVolunteers,
    committeesList,
    globalShifts: contextGlobalShifts,
    checkedInMap: contextCheckedInMap,
    checkedOutMap: contextCheckedOutMap,
    shiftCounts: contextShiftCounts,
    loading,
    refresh,
  } = useCoordinatorData();

  // Map raw volunteers to the local VolunteerType shape
  const volunteers = useMemo<VolunteerType[]>(
    () =>
      rawVolunteers
        .filter((v: any) => v.status !== 'archived')
        .map((v: any) => ({
          id: v.id,
          name: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
          stake: v.stake || '',
          ward: v.neighborhood || '',
          phone: v.phone || '',
          shifts: contextShiftCounts[v.id] || 0,
          reliability: v.reliability_score || 100,
          committee: v.committees?.name || 'Sin comité',
          committee_id: v.committee_id,
          age: v.age,
        })),
    [rawVolunteers, contextShiftCounts]
  );

  const globalShifts = contextGlobalShifts;
  const checkedInMap = contextCheckedInMap;
  const checkedOutMap = contextCheckedOutMap;
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileSelectorExpanded, setIsMobileSelectorExpanded] = useState(true);

  // User Role/Committee isolation
  const [currentUserRole, setCurrentUserRole] = useState<string>('Admin');
  const [currentUserCommittee, setCurrentUserCommittee] = useState<string>('');

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);

    const role = localStorage.getItem('mock_role') || 'Admin';
    const committee = localStorage.getItem('mock_committee') || '';
    setCurrentUserRole(role);
    setCurrentUserCommittee(committee);
    if (role === 'Editor' && committee) {
      setSelectedCommittees([committee]);
    }

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Toast State
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info', isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type, isVisible: true });
  };

  // Track shifts that are checked in / out (from shared context)
  // checkedInMap and checkedOutMap are already aliased above from context

  // Cargar confirmaciones de localStorage
  const [confirmedReminders, setConfirmedReminders] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("confirmed_reminders");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Error loading confirmed reminders", e);
        }
      }
    }
    return {};
  });

  // Requerimientos por comité cargados de localStorage o por defecto
  const [committeeRequirements, setCommitteeRequirements] = useState<Record<string, Record<string, number>>>(() => {
    const defaults = {
      'Historia': { T1: 3, T2: 2, T3: 3, T4: 2 },
      'Seguridad': { T1: 4, T2: 4, T3: 4, T4: 4 },
      'Guía': { T1: 5, T2: 5, T3: 5, T4: 5 },
      'Traducción': { T1: 2, T2: 1, T3: 2, T4: 1 },
      'Transporte': { T1: 3, T2: 2, T3: 3, T4: 2 },
      'Primeros Auxilios': { T1: 2, T2: 2, T3: 2, T4: 2 }
    };
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("committee_requirements");
      if (stored) {
        try {
          return { ...defaults, ...JSON.parse(stored) };
        } catch (e) {
          console.error("Error loading committee requirements in reminders", e);
        }
      }
    }
    return defaults;
  });

  // Contactados (localStorage)
  const [contactedReminders, setContactedReminders] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("contacted_reminders");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Error loading contacted reminders", e);
        }
      }
    }
    return {};
  });

  // Bulk Actions State
  const [selectedVolunteers, setSelectedVolunteers] = useState<Set<string>>(new Set());
  const [isReassignSheetOpen, setIsReassignSheetOpen] = useState(false);
  const [reassignDayKey, setReassignDayKey] = useState<string>("");
  const [reassignShiftId, setReassignShiftId] = useState<string>("");

  // loadData was removed — volunteers, committees, and shifts now come
  // from the shared CoordinatorDataProvider. Mutations call refresh(true)
  // to revalidate the cache across all tabs.

  // Estado del turno seleccionado (ninguno por defecto)
  const [selectedDayKey, setSelectedDayKey] = useState<string>("");
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isScrolled, setIsScrolled] = useState(false);

  // Auto-collapse selector on mobile scroll
  useEffect(() => {
    if (!isMobile) return;
    
    // On mobile, the main scroll container is likely the 'main' element in the layout
    const mainEl = document.querySelector('main');
    if (!mainEl) return;
    
    let lastScrollY = mainEl.scrollTop;
    
    const handleScroll = () => {
      const currentScrollY = mainEl.scrollTop;
      setIsScrolled(currentScrollY > 20);

      // Only collapse if actively scrolling down by at least 10px and past 50px threshold
      if (currentScrollY > lastScrollY + 10 && currentScrollY > 50 && isMobileSelectorExpanded && selectedDayKey && selectedShiftId) {
        setIsMobileSelectorExpanded(false);
      }
      lastScrollY = currentScrollY;
    };
    
    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, [isMobile, isMobileSelectorExpanded, selectedDayKey, selectedShiftId]);

  // Drawer states
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerType | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditingShifts, setIsEditingShifts] = useState(false);
  const [shiftsByDay, setShiftsByDay] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  const handleEditClick = (vol: VolunteerType) => {
    setEditingVolunteer(vol);
    setIsSheetOpen(true);
    setIsEditingShifts(false);
    setSaved(false);

    const volShifts = globalShifts[vol.id] || Object.fromEntries(EVENT_DAYS.map(d => [d.key, [] as string[]]));
    setShiftsByDay(volShifts);
  };

  const toggleShift = (day: string, turno: string) => {
    if (!isEditingShifts || !canEditShifts()) {
      if (!canEditShifts()) {
        showToast("No tienes permiso para editar turnos", "error");
      }
      return;
    }
    setShiftsByDay(prev => {
      const current = prev[day] ?? [];
      return {
        ...prev,
        [day]: current.includes(turno)
          ? current.filter(t => t !== turno)
          : [...current, turno],
      };
    });
  };

  const handleSaveShifts = async () => {
    setIsEditingShifts(false);
    if (!editingVolunteer) return;

    const { error: delErr } = await supabase
      .from('shifts')
      .delete()
      .eq('volunteer_id', editingVolunteer.id);

    if (delErr) {
      console.error("Error deleting shifts:", delErr);
      return;
    }

    const insertRows = [];
    for (const [dayKey, shiftKeys] of Object.entries(shiftsByDay)) {
      for (const shiftKey of shiftKeys) {
        insertRows.push({
          volunteer_id: editingVolunteer.id,
          day_key: dayKey,
          shift_key: shiftKey
        });
      }
    }

    if (insertRows.length > 0) {
      const { error: insErr } = await supabase
        .from('shifts')
        .insert(insertRows);

      if (insErr) {
        console.error("Error inserting shifts:", insErr);
        showToast("Error al guardar turnos", "error");
        return;
      }
    }

    setSaved(true);
    showToast("Turnos actualizados");
    setTimeout(() => setSaved(false), 2500);
    await refresh(true);
  };


  // Estado de los filtros y visualización de plantilla
  const { searchTerm, setSearchTerm } = useSearch();
  const [inputValue, setInputValue] = useState(searchTerm);
  const [appliedSearch, setAppliedSearch] = useState(searchTerm);

  useEffect(() => {
    setSearchTerm(appliedSearch);
  }, [appliedSearch, setSearchTerm]);

  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [selectedStakes, setSelectedStakes] = useState<string[]>([]);
  const [selectedWards, setSelectedWards] = useState<string[]>([]);
  const [showTemplate, setShowTemplate] = useState(false);

  // Escuchar actualizaciones del storage en caliente
  useEffect(() => {
    const handleUpdate = () => {
      if (typeof window !== "undefined") {
        const confirmedStored = localStorage.getItem("confirmed_reminders");
        if (confirmedStored) {
          try {
            setConfirmedReminders(JSON.parse(confirmedStored));
          } catch (e) {
            console.error("Error syncing confirmations", e);
          }
        }
        const storedReqs = localStorage.getItem("committee_requirements");
        if (storedReqs) {
          try {
            setCommitteeRequirements(prev => ({ ...prev, ...JSON.parse(storedReqs) }));
          } catch (e) {
            console.error("Error syncing committee requirements in reminders", e);
          }
        }
        const contactedStored = localStorage.getItem("contacted_reminders");
        if (contactedStored) {
          try {
            setContactedReminders(JSON.parse(contactedStored));
          } catch (e) {
            console.error("Error syncing contacted", e);
          }
        }
      }
    };

    window.addEventListener("focus", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("focus", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);


  // Calcular cantidad de voluntarios asignados por turno/día (respetando filtros)
  const shiftCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    EVENT_DAYS.forEach(day => {
      counts[day.key] = { T1: 0, T2: 0, T3: 0, T4: 0 };
      volunteers.forEach(vol => {
        // Filtrado multicriterio
        const searchTerms = searchTerm.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);
        const normName = normalizeSearch(vol.name);
        const normCommittee = normalizeSearch(vol.committee);
        const normStake = normalizeSearch(vol.stake);
        const normWard = normalizeSearch(vol.ward);

        const matchesSearch = searchTerms.length === 0 || searchTerms.every(term =>
          normName.includes(term) ||
          normCommittee.includes(term) ||
          normStake.includes(term) ||
          normWard.includes(term)
        );
        const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(vol.committee);
        const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(vol.stake);
        const matchesWard = selectedWards.length === 0 || selectedWards.includes(vol.ward);

        if (!(matchesSearch && matchesCommittee && matchesStake && matchesWard)) {
          return;
        }

        const shifts = globalShifts[vol.id];
        if (shifts && shifts[day.key]) {
          shifts[day.key].forEach(shId => {
            if (counts[day.key][shId] !== undefined) {
              counts[day.key][shId]++;
            }
          });
        }
      });
    });
    return counts;
  }, [volunteers, globalShifts, EVENT_DAYS, searchTerm, selectedCommittees, selectedStakes, selectedWards]);

  // Obtener voluntarios asignados al turno seleccionado
  const activeVolunteers = useMemo(() => {
    if (!selectedDayKey || !selectedShiftId) return [];
    return volunteers.filter(vol => {
      const searchTerms = searchTerm.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);
      const normName = normalizeSearch(vol.name);
      const normCommittee = normalizeSearch(vol.committee);
      const normStake = normalizeSearch(vol.stake);
      const normWard = normalizeSearch(vol.ward);

      const matchesSearch = searchTerms.length === 0 || searchTerms.every(term =>
        normName.includes(term) ||
        normCommittee.includes(term) ||
        normStake.includes(term) ||
        normWard.includes(term)
      );
      const matchesCommittee = selectedCommittees.length === 0 || selectedCommittees.includes(vol.committee);
      const matchesStake = selectedStakes.length === 0 || selectedStakes.includes(vol.stake);
      const matchesWard = selectedWards.length === 0 || selectedWards.includes(vol.ward);

      if (!(matchesSearch && matchesCommittee && matchesStake && matchesWard)) {
        return false;
      }

      const shifts = globalShifts[vol.id];
      return shifts && shifts[selectedDayKey] && shifts[selectedDayKey].includes(selectedShiftId);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [volunteers, globalShifts, selectedDayKey, selectedShiftId, searchTerm, selectedCommittees, selectedStakes, selectedWards]);

  const currentVolunteers = activeVolunteers;

  const groupedVolunteers = useMemo(() => {
    const groups: Record<string, VolunteerType[]> = {};
    activeVolunteers.forEach(v => {
      let letter = v.name.charAt(0).toUpperCase();
      if (!/^[A-Z]$/.test(letter)) letter = '#';
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(v);
    });
    return groups;
  }, [activeVolunteers]);
  const sortedLetters = Object.keys(groupedVolunteers).sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));
  // Detalles del turno seleccionado
  const selectedShiftDetails = getOfficialShiftTime(selectedDayKey, selectedShiftId);
  const selectedDayObj = EVENT_DAYS.find(d => d.key === selectedDayKey);
  const isSelectedHoliday = selectedDayObj ? isHoliday(selectedDayObj.date) : false;

  const dateStr = selectedDayObj
    ? format(selectedDayObj.date, "EEEE d 'de' MMMM", { locale: es })
    : "";

  const previewMessage = generateReminderMessage(
    "[Nombre del Voluntario]",
    dateStr ? dateStr.charAt(0).toUpperCase() + dateStr.slice(1) : "",
    selectedShiftDetails?.name || "",
    selectedShiftDetails?.time || "",
    selectedCommittees.length === 1 ? selectedCommittees[0] : "Seguridad",
    isSelectedHoliday
  );

  const handleStatusChange = (volId: string, status: string) => {
    const key = `${volId}-${selectedDayKey}-${selectedShiftId}`;
    if (status === "Pendiente") {
      setConfirmedReminders(prev => {
        const u = { ...prev };
        delete u[key];
        if (typeof window !== "undefined") localStorage.setItem("confirmed_reminders", JSON.stringify(u));
        return u;
      });
      setContactedReminders(prev => {
        const u = { ...prev };
        delete u[key];
        if (typeof window !== "undefined") localStorage.setItem("contacted_reminders", JSON.stringify(u));
        return u;
      });
    } else if (status === "Contactado") {
      setConfirmedReminders(prev => {
        const u = { ...prev };
        delete u[key];
        if (typeof window !== "undefined") localStorage.setItem("confirmed_reminders", JSON.stringify(u));
        return u;
      });
      setContactedReminders(prev => {
        const u = { ...prev, [key]: true };
        if (typeof window !== "undefined") localStorage.setItem("contacted_reminders", JSON.stringify(u));
        return u;
      });
    } else if (status === "Confirmado") {
      setConfirmedReminders(prev => {
        const u = { ...prev, [key]: true };
        if (typeof window !== "undefined") localStorage.setItem("confirmed_reminders", JSON.stringify(u));
        return u;
      });
      setContactedReminders(prev => {
        const u = { ...prev, [key]: true };
        if (typeof window !== "undefined") localStorage.setItem("contacted_reminders", JSON.stringify(u));
        return u;
      });
    }
  };

  const toggleConfirmed = (volId: string) => {
    const key = `${volId}-${selectedDayKey}-${selectedShiftId}`;
    setConfirmedReminders(prev => {
      const updated = {
        ...prev,
        [key]: !prev[key]
      };
      if (typeof window !== "undefined") {
        localStorage.setItem("confirmed_reminders", JSON.stringify(updated));
      }
      return updated;
    });
  };

  const toggleSelection = (volId: string) => {
    setSelectedVolunteers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(volId)) newSet.delete(volId);
      else newSet.add(volId);
      return newSet;
    });
  };

  const toggleAllSelection = () => {
    if (selectedVolunteers.size === currentVolunteers.length && currentVolunteers.length > 0) {
      setSelectedVolunteers(new Set());
    } else {
      setSelectedVolunteers(new Set(currentVolunteers.map(v => v.id)));
    }
  };

  const handleBulkConfirm = (confirm: boolean) => {
    setConfirmedReminders(prev => {
      const updated = { ...prev };
      selectedVolunteers.forEach(volId => {
        const key = `${volId}-${selectedDayKey}-${selectedShiftId}`;
        if (confirm) updated[key] = true;
        else delete updated[key];
      });
      if (typeof window !== "undefined") {
        localStorage.setItem("confirmed_reminders", JSON.stringify(updated));
      }
      return updated;
    });
    setSelectedVolunteers(new Set());
    showToast(confirm ? "Asistencia confirmada" : "Asistencia cancelada");
  };

  const [isSendingBulkWA, setIsSendingBulkWA] = useState(false);

  // Sync reminder_logs from Supabase in real-time
  useEffect(() => {
    const syncLogsFromSupabase = async () => {
      try {
        const { data: logs } = await supabase
          .from('reminder_logs')
          .select('volunteer_id, day_key, shift_key, status');

        if (logs && logs.length > 0) {
          setContactedReminders(prev => {
            const next = { ...prev };
            logs.forEach(log => {
              if (log.status === 'contactado' || log.status === 'confirmado') {
                const key = `${log.volunteer_id}-${log.day_key}-${log.shift_key}`;
                next[key] = true;
              }
            });
            return next;
          });

          setConfirmedReminders(prev => {
            const next = { ...prev };
            logs.forEach(log => {
              if (log.status === 'confirmado') {
                const key = `${log.volunteer_id}-${log.day_key}-${log.shift_key}`;
                next[key] = true;
              }
            });
            return next;
          });
        }
      } catch (err) {
        console.error("Error syncing reminder logs:", err);
      }
    };

    syncLogsFromSupabase();
    const interval = setInterval(syncLogsFromSupabase, 4000);

    const channel = supabase
      .channel('reminder_logs_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reminder_logs' },
        () => {
          syncLogsFromSupabase();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSingleSendWhatsApp = async (vol: VolunteerType) => {
    if (!canSendWhatsappMessages()) {
      showToast("El Administrador ha deshabilitado el envío de WhatsApp para Coordinadores", "error");
      return;
    }
    if (!vol.phone) {
      showToast("El voluntario no tiene teléfono registrado", "error");
      return;
    }
    showToast(`Enviando recordatorio de Meta WhatsApp a ${vol.name}...`);
    const res = await sendShiftReminderAction({
      phone: vol.phone,
      volunteerName: vol.name,
      committeeName: vol.committee,
      shiftName: selectedShiftDetails?.name || 'Turno 1',
      shiftHours: selectedShiftDetails?.time || '7:00 AM - 12:00 PM',
      shiftDate: dateStr || 'Próximo turno'
    });

    if (res.success) {
      const key = `${vol.id}-${selectedDayKey}-${selectedShiftId}`;
      setContactedReminders(prev => ({ ...prev, [key]: true }));

      // Insert log into Supabase
      await supabase.from('reminder_logs').insert([{
        volunteer_id: vol.id,
        shift_key: selectedShiftId,
        day_key: selectedDayKey,
        whatsapp_message_id: res.messageId || null,
        status: 'contactado',
        sent_at: new Date().toISOString()
      }]);

      showToast(`✅ Recordatorio de WhatsApp enviado a ${vol.name}`);
    } else {
      showToast(`❌ Error enviando WhatsApp: ${res.error}`, 'error');
    }
  };

  const handleBulkSendWhatsApp = async () => {
    if (!canSendWhatsappMessages()) {
      showToast("El Administrador ha deshabilitado el envío de WhatsApp para Coordinadores", "error");
      return;
    }
    if (selectedVolunteers.size === 0) return;
    setIsSendingBulkWA(true);
    showToast(`Enviando recordatorios de Meta WhatsApp a ${selectedVolunteers.size} voluntarios...`, 'info');

    const selectedVols = Array.from(selectedVolunteers)
      .map(id => volunteers.find(v => v.id === id))
      .filter((v): v is VolunteerType => !!v);

    let successCount = 0;
    let failCount = 0;

    for (const vol of selectedVols) {
      if (!vol.phone) {
        failCount++;
        continue;
      }
      const res = await sendShiftReminderAction({
        phone: vol.phone,
        volunteerName: vol.name,
        committeeName: vol.committee,
        shiftName: selectedShiftDetails?.name || 'Turno 1',
        shiftHours: selectedShiftDetails?.time || '7:00 AM - 12:00 PM',
        shiftDate: dateStr || 'Próximo turno'
      });

      if (res.success) {
        successCount++;
        const key = `${vol.id}-${selectedDayKey}-${selectedShiftId}`;
        setContactedReminders(prev => ({ ...prev, [key]: true }));

        await supabase.from('reminder_logs').insert([{
          volunteer_id: vol.id,
          shift_key: selectedShiftId,
          day_key: selectedDayKey,
          whatsapp_message_id: res.messageId || null,
          status: 'contactado',
          sent_at: new Date().toISOString()
        }]);
      } else {
        failCount++;
      }
    }

    setIsSendingBulkWA(false);
    setSelectedVolunteers(new Set());
    if (failCount === 0) {
      showToast(`✅ ¡Recordatorios enviados exitosamente a ${successCount} voluntarios!`);
    } else {
      showToast(`Enviados: ${successCount} | Fallidos: ${failCount}`, failCount > 0 ? 'error' : 'success');
    }
  };

  const handleBulkContacted = () => {
    setContactedReminders(prev => {
      const updated = { ...prev };
      selectedVolunteers.forEach(volId => {
        const key = `${volId}-${selectedDayKey}-${selectedShiftId}`;
        updated[key] = true;
      });
      if (typeof window !== "undefined") {
        localStorage.setItem("contacted_reminders", JSON.stringify(updated));
      }
      return updated;
    });
    setSelectedVolunteers(new Set());
    showToast("Marcados como contactados");
  };

  const getReassignCapacityInfo = useCallback((dayKey: string, shiftId: string) => {
    if (!dayKey || !shiftId || selectedVolunteers.size === 0) return null;

    const selectedVols = Array.from(selectedVolunteers)
      .map(id => volunteers.find(v => v.id === id))
      .filter((v): v is VolunteerType => !!v);

    // Group selected volunteers by committee
    const committeeGroups: Record<string, VolunteerType[]> = {};
    selectedVols.forEach(v => {
      const comm = v.committee || 'Sin Comité';
      if (!committeeGroups[comm]) committeeGroups[comm] = [];
      committeeGroups[comm].push(v);
    });

    for (const [commName, volsInComm] of Object.entries(committeeGroups)) {
      const maxReq = committeeRequirements[commName]?.[shiftId] ?? 0;

      // Volunteers of this committee currently assigned to target day & shift
      const currentlyAssignedCount = volunteers.filter(v =>
        v.committee === commName &&
        (globalShifts[v.id]?.[dayKey] || []).includes(shiftId)
      ).length;

      // Selected volunteers of this committee not already in target day & shift
      const newAdditions = volsInComm.filter(v =>
        !(globalShifts[v.id]?.[dayKey] || []).includes(shiftId)
      ).length;

      const projectedTotal = currentlyAssignedCount + newAdditions;

      if (maxReq > 0 && (currentlyAssignedCount >= maxReq || projectedTotal > maxReq)) {
        return {
          isFull: true,
          committeeName: commName,
          currentCount: currentlyAssignedCount,
          maxReq,
          projectedTotal
        };
      }
    }

    return { isFull: false };
  }, [selectedVolunteers, volunteers, committeeRequirements, globalShifts]);

  const handleBulkReassign = async () => {
    if (!reassignDayKey || !reassignShiftId) {
      showToast("Selecciona día y turno para reasignar", "error");
      return;
    }

    const capacityInfo = getReassignCapacityInfo(reassignDayKey, reassignShiftId);
    if (capacityInfo?.isFull) {
      showToast(
        `El turno ${reassignShiftId} del ${reassignDayKey} está lleno para el comité de ${capacityInfo.committeeName} (${capacityInfo.currentCount}/${capacityInfo.maxReq} requeridos). Selecciona otra fecha o turno.`,
        "error"
      );
      return;
    }

    // Process reassignments
    const insertRows: any[] = [];
    const deletePromises = Array.from(selectedVolunteers).map(volId => {
      insertRows.push({
        volunteer_id: volId,
        day_key: reassignDayKey,
        shift_key: reassignShiftId
      });
      // Delete old shift for this specific selected day
      return supabase
        .from('shifts')
        .delete()
        .eq('volunteer_id', volId)
        .eq('day_key', selectedDayKey)
        .eq('shift_key', selectedShiftId);
    });

    await Promise.all(deletePromises);

    const { error: insErr } = await supabase
      .from('shifts')
      .upsert(insertRows, { onConflict: 'volunteer_id,day_key,shift_key', ignoreDuplicates: true });

    if (insErr) {
      console.error("Error inserting reassigned shifts:", insErr);
      showToast("Error al reasignar: " + insErr.message, "error");
    } else {
      showToast(`Reasignados a ${reassignShiftId} el ${reassignDayKey}`);
      setIsReassignSheetOpen(false);
      setSelectedVolunteers(new Set());
      await refresh(true);
    }
  };

  const handleArchiveVolunteer = async (vol: VolunteerType) => {
    if (!window.confirm(`¿Estás seguro de que quieres archivar a ${vol.name}?`)) return;

    const res = await updateVolunteerStatusAction({
      volunteerId: vol.id,
      toStatus: 'archived',
    });

    if (!res.success) {
      console.error("Error updating status:", res.error);
      showToast(res.error || `Error al archivar a ${vol.name}`, "error");
    } else {
      showToast(`${vol.name} archivado con éxito`);
      await refresh(true);
    }
  };

  const handleCopyNumbers = () => {
    if (activeVolunteers.length === 0) {
      showToast("No hay voluntarios en este turno para copiar.", "info");
      return;
    }
    const numbers = activeVolunteers.map(v => v.phone).join(", ");
    navigator.clipboard.writeText(numbers);
    showToast(`Se copiaron ${activeVolunteers.length} números`);
  };

  const stakes = useMemo(() => {
    const set = new Set<string>();
    volunteers.forEach(v => { if (v.stake) set.add(v.stake); });
    return Array.from(set).sort();
  }, [volunteers]);

  const wards = useMemo(() => {
    const set = new Set<string>();
    volunteers.forEach(v => { if (v.ward) set.add(v.ward); });
    return Array.from(set).sort();
  }, [volunteers]);

  const committees = committeesList.map(c => c.name);

  const renderQuickSelectorPill = () => {
    if (!selectedDayKey || !selectedShiftId) return null;
    return (
      <button 
        className="lg:hidden flex items-center justify-between w-full px-3 py-2 bg-dark3 transition-colors active:bg-dark2 border-b border-border/50"
        onClick={() => setIsMobileSelectorExpanded(!isMobileSelectorExpanded)}
      >
        <div className="flex items-center w-full">
          {/* Left: Selected Day Card */}
          <div 
            style={{ width: '68px', height: '52px' }}
            className={cn(
              "relative shrink-0 flex flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-border shadow-sm transition-all text-text bg-dark3"
            )}
          >
            <div className={cn(
              "absolute left-0 top-0 bottom-0 w-1.5 opacity-90",
              (() => {
                const idx = EVENT_DAYS.findIndex(d => d.key === selectedDayKey);
                const bgColors = ['bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]', 'bg-[#981e32]', 'bg-[#7a3994]', 'bg-[#d97c2c]', 'bg-[#10a562]'];
                return idx >= 0 ? bgColors[idx % bgColors.length] : 'bg-dark3';
              })()
            )} />
            <span className="font-inter font-bold text-[10px] uppercase tracking-widest text-text">
              {EVENT_DAYS.find(d => d.key === selectedDayKey)?.label.substring(0, 3)}
            </span>
            <span className="text-base font-black leading-none drop-shadow-sm">
              {EVENT_DAYS.find(d => d.key === selectedDayKey)?.dateNum}
            </span>
          </div>

          {/* Right: Shift Cards Quick Selector */}
          <div className="flex items-center gap-1.5 ml-auto mr-3">
            {['T1', 'T2', 'T3', 'T4'].map((t) => {
              const isSelected = selectedShiftId === t;
              
              let count = 0;
              if (selectedDayKey) {
                count = shiftCounts[selectedDayKey]?.[t] || 0;
              }
              const isSingleCommittee = selectedCommittees.length === 1;
              const activeCommittee = isSingleCommittee ? selectedCommittees[0] : null;
              const minRequired = activeCommittee ? (committeeRequirements[activeCommittee]?.[t] ?? 0) : 0;
              
              let buttonClass = "";
              if (isSelected) {
                if (isSingleCommittee) {
                  buttonClass = count < minRequired ? "bg-rose-600 border-rose-500 text-white shadow-sm" : "bg-teal-600 border-teal-500 text-white shadow-sm";
                } else {
                  buttonClass = "bg-[#0084d1] border-[#0084d1] text-white shadow-sm";
                }
              } else {
                if (isSingleCommittee) {
                  buttonClass = count < minRequired ? "bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100/20" : "bg-teal-50 border-teal-100 text-accent hover:bg-teal-100/20";
                } else {
                  buttonClass = count > 0 ? "bg-dark3 border-border text-text hover:bg-dark3" : "bg-dark2 border-border text-text-dim hover:bg-dark3";
                }
              }

              return (
                <div 
                  key={t}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedShiftId(t);
                  }}
                  style={{ width: '52px', height: '52px' }}
                  className={cn(
                    "relative shrink-0 flex flex-col items-center justify-center gap-1 rounded-lg border transition-all font-inter font-bold",
                    buttonClass
                  )}
                >
                  <span className="font-inter font-bold text-xs">{t}</span>
                </div>
              )
            })}
          </div>
        </div>
        <span className="material-symbols-outlined text-text-dim text-[20px] shrink-0">
          {isMobileSelectorExpanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>
    );
  };

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-50">
        <AnimatedLogo isLooping className="w-16 h-16 md:w-20 md:h-20 text-text" />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto pb-32 lg:pb-0 flex flex-col min-h-screen lg:h-full lg:overflow-hidden">


      {/* Sticky Header matching users design */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 pointer-events-auto shrink-0">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight flex items-center gap-3">
            Avisos
          </h1>
          <Button
            onClick={() => setShowTemplate(true)}
            className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-9 px-4 text-xs font-bold transition-all active:scale-[0.97] flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">chat_bubble</span>
            <span>Ver Plantilla</span>
          </Button>
        </div>

        {/* Search Input Bar */}
        <div className="w-full relative z-10 flex items-center gap-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (appliedSearch && inputValue === appliedSearch) {
                setInputValue('');
                setAppliedSearch('');
              } else if (inputValue.trim()) {
                setAppliedSearch(inputValue.trim());
              }
            }}
            className="relative flex-1 min-w-0 flex items-center"
          >
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none z-10">
              <span className="material-symbols-outlined text-black/40 dark:text-white/70 text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder="Buscar voluntario, barrio o estaca..."
              className="w-full bg-black/5 dark:bg-[#fff6] border border-black/10 dark:border-white/10 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-white/70 rounded-full pl-12 pr-28 py-3.5 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30 transition-all text-[13px] font-bold font-inter h-[48px]"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setAppliedSearch(e.target.value);
              }}
              autoComplete="off"
            />
            {appliedSearch !== '' && (
              <div className="absolute inset-y-0 right-1.5 flex items-center z-10">
                <button
                  type="button"
                  onClick={() => {
                    setInputValue('');
                    setAppliedSearch('');
                  }}
                  className="h-9 px-3.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-full text-xs font-bold font-inter transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                  <span>Limpiar</span>
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Content wrapper with mobile padding */}
      <div className="flex flex-col gap-4 md:gap-6 flex-1 px-4 sm:px-6 lg:px-8 lg:min-h-0 lg:pb-6">
        {/* Selector de Turnos Rediseñado en Dos Filas */}
        <div className={cn("shrink-0 bg-dark2 border border-border rounded-sm shadow-sm flex flex-col z-30 bg-dark2/90 backdrop-blur-md sticky top-[96px]", (!isMobile || !isScrolled) && "overflow-hidden")}>
          
          {/* Mobile Header / Summary Pill */}
          <AnimatePresence mode="popLayout" initial={false}>
            {isScrolled && selectedDayKey && selectedShiftId ? (
              <motion.div
                key="pill"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                className="w-full"
              >
                {renderQuickSelectorPill()}
              </motion.div>
            ) : (
              <motion.div
                key="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                className="w-full"
              >
                <button 
                  className="lg:hidden flex items-center justify-between w-full p-4 bg-dark3 transition-colors active:bg-dark2"
                  onClick={() => setIsMobileSelectorExpanded(!isMobileSelectorExpanded)}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-text text-xl">event_available</span>
                    <span className="font-bold text-text text-sm">Filtros de Búsqueda</span>
                  </div>
                  <span className="material-symbols-outlined text-text-dim text-[20px]">
                    {isMobileSelectorExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Selector Content (Collapsible on mobile with Framer Motion) */}
          <AnimatePresence initial={false}>
            {(isMobileSelectorExpanded || !isMobile || (!selectedDayKey || !selectedShiftId)) && (
              <motion.div 
                initial={isMobile ? { height: 0, opacity: 0 } : false}
                animate={{ height: 'auto', opacity: 1 }}
                exit={isMobile ? { height: 0, opacity: 0 } : {}}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                className={cn("p-4 md:p-5 flex-col gap-4 md:gap-5 overflow-hidden", "flex", (isMobile && isScrolled) ? "absolute top-full left-[-1px] right-[-1px] bg-dark2/95 backdrop-blur-xl border border-border border-t-0 rounded-b-md shadow-2xl z-40" : "")}
              >

          {/* FILA 1: FECHA */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-text-dim tracking-widest uppercase">FECHA</span>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-8 md:flex md:flex-wrap w-full gap-2">
              {EVENT_DAYS.map((day, index) => {
                const dayCounts = shiftCounts[day.key] || { T1: 0, T2: 0, T3: 0, T4: 0 };
                const totalVolunteersOnDay = Object.values(dayCounts).reduce((acc, count) => acc + count, 0);
                const isSelected = selectedDayKey === day.key;
                const dayAbbr = day.label.substring(0, 3); // e.g. 'jue', 'vie', 'sáb'

                const bgColors = [
                  'bg-[#10a562]',
                  'bg-[#4aa9df]',
                  'bg-[#f1c130]',
                  'bg-[#d54134]',
                  'bg-[#981e32]',
                  'bg-[#2c44c2]',
                  'bg-[#f1c130]',
                  'bg-[#ed1b24]'
                ];
                const cardBg = bgColors[index % bgColors.length];

                return (
                  <button
                    key={day.key}
                    onClick={() => {
                      if (selectedDayKey === day.key) {
                        setSelectedDayKey("");
                        setSelectedShiftId("");
                      } else {
                        setSelectedDayKey(day.key);
                        if (!selectedShiftId) {
                          setSelectedShiftId("T1");
                        }
                      }
                    }}
                    className={`relative overflow-hidden shrink-0 flex flex-col items-center justify-center gap-1 p-2 md:px-4 md:py-2.5 rounded-lg md:rounded-sm border transition-all md:w-auto md:flex-1 w-full bg-dark3 ${isSelected
                      ? 'border-text text-text shadow-sm scale-105 z-10'
                      : 'border-border text-text-dim opacity-80 hover:opacity-100 hover:scale-[1.02]'
                      }`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${cardBg} opacity-90`} />
                    <span className={`font-inter font-bold text-[10px] md:text-[9px] uppercase tracking-widest ${isSelected ? 'text-text' : 'text-text-dim'}`}>
                      {dayAbbr}
                    </span>
                    <span className="text-base md:text-sm font-black leading-none drop-shadow-sm">{day.dateNum}</span>
                    <div className={`w-1.5 h-1.5 rounded-full absolute top-1.5 right-1.5 md:static md:mt-1 ${totalVolunteersOnDay > 0 ? 'bg-[#10a562] shadow-[0_0_6px_rgba(16,165,98,0.6)]' : 'bg-neutral-300 dark:bg-neutral-700'
                      }`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Separador y FILA 2: TURNOS solo si no está el selector rápido visible */}
          <AnimatePresence initial={false}>
            {!(isScrolled && selectedDayKey && selectedShiftId) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                className="flex flex-col gap-4 md:gap-5 overflow-hidden"
              >
                {/* Separador */}
                <div className="h-px bg-border/40" />

              {/* FILA 2: TURNOS */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-text-dim tracking-widest uppercase block">TURNOS</span>
                <div className="grid grid-cols-4 md:flex md:flex-wrap gap-2">
                  {['T1', 'T2', 'T3', 'T4'].map((t) => {
                    // Obtener conteo de voluntarios para este turno (si hay día seleccionado, del día; si no, total acumulado de todos los días)
                    let count = 0;
                    if (selectedDayKey) {
                      count = shiftCounts[selectedDayKey]?.[t] || 0;
                    } else {
                      EVENT_DAYS.forEach(day => {
                        count += shiftCounts[day.key]?.[t] || 0;
                      });
                    }

                    const isSelected = selectedDayKey && selectedShiftId === t;

                    // Lógica de colores según requerimientos de comité
                    const isSingleCommittee = selectedCommittees.length === 1;
                    const activeCommittee = isSingleCommittee ? selectedCommittees[0] : null;
                    const minRequired = activeCommittee ? (committeeRequirements[activeCommittee]?.[t] ?? 0) : 0;

                    let buttonClass = "";
                    let countTextClass = "";

                    if (isSelected) {
                      if (isSingleCommittee) {
                        const isUnderstaffed = count < minRequired;
                        if (isUnderstaffed) {
                          buttonClass = "bg-rose-600 border-rose-500 text-white shadow-sm scale-105 font-bold";
                          countTextClass = "text-rose-100/90";
                        } else {
                          buttonClass = "bg-teal-600 border-teal-500 text-white shadow-sm scale-105 font-bold";
                          countTextClass = "text-teal-100/90";
                        }
                      } else {
                        // Selección neutra global
                        buttonClass = "bg-[#0084d1] border-[#0084d1] text-white shadow-sm scale-105 font-bold";
                        countTextClass = "text-sky-100/90";
                      }
                    } else {
                      if (isSingleCommittee) {
                        const isUnderstaffed = count < minRequired;
                        if (isUnderstaffed) {
                          buttonClass = "bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100/20 hover:text-rose-700 font-bold";
                          countTextClass = "text-rose-500";
                        } else {
                          buttonClass = "bg-teal-50 border-teal-100 text-accent hover:bg-teal-100/20 hover:text-teal-700 font-bold";
                          countTextClass = "text-accent";
                        }
                      } else {
                        // Estilo neutro vista global
                        if (count > 0) {
                          buttonClass = "bg-dark3 border-border text-text hover:bg-dark3 hover:text-text font-bold";
                          countTextClass = "text-text-dim";
                        } else {
                          buttonClass = "bg-dark2 border-border text-text-dim hover:bg-dark3";
                          countTextClass = "text-text-dim";
                        }
                      }
                    }

                    // Si no hay día seleccionado, forzar un estilo atenuado y deshabilitar
                    if (!selectedDayKey) {
                      buttonClass = "bg-dark2 border-border text-text-dim opacity-60 cursor-not-allowed";
                      countTextClass = "text-text-dim";
                    }

                    const shiftTimeLabel = getOfficialShiftTime(selectedDayKey, t).timeLabel;

                    return (
                      <button
                        key={t}
                        disabled={!selectedDayKey}
                        onClick={() => {
                          if (selectedDayKey) {
                            if (selectedShiftId === t) {
                              setSelectedShiftId("");
                            } else {
                              setSelectedShiftId(t);
                            }
                          }
                        }}
                        title={!selectedDayKey ? "Por favor selecciona una fecha primero" : `Seleccionar ${shiftTimeLabel}`}
                        className={`shrink-0 flex items-center justify-center gap-1.5 px-2 md:px-4.5 py-2.5 rounded-sm border text-xs transition-all w-full md:w-auto ${buttonClass}`}
                      >
                        <span className="font-inter font-bold">{t}</span>
                        <div className="w-[1px] h-3 bg-current opacity-20" />
                        <span className={`font-inter font-bold ${countTextClass}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              </motion.div>
            )}
          </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Panel de Gestión del Turno Seleccionado (Debajo) */}
        <div className="flex flex-col w-full lg:flex-1 lg:min-h-0">
          {!selectedDayKey || !selectedShiftId ? (
            <div className="flex-1 bg-dark2 border border-border rounded-sm shadow-sm overflow-hidden p-12 flex flex-col items-center justify-center text-center min-h-[300px]">
              <span className="material-symbols-outlined text-[64px] text-text-dim mb-4 animate-pulse">calendar_month</span>
              <h3 className="text-lg font-bold tracking-tight text-text mb-2">Ningún turno seleccionado</h3>
              <p className="text-xs font-inter font-bold text-text-dim max-w-sm leading-relaxed">
                Selecciona un día y un turno específico (T1 - T4) en el selector superior para comenzar a enviar recordatorios de WhatsApp.
              </p>
            </div>
          ) : (
            <>
              {/* Lista de Voluntarios (Completa) */}
              <div className="flex flex-col w-full lg:h-full lg:min-h-0">
                <div className="flex flex-col w-full lg:h-full lg:min-h-0">
                  <div className="bg-dark2 border border-border rounded-sm shadow-sm flex flex-col w-full relative lg:h-full lg:min-h-0">
                    {selectedVolunteers.size > 0 && (
                      <div className="p-3 sm:px-4 sm:py-3 bg-dark2/95 backdrop-blur-xl border-b border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 animate-in fade-in sticky top-0 z-30 shadow-xl">
                        <div className="flex items-center justify-between sm:justify-start gap-2.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-text">
                            <span className="bg-[#4d7cfe] text-white px-2.5 py-0.5 rounded-full font-mono text-[11px] font-black shadow-sm">
                              {selectedVolunteers.size}
                            </span>
                            <span className="text-xs font-bold text-text">
                              {selectedVolunteers.size === 1 ? 'voluntario seleccionado' : 'voluntarios seleccionados'}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedVolunteers(new Set())}
                            className="sm:hidden text-text-dim text-[11px] font-bold hover:text-text h-7 px-2 rounded-full"
                          >
                            Desmarcar
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <Button
                            onClick={handleBulkSendWhatsApp}
                            disabled={isSendingBulkWA}
                            className="bg-emerald-600 hover:bg-emerald-500 dark:bg-[#25D366] dark:hover:bg-[#20bd5a] text-white dark:text-slate-950 font-extrabold text-xs rounded-full px-4 sm:px-5 h-9 sm:h-10 shadow-lg shadow-emerald-600/20 dark:shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 w-full sm:w-auto"
                          >
                            <span className="material-symbols-outlined text-[18px]">send</span>
                            <span className="sm:hidden">
                              {isSendingBulkWA ? "Enviando..." : `Enviar WA (${selectedVolunteers.size})`}
                            </span>
                            <span className="hidden sm:inline">
                              {isSendingBulkWA ? "Enviando recordatorios..." : `Enviar Recordatorio WhatsApp (${selectedVolunteers.size})`}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setSelectedVolunteers(new Set())}
                            className="hidden sm:inline-flex text-text-dim text-xs font-bold hover:text-text h-9 rounded-full px-3"
                          >
                            Desmarcar
                          </Button>
                        </div>
                      </div>
                    )}
                    <AlphabetScrubber isMobile={isMobile} />
                    <div className="bg-dark2 w-full relative lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:rounded-sm">
                      {activeVolunteers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-text-dim h-full">
                          <span className="material-symbols-outlined text-[48px] text-text-dim mb-4">group_off</span>
                          <p className="text-base font-bold text-text">Sin voluntarios asignados</p>
                          <p className="text-sm max-w-[250px] mt-1 text-text-dim">No hay voluntarios asignados a este turno para los filtros seleccionados.</p>
                        </div>
                      ) : (
                        <>
                          {/* Vista Mobile/Tablet: Tarjetas Deslizables */}
                          <div className="block lg:hidden divide-y divide-white/5 bg-dark2">
                            {sortedLetters.map(letter => (
                              <Fragment key={letter}>
                                {groupedVolunteers[letter].map((vol, index) => {
                              const isConfirmed = !!confirmedReminders[`${vol.id}-${selectedDayKey}-${selectedShiftId}`];
                              const isContacted = !!contactedReminders[`${vol.id}-${selectedDayKey}-${selectedShiftId}`];
                              const msg = generateReminderMessage(
                                vol.name,
                                dateStr ? dateStr.charAt(0).toUpperCase() + dateStr.slice(1) : "",
                                selectedShiftDetails?.name || "",
                                selectedShiftDetails?.time || "",
                                vol.committee,
                                isSelectedHoliday
                              );

                              return (
                                <div key={vol.id} id={index === 0 ? `letter-mobile-${letter}` : undefined} className={cn(
                                  "transition-colors",
                                  isConfirmed && "bg-[#6dd230]/5"
                                )}>
                                  <SwipeableMobileCard
                                    name={vol.name}
                                    phone={vol.phone}
                                    searchTerm={searchTerm}
                                    onEdit={() => handleEditClick(vol)}
                                    isSelected={selectedVolunteers.has(vol.id)}
                                    onToggleSelect={() => toggleSelection(vol.id)}
                                    selectionModeActive={selectedVolunteers.size > 0}

                                    onSwipeRight={() => {
                                      if (!canSendWhatsappMessages()) {
                                        showToast("El Administrador ha deshabilitado el envío de WhatsApp para Coordinadores", "error");
                                        return;
                                      }
                                      handleSingleSendWhatsApp(vol);
                                    }}
                                    swipeRightIcon="send"
                                    swipeRightText="WhatsApp"
                                    swipeRightColorClass="text-[#25D366]"
                                    swipeRightBgColor="rgba(37, 211, 102, 0.2)"

                                    onSwipeLeft={() => toggleConfirmed(vol.id)}
                                    swipeLeftIcon={isConfirmed ? "close" : "check"}
                                    swipeLeftText={isConfirmed ? "Desmarcar" : "Confirmar"}
                                    swipeLeftColorClass={isConfirmed ? "text-text-dim" : "text-[#6dd230]"}
                                    swipeLeftBgColor={isConfirmed ? "rgba(255, 255, 255, 0.1)" : "rgba(109, 210, 48, 0.2)"}

                                    badges={
                                      <>
                                        {vol.committee && (
                                          <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, getCommitteeColor(vol.committee))}>
                                            {vol.committee}
                                          </Badge>
                                        )}
                                        <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, isConfirmed ? "bg-accent/10 text-accent border-accent/20" : isContacted ? "bg-sky-500/10 text-sky-500 border-sky-500/20" : "bg-amber-50 text-amber-600 border-amber-200")}>
                                          {isConfirmed ? 'Confirmado' : isContacted ? 'Contactado' : 'Pendiente'}
                                        </Badge>
                                      </>
                                    }
                                  />
                                </div>
                              );
                            })}
                          </Fragment>
                        ))}
                          </div>

                          {/* Desktop Table (Hidden on small screens) */}
                          <div className="hidden lg:block bg-dark2 relative w-full pb-10">
                            <table className="w-full text-sm text-left font-inter border-separate border-spacing-0">
                              <thead className="bg-dark3/90 sticky top-0 z-20 backdrop-blur-md border-b border-border text-[10px] font-bold text-text-dim uppercase tracking-wider">
                                <tr>
                                  <th className="px-5 py-4 text-center w-16">
                                    <button 
                                      onClick={() => {
                                        const allDisplayed = sortedLetters.flatMap(l => groupedVolunteers[l]).map(v => v.id);
                                        const allSelected = allDisplayed.every(id => selectedVolunteers.has(id));
                                        if (allSelected) {
                                          setSelectedVolunteers(new Set());
                                        } else {
                                          setSelectedVolunteers(new Set(allDisplayed));
                                        }
                                      }}
                                      className={cn(
                                        "w-5 h-5 rounded flex items-center justify-center transition-all mx-auto border",
                                        sortedLetters.flatMap(l => groupedVolunteers[l]).every(v => selectedVolunteers.has(v.id)) && sortedLetters.flatMap(l => groupedVolunteers[l]).length > 0
                                          ? "bg-[#4d7cfe] border-[#4d7cfe] text-white"
                                          : "border-border hover:border-text-dim text-transparent dark:border-white/20 dark:hover:border-white/50"
                                      )}
                                    >
                                      <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                                    </button>
                                  </th>
                                  <th className="px-5 py-4 text-left w-36">Estado</th>
                                  <th className="px-5 py-4 text-left font-bold text-text-dim uppercase text-[10px]">Nombre y Apellido</th>
                                  <th className="px-5 py-4 text-center font-bold text-text-dim uppercase text-[10px]">Barrio / Rama</th>
                                  <th className="px-5 py-4 text-center font-bold text-text-dim uppercase text-[10px]">Estaca</th>
                                  <th className="px-5 py-4 text-center">Comité</th>
                                  <th className="px-5 py-4 text-center w-px whitespace-nowrap">Acciones</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                <AnimatePresence mode="popLayout">
                                  {sortedLetters.map(letter => (
                                    <Fragment key={letter}>
                                      {groupedVolunteers[letter].map((vol, index) => {
                                    const isConfirmed = !!confirmedReminders[`${vol.id}-${selectedDayKey}-${selectedShiftId}`];
                                    const isContacted = !!contactedReminders[`${vol.id}-${selectedDayKey}-${selectedShiftId}`];
                                    const msg = generateReminderMessage(
                                      vol.name,
                                      dateStr ? dateStr.charAt(0).toUpperCase() + dateStr.slice(1) : "",
                                      selectedShiftDetails?.name || "",
                                      selectedShiftDetails?.time || "",
                                      vol.committee,
                                      isSelectedHoliday
                                    );
                                    const link = generateWaMeLink(vol.phone, msg);

                                    return (
                                      <motion.tr
                                        key={vol.id}
                                        id={index === 0 ? `letter-${letter}` : undefined}
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        onClick={() => {
                                          if (selectedVolunteers.size > 0) {
                                            toggleSelection(vol.id);
                                          } else {
                                            handleEditClick(vol);
                                          }
                                        }}
                                        className={cn(
                                          "group hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors cursor-pointer",
                                          isConfirmed && "bg-[#6dd230]/5 hover:bg-[#6dd230]/10",
                                          selectedVolunteers.has(vol.id) && "bg-[#4d7cfe]/10 hover:bg-[#4d7cfe]/15"
                                        )}
                                      >

                                        <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                          <button
                                            onClick={() => toggleSelection(vol.id)}
                                            className={cn(
                                              "w-5 h-5 rounded flex items-center justify-center transition-all mx-auto border",
                                              selectedVolunteers.has(vol.id)
                                                ? "bg-[#4d7cfe] border-[#4d7cfe] text-white"
                                                : "border-border hover:border-text-dim text-transparent dark:border-white/20 dark:hover:border-white/50"
                                            )}
                                          >
                                            <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                                          </button>
                                        </td>
                                        <td className="px-5 py-4 text-left" onClick={(e) => e.stopPropagation()}>
                                          <Select 
                                            value={isConfirmed ? "Confirmado" : isContacted ? "Contactado" : "Pendiente"} 
                                            onValueChange={(val) => handleStatusChange(vol.id as string, val as string)}
                                          >
                                            <SelectTrigger 
                                              className={cn(
                                                "h-6 border-0 focus:ring-0 focus:ring-offset-0 font-inter font-bold uppercase text-[10px] tracking-widest px-2.5 py-0.5 rounded-full w-[130px] shadow-none",
                                                isConfirmed ? "bg-accent/10 text-accent" : 
                                                isContacted ? "bg-sky-500/10 text-sky-500" : 
                                                "bg-amber-50 text-amber-600 hover:bg-amber-100"
                                              )}
                                            >
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-dark2 border-border text-text font-inter">
                                              <SelectItem value="Pendiente" className="text-amber-500 font-bold text-xs">Pendiente</SelectItem>
                                              <SelectItem value="Contactado" className="text-sky-500 font-bold text-xs">Contactado</SelectItem>
                                              <SelectItem value="Confirmado" className="text-accent font-bold text-xs">Confirmado</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </td>
                                        <td className="px-5 py-4 font-bold text-text">
                                          <div className="flex items-center gap-2">
                                            <span>{vol.name}</span>
                                          </div>
                                        </td>
                                        <td className="px-5 py-4 text-text text-center">{vol.ward || '—'}</td>
                                        <td className="px-5 py-4 text-text-dim text-center">{vol.stake || '—'}</td>
                                        <td className="px-5 py-4 text-center">
                                          <Badge variant="outline" className={cn("font-bold px-2.5 py-0.5", getCommitteeColor(vol.committee))}>
                                            {vol.committee}
                                          </Badge>
                                        </td>
                                        <td className="px-3 py-4 text-center w-px whitespace-nowrap">
                                          <div className="flex items-center justify-center gap-1">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleSingleSendWhatsApp(vol);
                                              }}
                                              className={cn(
                                                "h-8 w-8 transition-all rounded-full border border-[#25D366]/20 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 active:scale-95",
                                                !canSendWhatsappMessages() && "text-text-dim/30 border-transparent bg-transparent cursor-not-allowed"
                                              )}
                                              title={canSendWhatsappMessages() ? "Enviar recordatorio por Meta WhatsApp" : "Permiso deshabilitado por el administrador"}
                                            >
                                              <span className="material-symbols-outlined text-[18px]">send</span>
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-amber-500/70 hover:bg-amber-500/10 hover:text-amber-500 transition-all active:scale-90 rounded-full"
                                              title="Archivar"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleArchiveVolunteer(vol);
                                              }}
                                            >
                                              <span className="material-symbols-outlined text-[18px]">archive</span>
                                            </Button>
                                          </div>
                                        </td>
                                      </motion.tr>
                                    );
                                  })}
                                </Fragment>
                              ))}
                                </AnimatePresence>
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>


                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Ver Plantilla Drawer */}
        <div className={`fixed inset-0 z-[100] flex flex-col justify-end transition-all duration-300 ${showTemplate ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${showTemplate ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setShowTemplate(false)}
          />

          {/* Drawer Content */}
          <div
            id="drawer-template"
            className={`relative w-full md:w-[500px] md:mx-auto h-[80vh] md:h-[94vh] bg-dark2 border border-white/10 rounded-t-[40px] shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out ${showTemplate ? 'translate-y-0' : 'translate-y-full'}`}
            style={{ willChange: 'transform' }}
          >
            {/* Handle */}
            <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />

            <div
              className="flex-1 overflow-y-auto scrollbar-hide px-6 pb-6 pt-2 overscroll-contain"
              onTouchStart={(e) => {
                const drawer = document.getElementById('drawer-template');
                if (!drawer) return;
                drawer.dataset.startY = e.touches[0].clientY.toString();
                drawer.style.transition = 'none';
              }}
              onTouchMove={(e) => {
                const drawer = document.getElementById('drawer-template');
                if (!drawer) return;
                const startY = parseFloat(drawer.dataset.startY || '0');
                const currentY = e.touches[0].clientY;
                const deltaY = currentY - startY;

                if (e.currentTarget.scrollTop <= 0 && deltaY > 0) {
                  drawer.style.transform = `translateY(${deltaY}px)`;
                  drawer.dataset.swiping = 'true';
                }
              }}
              onTouchEnd={(e) => {
                const drawer = document.getElementById('drawer-template');
                if (!drawer) return;

                drawer.style.transition = 'transform 0.3s ease-out';

                if (drawer.dataset.swiping === 'true') {
                  const startY = parseFloat(drawer.dataset.startY || '0');
                  const deltaY = e.changedTouches[0].clientY - startY;

                  drawer.dataset.swiping = 'false';

                  if (deltaY > 150) {
                    setShowTemplate(false);
                    setTimeout(() => { drawer.style.transform = ''; }, 300);
                  } else {
                    drawer.style.transform = `translateY(0)`;
                  }
                } else {
                  drawer.style.transform = '';
                }
              }}
            >
              {/* Header Drawer Info */}
              <div className="text-center mt-2 mb-8 px-4">
                <h3 className="text-xl font-bold text-text flex items-center justify-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[#0084d1]">chat_bubble</span>
                  Mensaje Plantilla
                </h3>
              </div>

              <div className="flex-1 flex flex-col gap-6">
                {/* Meta Template Preview Card */}
                <div className="bg-[#e5ddd5] dark:bg-[#0b141a] p-4 rounded-2xl border border-black/10 dark:border-white/10 shadow-lg relative">
                  <div className="bg-white dark:bg-[#202c33] p-4 rounded-xl shadow-sm text-sm text-slate-900 dark:text-slate-100 font-sans space-y-3">
                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                      Templo Managua
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {previewMessage}
                    </div>
                    <div className="text-[11px] text-slate-400 text-right pt-1">
                      Volunteer Manager
                    </div>
                    <div className="border-t border-slate-200 dark:border-slate-700/80 pt-2.5 space-y-2">
                      <div className="w-full py-2 bg-slate-100 dark:bg-[#111b21] hover:bg-slate-200 dark:hover:bg-[#2a3942] rounded-lg text-center text-xs font-bold text-[#00a884] cursor-pointer flex items-center justify-center gap-1.5 transition-colors">
                        <span className="material-symbols-outlined text-[16px]">reply</span>
                        <span>Confirmar</span>
                      </div>
                      <div className="w-full py-2 bg-slate-100 dark:bg-[#111b21] hover:bg-slate-200 dark:hover:bg-[#2a3942] rounded-lg text-center text-xs font-bold text-[#00a884] cursor-pointer flex items-center justify-center gap-1.5 transition-colors">
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                        <span>Ver mis turnos</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-dark3 border border-border text-xs text-text-dim flex items-start gap-2.5 leading-relaxed">
                  <span className="material-symbols-outlined text-[18px] text-[#4d7cfe] shrink-0 mt-0.5">verified</span>
                  <span>
                    Plantilla oficial aprobada por Meta: <strong className="text-text">recordatorio_turno_comite</strong>.
                    Los datos de nombre, fecha, horario y comité se completan dinámicamente para cada voluntario.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Unified Volunteer Profile Drawer */}
        <VolunteerProfileDrawer
          isOpen={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          volunteer={editingVolunteer}
          mode="coordinator"
        />

      {/* Bulk Actions Toolbar */}
        <AnimatePresence>
          {selectedVolunteers.size > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-0 md:bottom-6 left-0 right-0 z-[90] flex justify-center px-4 pointer-events-none"
            >
              <div className="bg-dark2 border border-border shadow-2xl rounded-t-2xl md:rounded-2xl p-4 flex flex-col gap-4 pointer-events-auto w-full md:w-auto md:min-w-[550px] max-w-full">
                <div className="relative flex items-center justify-center w-full">
                  <div className="flex items-center gap-2 font-bold text-text whitespace-nowrap">
                    <div className="w-6 h-6 rounded-full bg-[#4d7cfe] text-white flex items-center justify-center text-xs">
                      {selectedVolunteers.size}
                    </div>
                    <span>seleccionados</span>
                  </div>
                  <Button 
                    variant="ghost"
                    onClick={() => setSelectedVolunteers(new Set())}
                    className="absolute right-0 text-text-dim hover:text-text h-8 rounded-full px-2"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </Button>
                </div>
                
                <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                  <Button 
                    onClick={() => handleBulkConfirm(true)}
                    className="bg-[#6dd230]/10 hover:bg-[#6dd230]/20 text-[#6dd230] border border-[#6dd230]/20 h-9 flex items-center justify-center rounded-full text-[11px] font-bold px-3 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[15px] mr-1">check_circle</span>
                    Confirmar
                  </Button>
                  
                  <Button 
                    onClick={() => handleBulkContacted()}
                    className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 border border-sky-500/20 h-9 flex items-center justify-center rounded-full text-[11px] font-bold px-3 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[15px] mr-1">forum</span>
                    Contactados
                  </Button>

                  <Button 
                    onClick={() => setIsReassignSheetOpen(true)}
                    className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 h-9 flex items-center justify-center rounded-full text-[11px] font-bold px-3 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[15px] mr-1">sync_alt</span>
                    Reasignar
                  </Button>

                  <Button 
                    onClick={() => handleBulkConfirm(false)}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 h-9 flex items-center justify-center rounded-full text-[11px] font-bold px-3 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[15px] mr-1">cancel</span>
                    Cancelar
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reasignar Turno Modal Unificado */}
        <ReassignShiftModal
          isOpen={isReassignSheetOpen}
          onClose={() => setIsReassignSheetOpen(false)}
          volunteer={(() => {
            const firstItem = Array.from(selectedVolunteers)[0];
            if (!firstItem) return null;
            if (typeof firstItem === 'string') {
              const found = rawVolunteers.find((v: any) => v.id === firstItem);
              if (found) {
                return {
                  id: found.id,
                  name: found.name || `${found.first_name || ''} ${found.last_name || ''}`.trim() || 'Voluntario',
                  committee: found.committee
                };
              }
              return { id: firstItem, name: 'Voluntario Seleccionado' };
            }
            return firstItem as any;
          })()}
          sourceDayKey={selectedDayKey}
          sourceShiftId={selectedShiftId}
          onSuccess={(msg) => showToast(msg, 'success')}
          onError={(err) => showToast(err, 'error')}
          mode="coordinator"
        />

        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
        />
      </div>
    </div>
  );
}
