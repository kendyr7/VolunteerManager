'use client'

import { useState, useMemo } from 'react'

// Icon map matching sidebar exactly
const MODULE_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  volunteers: { icon: "group", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  shifts: { icon: "checklist", color: "text-amber-500", bg: "bg-amber-500/10" },
  "check-in": { icon: "qr_code_scanner", color: "text-pink-500", bg: "bg-pink-500/10" },
  replacements: { icon: "published_with_changes", color: "text-teal-500", bg: "bg-teal-500/10" },
  dashboard: { icon: "space_dashboard", color: "text-[#4d7cfe]", bg: "bg-[#4d7cfe]/10" },
  reminders: { icon: "campaign", color: "text-purple-500", bg: "bg-purple-500/10" },
  users: { icon: "shield_person", color: "text-blue-500", bg: "bg-blue-500/10" },
  reports: { icon: "analytics", color: "text-cyan-500", bg: "bg-cyan-500/10" },
  settings: { icon: "settings", color: "text-indigo-500", bg: "bg-indigo-500/10" },
}

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: 20, width: 20, height: 20, lineHeight: 1 }}
    >
      {name}
    </span>
  )
}

function StatusBadge({ status }: { status: "done" | "progress" | "pending" }) {
  if (status === "done") return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
      Operativo
    </span>
  )
  if (status === "progress") return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse" />
      En Progreso
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-border/30 text-text-dim border border-border">
      <span className="w-1.5 h-1.5 rounded-full bg-text-dim inline-block" />
      Pendiente
    </span>
  )
}

interface Feature {
  name: string
  description: string
  status: "done" | "progress" | "pending"
}

interface ModuleCardProps {
  moduleKey: string
  title: string
  route: string
  description: string
  features: Feature[]
}

