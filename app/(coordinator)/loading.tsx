export default function CoordinatorLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 animate-pulse min-h-full">
      <div className="space-y-2">
        <div className="h-9 w-56 max-w-[70%] rounded-lg bg-dark3" />
        <div className="h-4 w-80 max-w-[90%] rounded-md bg-dark3/70" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 md:h-28 rounded-xl border border-border bg-dark2"
          >
            <div className="p-4 space-y-3">
              <div className="h-3 w-16 rounded bg-dark3" />
              <div className="h-7 w-12 rounded bg-dark3" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-dark2 p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="h-5 w-40 rounded bg-dark3" />
          <div className="h-9 w-28 rounded-lg bg-dark3" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-11 rounded-lg bg-dark3/80" />
          ))}
        </div>
      </div>
    </div>
  );
}
