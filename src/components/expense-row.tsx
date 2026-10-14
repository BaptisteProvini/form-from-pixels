import { Link } from "@tanstack/react-router";
import { AlertTriangle, Copy } from "lucide-react";
import { formatAmount, formatDate } from "@/lib/format";
import type { ExpenseFull } from "@/lib/data";

export function ExpenseRow({ e, duplicate }: { e: ExpenseFull; duplicate?: boolean }) {
  const incomplete = e.missing_fields.length > 0;
  return (
    <Link
      to="/depenses/$id"
      params={{ id: e.id }}
      className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-card transition-colors hover:border-accent/50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground tabular">{e.ref}</span>
          {incomplete && <AlertTriangle className="size-3.5 text-warning" aria-label="Incomplète" />}
          {duplicate && <Copy className="size-3.5 text-destructive" aria-label="Doublon possible" />}
          {e.status === "valide" && <span className="rounded bg-accent/15 px-1.5 text-[10px] font-semibold text-accent">VALIDÉE</span>}
          {e.modified_after_export && <span className="rounded bg-warning/20 px-1.5 text-[10px] font-semibold text-warning-foreground">MODIF. APRÈS EXPORT</span>}
        </div>
        <div className="truncate font-semibold">{e.supplier ?? "Fournisseur ?"}</div>
        <div className="truncate text-xs text-muted-foreground">
          {formatDate(e.expense_date)} · {e.categories?.name ?? "Sans catégorie"}
        </div>
      </div>
      <div className="text-right font-semibold tabular">{formatAmount(e.total_ttc, e.currency)}</div>
    </Link>
  );
}
