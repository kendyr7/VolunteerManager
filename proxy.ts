import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken, signSession } from '@/lib/auth'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.headers.get('origin')

  // 0. Eximir Webhooks públicos (Meta WhatsApp, etc.) de bloqueos de origen CORS
  if (pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next();
  }

  // 1. Proteger APIs de CORS no autorizados
  if (pathname.startsWith('/api/')) {
    if (origin) {
      // Build list of allowed origins: env var + production domain + localhost variants
      const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL || '';
      const allowedOrigins = new Set([
        configuredOrigin,
        'https://volunteermanager.org',
        'https://www.volunteermanager.org',
        'http://localhost:3000',
        'http://localhost:3001',
      ].filter(Boolean));

      if (!allowedOrigins.has(origin)) {
        return new NextResponse(
          JSON.stringify({ error: 'CORS: Origen no permitido.' }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': configuredOrigin || 'https://volunteermanager.org'
            },
          }
        )
      }
    }
    // No origin header = same-origin request or server-to-server — allow through
  }

  // 2. Control de Acceso de Servidor (Session & Role Checking / Admin Check)
  const sessionCookie = request.cookies.get('session')?.value || ''
  const session = verifySessionToken(sessionCookie)

  const isAuthRoute = pathname.startsWith('/login')
  const isVolunteerRoute = pathname.startsWith('/calendar') || pathname.startsWith('/profile') || pathname.startsWith('/requests')
  const isCoordinatorRoute = 
    pathname.startsWith('/dashboard') || 
    pathname.startsWith('/volunteers') || 
    pathname.startsWith('/shifts') || 
    pathname.startsWith('/check-in') || 
    pathname.startsWith('/reports') || 
    pathname.startsWith('/reminders') || 
    pathname.startsWith('/users') || 
    pathname.startsWith('/settings') || 
    pathname.startsWith('/import') ||
    pathname.startsWith('/replacements')

  // Redirección si no está autenticado y busca páginas protegidas
  if (!session && (isVolunteerRoute || isCoordinatorRoute)) {
    const loginUrl = new URL('/login', request.url)
    if (sessionCookie) {
      loginUrl.searchParams.set('expired', 'true')
    }
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete('session')
    return response
  }

  // Redirección si ya está autenticado e intenta acceder al login
  if (session && isAuthRoute) {
    const dest = session.userType === 'volunteer' ? '/calendar' : '/volunteers'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // Si es Voluntario e intenta ingresar a rutas de Coordinador
  if (session && session.userType === 'volunteer' && isCoordinatorRoute) {
    return NextResponse.redirect(new URL('/calendar', request.url))
  }

  // Si es Coordinador e intenta ingresar a rutas exclusivamente de Voluntarios (/calendar o /requests)
  if (session && session.userType === 'profile' && (pathname.startsWith('/calendar') || pathname.startsWith('/requests'))) {
    return NextResponse.redirect(new URL('/volunteers', request.url))
  }

  // Si es Coordinador e intenta ingresar a rutas de Administrador (/users)
  if (session && session.userType === 'profile' && session.role !== 'Admin') {
    if (pathname.startsWith('/users')) {
      const fallbackDest = session.role === 'Editor' ? '/dashboard' : '/shifts'
      return NextResponse.redirect(new URL(fallbackDest, request.url))
    }
  }

  const response = NextResponse.next()

  // Renovación automática de sesión activa (Sliding Expiration Window) para usuarios en uso activo
  if (session && (isVolunteerRoute || isCoordinatorRoute)) {
    const refreshedToken = signSession({
      userId: session.userId,
      userType: session.userType,
      role: session.role,
      committee: session.committee
    }, 30);

    response.cookies.set('session', refreshedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  return response
}

export const config = {
  matcher: [
    '/api/:path*',
    '/login',
    '/calendar',
    '/profile',
    '/dashboard',
    '/volunteers',
    '/shifts',
    '/check-in',
    '/reports',
    '/reminders',
    '/users',
    '/settings',
    '/import',
    '/requests',
    '/replacements'
  ]
}
