export interface AuditEntryViewModel {
  id: string;
  rawActionType: string;
  actionCategory: 'checkin' | 'checkout' | 'reassignment' | 'edit' | 'security' | 'undo' | 'creation' | 'general';
  
  // Backward compatibility fields for raw UI consumers
  action_type: string;
  user_name: string;
  user_role: string;
  description: string;
  details: string | null;
  target_id: string | null;
  created_at: string;
  
  // Entity Resolution
  targetId: string | null;
  resolvedVolunteerId: string | null;
  resolvedVolunteerName: string | null;
  
  // Actor Info
  actorName: string;
  actorRole: string;
  
  // UI Display Properties (Zero text parsing in UI components)
  title: string;
  subtitle: string;
  formattedDate: string;
  timestamp: number;
  
  iconName: string;
  badgeText: string;
  badgeStyle: string;
  colorClass: string;
  
  rawDetails: string | null;
  parsedChanges: Array<{
    field: string;
    label: string;
    oldValue: any;
    newValue: any;
  }> | null;
}

export class AuditMapper {
  /**
   * Transforms any historical production log into a unified AuditEntryViewModel.
   * Resolves target_id (volunteer_id, shift_id, request_id, committee_id, null) using O(1) in-memory maps.
   */
  static toViewModel(
    rawLog: any,
    shiftsMap: Map<string, any> = new Map(),
    requestsMap: Map<string, any> = new Map(),
    volunteersMap: Map<string, any> = new Map(),
    sessionsMap: Map<string, any> = new Map()
  ): AuditEntryViewModel {
    const rawTargetId = rawLog.target_id || null;
    let resolvedVolunteerId: string | null = null;
    let resolvedVolunteerName: string | null = null;

    // 1. RESOLUTION LEVEL 1: Direct Volunteer ID match
    if (rawTargetId && volunteersMap.has(rawTargetId)) {
      resolvedVolunteerId = rawTargetId;
      const vol = volunteersMap.get(rawTargetId);
      resolvedVolunteerName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim() || vol.name || null;
    }

    // 2. RESOLUTION LEVEL 2: Shift ID match (target_id is shift_id)
    if (!resolvedVolunteerId && rawTargetId && shiftsMap.has(rawTargetId)) {
      const shift = shiftsMap.get(rawTargetId);
      if (shift?.volunteer_id) {
        resolvedVolunteerId = shift.volunteer_id;
        const vol = volunteersMap.get(shift.volunteer_id);
        if (vol) {
          resolvedVolunteerName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim() || vol.name || null;
        }
      }
    }

    // 3. RESOLUTION LEVEL 3: Request ID match (target_id is shift_change_requests.id)
    if (!resolvedVolunteerId && rawTargetId && requestsMap.has(rawTargetId)) {
      const req = requestsMap.get(rawTargetId);
      const vId = req?.volunteer_id || req?.volunteerId;
      if (vId) {
        resolvedVolunteerId = vId;
        const vol = volunteersMap.get(vId);
        if (vol) {
          resolvedVolunteerName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim() || vol.name || null;
        }
      }
    }

    // 4. RESOLUTION LEVEL 4: Attendance session ID match
    if (!resolvedVolunteerId && rawTargetId && sessionsMap.has(rawTargetId)) {
      const attendanceSession = sessionsMap.get(rawTargetId);
      const vId = attendanceSession?.volunteer_id;
      if (vId) {
        resolvedVolunteerId = vId;
        const vol = volunteersMap.get(vId);
        if (vol) {
          resolvedVolunteerName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim() || vol.name || null;
        }
      }
    }

    // 5. RESOLUTION LEVEL 5: Fallback Token & Phone Matching for legacy logs
    const desc = (rawLog.description || '').toLowerCase();
    const details = (rawLog.details || '').toLowerCase();
    const fullText = `${desc} ${details}`;

    if (!resolvedVolunteerId) {
      volunteersMap.forEach((vol, vId) => {
        if (resolvedVolunteerId) return;

        // Phone match
        const phone = (vol.phone || '').replace(/\D/g, '');
        if (phone && phone.length >= 8 && fullText.includes(phone)) {
          resolvedVolunteerId = vId;
          resolvedVolunteerName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim() || vol.name;
          return;
        }

        // Full name match
        const volFullName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim().toLowerCase();
        if (volFullName && volFullName.length >= 4 && fullText.includes(volFullName)) {
          resolvedVolunteerId = vId;
          resolvedVolunteerName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim() || vol.name;
          return;
        }
      });
    }

    // Details JSON parsing for structured diffs
    let parsedChanges: AuditEntryViewModel['parsedChanges'] = null;
    let cleanSubtitle = rawLog.details || '';

    if (rawLog.details && typeof rawLog.details === 'string' && rawLog.details.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(rawLog.details);
        if (Array.isArray(parsed.changes) && parsed.changes.length > 0) {
          parsedChanges = parsed.changes;
          const labels = parsed.changes.map((c: any) => c.label || c.field).join(', ');
          cleanSubtitle = `Modificaciones: ${labels}`;
        } else if (parsed.context) {
          cleanSubtitle = typeof parsed.context === 'string'
            ? parsed.context
            : typeof parsed.context.summary === 'string'
              ? parsed.context.summary
              : typeof parsed.context.source === 'string'
                ? parsed.context.source
                : '';
        }
      } catch (e) {
        // Fallback to rawDetails string if JSON parsing fails
        parsedChanges = null;
      }
    }

