import { useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PAYMENT_METHODS } from "@/lib/format";
import type { Category } from "@/lib/data";
import { cn } from "@/lib/utils";

export type FormState = {
  expense_date: string;
  supplier: string;
  description: string;
  total_ttc: string;
  currency: string;
  amount_ht: string;
  chf_amount: string;
  category_id: string;
  payment_method: string;
  personal_advance: boolean;
  comment: string;
  validated: boolean;
  vat_lines: { rate: string; amount: string }[];
};

export const emptyForm = (): FormState => ({
  expense_date: "",
  supplier: "",
  description: "",
  total_ttc: "",
  currency: "CHF",
  amount_ht: "",
  chf_amount: "",
  category_id: "",
  payment_method: "carte_pro",
  personal_advance: false,
  comment: "",
  validated: false,
  vat_lines: [],
});

export const num = (s: string): number | null => {
  const t = s.replace(/[’'\s]/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const CURRENCIES = ["CHF", "EUR", "USD", "GBP"];

export const selectCls =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function ExpenseForm({
  value,
  onChange,
  categories,
  uncertain = [],
}: {
  value: FormState;
  onChange: (v: FormState) => void;
  categories: Category[];
  uncertain?: string[];
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => onChange({ ...value, [k]: v });
  const flag = (k: string) => uncertain.includes(k);
  const warn = (k: string, empty: boolean) =>
    flag(k) || empty ? "border-warning bg-warning/10 focus-visible:ring-warning" : "";
  const Hint = ({ k, empty }: { k: string; empty: boolean }) =>
    flag(k) || empty ? (
      <span className="flex items-center gap-1 text-xs font-medium text-warning-foreground">
        <AlertTriangle className="size-3" /> {empty ? "Illisible ou absent — à saisir" : "À vérifier"}
      </span>
    ) : null;
  const [cur] = useState(() => (CURRENCIES.includes(value.currency) ? null : value.currency));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={value.expense_date} onChange={(e) => set("expense_date", e.target.value)} className={warn("expense_date", !value.expense_date)} />
          <Hint k="expense_date" empty={!value.expense_date} />
        </Field>
        <Field label="Montant TTC">
          <div className="flex gap-2">
            <select className={cn(selectCls, "w-20 px-2")} value={value.currency} onChange={(e) => set("currency", e.target.value)}>
              {[...CURRENCIES, ...(cur ? [cur] : [])].map((c) => <option key={c}>{c}</option>)}
            </select>
            <Input inputMode="decimal" value={value.total_ttc} onChange={(e) => set("total_ttc", e.target.value)} className={cn("tabular", warn("total_ttc", !value.total_ttc))} />
          </div>
          <Hint k="total_ttc" empty={!value.total_ttc} />
        </Field>
      </div>

      <Field label="Fournisseur">
        <Input value={value.supplier} onChange={(e) => set("supplier", e.target.value)} className={warn("supplier", !value.supplier)} />
        <Hint k="supplier" empty={!value.supplier} />
      </Field>
      <Field label="Description">
        <Input value={value.description} onChange={(e) => set("description", e.target.value)} className={warn("description", false)} />
      </Field>
      <Field label="Catégorie">
        <select className={cn(selectCls, warn("category", !value.category_id))} value={value.category_id} onChange={(e) => set("category_id", e.target.value)}>
          <option value="">— Choisir —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Hint k="category" empty={!value.category_id} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Montant HT (si connu)">
          <Input inputMode="decimal" value={value.amount_ht} onChange={(e) => set("amount_ht", e.target.value)} className={cn("tabular", warn("amount_ht", false))} />
        </Field>
        {value.currency !== "CHF" && (
          <Field label="Contre-valeur CHF">
            <Input inputMode="decimal" value={value.chf_amount} onChange={(e) => set("chf_amount", e.target.value)} className="tabular" />
          </Field>
        )}
      </div>

      <div className={cn("space-y-2 rounded-xl border p-3", flag("vat_lines") && "border-warning bg-warning/10")}>
        <div className="flex items-center justify-between">
          <Label>TVA</Label>
          <button type="button" className="flex items-center gap-1 text-sm font-medium text-accent" onClick={() => set("vat_lines", [...value.vat_lines, { rate: "", amount: "" }])}>
            <Plus className="size-4" /> Ajouter un taux
          </button>
        </div>
        {value.vat_lines.length === 0 && <p className="text-xs text-muted-foreground">Aucune TVA identifiée sur le justificatif.</p>}
        {value.vat_lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input inputMode="decimal" placeholder="Taux %" value={l.rate} className="tabular"
              onChange={(e) => set("vat_lines", value.vat_lines.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} />
            <Input inputMode="decimal" placeholder="Montant" value={l.amount} className="tabular"
              onChange={(e) => set("vat_lines", value.vat_lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            <button type="button" aria-label="Supprimer" className="p-2 text-muted-foreground" onClick={() => set("vat_lines", value.vat_lines.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {flag("vat_lines") && <p className="text-xs font-medium text-warning-foreground">TVA à vérifier sur le justificatif.</p>}
      </div>

      <Field label="Moyen de paiement">
        <select className={selectCls} value={value.payment_method} onChange={(e) => {
          const pm = e.target.value;
          onChange({ ...value, payment_method: pm, personal_advance: pm === "carte_perso" ? true : value.personal_advance });
        }}>
          {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <label className="flex items-center justify-between rounded-xl border bg-card p-3">
        <span className="text-sm font-medium">Dépense avancée personnellement</span>
        <Switch checked={value.personal_advance} onCheckedChange={(v) => set("personal_advance", v)} />
      </label>
      <Field label="Commentaire">
        <Textarea rows={2} value={value.comment} onChange={(e) => set("comment", e.target.value)} />
      </Field>
      <label className="flex items-center justify-between rounded-xl border border-accent/40 bg-accent/5 p-3">
        <span className="text-sm font-medium">Marquer comme validée</span>
        <Switch checked={value.validated} onCheckedChange={(v) => set("validated", v)} />
      </label>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function formToRow(v: FormState) {
  return {
    expense_date: v.expense_date || null,
    supplier: v.supplier.trim() || null,
    description: v.description.trim() || null,
    total_ttc: num(v.total_ttc),
    currency: v.currency || "CHF",
    amount_ht: num(v.amount_ht),
    chf_amount: v.currency === "CHF" ? null : num(v.chf_amount),
    category_id: v.category_id || null,
    payment_method: v.payment_method,
    personal_advance: v.personal_advance,
    comment: v.comment.trim() || null,
  };
}
