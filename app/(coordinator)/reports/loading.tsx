export default function ReportsLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 animate-pulse min-h-full">
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 rounded-xl bg-dark3" />
        <div className="h-9 w-28 rounded-full bg-dark3" />
      </div>

      {/* Reports Table Skeleton */}
      <div className="rounded-2xl border border-border bg-dark2 p-4 md:p-6 space-y-3">
        <div className="h-6 w-40 rounded bg-dark3 mb-4" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 rounded-xl bg-dark3/70" />
        ))}
      </div>
    </div>
  );
}
