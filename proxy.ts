import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin')
  const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Para las rutas de API, bloquear si el origen es diferente al permitido
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Si la solicitud viene de un navegador (tiene cabecera Origin) y no coincide con nuestra app, denegar acceso.
    if (origin && origin !== allowedOrigin) {
      return new NextResponse(
        JSON.stringify({ error: 'CORS: Origen no permitido.' }),
        {
          status: 403,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': allowedOrigin
          },
        }
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
