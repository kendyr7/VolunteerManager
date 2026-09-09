export default function JournalLoading() {
  return <div className="p-6 space-y-6" role="status" aria-label="Cargando tu diario">
    <div className="h-8 w-40 rounded bg-dark3" />
    <div className="h-12 max-w-md rounded bg-dark3" />
    <div className="h-96 rounded-xl bg-dark2 border border-border" />
    <span className="sr-only">Cargando tus días de servicio…</span>
  </div>;
}
