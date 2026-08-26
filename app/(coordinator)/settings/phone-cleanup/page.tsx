'use client'

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  fetchPhoneCleanupGroupsAction,
  savePersonCentricReviewAction,
  applyPhoneCleanupItemsAction,
} from '@/app/actions/phone-review-actions';
import {
  PhoneGroupReviewItem,
  AppliedPhoneReviewGroup,
  AppliedPhoneReviewMember,
  PersonCentricDecision,
  PersonCentricItemInput,
} from '@/lib/services/phone-cleanup-review.service';
import {
  BatchProcessingSummary
} from '@/lib/services/phone-cleanup-processing.service';
import {
  Phone,
  History as HistoryIcon,
  Save,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Zap,
  CheckCheck,
  Info,
  XCircle,
  CheckSquare,
  Square,
  ArrowRight,
  Crown,
  Users,
  Archive,
  Smartphone,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { SmartSearchBar } from '@/components/SmartSearchBar';
import { useDebouncedSearch } from '@/lib/use-debounced-search';
import { HighlightText } from '@/components/HighlightText';
import { normalizeSearch } from '@/lib/utils';

const phoneDigits = (value: string) => value.replace(/\D/g, '').slice(-8);

function getAppliedDecisionCopy(member: AppliedPhoneReviewMember) {
  switch (member.decision) {
    case 'PHONE_OWNER':
      return {
        label: 'Titular del número',
        detail: 'Este perfil conserva el teléfono del grupo.',
        className: 'bg-[#4d7cfe]/10 text-[#4d7cfe] border-[#4d7cfe]/25',
      };
    case 'SHARED_PHONE':
      return {
        label: 'Teléfono compartido',
        detail: member.sharedPhoneOwnerName
          ? `Comparte el número con ${member.sharedPhoneOwnerName}.`
          : 'Comparte el número con el titular autorizado.',
        className: 'bg-violet-500/10 text-violet-500 border-violet-500/25',
      };
    case 'PHONE_DOES_NOT_BELONG':
      return {
        label: 'Número corregido',
        detail: 'Se reemplazó el teléfono que pertenecía a este grupo.',
        className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
      };
    case 'ARCHIVE_DUPLICATE':
      return {
        label: 'Registro archivado',
        detail: member.duplicatePrimaryVolunteerName
          ? `El registro principal es ${member.duplicatePrimaryVolunteerName}.`
          : 'Se archivó como perfil duplicado.',
        className: 'bg-[#fe4d97]/10 text-[#fe4d97] border-[#fe4d97]/25',
      };
    case 'KEEP':
      return {
        label: 'Número conservado',
        detail: 'El teléfono se mantuvo sin cambios.',
        className: 'bg-[#6dd230]/10 text-emerald-700 dark:text-[#6dd230] border-[#6dd230]/25',
      };
    default:
      return {
        label: 'Revisión aplicada',
        detail: 'La decisión fue procesada.',
        className: 'bg-dark3 text-text-dim border-border',
      };
  }
}

export default function PhoneCleanupPersonCentricPage() {
  const [groups, setGroups] = useState<PhoneGroupReviewItem[]>([]);
  const [appliedGroups, setAppliedGroups] = useState<AppliedPhoneReviewGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const { inputValue: searchInput, setInputValue: setSearchInput, appliedSearch: search, applySearch } = useDebouncedSearch();
  const {
    inputValue: historySearchInput,
    setInputValue: setHistorySearchInput,
    appliedSearch: historySearch,
    applySearch: applyHistorySearch,
  } = useDebouncedSearch();
  const [activeTab, setActiveTab] = useState<'PENDING' | 'READY' | 'PROCESSED'>('PENDING');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNREVIEWED' | 'SAVED' | 'REQUIRES_INFO' | 'LATER'>('ALL');
  const [expandedPhoneKey, setExpandedPhoneKey] = useState<string | null>(null);
  const [expandedAppliedReviewId, setExpandedAppliedReviewId] = useState<string | null>(null);
  const [committeeFilter, setCommitteeFilter] = useState('ALL');

  // Selected Item IDs for batch execution in "Listas para aplicar"
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [batchSummary, setBatchSummary] = useState<BatchProcessingSummary | null>(null);

  // Local form state: phoneNormalized -> Map<volunteerId, PersonCentricFormState>
  interface PersonCentricFormState {
    decision: PersonCentricDecision | '';
    hasCorrectedPhone: boolean;
    correctedPhone: string;
    sharedPhoneOwnerId: string;
    duplicatePrimaryVolunteerId: string;
    reviewerComment: string;
  }

  const [formState, setFormState] = useState<Record<string, Record<string, PersonCentricFormState>>>({});

  // Load Groups & Populate Initial Form State directly from Supabase DB
  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await fetchPhoneCleanupGroupsAction(true);
    if (res.success && res.data) {
      setGroups(res.data);
      setAppliedGroups(res.appliedGroups);
      initFormState(res.data);
      setSelectedItemIds([]);
    } else {
      setErrorMsg(res.error || 'Error al cargar teléfonos desde Supabase.');
    }
    setLoading(false);
  };

  const initFormState = (loadedGroups: PhoneGroupReviewItem[]) => {
    const nextState: Record<string, Record<string, PersonCentricFormState>> = {};

    loadedGroups.forEach(group => {
      const phoneKey = group.phoneNormalized;
      nextState[phoneKey] = {};

      group.volunteers.forEach(vol => {
        const dec = vol.decision || '';
        const corrPhone = vol.correctedPhone || '';
        const hasPhone = !!corrPhone;
        const ownerId = vol.sharedPhoneOwnerId || '';
        const primId = vol.duplicatePrimaryVolunteerId || '';
        const comment = vol.reviewerComment || '';

        nextState[phoneKey][vol.id] = {
          decision: dec as PersonCentricDecision | '',
          hasCorrectedPhone: hasPhone,
          correctedPhone: corrPhone,
          sharedPhoneOwnerId: ownerId,
          duplicatePrimaryVolunteerId: primId,
          reviewerComment: comment,
        };
      });
    });

    setFormState(nextState);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDecisionChange = (phoneKey: string, volunteerId: string, decision: PersonCentricDecision) => {
    setFormState(prev => {
      const phoneGroupState = { ...prev[phoneKey] };
      const currentVolState = { ...phoneGroupState[volunteerId], decision };

      if (decision === 'PHONE_DOES_NOT_BELONG') {
        currentVolState.hasCorrectedPhone = currentVolState.hasCorrectedPhone ?? false;
      }

      phoneGroupState[volunteerId] = currentVolState;
      return { ...prev, [phoneKey]: phoneGroupState };
    });
  };

  const handleFieldChange = (phoneKey: string, volunteerId: string, field: keyof PersonCentricFormState, value: any) => {
    setFormState(prev => {
      const phoneGroupState = { ...prev[phoneKey] };
      phoneGroupState[volunteerId] = {
        ...phoneGroupState[volunteerId],
        [field]: value,
      };
      return { ...prev, [phoneKey]: phoneGroupState };
    });
  };

  const handleSaveProgress = async (group: PhoneGroupReviewItem) => {
    const phoneKey = group.phoneNormalized;
    const groupVolState = formState[phoneKey] || {};

    const itemsToSave: PersonCentricItemInput[] = [];

    group.volunteers.forEach(vol => {
      const vState = groupVolState[vol.id];
      if (vState && vState.decision) {
        itemsToSave.push({
          volunteerId: vol.id,
          decision: vState.decision,
          correctedPhone: vState.hasCorrectedPhone ? vState.correctedPhone : null,
          sharedPhoneOwnerId: vState.sharedPhoneOwnerId || null,
          duplicatePrimaryVolunteerId: vState.duplicatePrimaryVolunteerId || null,
          reviewerComment: vState.reviewerComment || null,
        });
      }
    });

    if (itemsToSave.length === 0) {
      setToastMsg('Seleccione al menos una decisión antes de guardar.');
      setTimeout(() => setToastMsg(null), 3000);
      return;
    }

    try {
      const res = await savePersonCentricReviewAction({
        phoneNormalized: phoneKey,
        items: itemsToSave,
      });

      if (res.success) {
        setToastMsg(`✅ Progreso guardado (${itemsToSave.length}/${group.volunteers.length} personas)`);
        setTimeout(() => setToastMsg(null), 4000);
        await loadData();
      } else {
        setErrorMsg(res.error || 'Error al guardar el progreso en Supabase.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión al guardar progreso.');
    }
  };

  // Only unresolved duplicates belong in the pending workflow. A phone with one
  // active profile plus archived profiles is an already-resolved exception.
  const pendingGroups = useMemo(() => {
    return groups.map(g => {
      const activeVolunteerCount = g.volunteers.filter(v => v.status === 'active').length;
      const pendingVols = g.volunteers.filter(v => v.status === 'active' && v.processingStatus !== 'PROCESSED');
      if (activeVolunteerCount < 2) return { ...g, volunteers: [] };
      return { ...g, volunteers: pendingVols };
    }).filter(g => g.volunteers.length > 0);
  }, [groups]);

  // Items ready to process in "Listas para aplicar" tab
  const readyToProcessItems = useMemo(() => {
    const list: Array<{ itemId: string; volunteerId: string; fullName: string; committee: string; phoneNormalized: string; phoneActual: string; decision: PersonCentricDecision; correctedPhone?: string | null }> = [];
    pendingGroups.forEach(g => {
      g.volunteers.forEach(v => {
        if (v.status === 'active' && v.reviewItemId && v.reviewItemStatus === 'READY_TO_PROCESS' && v.processingStatus === 'PENDING' && v.decision) {
          list.push({
            itemId: v.reviewItemId,
            volunteerId: v.id,
            fullName: v.fullName,
            committee: v.committee,
            phoneNormalized: g.phoneNormalized,
            phoneActual: v.phone,
            decision: v.decision,
            correctedPhone: v.correctedPhone,
          });
        }
      });
    });
    return list;
  }, [pendingGroups]);

  const committeeOptions = useMemo(() => {
    const committees = new Set<string>();
    groups.forEach(group => group.volunteers.forEach(volunteer => {
      if (volunteer.committee) committees.add(volunteer.committee);
    }));
    appliedGroups.forEach(group => group.members.forEach(member => {
      if (member.committee) committees.add(member.committee);
    }));
    return Array.from(committees).sort((a, b) => a.localeCompare(b, 'es'));
  }, [groups, appliedGroups]);

  const filteredReadyToProcessItems = useMemo(() => {
    if (committeeFilter === 'ALL') return readyToProcessItems;
    return readyToProcessItems.filter(item => item.committee === committeeFilter);
  }, [readyToProcessItems, committeeFilter]);

  const filteredAppliedGroups = useMemo(() => {
    const terms = historySearch.split(',').map(term => normalizeSearch(term.trim())).filter(Boolean);
    return appliedGroups.filter(group => {
      const matchesCommittee = committeeFilter === 'ALL' || group.members.some(member => member.committee === committeeFilter);
      if (!matchesCommittee) return false;
      if (terms.length === 0) return true;

      const searchable = normalizeSearch([
        group.phoneNormalized,
        ...group.currentMembers.flatMap(member => [member.fullName, member.committee]),
        ...group.members.flatMap(member => [
          member.fullName,
          member.committee,
          member.originalPhone,
          member.resultingPhone,
          member.decision,
          member.sharedPhoneOwnerName || '',
          member.duplicatePrimaryVolunteerName || '',
        ]),
      ].join(' '));
      return terms.every(term => searchable.includes(term));
    });
  }, [appliedGroups, historySearch, committeeFilter]);

  const pendingGroupMetrics = useMemo(() => {
    const metrics = new Map<string, {
      reviewedCount: number;
      unreviewedCount: number;
      requiresInfoCount: number;
      laterCount: number;
      status: 'UNREVIEWED' | 'SAVED' | 'REQUIRES_INFO' | 'LATER';
    }>();

    pendingGroups.forEach(group => {
      const groupVolState = formState[group.phoneNormalized] || {};
      let reviewedCount = 0;
      let unreviewedCount = 0;
      let requiresInfoCount = 0;
      let laterCount = 0;

      group.volunteers.forEach(volunteer => {
        const state = groupVolState[volunteer.id];
        if (!state?.decision) {
          unreviewedCount++;
          return;
        }

        reviewedCount++;
        if (state.decision === 'PHONE_DOES_NOT_BELONG' && !state.hasCorrectedPhone) requiresInfoCount++;
        if (state.decision === 'MANUAL_REVIEW') laterCount++;
      });

      const status = requiresInfoCount > 0
        ? 'REQUIRES_INFO'
        : unreviewedCount > 0
          ? 'UNREVIEWED'
          : laterCount > 0
            ? 'LATER'
            : 'SAVED';

      metrics.set(group.phoneNormalized, {
        reviewedCount,
        unreviewedCount,
        requiresInfoCount,
        laterCount,
        status,
      });
    });

    return metrics;
  }, [pendingGroups, formState]);

  const searchedPendingGroups = useMemo(() => {
    const searchTerms = search.split(',').map(term => normalizeSearch(term.trim())).filter(Boolean);
    return pendingGroups.filter(g => {
      if (committeeFilter !== 'ALL' && !g.volunteers.some(volunteer => volunteer.committee === committeeFilter)) return false;
      const matchSearch = searchTerms.length === 0 || searchTerms.every(term => {
        if (normalizeSearch(g.phoneNormalized).includes(term)) return true;
        return g.volunteers.some(volunteer => normalizeSearch(
          `${volunteer.fullName} ${volunteer.phone} ${volunteer.committee} ${volunteer.stake || ''} ${volunteer.neighborhood || ''}`
        ).includes(term));
      });
      return matchSearch;
    });
  }, [pendingGroups, search, committeeFilter]);

  const pendingStatusCounts = useMemo(() => {
    const counts = { ALL: searchedPendingGroups.length, UNREVIEWED: 0, SAVED: 0, REQUIRES_INFO: 0, LATER: 0 };
    searchedPendingGroups.forEach(group => {
      const status = pendingGroupMetrics.get(group.phoneNormalized)?.status;
      if (status) counts[status]++;
    });
    return counts;
  }, [searchedPendingGroups, pendingGroupMetrics]);

  const filteredGroups = useMemo(() => {
    if (statusFilter === 'ALL') return searchedPendingGroups;
    return searchedPendingGroups.filter(group => pendingGroupMetrics.get(group.phoneNormalized)?.status === statusFilter);
  }, [searchedPendingGroups, statusFilter, pendingGroupMetrics]);

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAllReady = () => {
    const visibleIds = filteredReadyToProcessItems.map(item => item.itemId);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedItemIds.includes(id));
    if (allVisibleSelected) {
      setSelectedItemIds(previous => previous.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedItemIds(previous => Array.from(new Set([...previous, ...visibleIds])));
    }
  };

  const handleExecuteBatch = async (dryRun: boolean = false) => {
    if (selectedItemIds.length === 0) return;
    setIsApplying(true);
    setErrorMsg(null);

    try {
      const res = await applyPhoneCleanupItemsAction(selectedItemIds, dryRun);
      if (res.success && res.summary) {
        setBatchSummary(res.summary);
        const failedCount = res.summary.totalRequested - res.summary.processedCount - res.summary.alreadyProcessedCount;
        if (failedCount > 0) {
          setErrorMsg(`Se aplicaron ${res.summary.processedCount} de ${res.summary.totalRequested} cambios. Revisa el detalle de los ${failedCount} pendientes.`);
          setActiveTab('READY');
        } else {
          setToastMsg(`${res.summary.processedCount} cambios aplicados correctamente.`);
          setTimeout(() => setToastMsg(null), 5000);
        }
        setShowConfirmModal(false);
        await loadData();
      } else {
        setErrorMsg(res.error || 'Error al procesar el lote seleccionado.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión durante el procesamiento.');
    }
    setIsApplying(false);
  };

  return (
    <div className="min-h-screen bg-dark p-4 font-sans text-text sm:p-6 lg:p-8">
      <header className="sticky top-0 z-40 -mx-4 -mt-4 mb-4 bg-dark/90 px-4 pb-4 pt-6 backdrop-blur-xl sm:-mx-6 sm:-mt-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8">
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-3 text-[28px] font-black tracking-tight text-text sm:text-4xl">
              Revisión de teléfonos
              <span className="rounded-full border border-[#4d7cfe]/20 bg-[#4d7cfe]/10 px-2.5 py-1 text-xs font-bold text-[#4d7cfe]">
                {pendingGroups.length}
              </span>
            </h1>
            <p className="mt-1 text-sm text-text-dim">Resuelve números compartidos o duplicados antes de aplicarlos.</p>
          </div>
          <Button
            onClick={loadData}
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 border-border bg-dark2 text-text hover:bg-dark3"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </div>
      </header>

      <div className="mb-8 w-full space-y-4">

        {/* TABS SELECTOR */}
        <div className="grid grid-cols-1 gap-1 rounded-xl border border-border bg-dark2 p-1.5 text-sm font-semibold sm:grid-cols-3" role="tablist" aria-label="Etapas de revisión telefónica">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'PENDING'}
            onClick={() => setActiveTab('PENDING')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 transition-colors ${
              activeTab === 'PENDING'
                ? 'bg-[#4d7cfe] text-white'
                : 'text-text-dim hover:bg-dark3 hover:text-text'
            }`}
          >
            <Phone className="w-4 h-4" />
            Pendientes ({pendingGroups.length} teléfonos)
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'READY'}
            onClick={() => setActiveTab('READY')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 transition-colors ${
              activeTab === 'READY'
                ? 'bg-[#4d7cfe] text-white'
                : 'text-text-dim hover:bg-dark3 hover:text-text'
            }`}
          >
            <Zap className="w-4 h-4" />
            Listas para aplicar ({readyToProcessItems.length} {readyToProcessItems.length === 1 ? 'persona' : 'personas'})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'PROCESSED'}
            onClick={() => setActiveTab('PROCESSED')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 transition-colors ${
              activeTab === 'PROCESSED'
                ? 'bg-[#4d7cfe] text-white'
                : 'text-text-dim hover:bg-dark3 hover:text-text'
            }`}
          >
            <CheckCheck className="w-4 h-4" />
            Aplicadas ({appliedGroups.length} teléfonos)
          </button>
        </div>

        {/* NOTIFICATIONS */}
        {errorMsg && (
          <div className="flex items-center justify-between rounded-xl border border-[#fe4d97]/30 bg-[#fe4d97]/10 p-4 text-sm text-[#fe4d97]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setErrorMsg(null)} className="text-[#fe4d97] hover:bg-[#fe4d97]/10">Cerrar</Button>
          </div>
        )}

        {toastMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-[#6dd230]/30 bg-[#6dd230]/10 p-4 text-sm text-emerald-700 animate-in fade-in duration-200 dark:text-[#6dd230]">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span className="font-medium">{toastMsg}</span>
          </div>
        )}
      </div>

      {/* TAB CONTENT 1: PENDIENTES */}
      {activeTab === 'PENDING' && (
        <div className="w-full space-y-8">
          {/* SEARCH & FILTERS */}
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-dark2 p-4 xl:flex-row xl:items-center">
            <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
              <SmartSearchBar
                value={searchInput}
                onValueChange={(value) => {
                  setSearchInput(value);
                  setExpandedPhoneKey(null);
                }}
                onImmediateSearch={applySearch}
                placeholder="Buscar por persona o número..."
                className="w-full sm:w-96"
                inputClassName="!border-border !bg-dark3 !text-text placeholder:!text-text-dim"
              />
              <label className="sr-only" htmlFor="pending-committee-filter">Filtrar por comité</label>
              <select
                id="pending-committee-filter"
                value={committeeFilter}
                onChange={(event) => {
                  setCommitteeFilter(event.target.value);
                  setExpandedPhoneKey(null);
                }}
                className="h-10 min-w-52 rounded-lg border border-border bg-dark3 px-3 text-sm font-medium text-text"
              >
                <option value="ALL">Todos los comités</option>
                {committeeOptions.map(committee => <option key={committee} value={committee}>{committee}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button
                size="sm"
                variant={statusFilter === 'ALL' ? 'default' : 'outline'}
                onClick={() => { setStatusFilter('ALL'); setExpandedPhoneKey(null); }}
                className={statusFilter === 'ALL' ? 'bg-[#4d7cfe] text-white hover:bg-[#3b66e0]' : 'border-border bg-dark2 text-text-dim'}
              >
                Todos ({pendingStatusCounts.ALL})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'UNREVIEWED' ? 'default' : 'outline'}
                onClick={() => { setStatusFilter('UNREVIEWED'); setExpandedPhoneKey(null); }}
                className={statusFilter === 'UNREVIEWED' ? 'bg-[#4d7cfe] text-white' : 'border-border bg-dark2 text-text-dim'}
              >
                Sin revisar ({pendingStatusCounts.UNREVIEWED})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'SAVED' ? 'default' : 'outline'}
                onClick={() => { setStatusFilter('SAVED'); setExpandedPhoneKey(null); }}
                className={statusFilter === 'SAVED' ? 'bg-[#4d7cfe] text-white' : 'border-border bg-dark2 text-text-dim'}
              >
                Guardados ({pendingStatusCounts.SAVED})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'REQUIRES_INFO' ? 'default' : 'outline'}
                onClick={() => { setStatusFilter('REQUIRES_INFO'); setExpandedPhoneKey(null); }}
                className={statusFilter === 'REQUIRES_INFO' ? 'bg-[#4d7cfe] text-white' : 'border-border bg-dark2 text-text-dim'}
              >
                Requieren información ({pendingStatusCounts.REQUIRES_INFO})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'LATER' ? 'default' : 'outline'}
                onClick={() => { setStatusFilter('LATER'); setExpandedPhoneKey(null); }}
                className={statusFilter === 'LATER' ? 'bg-[#4d7cfe] text-white' : 'border-border bg-dark2 text-text-dim'}
              >
                Revisar después ({pendingStatusCounts.LATER})
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-border bg-dark2 py-20 text-center">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-text-dim">Cargando teléfonos pendientes…</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="space-y-2 rounded-xl border border-border bg-dark2 py-20 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto opacity-80" />
              <h3 className="text-lg font-semibold text-text">No hay teléfonos pendientes</h3>
              <p className="text-sm text-text-dim">Todas las revisiones de esta sección fueron completadas o aplicadas.</p>
            </div>
          ) : (
            <>
              <section className="overflow-hidden rounded-xl border border-border bg-dark2" aria-label="Teléfonos pendientes de revisión">
                <div className="flex flex-col gap-1 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-text">
                    {filteredGroups.length} {filteredGroups.length === 1 ? 'teléfono encontrado' : 'teléfonos encontrados'}
                  </p>
                  <p className="text-xs text-text-dim">Selecciona un teléfono para revisar a las personas asociadas.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-left text-sm md:min-w-[760px] md:table-auto">
                    <thead className="bg-dark3 text-xs font-semibold text-text-dim">
                      <tr>
                        <th scope="col" className="px-4 py-3">Teléfono</th>
                        <th scope="col" className="px-4 py-3">Personas</th>
                        <th scope="col" className="hidden px-4 py-3 sm:table-cell">Comité</th>
                        <th scope="col" className="px-4 py-3">Estado</th>
                        <th scope="col" className="hidden px-4 py-3 md:table-cell">Progreso</th>
                        <th scope="col" className="hidden px-4 py-3 text-right md:table-cell">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredGroups.filter(group => !expandedPhoneKey || group.phoneNormalized === expandedPhoneKey).map(group => {
                        const metrics = pendingGroupMetrics.get(group.phoneNormalized);
                        const isExpanded = expandedPhoneKey === group.phoneNormalized;
                        const status = metrics?.status || 'UNREVIEWED';
                        const statusCopy = status === 'REQUIRES_INFO'
                          ? 'Requiere información'
                          : status === 'LATER'
                            ? 'Revisar después'
                            : status === 'SAVED'
                              ? 'Guardado'
                              : 'Sin revisar';
                        const statusClass = status === 'REQUIRES_INFO'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : status === 'LATER'
                            ? 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                            : status === 'SAVED'
                              ? 'border-[#6dd230]/30 bg-[#6dd230]/10 text-emerald-700 dark:text-[#6dd230]'
                              : 'border-border bg-dark3 text-text-dim';

                        return (
                          <tr key={group.phoneNormalized} className={isExpanded ? 'bg-[#4d7cfe]/5' : 'hover:bg-dark3/60'}>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setExpandedPhoneKey(isExpanded ? null : group.phoneNormalized)}
                                className="inline-flex items-center gap-1 font-bold tracking-wide text-text hover:text-[#4d7cfe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]"
                              >
                                <HighlightText text={group.phoneNormalized} term={search} />
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 md:hidden" /> : <ChevronDown className="h-3.5 w-3.5 md:hidden" />}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                <Users className="mt-0.5 h-4 w-4 shrink-0 text-text-dim" />
                                <div>
                                  <p className="font-medium text-text">
                                    {group.volunteers.slice(0, 2).map(volunteer => volunteer.fullName).join(', ')}
                                  </p>
                                  {group.volunteers.length > 2 && (
                                    <p className="mt-0.5 text-xs text-text-dim">+{group.volunteers.length - 2} personas más</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="hidden px-4 py-3 text-text-dim sm:table-cell">
                              {Array.from(new Set(group.volunteers.map(volunteer => volunteer.committee))).join(', ')}
                            </td>
                            <td className="px-3 py-3 sm:px-4">
                              <Badge variant="outline" className={`${statusClass} max-w-24 whitespace-normal text-center leading-tight md:max-w-none md:whitespace-nowrap`}>{statusCopy}</Badge>
                            </td>
                            <td className="hidden px-4 py-3 md:table-cell">
                              <div className="w-36 space-y-1.5">
                                <div className="flex justify-between text-xs text-text-dim">
                                  <span>{metrics?.reviewedCount || 0} de {group.volunteers.length}</span>
                                  <span>{Math.round(((metrics?.reviewedCount || 0) / group.volunteers.length) * 100)}%</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-dark3">
                                  <div
                                    className="h-full rounded-full bg-[#4d7cfe] transition-[width] duration-200"
                                    style={{ width: `${((metrics?.reviewedCount || 0) / group.volunteers.length) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="hidden px-4 py-3 text-right md:table-cell">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpandedPhoneKey(isExpanded ? null : group.phoneNormalized)}
                                className="gap-1.5 text-[#4d7cfe] hover:bg-[#4d7cfe]/10 hover:text-[#4d7cfe]"
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? 'Cerrar' : 'Revisar'}
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {!filteredGroups.some(group => group.phoneNormalized === expandedPhoneKey) && (
                <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-text-dim">
                  Abre una fila para ver y guardar las decisiones de cada persona.
                </p>
              )}

              {filteredGroups.filter(group => group.phoneNormalized === expandedPhoneKey).map(group => {
              const phoneKey = group.phoneNormalized;
              const groupVolState = formState[phoneKey] || {};

              let reviewedCount = 0;
              let reqInfoCount = 0;
              let unreviewedCount = 0;

              group.volunteers.forEach(v => {
                const st = groupVolState[v.id];
                if (!st || !st.decision) unreviewedCount++;
                else if (st.decision === 'PHONE_DOES_NOT_BELONG' && !st.hasCorrectedPhone) { reqInfoCount++; reviewedCount++; }
                else reviewedCount++;
              });

              return (
                <div key={phoneKey} className="overflow-hidden rounded-xl border border-border bg-dark2">
                  {/* PHONE HEADER BANNER */}
                  <div className="flex flex-col justify-between gap-4 border-b border-border bg-dark3/70 p-5 md:flex-row md:items-center">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
                          <Phone className="w-5 h-5" />
                        </div>
                          <h2 className="text-xl font-bold tracking-wide text-text">{phoneKey}</h2>
                        <Badge variant="outline" className="border-border bg-dark2 text-text-dim">
                          {group.volunteers.length} {group.volunteers.length === 1 ? 'persona pendiente' : 'personas pendientes'} en este teléfono
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-medium pt-1">
                        <span className="text-emerald-600 dark:text-[#6dd230]">{reviewedCount} {reviewedCount === 1 ? 'revisada' : 'revisadas'}</span>
                        {reqInfoCount > 0 && <span className="text-amber-700 dark:text-amber-400">{reqInfoCount} {reqInfoCount === 1 ? 'requiere' : 'requieren'} información</span>}
                        {unreviewedCount > 0 && <span className="text-text-dim">{unreviewedCount} sin revisar</span>}
                      </div>
                    </div>

                    <Button
                      onClick={() => handleSaveProgress(group)}
                      className="gap-2 rounded-lg bg-[#4d7cfe] px-5 py-2.5 font-semibold text-white hover:bg-[#3b66e0]"
                    >
                      <Save className="w-4 h-4" /> Guardar decisiones
                    </Button>
                  </div>

                  {/* VOLUNTEERS LIST */}
                  <div className="space-y-6 divide-y divide-border p-6">
                    {group.volunteers.map((vol, vIdx) => {
                      const st = groupVolState[vol.id] || { decision: '', hasCorrectedPhone: false, correctedPhone: '', sharedPhoneOwnerId: '', duplicatePrimaryVolunteerId: '', reviewerComment: '' };
                      const isSaved = !!st.decision;
                      const isReqInfo = st.decision === 'PHONE_DOES_NOT_BELONG' && !st.hasCorrectedPhone;
                      const isLater = st.decision === 'MANUAL_REVIEW';
                      const hasLegacy = vol.reviewItemStatus === 'LEGACY';

                      return (
                        <div key={vol.id} className={vIdx > 0 ? 'pt-6' : ''}>
                          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                            <div className="space-y-1.5 max-w-md">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base font-bold text-text"><HighlightText text={vol.fullName} term={search} /></span>
                                {isReqInfo ? <Badge className="border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">Requiere información</Badge> : isLater ? <Badge className="border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300">Revisar después</Badge> : isSaved ? <Badge className="border border-[#6dd230]/30 bg-[#6dd230]/10 text-emerald-700 dark:text-[#6dd230]">Guardado</Badge> : <Badge variant="outline" className="border-border bg-dark3 text-text-dim">Sin revisar</Badge>}
                                {(vol.processingStatus === 'CONFLICT' || vol.processingStatus === 'ERROR') && (
                                  <Badge className="border border-rose-500/30 bg-rose-500/15 text-rose-300">Requiere corrección</Badge>
                                )}
                                {hasLegacy && <Badge variant="outline" className="border-border text-[10px] text-text-dim">Existe historial anterior</Badge>}
                              </div>
                              {vol.processingError && (
                                <p className="flex max-w-xl items-start gap-1.5 text-xs text-rose-300" role="alert">
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  {vol.processingError}
                                </p>
                              )}
                              <div className="space-x-3 text-xs text-text-dim">
                                <span>Comité: <strong className="text-text">{vol.committee}</strong></span>
                                <span>•</span>
                                <span>Estado: <strong className={vol.status === 'active' ? 'text-emerald-600 dark:text-[#6dd230]' : 'text-text-dim'}>{vol.status === 'active' ? 'Activo' : 'Archivado'}</strong></span>
                              </div>
                            </div>

                            <div className="max-w-xl flex-1 space-y-4 rounded-xl bg-dark3 p-4">
                              <div>
                                <label className="mb-1.5 block text-xs font-semibold text-text">Decisión para esta persona:</label>
                                <select
                                  value={st.decision}
                                  onChange={(e) => handleDecisionChange(phoneKey, vol.id, e.target.value as PersonCentricDecision)}
                                  className="w-full rounded-lg border border-border bg-dark2 p-2.5 text-sm text-text"
                                >
                                  <option value="">Seleccionar una decisión…</option>
                                  <option value="KEEP">1. Mantener este teléfono</option>
                                  <option value="PHONE_OWNER">2. Es el titular de este teléfono</option>
                                  <option value="SHARED_PHONE">3. Comparte este teléfono</option>
                                  <option value="PHONE_DOES_NOT_BELONG">4. Este teléfono no corresponde</option>
                                  <option value="ARCHIVE_DUPLICATE">5. Este registro es duplicado</option>
                                  <option value="MANUAL_REVIEW">6. Revisar después</option>
                                </select>
                              </div>

                              {st.decision === 'PHONE_DOES_NOT_BELONG' && (
                                <div className="space-y-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-200">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`corr_${vol.id}`} checked={st.hasCorrectedPhone === true} onChange={() => handleFieldChange(phoneKey, vol.id, 'hasCorrectedPhone', true)} />
                                    <span>Tengo el teléfono correcto</span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name={`corr_${vol.id}`} checked={st.hasCorrectedPhone === false} onChange={() => handleFieldChange(phoneKey, vol.id, 'hasCorrectedPhone', false)} />
                                    <span>No tengo el teléfono correcto todavía</span>
                                  </label>

                                  {st.hasCorrectedPhone ? (
                                    <Input value={st.correctedPhone} onChange={(e) => handleFieldChange(phoneKey, vol.id, 'correctedPhone', e.target.value)} placeholder="Ej: 88888888" className="border-border bg-dark2 text-xs text-text" />
                                  ) : (
                                    <div className="rounded bg-dark2 p-2 text-xs text-amber-700 dark:text-amber-300">Esta persona requiere información. No se realizará ningún cambio.</div>
                                  )}
                                </div>
                              )}

                              {st.decision === 'SHARED_PHONE' && (
                                <div className="space-y-1.5 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                                  <label className="text-xs font-semibold text-indigo-300">¿Con quién comparte el teléfono?</label>
                                  <select value={st.sharedPhoneOwnerId} onChange={(e) => handleFieldChange(phoneKey, vol.id, 'sharedPhoneOwnerId', e.target.value)} className="w-full rounded border border-border bg-dark2 p-2 text-xs text-text">
                                    <option value="">[ Seleccionar titular... ]</option>
                                    {group.volunteers.filter(other => other.id !== vol.id).map(other => (<option key={other.id} value={other.id}>{other.fullName}</option>))}
                                  </select>
                                </div>
                              )}

                              {st.decision === 'ARCHIVE_DUPLICATE' && (
                                <div className="space-y-1.5 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                                  <label className="text-xs font-semibold text-rose-300">¿Qué persona conserva el registro principal?</label>
                                  <select value={st.duplicatePrimaryVolunteerId} onChange={(e) => handleFieldChange(phoneKey, vol.id, 'duplicatePrimaryVolunteerId', e.target.value)} className="w-full rounded border border-border bg-dark2 p-2 text-xs text-text">
                                    <option value="">[ Seleccionar voluntario principal... ]</option>
                                    {group.volunteers.filter(other => other.id !== vol.id).map(other => (<option key={other.id} value={other.id}>{other.fullName}</option>))}
                                  </select>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              })}
            </>
          )}
        </div>
      )}

      {/* TAB CONTENT 2: LISTAS PARA APLICAR */}
      {activeTab === 'READY' && (
        <div className="w-full space-y-6">
          {batchSummary && (
            <section
              aria-live="polite"
              className="rounded-xl border border-border bg-dark2 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-bold text-text">Resultado de la última aplicación</h2>
                  <p className="mt-1 text-sm text-text-dim">
                    {batchSummary.processedCount} aplicados, {batchSummary.alreadyProcessedCount} ya estaban aplicados y{' '}
                    {batchSummary.totalRequested - batchSummary.processedCount - batchSummary.alreadyProcessedCount} continúan pendientes.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setBatchSummary(null)} className="text-text-dim">
                  Cerrar
                </Button>
              </div>

              {batchSummary.results.some(result => !result.success) && (
                <div className="mt-4 divide-y divide-border rounded-lg bg-dark3 px-4">
                  {batchSummary.results.filter(result => !result.success).map(result => (
                    <div key={result.itemId} className="flex items-start gap-3 py-3 text-sm">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                      <div>
                        <p className="font-semibold text-rose-300">Cambio no aplicado</p>
                        <p className="text-text-dim">{result.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="space-y-6 rounded-xl border border-border bg-dark2 p-5 sm:p-6">
            <div className="flex flex-col items-start justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-text">
                  <Zap className="w-5 h-5 text-emerald-400" />
                  Listas para aplicar
                </h2>
                <p className="mt-1 text-sm text-text-dim">
                  Selecciona los voluntarios cuyas decisiones confirmadas deseas aplicar a la base de datos oficial.
                </p>
                <label className="sr-only" htmlFor="ready-committee-filter">Filtrar por comité</label>
                <select
                  id="ready-committee-filter"
                  value={committeeFilter}
                  onChange={(event) => setCommitteeFilter(event.target.value)}
                  className="mt-3 h-9 min-w-52 rounded-lg border border-border bg-dark3 px-3 text-sm font-medium text-text"
                >
                  <option value="ALL">Todos los comités</option>
                  {committeeOptions.map(committee => <option key={committee} value={committee}>{committee}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={toggleSelectAllReady}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-border bg-dark2 text-text"
                >
                  {filteredReadyToProcessItems.length > 0 && filteredReadyToProcessItems.every(item => selectedItemIds.includes(item.itemId)) ? <CheckSquare className="w-4 h-4 text-emerald-400" /> : <Square className="w-4 h-4" />}
                  Seleccionar visibles ({filteredReadyToProcessItems.length})
                </Button>

                <Button
                  onClick={() => setShowConfirmModal(true)}
                  disabled={selectedItemIds.length === 0}
                  className="gap-2 bg-[#4d7cfe] font-semibold text-white hover:bg-[#3b66e0]"
                >
                  <Zap className="w-4 h-4" /> APLICAR CAMBIOS SELECCIONADOS ({selectedItemIds.length})
                </Button>
              </div>
            </div>

            {filteredReadyToProcessItems.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <Info className="mx-auto h-8 w-8 text-text-dim" />
                <p className="text-sm text-text-dim">No hay decisiones listas para aplicar con este filtro.</p>
                <p className="text-xs text-text-dim">Cambia el comité o revisa la pestaña Pendientes.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-dark3 text-xs font-semibold text-text-dim">
                    <tr>
                      <th scope="col" className="w-12 px-4 py-3">Elegir</th>
                      <th scope="col" className="px-4 py-3">Persona</th>
                      <th scope="col" className="px-4 py-3">Comité</th>
                      <th scope="col" className="px-4 py-3">Teléfono</th>
                      <th scope="col" className="px-4 py-3">Cambio confirmado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredReadyToProcessItems.map(item => {
                      const isSelected = selectedItemIds.includes(item.itemId);
                      const decisionCopy = item.decision === 'PHONE_OWNER'
                        ? 'Titular del teléfono'
                        : item.decision === 'SHARED_PHONE'
                          ? 'Teléfono compartido'
                          : item.decision === 'PHONE_DOES_NOT_BELONG'
                            ? `Cambiar a ${item.correctedPhone}`
                            : item.decision === 'ARCHIVE_DUPLICATE'
                              ? 'Archivar duplicado'
                              : 'Mantener teléfono';

                      return (
                        <tr
                          key={item.itemId}
                          onClick={() => toggleItemSelection(item.itemId)}
                          className={`cursor-pointer ${isSelected ? 'bg-[#4d7cfe]/10' : 'hover:bg-dark3/60'}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleItemSelection(item.itemId)}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`Seleccionar ${item.fullName}`}
                              className="h-4 w-4 cursor-pointer accent-[#4d7cfe]"
                            />
                          </td>
                          <td className="px-4 py-3 font-bold text-text">{item.fullName}</td>
                          <td className="px-4 py-3 text-text-dim">{item.committee}</td>
                          <td className="px-4 py-3 font-mono text-xs text-text">{item.phoneActual || item.phoneNormalized}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="border-[#6dd230]/30 bg-[#6dd230]/10 text-emerald-700 dark:text-[#6dd230]">
                              {decisionCopy}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: APLICADAS / COMPLETADAS */}
      {activeTab === 'PROCESSED' && (
        <div className="w-full space-y-5">
          <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold text-text">
                <HistoryIcon className="h-5 w-5 text-[#4d7cfe]" />
                Historial por teléfono
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-text-dim">
                Cada bloque conserva el número original y muestra qué ocurrió con todas las personas procesadas dentro de ese grupo.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <SmartSearchBar
                value={historySearchInput}
                onValueChange={(value) => {
                  setHistorySearchInput(value);
                  setExpandedAppliedReviewId(null);
                }}
                onImmediateSearch={applyHistorySearch}
                placeholder="Buscar historial…"
                className="w-full lg:w-96"
              />
              <label className="sr-only" htmlFor="applied-committee-filter">Filtrar por comité</label>
              <select
                id="applied-committee-filter"
                value={committeeFilter}
                onChange={(event) => {
                  setCommitteeFilter(event.target.value);
                  setExpandedAppliedReviewId(null);
                }}
                className="h-10 min-w-52 rounded-lg border border-border bg-dark3 px-3 text-sm font-medium text-text"
              >
                <option value="ALL">Todos los comités</option>
                {committeeOptions.map(committee => <option key={committee} value={committee}>{committee}</option>)}
              </select>
            </div>
          </div>

          {appliedGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-dark2 py-16 text-center">
              <HistoryIcon className="mb-3 h-9 w-9 text-text-dim" />
              <h3 className="font-bold text-text">Todavía no hay cambios aplicados</h3>
              <p className="mt-1 text-sm text-text-dim">Los grupos procesados aparecerán aquí con su resultado completo.</p>
            </div>
          ) : filteredAppliedGroups.length === 0 ? (
            <div className="rounded-xl border border-border bg-dark2 py-14 text-center">
              <p className="font-bold text-text">No encontramos resultados para esa búsqueda.</p>
              <p className="mt-1 text-sm text-text-dim">Prueba con el número original, el nuevo número o el nombre de una persona.</p>
            </div>
          ) : (
            <>
              <section className="overflow-hidden rounded-xl border border-border bg-dark2" aria-label="Historial de teléfonos aplicados">
                <div className="border-b border-border px-4 py-3 text-sm font-semibold text-text">
                  {filteredAppliedGroups.length} {filteredAppliedGroups.length === 1 ? 'teléfono aplicado' : 'teléfonos aplicados'}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                    <thead className="bg-dark3 text-xs font-semibold text-text-dim">
                      <tr>
                        <th scope="col" className="px-4 py-3">Teléfono original</th>
                        <th scope="col" className="px-4 py-3">Personas procesadas</th>
                        <th scope="col" className="px-4 py-3">Comité</th>
                        <th scope="col" className="px-4 py-3">Resultado</th>
                        <th scope="col" className="px-4 py-3">Fecha</th>
                        <th scope="col" className="px-4 py-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredAppliedGroups.filter(group => !expandedAppliedReviewId || group.reviewId === expandedAppliedReviewId).map(group => {
                        const changedCount = group.members.filter(member => member.decision === 'PHONE_DOES_NOT_BELONG').length;
                        const archivedCount = group.members.filter(member => member.decision === 'ARCHIVE_DUPLICATE').length;
                        const isExpanded = expandedAppliedReviewId === group.reviewId;
                        const committees = Array.from(new Set(group.members.map(member => member.committee))).join(', ');
                        const resultCopy = [
                          changedCount > 0 ? `${changedCount} ${changedCount === 1 ? 'cambio' : 'cambios'} de número` : '',
                          archivedCount > 0 ? `${archivedCount} ${archivedCount === 1 ? 'archivo' : 'archivos'}` : '',
                        ].filter(Boolean).join(' · ') || 'Número conservado';

                        return (
                          <tr key={group.reviewId} className={isExpanded ? 'bg-[#4d7cfe]/5' : 'hover:bg-dark3/60'}>
                            <td className="px-4 py-3 font-mono font-bold text-text">{group.phoneNormalized}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-text">{group.members.slice(0, 2).map(member => member.fullName).join(', ')}</p>
                              {group.members.length > 2 && <p className="mt-0.5 text-xs text-text-dim">+{group.members.length - 2} personas más</p>}
                            </td>
                            <td className="px-4 py-3 text-text-dim">{committees}</td>
                            <td className="px-4 py-3 text-text">{resultCopy}</td>
                            <td className="px-4 py-3 text-xs text-text-dim">
                              {group.processedAt
                                ? new Date(group.processedAt).toLocaleDateString('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: 'short', year: 'numeric' })
                                : 'No disponible'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpandedAppliedReviewId(isExpanded ? null : group.reviewId)}
                                className="gap-1.5 text-[#4d7cfe] hover:bg-[#4d7cfe]/10 hover:text-[#4d7cfe]"
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? 'Cerrar' : 'Ver detalle'}
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {!filteredAppliedGroups.some(group => group.reviewId === expandedAppliedReviewId) && (
                <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-text-dim">
                  Abre una fila para consultar quién conservó, compartió o cambió el número.
                </p>
              )}

              {filteredAppliedGroups.filter(group => group.reviewId === expandedAppliedReviewId).map(group => {
                const changedCount = group.members.filter(member => member.decision === 'PHONE_DOES_NOT_BELONG').length;
                const archivedCount = group.members.filter(member => member.decision === 'ARCHIVE_DUPLICATE').length;

                return (
                  <article key={group.reviewId} className="overflow-hidden rounded-xl border border-border bg-dark2">
                    <header className="flex flex-col gap-3 border-b border-border bg-dark3/70 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4d7cfe]/10 text-[#4d7cfe]">
                          <Phone className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-base font-bold text-text sm:text-lg">{group.phoneNormalized}</p>
                          <p className="text-xs text-text-dim">
                            {group.members.length} {group.members.length === 1 ? 'persona procesada' : 'personas procesadas'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-dim">
                        <span>
                          {group.currentMembers.length} {group.currentMembers.length === 1 ? 'persona activa usa' : 'personas activas usan'} este número
                        </span>
                        {changedCount > 0 && <span>{changedCount} {changedCount === 1 ? 'cambió' : 'cambiaron'} de número</span>}
                        {archivedCount > 0 && <span>{archivedCount} {archivedCount === 1 ? 'archivado' : 'archivados'}</span>}
                        <span>
                          {group.processedAt
                            ? new Date(group.processedAt).toLocaleString('es-GT', {
                                timeZone: 'America/Guatemala',
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Fecha no disponible'}
                        </span>
                      </div>
                    </header>

                    <div className="flex flex-col gap-2 border-b border-border bg-[#4d7cfe]/[0.04] px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
                      <div className="flex shrink-0 items-center gap-2 text-xs font-bold text-text">
                        <Users className="h-4 w-4 text-[#4d7cfe]" />
                        Actualmente bajo este número
                      </div>
                      {group.currentMembers.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {group.currentMembers.map(currentMember => (
                            <span key={currentMember.volunteerId} className="rounded-full border border-border bg-dark2 px-2.5 py-1 text-[11px] font-semibold text-text">
                              {currentMember.fullName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-text-dim">Ningún perfil activo conserva este número.</span>
                      )}
                    </div>

                    <div className="divide-y divide-border">
                      {group.members.map(member => {
                        const presentation = getAppliedDecisionCopy(member);
                        const phoneChanged = phoneDigits(member.originalPhone) !== phoneDigits(member.resultingPhone);
                        const DecisionIcon = member.decision === 'PHONE_OWNER'
                          ? Crown
                          : member.decision === 'SHARED_PHONE'
                            ? Users
                            : member.decision === 'ARCHIVE_DUPLICATE'
                              ? Archive
                              : member.decision === 'PHONE_DOES_NOT_BELONG'
                                ? Smartphone
                                : CheckCircle2;

                        return (
                          <div key={member.reviewItemId} className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,1.2fr)_minmax(220px,0.8fr)] lg:items-center">
                            <div className="min-w-0">
                              <p className="font-bold text-text">{member.fullName}</p>
                              <p className="mt-0.5 text-xs text-text-dim">{member.committee}</p>
                            </div>

                            <div className="flex min-w-0 items-start gap-3">
                              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${presentation.className}`}>
                                <DecisionIcon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-text">{presentation.label}</p>
                                <p className="mt-0.5 text-xs leading-relaxed text-text-dim">{presentation.detail}</p>
                              </div>
                            </div>

                            <div className="rounded-lg bg-dark3 px-3 py-2.5 font-mono text-xs">
                              {phoneChanged ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-text-dim line-through">{member.originalPhone}</span>
                                  <ArrowRight className="h-3.5 w-3.5 text-[#4d7cfe]" />
                                  <span className="font-bold text-text">{member.resultingPhone}</span>
                                </div>
                              ) : member.decision === 'ARCHIVE_DUPLICATE' ? (
                                <span className="font-sans font-bold text-[#fe4d97]">Perfil archivado</span>
                              ) : (
                                <span className="font-bold text-text">{member.resultingPhone}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <footer className="border-t border-border px-4 py-2.5 text-right text-[11px] text-text-dim sm:px-5">
                      Procesado por {group.processedBy.length > 0 ? group.processedBy.join(', ') : 'Sistema'}
                    </footer>
                  </article>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="phone-cleanup-confirm-title" className="w-full max-w-lg space-y-5 rounded-xl border border-border bg-dark2 p-6 text-text">
            <div className="flex items-center gap-3 border-b border-border pb-3 text-[#4d7cfe]">
              <Zap className="w-6 h-6" />
              <h3 id="phone-cleanup-confirm-title" className="text-lg font-bold text-text">¿Deseas aplicar estos cambios?</h3>
            </div>

            <p className="text-sm text-text-dim">
              Estás a punto de actualizar oficialmente a <strong className="text-emerald-400 font-bold">{selectedItemIds.length} voluntarios</strong> en Supabase PostgreSQL.
            </p>

            <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl bg-dark3 p-3 text-xs">
              {readyToProcessItems.filter(i => selectedItemIds.includes(i.itemId)).map(i => (
                <div key={i.itemId} className="flex items-center justify-between border-b border-border pb-1 text-text">
                  <span>{i.fullName}</span>
                  <span className="font-semibold text-emerald-400">{i.decision}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
                disabled={isApplying}
                className="border-border bg-dark2 text-text"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => handleExecuteBatch(false)}
                disabled={isApplying}
                className="gap-2 bg-[#4d7cfe] font-bold text-white hover:bg-[#3b66e0]"
              >
                {isApplying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                CONFIRMAR Y APLICAR {selectedItemIds.length} CAMBIOS
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
