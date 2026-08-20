export default function CommitteeAreasLoading() {
  return (
    <div className="min-h-full animate-pulse px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="space-y-3">
          <div className="h-4 w-28 rounded-lg bg-dark3" />
          <div className="h-8 w-64 rounded-lg bg-dark3" />
        </div>
        <div className="h-11 w-36 rounded-lg bg-dark3" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="h-[520px] rounded-xl border border-border bg-dark2" />
        <div className="h-[620px] rounded-xl border border-border bg-dark2" />
      </div>
    </div>
  );
}
