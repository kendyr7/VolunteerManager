'use client'

import { useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { logout } from "@/app/actions/auth"

export function AutoLogout() {
  const router = useRouter()
  const pathname = usePathname()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // 15 minutos de inactividad
  const TIMEOUT = 15 * 60 * 1000

  const handleLogout = async () => {
    // Evitar logout si ya está en login u otras rutas públicas
    if (pathname === '/login' || pathname === '/') return

    // Limpiar storage y cookies
    localStorage.removeItem("mock_role")
    localStorage.removeItem("mock_committee")
    await logout()
    
    // Redirigir al login
    router.push('/login')
  }

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(handleLogout, TIMEOUT)
  }

  useEffect(() => {
    // Si estamos en login, no rastrear inactividad
    if (pathname === '/login' || pathname === '/') {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    // Inicializar timer
    resetTimer()

    // Eventos a rastrear
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']

    const handleEvent = () => resetTimer()

    events.forEach(event => {
      document.addEventListener(event, handleEvent, { passive: true })
    })

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleEvent)
      })
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [pathname])

  return null
}
