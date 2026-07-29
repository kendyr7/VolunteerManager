export default function SettingsLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 animate-pulse min-h-full">
      <div className="h-8 w-32 rounded-xl bg-dark3" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl border border-border bg-dark2 p-5" />
        ))}
      </div>
    </div>
  );
}