function ModuleCard({ moduleKey, title, route, description, features }: ModuleCardProps) {
  const { icon, color, bg } = MODULE_ICONS[moduleKey] || { icon: "info", color: "text-text", bg: "bg-dark3" }
  const done = features.filter(f => f.status === "done").length
  const total = features.length

  return (
    <div className="rounded-none sm:rounded-xl border-x-0 sm:border-x border border-border bg-dark2 overflow-hidden transition-all duration-200 hover:border-border/80">
      {/* Card Header */}
      <div className="flex items-start gap-4 p-5 border-b border-border/50">
        <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
          <Icon name={icon} className={color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-inter font-bold text-base text-text">{title}</h2>
            <span className="font-mono text-xs text-text-dim bg-dark3 border border-border rounded px-2 py-0.5">{route}</span>
          </div>
          <p className="text-sm text-text-dim mt-1 leading-relaxed">{description}</p>
        </div>
        {/* Progress indicator */}
        <div className="text-right shrink-0">
          <span className="text-xs text-text-dim">{done}/{total}</span>
          <div className="mt-1 w-16 h-1.5 bg-dark3 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Feature rows */}
      <div className="divide-y divide-border/40">
        {features.map((f, i) => (
          <div key={i} className="flex items-start gap-4 px-5 py-3.5 hover:bg-dark3/40 transition-colors duration-150">
            <div className="w-[28px] mt-0.5 shrink-0 flex justify-center">
              <Icon
                name={f.status === "done" ? "check_circle" : f.status === "progress" ? "pending" : "radio_button_unchecked"}
                className={f.status === "done" ? "text-emerald-500" : f.status === "progress" ? "text-amber-400" : "text-text-dim/40"}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text">{f.name}</p>
              <p className="text-xs text-text-dim mt-0.5 leading-relaxed">{f.description}</p>
            </div>
            <div className="shrink-0 mt-0.5">
              <StatusBadge status={f.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const MODULES: ModuleCardProps[] = [
  {
    moduleKey: "dashboard",
    title: "Dashboard",
    route: "/dashboard",
    description: "Métricas clave de rendimiento, asistencia y estado general del evento en tiempo real.",
    features: [
      { name: "Métricas Generales", description: "Tarjetas resumen: total de voluntarios, activos (escaneados), completados y horas acumuladas.", status: "done" },
      { name: "Exclusión de Archivados", description: "Los usuarios archivados se excluyen automáticamente de todas las métricas y KPIs.", status: "done" },
      { name: "Mapa de Calor", description: "Gráfico visual de horas pico, asistencia planificada y real por día y franja horaria.", status: "done" },
      { name: "Filtros de Comité", description: "Filtrar el dashboard para visualizar proyecciones y métricas de un comité específico.", status: "done" },
    ],
  },
  {
    moduleKey: "volunteers",
    title: "Voluntarios",
    route: "/volunteers",
    description: "Gestión integral de perfiles, asignación de comités y acceso de cada voluntario.",
    features: [
      { name: "Búsqueda y Filtros Avanzados", description: "Buscar por nombre, comité, estaca, barrio o código QR en tiempo real.", status: "done" },
      { name: "Agregar Voluntarios", description: "Formulario con captura de edad, comité, perfil organizativo (estacas/barrios) y datos de contacto.", status: "done" },
      { name: "Archivar Usuarios", description: "Desactiva un voluntario sin borrar su historial. Los archivados quedan excluidos de métricas y listas activas.", status: "done" },
      { name: "Prevención de Duplicados en Importación", description: "Valida duplicidad telefónica contra voluntarios activos (los archivados no cuentan como duplicados) y sanitiza campos de Barrio/Estaca.", status: "done" },
      { name: "Resolución de Conflictos al Desarchivar", description: "Modal comparativo con datos distintivos (Comité, Barrio, Estaca) al desarchivar usuarios en colisión de teléfono, permitiendo reemplazo o edición rápida.", status: "done" },
      { name: "Identificación de Menores (< 18 años)", description: "Badges informativos para menores de 18 años visibles en tabla general, tarjetas móviles y cabecera del perfil.", status: "done" },
      { name: "Resetear Código / PIN", description: "Regenera el código de acceso de un voluntario en caso de pérdida o bloqueo.", status: "done" },
      { name: "Perfil y Cronograma Individual", description: "Vista detallada con información completa, horas acumuladas, comité asignado y calendario de turnos.", status: "done" },
      { name: "Gestión de Turnos (Admin)", description: "Editar, reasignar o cancelar turnos directamente desde el perfil del voluntario. Exclusivo para admins/coordinadores.", status: "done" },
      { name: "Envío de PIN por WhatsApp", description: "Envío de credenciales (PIN + instrucciones) vía WhatsApp al registrar o actualizar un voluntario.", status: "done" },
    ],
  },
  {
    moduleKey: "shifts",
    title: "Turnos",
    route: "/shifts",
    description: "Vista completa de todos los turnos del evento con estados visuales y gestión de grupos.",
    features: [
      { name: "Vista de Grupos Activos (Toggle)", description: "Muestra en tiempo real quiénes están activos en su turno actual (ya escanearon QR). También permite hacer check-out.", status: "done" },
      { name: "Estados Visuales por Comité", description: "Código de colores por comité para identificar rápidamente el estado de cada turno (confirmado, cancelado, completado).", status: "done" },
      { name: "Comité en Vista de Confirmados", description: "El nombre del comité aparece en el turno del voluntario confirmado con color de texto diferenciado.", status: "done" },
      { name: "Reasignación desde Turnos", description: "Capacidad de asignar un voluntario a otro turno directamente desde esta vista.", status: "done" },
      { name: "Verificación de Turnos Diarios", description: "Lógica para prevenir múltiples turnos el mismo día o en horarios conflictivos.", status: "done" },
    ],
  },
  {
    moduleKey: "check-in",
    title: "Escanear QR",
    route: "/check-in",
    description: "Herramienta de registro de llegadas y verificación de voluntarios en el lugar del evento.",
    features: [
      { name: "Escaneo de Códigos QR", description: "Lector de cámara integrado que registra la llegada del voluntario al escanear su código.", status: "done" },
      { name: "Identidad Visual", description: "Muestra foto, nombre, estaca, barrio y comité del voluntario tras un escaneo exitoso.", status: "done" },
      { name: "Historial de Escaneos", description: "Pestaña con el registro de todos los voluntarios escaneados recientemente por ese dispositivo.", status: "done" },
      { name: "Check-out Manual", description: "Permite finalizar el turno de un voluntario desde la pantalla de historial sin necesitar otro escaneo.", status: "done" },
      { name: "Alertas de Estado", description: "Advertencias si el voluntario ya fue escaneado antes o si su turno fue cancelado.", status: "done" },
      { name: "Sincronización Realtime", description: "Los estados de check-in/check-out se actualizan instantáneamente en todos los dispositivos conectados.", status: "done" },
    ],
  },
  {
    moduleKey: "replacements",
    title: "Solicitudes",
    route: "/replacements",
    description: "Gestión de ausencias, cancelaciones y búsqueda de reemplazos para mantener la cobertura.",
    features: [
      { name: "Bandeja de Cancelaciones", description: "Vista centralizada de todos los avisos de voluntarios que cancelaron su turno.", status: "done" },
      { name: "Reasignación Directa", description: "Asignar un nuevo voluntario al turno cancelado y actualizar el cronograma de ambos al instante.", status: "done" },
      { name: "Llamado de Reemplazos", description: "Interfaz para contactar a voluntarios disponibles (acceso directo a llamada o WA).", status: "done" },
      { name: "Notificación al Reemplazo", description: "Aviso automático vía WhatsApp al voluntario que acepta el turno de reemplazo.", status: "done" },
    ],
  },
  {
    moduleKey: "reminders",
    title: "Avisos",
    route: "/reminders",
    description: "Centro de comunicación interna: alertas, recordatorios y control de cupos por comité.",
    features: [
      { name: "Validación de Cupos", description: "Verifica automáticamente si un turno está lleno según la capacidad de su comité antes de emitir un aviso.", status: "done" },
      { name: "Creación de Avisos", description: "Formulario para crear recordatorios o alertas visibles para todos los coordinadores del equipo.", status: "done" },
      { name: "Alertas de Turnos Vacantes", description: "Muestra automáticamente los turnos con cupos disponibles que necesitan más voluntarios.", status: "done" },
      { name: "Distribución por WhatsApp", description: "Envío de avisos críticos directamente a grupos o individuos a través de WA.", status: "done" },
    ],
  },
  {
    moduleKey: "reports",
    title: "Reportes",
    route: "/reports",
    description: "Análisis interactivo, exportación y métricas operativas por comité, franja etaria y día de evento.",
    features: [
      { name: "Reclutamiento por Comité y Cuota Faltante", description: "Métricas de voluntariado activo, turnos requeridos vs asignados y visualización de cuántos faltan por comité.", status: "done" },
      { name: "Segmentación Demográfica por Edad", description: "Agrupación dinámica de voluntarios en franjas de edad (< 18, 18-25, 26-35, 36-50, 50+).", status: "done" },
      { name: "Informe de Cobertura Diaria por Evento", description: "Cobertura diaria (Sep 10-26) con desglose por turnos (T1 a T4), requeridos, asignados, asistencias y tarjetas nativas en móviles.", status: "done" },
      { name: "Filtros Reactivos Globales", description: "Todos los filtros activos (Comité, Barrio/Rama, Estaca, Estado, Fechas y Búsqueda) aplican en tiempo real sobre las 4 vistas del reporte.", status: "done" },
      { name: "Navegación Móvil de 4 Columnas", description: "Tabs organizadas en segmented control de 4 columnas en teléfonos sin desplazamientos horizontales.", status: "done" },
      { name: "Reporte de Asistencia", description: "Lista completa de voluntarios con check-ins, check-outs y horas totales por día.", status: "done" },
      { name: "Exportar a CSV / Excel", description: "Descarga de datos en formato de hoja de cálculo para análisis externo o presentaciones.", status: "done" },
    ],
  },
  {
    moduleKey: "users",
    title: "Usuarios",
    route: "/users",
    description: "Administración de cuentas del equipo coordinador con control de roles y permisos.",
    features: [
      { name: "Sistema de Roles y Permisos", description: "Administrador, Coordinador de tecnología, Coordinador de comité y Voluntario, cada uno con su alcance definido.", status: "done" },
      { name: "Actualización Segura de Roles (Admin Client)", description: "Server Action utilizando Service Role Key (getAdminClient) para guardar demociones y promociones de permisos sin errores RLS.", status: "done" },
      { name: "Creación de Cuentas", description: "Crear nuevas cuentas para el equipo coordinador y asignarles su rol correspondiente.", status: "done" },
      { name: "Sesión Persistente (Offline)", description: "Token de autenticación sin límite de tiempo para evitar cierres de sesión durante el evento.", status: "done" },
    ],
  },
  {
    moduleKey: "settings",
    title: "Ajustes",
    route: "/settings",
    description: "Configuración general: comités, requerimientos por turno, permisos e integraciones.",
    features: [
      { name: "Gestión de Comités", description: "Agregar o archivar comités; los cambios se reflejan automáticamente en todas las listas y filtros de la plataforma sin recargar.", status: "done" },
      { name: "Gestión de Estacas y Barrios", description: "Configurar la estructura organizacional que se asigna en los perfiles de voluntarios.", status: "done" },
      { name: "Requerimientos por Turno", description: "Definir la cantidad de voluntarios requeridos para cada turno y comité para calcular cupos disponibles y estado de llenado.", status: "done" },
      { name: "Permisos por Rol", description: "Permisos configurables por tipo de Coordinador, administrados exclusivamente por Administradores.", status: "done" },
      { name: "Historial de Actividades", description: "Registro cronológico de acciones importantes realizadas en la plataforma (check-ins, reasignaciones, cancelaciones).", status: "done" },
      { name: "Autenticación por PIN y Passkey", description: "Pantalla de login con ingreso por PIN de 4 dígitos como predeterminado y opción de botón inmediato para Passkey / Windows Hello.", status: "done" },
      { name: "Centro de Documentación", description: "Esta misma página: base de conocimiento integrada dentro de la plataforma para el equipo coordinador.", status: "done" },
    ],
  },
]

export default function DocsPage() {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredModules = useMemo(() => {
    if (!searchTerm.trim()) return MODULES
    const q = searchTerm.toLowerCase()
    return MODULES.map(mod => {
      const titleMatch = mod.title.toLowerCase().includes(q) || mod.description.toLowerCase().includes(q)
      const matchedFeatures = mod.features.filter(f =>
        f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
      )
      if (titleMatch) return mod
      if (matchedFeatures.length > 0) return { ...mod, features: matchedFeatures }
      return null
    }).filter(Boolean) as ModuleCardProps[]
  }, [searchTerm])

  const totalFeatures = filteredModules.reduce((sum, m) => sum + m.features.length, 0)
  const totalDone = filteredModules.reduce((sum, m) => sum + m.features.filter(f => f.status === "done").length, 0)
  const totalProgress = filteredModules.reduce((sum, m) => sum + m.features.filter(f => f.status === "progress").length, 0)
  const totalPending = filteredModules.reduce((sum, m) => sum + m.features.filter(f => f.status === "pending").length, 0)

  return (
    <>
      {/* Sticky Header — matches Dashboard / Volunteers / Reports */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4 pointer-events-auto shrink-0 border-b border-white/5">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-[28px] sm:text-4xl font-black text-text tracking-tight">
            Centro de Documentación
          </h1>
        </div>
        {/* Search */}
        <div className="w-full relative">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none z-10">
            <span className="material-symbols-outlined text-black/40 dark:text-white/70 text-[20px]">search</span>
          </div>
          <input
            type="text"
            placeholder="Buscar módulo o función..."
            className="w-full bg-black/5 dark:bg-[#fff6] border border-black/10 dark:border-white/10 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-white/70 rounded-full pl-12 pr-12 py-3.5 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30 transition-all text-[13px] font-bold font-inter h-[48px]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoComplete="off"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-3 flex items-center z-10 text-text-dim hover:text-text transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>

      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-20 pt-4">

        {/* Summary KPIs — edge-to-edge grid matching Dashboard */}
        <div className="-mx-4 sm:-mx-6 lg:-mx-8 border-y border-white/5 bg-white/5 mb-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1px]">
            {/* Total */}
            <div className="bg-dark2 p-4 sm:p-7 group transition-colors hover:bg-dark3 relative">
              <div className="flex items-start justify-between mb-3 sm:mb-6">
                <div className="p-3 bg-blue-500/10 text-blue-500 rounded-sm group-hover:bg-[#4d7cfe] group-hover:text-white transition-colors duration-300">
                  <Icon name="list_alt" className="" />
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-text font-bold tracking-tighter text-2xl sm:text-3xl">{totalFeatures}</h3>
                <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-wider">Total Funciones</p>
              </div>
              <p className="text-[10px] text-text-dim mt-3 sm:mt-6 font-inter font-bold uppercase tracking-[0.1em]">Capacidades del sistema</p>
            </div>

            {/* Operativas */}
            <div className="bg-dark2 p-4 sm:p-7 group transition-colors hover:bg-dark3 relative">
              <div className="flex items-start justify-between mb-3 sm:mb-6">
                <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-sm group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-300">
                  <Icon name="check_circle" className="" />
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim mb-1">Progreso</span>
                  <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    {Math.round((totalDone / totalFeatures) * 100)}%
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-emerald-500 font-bold tracking-tighter text-2xl sm:text-3xl">{totalDone}</h3>
                <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-wider">Operativas</p>
              </div>
              <p className="text-[10px] text-text-dim mt-3 sm:mt-6 font-inter font-bold uppercase tracking-[0.1em]">Funciones listas para uso</p>
            </div>

            {/* En Progreso */}
            <div className="bg-dark2 p-4 sm:p-7 group transition-colors hover:bg-dark3 relative">
              <div className="flex items-start justify-between mb-3 sm:mb-6">
                <div className="p-3 bg-amber-500/10 text-amber-400 rounded-sm group-hover:bg-amber-500 group-hover:text-white transition-colors duration-300">
                  <Icon name="pending" className="" />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Activo</span>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-amber-400 font-bold tracking-tighter text-2xl sm:text-3xl">{totalProgress}</h3>
                <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-wider">En Progreso</p>
              </div>
              <p className="text-[10px] text-text-dim mt-3 sm:mt-6 font-inter font-bold uppercase tracking-[0.1em]">En desarrollo activo</p>
            </div>

            {/* Pendientes */}
            <div className="bg-dark2 p-4 sm:p-7 group transition-colors hover:bg-dark3 relative">
              <div className="flex items-start justify-between mb-3 sm:mb-6">
                <div className={`p-3 rounded-sm transition-colors duration-300 ${totalPending > 0 ? 'bg-red-500/10 text-red-400 group-hover:bg-red-500 group-hover:text-white' : 'bg-dark3 text-text-dim group-hover:bg-white/10 group-hover:text-white'}`}>
                  <Icon name="radio_button_unchecked" className="" />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${totalPending > 0 ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-text-dim bg-dark3 border-border'}`}>
                  {totalPending > 0 ? 'PENDIENTE' : 'COMPLETO'}
                </span>
              </div>
              <div className="space-y-1">
                <h3 className={`font-bold tracking-tighter text-2xl sm:text-3xl ${totalPending > 0 ? 'text-red-400' : 'text-text'}`}>{totalPending}</h3>
                <p className="text-xs font-inter font-bold text-text-dim uppercase tracking-wider">Pendientes</p>
              </div>
              <p className="text-[10px] text-text-dim mt-3 sm:mt-6 font-inter font-bold uppercase tracking-[0.1em]">
                {totalPending > 0 ? 'Funciones por implementar' : 'Todo al día'}
              </p>
            </div>
          </div>
        </div>

        {/* Module Cards */}
        <div className="-mx-4 sm:mx-0 space-y-4 sm:space-y-4">
          {filteredModules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined text-[40px] text-text-dim/40 mb-3">search_off</span>
              <p className="text-sm font-bold text-text-dim">No se encontraron resultados para "{searchTerm}"</p>
            </div>
          ) : (
            filteredModules.map((mod) => (
              <ModuleCard key={mod.moduleKey} {...mod} />
            ))
          )}
        </div>

        <p className="text-center text-xs text-text-dim pb-4">
          Última actualización: {new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>
    </>
  )
}
