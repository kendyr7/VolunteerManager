export default function VolunteersLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 animate-pulse min-h-full">
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 rounded-xl bg-dark3" />
        <div className="h-9 w-36 rounded-full bg-dark3" />
      </div>

      {/* Search & Filter Bar */}
      <div className="h-12 w-full rounded-2xl border border-border bg-dark2" />

      {/* Volunteer Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl border border-border bg-dark2 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-dark3" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-32 rounded bg-dark3" />
                <div className="h-3 w-20 rounded bg-dark3/60" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
