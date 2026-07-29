export default function UsersLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 animate-pulse min-h-full">
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 rounded-xl bg-dark3" />
        <div className="h-9 w-32 rounded-full bg-dark3" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-border bg-dark2 p-4 space-y-2" />
        ))}
      </div>
    </div>
  );
}
