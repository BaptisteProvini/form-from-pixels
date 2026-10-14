import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/components/company-context";
import { ExpenseRow } from "@/components/expense-row";
import { selectCls } from "@/components/expense-form";
import { duplicateIds, fetchCategories, fetchExpenses } from "@/lib/data";
import { formatAmount } from "@/lib/format";

type Search = { statut?: string };

export const Route = createFileRoute("/_authenticated/depenses/")({
  validateSearch: (s: Record<string, unknown>): Search => ({ statut: typeof s.statut === "string" ? s.statut : undefined }),
  head: () => ({ meta: [{ title: "Dépenses — Mes Frais Pro" }, { name: "description", content: "Liste et filtres des dépenses." }, { property: "og:title", content: "Dépenses — Mes Frais Pro" }, { property: "og:description", content: "Liste des dépenses." }] }),
  component: ListPage,
});

function ListPage() {
  const { company } = useCompany();
  const search = Route.useSearch();
  const { data: all = [], isLoading } = useQuery({ queryKey: ["expenses", company!.id], queryFn: () => fetchExpenses(company!.id) });
  const { data: cats = [] } = useQuery({ queryKey: ["categories", company!.id], queryFn: () => fetchCategories(company!.id) });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState(search.statut ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const dups = useMemo(() => duplicateIds(all), [all]);

  const list = all.filter((e) => {
    if (q && !`${e.supplier ?? ""} ${e.description ?? ""} ${e.ref}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (cat && e.category_id !== cat) return false;
    if (status === "incomplete" && e.missing_fields.length === 0) return false;
    if (status === "doublons" && !dups.has(e.id)) return false;
    if ((status === "valide" || status === "a_valider") && e.status !== status) return false;
    if (status === "avance" && !e.personal_advance) return false;
    if (from && (!e.expense_date || e.expense_date < from)) return false;
    if (to && (!e.expense_date || e.expense_date > to)) return false;
    if (min && Number(e.total_ttc ?? 0) < Number(min)) return false;
    if (max && Number(e.total_ttc ?? 0) > Number(max)) return false;
    return true;
  });
  const sumChf = list.filter((e) => e.currency === "CHF").reduce((s, e) => s + Number(e.total_ttc ?? 0), 0);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-semibold text-primary">Dépenses</h1>
      <div className="space-y-2 rounded-2xl border bg-card p-3 shadow-card">
        <Input placeholder="Rechercher fournisseur, description, DEP-…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <select className={selectCls} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Toutes catégories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            <option value="a_valider">À valider</option>
            <option value="valide">Validées</option>
            <option value="incomplete">Incomplètes</option>
            <option value="doublons">Doublons possibles</option>
            <option value="avance">Avancées personnellement</option>
          </select>
          <Input type="date" aria-label="Du" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" aria-label="Au" value={to} onChange={(e) => setTo(e.target.value)} />
          <Input inputMode="decimal" placeholder="Montant min" value={min} onChange={(e) => setMin(e.target.value)} />
          <Input inputMode="decimal" placeholder="Montant max" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{list.length} dépense{list.length > 1 ? "s" : ""} · {formatAmount(sumChf)} (en CHF)</p>
      <div className="space-y-2">
        {isLoading && <p className="text-center text-muted-foreground">Chargement…</p>}
        {list.map((e) => <ExpenseRow key={e.id} e={e} duplicate={dups.has(e.id)} />)}
      </div>
    </div>
  );
}