    // Action Category & UI Styling Normalization
    const actionType = (rawLog.action_type || '').trim();
    let actionCategory: AuditEntryViewModel['actionCategory'] = 'general';
    let iconName = 'event_note';
    let badgeText = actionType || 'Evento';
    let badgeStyle = 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/30';
    let colorClass = 'bg-[#4d7cfe]';

    const descLower = desc;

    if (actionType === 'Confirmación') {
      actionCategory = 'general';
      iconName = 'event_available';
      badgeText = 'Confirmación';
      badgeStyle = 'bg-sky-500/15 text-sky-400 border-sky-500/30';
      colorClass = 'bg-sky-500';
    } else if (actionType === 'Check-out' || actionType.includes('Salida') || descLower.includes('check-out') || descLower.includes('salida')) {
      actionCategory = 'checkout';
      iconName = 'logout';
      badgeText = actionType.includes('Corrección') ? 'Salida corregida' : 'Check-out';
      badgeStyle = 'bg-teal-500/15 text-teal-400 border-teal-500/30';
      colorClass = 'bg-teal-500';
    } else if (actionType === 'Check-in' || actionType.includes('Entrada') || descLower.includes('check-in') || descLower.includes('asistencia')) {
      actionCategory = 'checkin';
      iconName = 'how_to_reg';
      badgeText = actionType.includes('Corrección') ? 'Entrada registrada' : 'Check-in';
      badgeStyle = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      colorClass = 'bg-emerald-500';
    } else if (actionType === 'Reasignación' || descLower.includes('reasignó') || descLower.includes('solicitud')) {
      actionCategory = 'reassignment';
      iconName = 'published_with_changes';
      badgeText = 'Reasignación';
      badgeStyle = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      colorClass = 'bg-amber-500';
    } else if (actionType === 'Deshacer' || descLower.includes('revirtió') || descLower.includes('reabrió')) {
      actionCategory = 'undo';
      iconName = 'undo';
      badgeText = 'Deshacer';
      badgeStyle = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      colorClass = 'bg-rose-500';
    } else if (actionType === 'Seguridad' || descLower.includes('pin') || descLower.includes('passkey')) {
      actionCategory = 'security';
      iconName = 'lock';
      badgeText = 'Seguridad';
      badgeStyle = 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      colorClass = 'bg-purple-500';
    } else if (actionType === 'Permisos') {
      actionCategory = 'security';
      iconName = 'admin_panel_settings';
      badgeText = 'Permisos';
      badgeStyle = 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      colorClass = 'bg-purple-500';
    } else if (actionType === 'Aviso') {
      actionCategory = 'general';
      iconName = 'campaign';
      badgeText = 'Aviso';
      badgeStyle = 'bg-sky-500/15 text-sky-400 border-sky-500/30';
      colorClass = 'bg-sky-500';
    } else if (actionType === 'Creación' || descLower.includes('creó') || descLower.includes('importó')) {
      actionCategory = 'creation';
      iconName = 'person_add';
      badgeText = 'Creación';
      badgeStyle = 'bg-sky-500/15 text-sky-400 border-sky-500/30';
      colorClass = 'bg-sky-500';
    } else if (actionType === 'Edición' || descLower.includes('ajustó')) {
      actionCategory = 'edit';
      iconName = 'edit_note';
      badgeText = 'Edición';
      badgeStyle = 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
      colorClass = 'bg-indigo-500';
    }

    const createdDate = new Date(rawLog.created_at);
    const formattedDate = !isNaN(createdDate.getTime())
      ? createdDate.toLocaleString('es-NI', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : rawLog.created_at || '';

    const storedActorRole = rawLog.user_role || 'Admin';
    const displayActorRole = storedActorRole === 'Editor'
      ? 'Coordinador'
      : storedActorRole === 'Lector'
        ? 'Voluntario'
        : storedActorRole;

    return {
      id: rawLog.id,
      rawActionType: actionType,
      actionCategory,
      
      // Backward compatibility mapping
      action_type: actionType,
      user_name: rawLog.user_name || 'Sistema',
      user_role: displayActorRole,
      description: rawLog.description || '',
      details: rawLog.details || null,
      target_id: rawTargetId,
      created_at: rawLog.created_at || new Date().toISOString(),

      targetId: rawTargetId,
      resolvedVolunteerId,
      resolvedVolunteerName,
      actorName: rawLog.user_name || 'Sistema',
      actorRole: displayActorRole,
      title: rawLog.description || 'Evento registrado',
      subtitle: cleanSubtitle,
      formattedDate,
      timestamp: createdDate.getTime() || Date.now(),
      iconName,
      badgeText,
      badgeStyle,
      colorClass,
      rawDetails: rawLog.details || null,
      parsedChanges,
    };
  }
}
