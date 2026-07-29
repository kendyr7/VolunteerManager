export default function DashboardLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 animate-pulse min-h-full">
      <div className="space-y-2">
        <div className="h-8 w-60 rounded-xl bg-dark3" />
        <div className="h-4 w-80 rounded-lg bg-dark3/60" />
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-border bg-dark2 p-4 space-y-3">
            <div className="h-3 w-20 rounded bg-dark3" />
            <div className="h-7 w-16 rounded-lg bg-dark3" />
          </div>
        ))}
      </div>

      {/* Heatmap Section */}
      <div className="rounded-2xl border border-border bg-dark2 p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="h-5 w-48 rounded bg-dark3" />
          <div className="h-9 w-32 rounded-xl bg-dark3" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-dark3/80" />
          ))}
        </div>
      </div>
    </div>
  );
}
