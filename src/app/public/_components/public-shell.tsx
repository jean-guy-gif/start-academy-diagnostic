export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-[#eaf5ff]/40 to-white">
      <header className="border-b border-border/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#00527a] text-white font-heading font-bold">
            SA
          </div>
          <span className="font-heading text-lg font-bold tracking-wide text-[#00527a]">
            START ACADEMY
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-6 py-10">{children}</main>
    </div>
  );
}
