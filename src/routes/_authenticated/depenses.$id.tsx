import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Paperclip, Trash2, History, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ExpenseForm, emptyForm, formToRow, num, type FormState } from "@/components/expense-form";
import { computeMissing, duplicateMap, fetchCategories, fetchExpense, fetchExpenses, uploadReceipts, FIELD_LABELS, type ExpenseFull } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/depenses/$id")({
  head: () => ({ meta: [{ title: "Dépense — Mes Frais Pro" }, { name: "description", content: "Détail d'une dépense." }, { property: "og:title", content: "Dépense — Mes Frais Pro" }, { property: "og:description", content: "Détail d'une dépense." }] }),
  component: DetailPage,
});

function toForm(e: ExpenseFull): FormState {
  return {
    ...emptyForm(),
    expense_date: e.expense_date ?? "",
    supplier: e.supplier ?? "",
    description: e.description ?? "",
    total_ttc: e.total_ttc != null ? String(e.total_ttc) : "",
    currency: e.currency,
    amount_ht: e.amount_ht != null ? String(e.amount_ht) : "",
    chf_amount: e.chf_amount != null ? String(e.chf_amount) : "",
    category_id: e.category_id ?? "",
    payment_method: e.payment_method,
    personal_advance: e.personal_advance,
    comment: e.comment ?? "",
    validated: e.status === "valide",
    vat_lines: e.vat_lines.map((l) => ({ rate: l.rate != null ? String(l.rate) : "", amount: l.amount != null ? String(l.amount) : "" })),
  };
}

function DetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: e, refetch } = useQuery({ queryKey: ["expense", id], queryFn: () => fetchExpense(id) });
  const { data: cats = [] } = useQuery({ queryKey: ["categories", e?.company_id], queryFn: () => fetchCategories(e!.company_id), enabled: !!e });
  const { data: history = [] } = useQuery({
    queryKey: ["history", id],
    queryFn: async () => (await supabase.from("expense_history").select("*").eq("expense_id", id).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: siblings = [] } = useQuery({ queryKey: ["expenses", e?.company_id], queryFn: () => fetchExpenses(e!.company_id), enabled: !!e });
  const dupList = duplicateMap(siblings).get(id) ?? [];
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const extraRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (e) setForm(toForm(e)); }, [e]);
  if (!e || !form) return <p className="py-20 text-center text-muted-foreground">Chargement…</p>;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["history", id] });
    refetch();
  };

  async function save() {
    setSaving(true);
    try {
      const row = formToRow(form!);
      const missing = computeMissing(row, e!.receipts.length);
      const { error } = await supabase.from("expenses").update({ ...row, missing_fields: missing, status: form!.validated && missing.length === 0 ? "valide" : "a_valider" }).eq("id", id);
      if (error) throw error;
      await supabase.from("vat_lines").delete().eq("expense_id", id);
      const vat = form!.vat_lines.map((l) => ({ expense_id: id, rate: num(l.rate), amount: num(l.amount) })).filter((l) => l.rate != null || l.amount != null);
      if (vat.length) await supabase.from("vat_lines").insert(vat);
      toast.success("Modifications enregistrées");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function open(path: string, filename: string, download: boolean) {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 300, download ? { download: filename } : undefined);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }

  async function addFiles(files: File[]) {
    if (!files.length) return;
    const { data: u } = await supabase.auth.getUser();
    try {
      await uploadReceipts({ userId: u.user!.id, companyId: e!.company_id, expenseId: id, files });
      const missing = computeMissing(formToRow(form!), e!.receipts.length + files.length);
      await supabase.from("expenses").update({ missing_fields: missing }).eq("id", id);
      toast.success("Justificatif ajouté");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer ${e!.ref} ? Le justificatif original reste archivé.`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["expenses"] });
    navigate({ to: "/depenses" });
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <input ref={extraRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(ev) => { addFiles(Array.from(ev.target.files ?? [])); ev.target.value = ""; }} />
      <div className="flex items-center gap-2">
        <button onClick={() => navigate({ to: "/depenses" })} aria-label="Retour" className="p-2"><ArrowLeft /></button>
        <h1 className="flex-1 text-xl font-semibold">{e.ref}</h1>
        {e.exported_at ? (
          <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs"><Lock className="size-3" /> Exportée le {formatDate(e.exported_at)}</span>
        ) : (
          <button onClick={remove} aria-label="Supprimer" className="p-2 text-destructive"><Trash2 className="size-5" /></button>
        )}
      </div>
      {e.modified_after_export && (
        <div className="rounded-xl border border-warning bg-warning/10 p-3 text-sm text-warning-foreground">Modifiée après l'export comptable : informez votre comptable.</div>
      )}
      {dupList.length > 0 && (
        <div className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <div className="font-semibold">Doublon possible</div>
          {dupList.map((d) => (
            <Link key={d.id} to="/depenses/$id" params={{ id: d.id }} className="block underline-offset-2 hover:underline">
              {d.ref} — {d.reasons.join(", ")}
            </Link>
          ))}
        </div>
      )}
      {e.missing_fields.length > 0 && (
        <div className="rounded-xl border border-warning bg-warning/10 p-3 text-sm text-warning-foreground">
          Incomplète : {e.missing_fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Justificatifs originaux</h2>
        {e.receipts.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl border bg-card p-3 text-sm">
            <Paperclip className="size-4 shrink-0" />
            <button className="min-w-0 flex-1 truncate text-left font-medium" onClick={() => open(r.path, r.filename, false)}>{r.filename}</button>
            <span className="text-xs text-muted-foreground">{Math.round(r.size_bytes / 1024)} Ko</span>
            <button aria-label="Télécharger" onClick={() => open(r.path, r.filename, true)} className="p-1"><Download className="size-4" /></button>
          </div>
        ))}
        <Button variant="ghost" className="w-full" onClick={() => extraRef.current?.click()}><Paperclip /> Ajouter un justificatif</Button>
      </section>

      <ExpenseForm value={form} onChange={setForm} categories={cats} />
      <Button variant="accent" size="lg" className="w-full" disabled={saving} onClick={save}>{saving ? "…" : "Enregistrer les modifications"}</Button>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><History className="size-4" /> Historique</h2>
        {history.map((h) => (
          <div key={h.id} className="rounded-lg bg-secondary/60 p-2 text-xs">
            <span className="font-semibold">{h.action === "creation" ? "Création" : "Modification"}</span> · {new Date(h.created_at).toLocaleString("fr-CH")}
            {h.action === "modification" && h.changes && (
              <div className="mt-1 text-muted-foreground">{Object.keys(h.changes as object).map((k) => FIELD_LABELS[k] ?? k).join(", ")}</div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
