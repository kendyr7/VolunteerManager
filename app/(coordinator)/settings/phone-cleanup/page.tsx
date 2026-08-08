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
  PersonCentricDecision,
  PersonCentricItemInput,
} from '@/lib/services/phone-cleanup-review.service';
import {
  BatchProcessingSummary
} from '@/lib/services/phone-cleanup-processing.service';
import {
  Phone,
  ShieldCheck,
  History as HistoryIcon,
  Save,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  AlertTriangle,
  Zap,
  CheckCheck,
  Info,
  Calendar,
  User,
  XCircle,
  CheckSquare,
  Square
} from 'lucide-react';

export default function PhoneCleanupPersonCentricPage() {
  const [groups, setGroups] = useState<PhoneGroupReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'PENDING' | 'READY' | 'PROCESSED'>('PENDING');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNREVIEWED' | 'SAVED' | 'REQUIRES_INFO' | 'LATER'>('ALL');
  const [reviewerName, setReviewerName] = useState('Administrador');

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
      initFormState(res.data);
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
        reviewedBy: reviewerName || 'Administrador',
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

  // Items ready to process in "Listas para aplicar" tab
  const readyToProcessItems = useMemo(() => {
    const list: Array<{ itemId: string; volunteerId: string; fullName: string; phoneNormalized: string; phoneActual: string; decision: PersonCentricDecision; correctedPhone?: string | null }> = [];
    groups.forEach(g => {
      g.volunteers.forEach(v => {
        if (v.reviewItemStatus === 'READY_TO_PROCESS' && v.processingStatus === 'PENDING' && v.decision) {
          list.push({
            itemId: v.id, // Item ID loaded in volunteer structure
            volunteerId: v.id,
            fullName: v.fullName,
            phoneNormalized: g.phoneNormalized,
            phoneActual: v.phone,
            decision: v.decision,
            correctedPhone: v.correctedPhone,
          });
        }
      });
    });
    return list;
  }, [groups]);

  // Processed items in "Aplicadas" tab
  const processedItemsList = useMemo(() => {
    const list: Array<{ volunteerId: string; fullName: string; phoneNormalized: string; phoneActual: string; decision: PersonCentricDecision | null; processedAt?: string | null; processedBy?: string | null }> = [];
    groups.forEach(g => {
      g.volunteers.forEach(v => {
        if (v.processingStatus === 'PROCESSED') {
          list.push({
            volunteerId: v.id,
            fullName: v.fullName,
            phoneNormalized: g.phoneNormalized,
            phoneActual: v.phone,
            decision: v.decision || null,
            processedAt: v.processedAt,
            processedBy: v.processedBy,
          });
        }
      });
    });
    return list;
  }, [groups]);

  // Filter pending groups (excludes fully PROCESSED volunteers)
  const filteredGroups = useMemo(() => {
    return groups.map(g => {
      const pendingVols = g.volunteers.filter(v => v.processingStatus !== 'PROCESSED');
      return { ...g, volunteers: pendingVols };
    }).filter(g => {
      if (g.volunteers.length === 0) return false;
      const matchSearch = !search || g.phoneNormalized.includes(search) || g.volunteers.some(v => v.fullName.toLowerCase().includes(search.toLowerCase()));
      if (!matchSearch) return false;

      if (statusFilter === 'ALL') return true;

      const groupVolState = formState[g.phoneNormalized] || {};
      const hasUnreviewed = g.volunteers.some(v => !groupVolState[v.id]?.decision);
      const hasSaved = g.volunteers.some(v => !!groupVolState[v.id]?.decision);
      const hasReqInfo = g.volunteers.some(v => groupVolState[v.id]?.decision === 'PHONE_DOES_NOT_BELONG' && !groupVolState[v.id]?.hasCorrectedPhone);
      const hasLater = g.volunteers.some(v => groupVolState[v.id]?.decision === 'MANUAL_REVIEW');

      if (statusFilter === 'UNREVIEWED') return hasUnreviewed;
      if (statusFilter === 'SAVED') return hasSaved;
      if (statusFilter === 'REQUIRES_INFO') return hasReqInfo;
      if (statusFilter === 'LATER') return hasLater;

      return true;
    });
  }, [groups, search, statusFilter, formState]);

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAllReady = () => {
    if (selectedItemIds.length === readyToProcessItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(readyToProcessItems.map(i => i.volunteerId));
    }
  };

  const handleExecuteBatch = async (dryRun: boolean = false) => {
    if (selectedItemIds.length === 0) return;
    setIsApplying(true);
    setErrorMsg(null);

    try {
      const res = await applyPhoneCleanupItemsAction(selectedItemIds, reviewerName, dryRun);
      if (res.success && res.summary) {
        setBatchSummary(res.summary);
        setToastMsg(`✅ Procesamiento finalizado: ${res.summary.processedCount} exitosos, ${res.summary.conflictCount} conflictos.`);
        setTimeout(() => setToastMsg(null), 5000);
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
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10 font-sans">
      {/* HEADER BANNER */}
      <div className="max-w-6xl mx-auto mb-8 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/80 backdrop-blur border border-slate-700/80 p-6 rounded-2xl shadow-xl">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Saneamiento de Teléfonos
                </h1>
                <p className="text-sm text-slate-400">
                  Revisión centrada en personas. Revisa, guarda tu progreso y aplica los cambios confirmados.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Revisor:</span>
            <Input
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="Nombre del revisor..."
              className="w-40 h-8 bg-slate-800 border-slate-700 text-white text-xs"
            />
            <Button
              onClick={loadData}
              variant="outline"
              size="sm"
              className="h-8 border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Recargar
            </Button>
          </div>
        </div>

        {/* TABS SELECTOR */}
        <div className="flex border-b border-slate-700/80 gap-6 text-sm font-semibold">
          <button
            onClick={() => setActiveTab('PENDING')}
            className={`pb-3 transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'PENDING'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Phone className="w-4 h-4" />
            🔵 Pendientes ({filteredGroups.length} teléfonos)
          </button>

          <button
            onClick={() => setActiveTab('READY')}
            className={`pb-3 transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'READY'
                ? 'border-emerald-500 text-emerald-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            🟢 Listas para aplicar ({readyToProcessItems.length} personas)
          </button>

          <button
            onClick={() => setActiveTab('PROCESSED')}
            className={`pb-3 transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'PROCESSED'
                ? 'border-blue-500 text-blue-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCheck className="w-4 h-4" />
            ✅ Aplicadas / Completadas ({processedItemsList.length} personas)
          </button>
        </div>

        {/* NOTIFICATIONS */}
        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">Cerrar</Button>
          </div>
        )}

        {toastMsg && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span className="font-medium">{toastMsg}</span>
          </div>
        )}
      </div>

      {/* TAB CONTENT 1: PENDIENTES */}
      {activeTab === 'PENDING' && (
        <div className="max-w-6xl mx-auto space-y-8">
          {/* SEARCH & FILTERS */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por persona o número..."
                className="pl-9 bg-slate-900 border-slate-700 text-sm text-white placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button
                size="sm"
                variant={statusFilter === 'ALL' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('ALL')}
                className={statusFilter === 'ALL' ? 'bg-indigo-600 hover:bg-indigo-500' : 'border-slate-700 text-slate-400'}
              >
                Todos ({filteredGroups.length})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'UNREVIEWED' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('UNREVIEWED')}
                className={statusFilter === 'UNREVIEWED' ? 'bg-slate-700 text-white' : 'border-slate-700 text-slate-400'}
              >
                ⚪ Sin revisar
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'SAVED' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('SAVED')}
                className={statusFilter === 'SAVED' ? 'bg-emerald-600 text-white' : 'border-slate-700 text-slate-400'}
              >
                🟢 Guardados
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'REQUIRES_INFO' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('REQUIRES_INFO')}
                className={statusFilter === 'REQUIRES_INFO' ? 'bg-amber-600 text-white' : 'border-slate-700 text-slate-400'}
              >
                🟡 Requieren información
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'LATER' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('LATER')}
                className={statusFilter === 'LATER' ? 'bg-purple-600 text-white' : 'border-slate-700 text-slate-400'}
              >
                ⏳ Revisar después
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-20 bg-slate-800/30 rounded-2xl border border-slate-800">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Cargando listas de teléfonos pendientes desde Supabase...</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-20 bg-slate-800/30 rounded-2xl border border-slate-800 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto opacity-80" />
              <h3 className="text-lg font-semibold text-white">¡No hay teléfonos pendientes!</h3>
              <p className="text-slate-400 text-sm">Todas las revisiones de esta sección han sido completadas o aplicadas.</p>
            </div>
          ) : (
            filteredGroups.map(group => {
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
                <div key={phoneKey} className="bg-slate-800/90 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
                  {/* PHONE HEADER BANNER */}
                  <div className="bg-slate-950/70 p-5 border-b border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
                          <Phone className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-wide">📱 {phoneKey}</h2>
                        <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700">
                          {group.volunteers.length} personas pendientes en este teléfono
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-medium pt-1">
                        <span className="text-emerald-400">🟢 {reviewedCount} revisadas</span>
                        {reqInfoCount > 0 && <span className="text-amber-400">🟡 {reqInfoCount} requiere información</span>}
                        {unreviewedCount > 0 && <span className="text-slate-400">⚪ {unreviewedCount} sin revisar</span>}
                      </div>
                    </div>

                    <Button
                      onClick={() => handleSaveProgress(group)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg gap-2 px-5 py-2.5 rounded-xl transition-all"
                    >
                      <Save className="w-4 h-4" /> 💾 GUARDAR PROGRESO
                    </Button>
                  </div>

                  {/* VOLUNTEERS LIST */}
                  <div className="p-6 space-y-6 divide-y divide-slate-700/60">
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
                                <span className="font-bold text-base text-white">{vol.fullName}</span>
                                {isReqInfo ? <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30">🟡 Requiere información</Badge> : isLater ? <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30">⏳ Revisar después</Badge> : isSaved ? <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">🟢 Guardado</Badge> : <Badge variant="outline" className="text-slate-400 border-slate-700 bg-slate-900/50">⚪ Sin revisar</Badge>}
                                {hasLegacy && <Badge variant="outline" className="text-slate-400 border-slate-700 text-[10px]">📜 Existe historial anterior</Badge>}
                              </div>
                              <div className="text-xs text-slate-400 space-x-3">
                                <span>Comité: <strong className="text-slate-300">{vol.committee}</strong></span>
                                <span>•</span>
                                <span>Estado: <strong className={vol.status === 'active' ? 'text-emerald-400' : 'text-slate-400'}>{vol.status === 'active' ? 'Activo' : 'Archivado'}</strong></span>
                              </div>
                            </div>

                            <div className="flex-1 max-w-xl space-y-4 bg-slate-900/60 p-4 rounded-xl border border-slate-700/50">
                              <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Decisión para esta persona:</label>
                                <select
                                  value={st.decision}
                                  onChange={(e) => handleDecisionChange(phoneKey, vol.id, e.target.value as PersonCentricDecision)}
                                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm"
                                >
                                  <option value="">[ Seleccionar opción humanos... ]</option>
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
                                    <Input value={st.correctedPhone} onChange={(e) => handleFieldChange(phoneKey, vol.id, 'correctedPhone', e.target.value)} placeholder="Ej: 88888888" className="bg-slate-800 border-slate-700 text-white text-xs" />
                                  ) : (
                                    <div className="p-2 bg-slate-900/80 text-xs text-amber-300 rounded">⚠️ Esta persona requiere información. No se realizará ningún cambio.</div>
                                  )}
                                </div>
                              )}

                              {st.decision === 'SHARED_PHONE' && (
                                <div className="space-y-1.5 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                                  <label className="text-xs font-semibold text-indigo-300">¿Con quién comparte el teléfono?</label>
                                  <select value={st.sharedPhoneOwnerId} onChange={(e) => handleFieldChange(phoneKey, vol.id, 'sharedPhoneOwnerId', e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded p-2 text-xs">
                                    <option value="">[ Seleccionar titular... ]</option>
                                    {group.volunteers.filter(other => other.id !== vol.id).map(other => (<option key={other.id} value={other.id}>{other.fullName}</option>))}
                                  </select>
                                </div>
                              )}

                              {st.decision === 'ARCHIVE_DUPLICATE' && (
                                <div className="space-y-1.5 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                                  <label className="text-xs font-semibold text-rose-300">¿Qué persona conserva el registro principal?</label>
                                  <select value={st.duplicatePrimaryVolunteerId} onChange={(e) => handleFieldChange(phoneKey, vol.id, 'duplicatePrimaryVolunteerId', e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded p-2 text-xs">
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
            })
          )}
        </div>
      )}

      {/* TAB CONTENT 2: LISTAS PARA APLICAR */}
      {activeTab === 'READY' && (
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-5">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-400" />
                  Decisiones Confirmadas Listas para Aplicar
                </h2>
                <p className="text-xs text-slate-400">
                  Selecciona los voluntarios cuyas decisiones confirmadas deseas aplicar a la base de datos oficial.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={toggleSelectAllReady}
                  variant="outline"
                  size="sm"
                  className="border-slate-700 text-slate-300 gap-1.5"
                >
                  {selectedItemIds.length === readyToProcessItems.length ? <CheckSquare className="w-4 h-4 text-emerald-400" /> : <Square className="w-4 h-4" />}
                  Seleccionar Todo ({readyToProcessItems.length})
                </Button>

                <Button
                  onClick={() => setShowConfirmModal(true)}
                  disabled={selectedItemIds.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg gap-2"
                >
                  <Zap className="w-4 h-4" /> APLICAR CAMBIOS SELECCIONADOS ({selectedItemIds.length})
                </Button>
              </div>
            </div>

            {readyToProcessItems.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <Info className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-slate-400 text-sm">No hay decisiones marcadas como "Listas para aplicar".</p>
                <p className="text-xs text-slate-500">Revisa la pestaña "Pendientes" y guarda tus selecciones primero.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {readyToProcessItems.map(item => {
                  const isSelected = selectedItemIds.includes(item.volunteerId);
                  return (
                    <div
                      key={item.volunteerId}
                      onClick={() => toggleItemSelection(item.volunteerId)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                        isSelected
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                          : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 accent-emerald-500 cursor-pointer"
                        />
                        <div>
                          <p className="font-bold text-white text-sm">{item.fullName}</p>
                          <p className="text-xs text-slate-400">Teléfono actual: {item.phoneActual} ({item.phoneNormalized})</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {item.decision === 'PHONE_OWNER' && 'Titular del teléfono'}
                          {item.decision === 'SHARED_PHONE' && 'Comparte este teléfono'}
                          {item.decision === 'PHONE_DOES_NOT_BELONG' && `Cambiar a: ${item.correctedPhone}`}
                          {item.decision === 'ARCHIVE_DUPLICATE' && 'Archivar duplicado'}
                          {item.decision === 'KEEP' && 'Mantener teléfono'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: APLICADAS / COMPLETADAS */}
      {activeTab === 'PROCESSED' && (
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <CheckCheck className="w-5 h-5 text-blue-400" />
                Historial de Personas Aplicadas / Completadas
              </h2>
              <p className="text-xs text-slate-400">
                Registro histórico auditado de saneamientos telefónicos ejecutados en la base de datos official.
              </p>
            </div>

            {processedItemsList.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <HistoryIcon className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-slate-400 text-sm">No se han ejecutado saneamientos todavía.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 uppercase tracking-wider bg-slate-950/50">
                      <th className="p-3">Voluntario</th>
                      <th className="p-3">Teléfono</th>
                      <th className="p-3">Decisión Aplicada</th>
                      <th className="p-3">Procesado Por</th>
                      <th className="p-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {processedItemsList.map(p => (
                      <tr key={p.volunteerId} className="hover:bg-slate-800/50">
                        <td className="p-3 font-semibold text-white">{p.fullName}</td>
                        <td className="p-3 font-mono">{p.phoneActual}</td>
                        <td className="p-3 font-semibold text-emerald-400">{p.decision || 'SANEADO'}</td>
                        <td className="p-3 text-slate-400">{p.processedBy || 'Sistema'}</td>
                        <td className="p-3 text-slate-400">{p.processedAt ? new Date(p.processedAt).toLocaleString() : 'Reciente'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-emerald-400 border-b border-slate-800 pb-3">
              <Zap className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">¿Deseas aplicar estos cambios?</h3>
            </div>

            <p className="text-sm text-slate-300">
              Estás a punto de actualizar oficialmente a <strong className="text-emerald-400 font-bold">{selectedItemIds.length} voluntariados</strong> en Supabase PostgreSQL.
            </p>

            <div className="max-h-48 overflow-y-auto p-3 bg-slate-950 rounded-xl space-y-2 text-xs border border-slate-800">
              {readyToProcessItems.filter(i => selectedItemIds.includes(i.volunteerId)).map(i => (
                <div key={i.volunteerId} className="flex justify-between items-center text-slate-300 border-b border-slate-900 pb-1">
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
                className="border-slate-700 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => handleExecuteBatch(false)}
                disabled={isApplying}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2"
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
