'use server';

import { AuthorizationError, requireAuthenticated } from '@/lib/authorization';
import { hasCapability } from '@/lib/role-permissions';
import { VolunteerScheduleService } from '@/lib/services/volunteer-schedule.service';

export async function getVolunteerScheduleAction(volunteerId: string) {
  const sessionUser = await requireAuthenticated();
  const volunteer = await VolunteerScheduleService.getVolunteerScope(volunteerId);
  if (!volunteer || volunteer.status === 'archived') {
    throw new AuthorizationError('El voluntario no existe o no está disponible.');
  }

  const canRead = sessionUser.userType === 'volunteer'
    ? sessionUser.userId === volunteer.id
    : hasCapability(sessionUser, 'view_volunteers', volunteer.committeeId || undefined);
  if (!canRead) throw new AuthorizationError('No tienes permiso para consultar este horario.');

  return { success: true as const, shifts: await VolunteerScheduleService.getSchedule(volunteer.id) };
}
