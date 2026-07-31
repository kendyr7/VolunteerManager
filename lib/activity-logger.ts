import { createActivityLog } from '@/app/actions/activity-actions';

export async function recordActivityLog({
  actionType,
  description,
  details,
  targetId,
  userName: customUserName,
  userRole: customUserRole
}: {
  actionType: 'Creación' | 'Edición' | 'Reasignación' | 'Seguridad' | 'Configuración' | 'Eliminación' | 'Estado';
  description: string;
  details?: string;
  targetId?: string;
  userName?: string;
  userRole?: string;
}) {
  try {
    const role = customUserRole || (typeof window !== 'undefined' ? localStorage.getItem('mock_role') || 'Admin' : 'Admin');
    const committee = typeof window !== 'undefined' ? localStorage.getItem('mock_committee') : null;
    const storedName = customUserName || (typeof window !== 'undefined' ? localStorage.getItem('volunteer_name') : null);

    const userName = storedName || (role === 'Admin' ? 'Administrador' : `Coordinador (${committee || 'General'})`);

    await createActivityLog({
      userName,
      userRole: role,
      actionType,
      description,
      details,
      targetId
    });
  } catch (err) {
    console.error("Failed to record activity log:", err);
  }
}
