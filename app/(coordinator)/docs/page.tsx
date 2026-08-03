'use client'

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
    <div className="rounded-xl border border-border bg-dark2 overflow-hidden transition-all duration-200 hover:border-border/80">
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
      { name: "Resetear Código / PIN", description: "Regenera el código de acceso de un voluntario en caso de pérdida o bloqueo.", status: "done" },
      { name: "Perfil y Cronograma Individual", description: "Vista detallada con información completa, horas acumuladas, comité asignado y calendario de turnos.", status: "done" },
      { name: "Gestión de Turnos (Admin)", description: "Editar, reasignar o cancelar turnos directamente desde el perfil del voluntario. Exclusivo para admins/coordinadores.", status: "done" },
      { name: "Envío de PIN por WhatsApp", description: "Envío automático de credenciales (PIN + instrucciones) vía WA al registrar un nuevo voluntario.", status: "progress" },
      { name: "Gestión de Teléfonos Duplicados", description: "Manejo de casos donde menores comparten número de contacto con sus padres.", status: "pending" },
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
      { name: "Verificación de Turnos Diarios", description: "Lógica para prevenir múltiples turnos el mismo día o en horarios conflictivos.", status: "pending" },
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
      { name: "Sincronización Realtime", description: "Los estados de check-in/check-out se actualizan instantáneamente en todos los dispositivos conectados.", status: "progress" },
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
      { name: "Notificación al Reemplazo", description: "Aviso automático vía WhatsApp al voluntario que acepta el turno de reemplazo.", status: "pending" },
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
      { name: "Distribución por WhatsApp", description: "Envío de avisos críticos directamente a grupos o individuos a través de WA.", status: "pending" },
    ],
  },
  {
    moduleKey: "reports",
    title: "Reportes",
    route: "/reports",
    description: "Exportación y análisis de datos históricos para revisión post-evento.",
    features: [
      { name: "Reporte de Asistencia", description: "Lista completa de voluntarios con check-ins, check-outs y horas totales por día.", status: "done" },
      { name: "Reporte por Comité", description: "Resumen desglosado de participación, asistencia y horas agrupado por comité.", status: "done" },
      { name: "Exportar a CSV / Excel", description: "Descarga de datos en formato de hoja de cálculo para análisis externo o presentaciones.", status: "done" },
      { name: "Historial de Cambios de Estado", description: "Registro completo de turnos asignados, completados, cancelados y reasignados.", status: "done" },
    ],
  },
  {
    moduleKey: "users",
    title: "Usuarios",
    route: "/users",
    description: "Administración de cuentas del equipo coordinador con control de roles y permisos.",
    features: [
      { name: "Sistema de Roles y Permisos", description: "Tres niveles: Administrador (acceso total), Coordinador (gestión operativa), Editor (lectura limitada). Voluntarios/Editores no modifican turnos.", status: "done" },
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
      { name: "Gestión de Comités", description: "Agregar o archivar comités; los cambios se reflejan automáticamente en todas las listas y filtros de la plataforma sin necesidad de recargar.", status: "done" },
      { name: "Gestión de Estacas y Barrios", description: "Configurar la estructura organizacional que se asigna en los perfiles de voluntarios.", status: "done" },
      { name: "Requerimientos por Turno", description: "Definir la cantidad de voluntarios requeridos para cada turno y comité. La plataforma usa este valor para calcular cupos disponibles, emitir avisos y mostrar el estado de llenado.", status: "done" },
      { name: "Permisos por Rol", description: "Control granular de qué acciones puede realizar cada rol (Admin, Coordinador, Editor). Se configura por módulo: ver voluntarios, hacer check-in, enviar WA, importar datos, gestionar usuarios, etc.", status: "done" },
      { name: "Historial de Actividades", description: "Registro cronológico de acciones importantes realizadas en la plataforma: quién hizo qué y cuándo (check-ins, reasignaciones, cancelaciones, cambios de configuración).", status: "done" },
      { name: "Integración WA (API de Meta)", description: "Configuración de credenciales y parámetros del bot de WhatsApp para mensajería automatizada.", status: "progress" },
      { name: "Autenticación por Huella", description: "Inicio de sesión biométrico para coordinadores en dispositivos móviles, eliminando la necesidad de ingresar credenciales manualmente durante el evento.", status: "progress" },
      { name: "Centro de Documentación", description: "Esta misma página: base de conocimiento integrada dentro de la plataforma para el equipo coordinador.", status: "progress" },
    ],
  },
]

export default function DocsPage() {
  const totalFeatures = MODULES.reduce((sum, m) => sum + m.features.length, 0)
  const totalDone = MODULES.reduce((sum, m) => sum + m.features.filter(f => f.status === "done").length, 0)
  const totalProgress = MODULES.reduce((sum, m) => sum + m.features.filter(f => f.status === "progress").length, 0)
  const totalPending = MODULES.reduce((sum, m) => sum + m.features.filter(f => f.status === "pending").length, 0)

  return (
    <div className="min-h-full bg-dark">
      <div className="w-full px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-text-dim text-sm font-inter mb-3">
            <Icon name="menu_book" className="text-text-dim" />
            <span>Volunteer Manager</span>
            <Icon name="chevron_right" className="text-text-dim" />
            <span className="text-text">Centro de Documentación</span>
          </div>
          <h1 className="text-2xl font-inter font-bold text-text tracking-tight">Centro de Documentación</h1>
          <p className="text-sm text-text-dim leading-relaxed max-w-2xl">
            Registro completo de capacidades de la plataforma organizadas por módulo. Úsalo como guía de referencia rápida para el equipo coordinador.
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total funciones", value: totalFeatures, icon: "list_alt", color: "text-text" },
            { label: "Operativas", value: totalDone, icon: "check_circle", color: "text-emerald-500" },
            { label: "En progreso", value: totalProgress, icon: "pending", color: "text-amber-400" },
            { label: "Pendientes", value: totalPending, icon: "radio_button_unchecked", color: "text-text-dim" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-dark2 px-4 py-3 flex items-center gap-3">
              <Icon name={stat.icon} className={stat.color} />
              <div>
                <p className={`text-xl font-bold font-inter ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-text-dim">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Module Cards */}
        <div className="space-y-4">
          {MODULES.map((mod) => (
            <ModuleCard key={mod.moduleKey} {...mod} />
          ))}
        </div>

        <p className="text-center text-xs text-text-dim pb-4">
          Última actualización: {new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>
    </div>
  )
}
