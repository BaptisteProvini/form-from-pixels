import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Camera, AlertTriangle } from "lucide-react";
import { useCompany } from "@/components/company-context";
import { ExpenseRow } from "@/components/expense-row";
import { chfValue, duplicateIds, fetchExpenses } from "@/lib/data";
import { MONTHS_FR, formatAmount, monthRange } from "@/lib/format";

export const Route = createFileRoute("/_app/accueil")({
  head: () => ({ meta: [{ title: "Accueil — Mes Frais Pro" }, { name: "description", content: "Vue d'ensemble de vos dépenses." }, { property: "og:title", content: "Accueil — Mes Frais Pro" }, { property: "og:description", content: "Vue d'ensemble de vos dépenses." }] }),
  component: Home,
});

function Home() {
  const { company } = useCompany();
  const { data: all = [] } = useQuery({ queryKey: ["expenses", company!.id], queryFn: () => fetchExpenses(company!.id) });
  const now = new Date();
  const { start, end } = monthRange(now.getFullYear(), now.getMonth());
  const month = all.filter((e) => e.expense_date && e.expense_date >= start && e.expense_date <= end);
  const total = month.reduce((s, e) => s + (chfValue(e) ?? 0), 0);
  const noChf = month.filter((e) => chfValue(e) == null).length;
  const vat = month.filter((e) => e.currency === "CHF").reduce((s, e) => s + e.vat_lines.reduce((a, l) => a + Number(l.amount ?? 0), 0), 0);
  const receipts = month.reduce((s, e) => s + e.receipts.length, 0);
  const incomplete = all.filter((e) => e.missing_fields.length > 0);
  const dups = duplicateIds(all);

  return (
    <div className="space-y-6">
      <Link to="/scanner" className="flex items-center gap-4 rounded-3xl bg-hero p-6 text-primary-foreground shadow-card">
        <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-scan">
          <Camera className="size-8" />
        </span>
        <span>
          <span className="block font-display text-2xl font-semibold">Scanner une dépense</span>
          <span className="text-sm text-primary-foreground/75">Photo → lecture → enregistré</span>
        </span>
      </Link>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{MONTHS_FR[now.getMonth()]} {now.getFullYear()}</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total CHF" value={formatAmount(total)} sub={noChf ? `${noChf} sans contre-valeur` : undefined} />
          <Stat label="Justificatifs" value={String(receipts)} />
          <Stat label="TVA identifiée" value={formatAmount(vat)} />
        </div>
      </section>

      {(incomplete.length > 0 || dups.size > 0) && (
        <section className="space-y-2">
          {incomplete.length > 0 && (
            <Link to="/depenses" search={{ statut: "incomplete" }} className="flex items-center gap-3 rounded-xl border border-warning bg-warning/10 p-3 text-sm text-warning-foreground">
              <AlertTriangle className="size-4" /> {incomplete.length} dépense{incomplete.length > 1 ? "s" : ""} incomplète{incomplete.length > 1 ? "s" : ""} ou sans justificatif
            </Link>
          )}
          {dups.size > 0 && (
            <Link to="/depenses" search={{ statut: "doublons" }} className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="size-4" /> {dups.size} dépenses en doublon possible
            </Link>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dernières dépenses</h2>
          <Link to="/depenses" className="text-sm font-medium text-accent">Tout voir</Link>
        </div>
        <div className="space-y-2">
          {all.slice(0, 5).map((e) => <ExpenseRow key={e.id} e={e} duplicate={dups.has(e.id)} />)}
          {all.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune dépense pour {company!.name}.</p>}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-card">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-bold tabular text-primary sm:text-xl">{value}</div>
      {sub && <div className="text-[10px] text-warning-foreground">{sub}</div>}
    </div>
  );
}
