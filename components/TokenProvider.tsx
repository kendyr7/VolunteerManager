'use client';

import { useEffect } from 'react';
import { setGlobalToken } from '@/lib/supabase/client';

export function TokenProvider({ token }: { token: string | null }) {
  // Configurar el token globalmente tan pronto como se renderiza este componente
  if (typeof window !== 'undefined') {
    setGlobalToken(token);
  }

  useEffect(() => {
    setGlobalToken(token);
  }, [token]);

  return null;
}
