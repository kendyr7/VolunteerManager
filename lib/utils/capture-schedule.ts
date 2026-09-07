'use client';

import { toPng } from 'html-to-image';

/**
 * Normaliza y sanitiza un nombre para el archivo descargado.
 */
function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Captura un elemento HTML y lo descarga automáticamente como imagen PNG en alta resolución,
 * respetando el modo claro u oscuro actual y los colores oficiales.
 */
export async function downloadScheduleImage(
  element: HTMLElement,
  volunteerName: string,
  isDark?: boolean
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'No se puede ejecutar en el servidor' };
  }

  try {
    // Determinar si el tema activo es oscuro o claro si no se especifica
    const resolvedIsDark =
      isDark ?? document.documentElement.classList.contains('dark');
    const currentBg = resolvedIsDark ? '#050505' : '#f8fafb';

    // Dar un microtick para asegurar que cualquier renderizado pendiente concluya
    await new Promise((resolve) => setTimeout(resolve, 80));

    const dataUrl = await toPng(element, {
      pixelRatio: 2,
      quality: 0.98,
      skipFonts: true,
      cacheBust: true,
      backgroundColor: currentBg,
      filter: (node) => {
        // Excluir elementos marcados explícitamente para ignorar
        if (node instanceof HTMLElement && node.dataset.captureIgnore === 'true') {
          return false;
        }
        return true;
      },
    });

    const safeName = sanitizeFileName(volunteerName || 'Voluntario');
    const fileName = `Cronograma_${safeName}.png`;

    const link = document.createElement('a');
    link.download = fileName;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return { success: true };
  } catch (err: any) {
    console.error('Error al capturar el cronograma:', err);
    return {
      success: false,
      error: err?.message || 'Error al generar la imagen del cronograma',
    };
  }
}
