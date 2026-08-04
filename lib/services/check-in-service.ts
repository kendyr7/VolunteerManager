import { createClient } from '@/lib/supabase/client';
import { useVolunteerStore } from '@/lib/store/use-volunteer-store';

export interface CheckInResult {
  success: boolean;
  message: string;
  volunteerName?: string;
  timestamp?: string;
  error?: string;
}

export class CheckInService {
  private static instance: CheckInService | null = null;

  public static getInstance(): CheckInService {
    if (!CheckInService.instance) {
      CheckInService.instance = new CheckInService();
    }
    return CheckInService.instance;
  }

  public async processCheckIn(
    volunteerId: string,
    operatorUserId: string,
    deviceInfo = 'browser'
  ): Promise<CheckInResult> {
    const supabase = createClient();
    const volunteer = useVolunteerStore.getState().getVolunteerById(volunteerId);

    if (!volunteer) {
      return {
        success: false,
        message: 'Voluntario no encontrado en el sistema',
        error: 'NOT_FOUND',
      };
    }

    const nowIso = new Date().toISOString();

    try {
      // 1. Transactional Update: Registrar entrada en PostgreSQL
      const { error: updateErr } = await supabase
        .from('volunteers')
        .update({
          status: 'active',
          updated_at: nowIso,
        })
        .eq('id', volunteerId);

      if (updateErr) {
        return {
          success: false,
          message: `Error al registrar entrada: ${updateErr.message}`,
          error: updateErr.message,
        };
      }

      // 2. Transacción de Auditoría
      void supabase.from('audit_logs').insert({
        volunteer_id: volunteerId,
        operator_id: operatorUserId,
        action: 'CHECK_IN',
        device: deviceInfo,
        created_at: nowIso,
      });

      // 3. Mutación inmediata en el Store local
      useVolunteerStore.getState().upsertVolunteer({
        ...volunteer,
        status: 'active',
        updated_at: nowIso,
      } as any);

      return {
        success: true,
        message: `¡Entrada registrada para ${volunteer.name}!`,
        volunteerName: volunteer.name,
        timestamp: nowIso,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'Error inesperado durante el check-in',
        error: err?.message || 'UNKNOWN_ERROR',
      };
    }
  }

  public async processCheckOut(
    volunteerId: string,
    operatorUserId: string,
    deviceInfo = 'browser'
  ): Promise<CheckInResult> {
    const supabase = createClient();
    const volunteer = useVolunteerStore.getState().getVolunteerById(volunteerId);

    if (!volunteer) {
      return {
        success: false,
        message: 'Voluntario no encontrado',
        error: 'NOT_FOUND',
      };
    }

    const nowIso = new Date().toISOString();

    try {
      const { error: updateErr } = await supabase
        .from('volunteers')
        .update({
          updated_at: nowIso,
        })
        .eq('id', volunteerId);

      if (updateErr) {
        return {
          success: false,
          message: `Error al registrar salida: ${updateErr.message}`,
          error: updateErr.message,
        };
      }

      void supabase.from('audit_logs').insert({
        volunteer_id: volunteerId,
        operator_id: operatorUserId,
        action: 'CHECK_OUT',
        device: deviceInfo,
        created_at: nowIso,
      });

      return {
        success: true,
        message: `¡Salida registrada para ${volunteer.name}!`,
        volunteerName: volunteer.name,
        timestamp: nowIso,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'Error inesperado durante el check-out',
        error: err?.message || 'UNKNOWN_ERROR',
      };
    }
  }
}
