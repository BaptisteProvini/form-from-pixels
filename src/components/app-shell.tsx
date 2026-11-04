import { Link, Outlet } from "@tanstack/react-router";
import { Home, ListChecks, ScanLine, FileArchive, Settings, Building2 } from "lucide-react";
import { CompanyProvider, useCompany } from "./company-context";

export function AppShell() {
  return (
    <CompanyProvider>
      <Shell />
    </CompanyProvider>
  );
}

function CompanySelect() {
  const { companies, company, setCompanyId } = useCompany();
  return (
    <label className="relative flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-card">
      <Building2 className="size-4 shrink-0 text-accent" />
      <select
        aria-label="Société"
        className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold outline-none"
        value={company?.id ?? ""}
        onChange={(e) => setCompanyId(e.target.value)}
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </label>
  );
}

const NAV = [
  { to: "/accueil", label: "Accueil", icon: Home },
  { to: "/depenses", label: "Dépenses", icon: ListChecks },
  { to: "/scanner", label: "Scanner", icon: ScanLine },
  { to: "/export", label: "Export", icon: FileArchive },
  { to: "/reglages", label: "Réglages", icon: Settings },
] as const;

function Shell() {
  const { company, isLoading } = useCompany();

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <div className="h-[env(safe-area-inset-top)] bg-background" />
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link to="/accueil" className="hidden shrink-0 font-display text-xl font-semibold text-primary sm:block">
            Mes Frais <span className="text-accent">Pro</span>
          </Link>
          <CompanySelect />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
                activeProps={{ className: "bg-secondary text-primary" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        {isLoading ? (
          <p className="py-20 text-center text-muted-foreground">Chargement…</p>
        ) : !company ? (
          <div className="py-16 text-center">
            <p className="text-muted-foreground">Aucune société. Créez-en une dans les réglages.</p>
            <Link to="/reglages" className="mt-4 inline-block font-semibold text-accent">Ouvrir les réglages</Link>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              {n.to === "/scanner" ? (
                <span className="-mt-6 grid size-12 place-items-center rounded-full bg-accent text-accent-foreground shadow-scan">
                  <n.icon className="size-6" />
                </span>
              ) : (
                <n.icon className="size-5" />
              )}
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
