export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-none flex-wrap items-center gap-3 border-b border-line px-4 py-3 md:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-black tracking-tight">{title}</h1>
        {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
      </div>
      {children}
    </header>
  );
}
