import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Upload, RotateCcw, Sparkles, FileText, Paperclip, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/components/company-context";
import { ExpenseForm, emptyForm, formToRow, num, selectCls, type FormState } from "@/components/expense-form";
import { analyzeReceipt } from "@/lib/analyze.functions";
import { prepareForAnalysis } from "@/lib/files";
import { computeMissing, fetchCategories, findDuplicateFiles, findSimilarExpenses, uploadReceipts } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/scanner")({
  head: () => ({ meta: [{ title: "Scanner une dépense — Mes Frais Pro" }, { name: "description", content: "Photographiez un ticket." }, { property: "og:title", content: "Scanner — Mes Frais Pro" }, { property: "og:description", content: "Photographiez un ticket." }] }),
  component: ScannerPage,
});

type Step = "pick" | "preview" | "analyzing" | "form";

function ScannerPage() {
  const { company, companies } = useCompany();
  const [companyId, setCompanyId] = useState(company!.id);
  useEffect(() => setCompanyId(company!.id), [company]);
  const { data: categories = [] } = useQuery({ queryKey: ["categories", companyId], queryFn: () => fetchCategories(companyId) });

  const [step, setStep] = useState<Step>("pick");
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiCategory, setAiCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);
  const analyze = useServerFn(analyzeReceipt);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // re-map AI-suggested category when company changes
  useEffect(() => {
    if (!aiCategory) return;
    const c = categories.find((x) => x.name.toLowerCase() === aiCategory.toLowerCase());
    setForm((f) => ({ ...f, category_id: c?.id ?? "" }));
  }, [categories, aiCategory]);

  function onPick(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return toast.error("Fichier trop volumineux (20 Mo max).");
    setFiles([f]);
    setPreviewUrl(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setStep("preview");
  }

  function reset() {
    setFiles([]); setPreviewUrl(null); setForm(emptyForm()); setUncertain([]); setAiNote(null); setAiCategory(null); setStep("pick");
  }

  async function runAnalysis() {
    setStep("analyzing");
    try {
      const prep = await prepareForAnalysis(files[0]);
      const res = await analyze({ data: { dataBase64: prep.base64, mime: prep.mime, filename: files[0].name, categories: categories.map((c) => c.name) } });
      if (!res.ok) {
        toast.error(res.error);
        setUncertain([]);
        setStep("form");
        return;
      }
      const r = res.result;
      const cat = r.category ? categories.find((c) => c.name.toLowerCase() === r.category!.toLowerCase()) : undefined;
      setAiCategory(r.category);
      setForm({
        ...emptyForm(),
        expense_date: r.expense_date && /^\d{4}-\d{2}-\d{2}$/.test(r.expense_date) ? r.expense_date : "",
        supplier: r.supplier ?? "",
        description: r.description ?? "",
        total_ttc: r.total_ttc != null ? String(r.total_ttc) : "",
        currency: (r.currency ?? "CHF").toUpperCase(),
        amount_ht: r.amount_ht != null ? String(r.amount_ht) : "",
        category_id: cat?.id ?? "",
        vat_lines: r.vat_lines.map((l) => ({ rate: l.rate != null ? String(l.rate) : "", amount: l.amount != null ? String(l.amount) : "" })),
      });
      setUncertain(r.uncertain_fields);
      setAiNote(!r.readable ? "Document difficilement lisible : vérifiez chaque champ." : r.notes);
      setStep("form");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analyse impossible");
      setStep("form");
    }
  }

  async function save() {
    setSaving(true);
    try {
      const row = formToRow(form);
      const dupFiles = await findDuplicateFiles(companyId, files);
      const similar = await findSimilarExpenses(companyId, row);
      if (dupFiles.length || similar.length) {
        const refs = [...new Set([...dupFiles, ...similar.map((s) => s.ref)])].join(", ");
        if (!window.confirm(`Doublon possible avec ${refs}. Enregistrer quand même ?`)) { setSaving(false); return; }
      }
      const missing = computeMissing(row, files.length);
      const { data: u } = await supabase.auth.getUser();
      const { data: exp, error } = await supabase
        .from("expenses")
        .insert({ ...row, company_id: companyId, missing_fields: missing, status: form.validated && missing.length === 0 ? "valide" : "a_valider" })
        .select("id, ref")
        .single();
      if (error) throw error;
      const vat = form.vat_lines.map((l) => ({ expense_id: exp.id, rate: num(l.rate), amount: num(l.amount) })).filter((l) => l.rate != null || l.amount != null);
      if (vat.length) {
        const { error: vErr } = await supabase.from("vat_lines").insert(vat);
        if (vErr) throw vErr;
      }
      await uploadReceipts({ userId: u.user!.id, companyId, expenseId: exp.id, files });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(`${exp.ref} enregistrée`);
      reset();
      if (missing.length) navigate({ to: "/depenses/$id", params: { id: exp.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />
      <input ref={extraRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { const l = Array.from(e.target.files ?? []); setFiles((f) => [...f, ...l]); e.target.value = ""; }} />

      {step === "pick" && (
        <div className="space-y-4 pt-4">
          <h1 className="font-display text-3xl font-semibold text-primary">Scanner une dépense</h1>
          <p className="text-muted-foreground">Cadrez le ticket entier, à plat et bien éclairé.</p>
          <Button variant="accent" size="xl" className="h-28 w-full flex-col gap-2" onClick={() => camRef.current?.click()}>
            <Camera className="!size-8" /> Prendre une photo
          </Button>
          <Button variant="outline" size="lg" className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload /> Importer une image ou un PDF
          </Button>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <Preview url={previewUrl} file={files[0]} />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="lg" onClick={() => { reset(); camRef.current?.click(); }}><RotateCcw /> Reprendre</Button>
            <Button variant="accent" size="lg" onClick={runAnalysis}><Sparkles /> Analyser</Button>
          </div>
          <button className="w-full text-sm text-muted-foreground" onClick={() => setStep("form")}>Saisir manuellement sans analyse</button>
        </div>
      )}

      {step === "analyzing" && (
        <div className="space-y-4">
          <Preview url={previewUrl} file={files[0]} scanning />
          <p className="text-center font-medium text-primary">Lecture du justificatif…</p>
        </div>
      )}

      {step === "form" && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            {previewUrl ? <img src={previewUrl} alt="Justificatif" className="size-16 rounded-lg object-cover" /> : <div className="grid size-16 place-items-center rounded-lg bg-secondary"><FileText /></div>}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold">Vérifier la dépense</h1>
              <p className="text-sm text-muted-foreground">{files.length} justificatif{files.length > 1 ? "s" : ""}</p>
            </div>
            <button aria-label="Annuler" className="p-2 text-muted-foreground" onClick={reset}><X /></button>
          </div>
          {aiNote && (
            <div className="flex gap-2 rounded-xl border border-warning bg-warning/10 p-3 text-sm text-warning-foreground">
              <AlertTriangle className="size-4 shrink-0" /> {aiNote}
            </div>
          )}
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Société</span>
            <select className={selectCls} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <ExpenseForm value={form} onChange={setForm} categories={categories} uncertain={uncertain} />
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
                <Paperclip className="size-4" /> <span className="flex-1 truncate">{f.name || "photo.jpg"}</span>
                {i > 0 && <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Retirer"><X className="size-4" /></button>}
              </div>
            ))}
            <Button variant="ghost" className="w-full" onClick={() => extraRef.current?.click()}><Paperclip /> Ajouter un justificatif</Button>
          </div>
          <div className="sticky bottom-20 md:bottom-4">
            <Button variant="accent" size="xl" className="w-full" disabled={saving} onClick={save}>
              {saving ? "Enregistrement…" : "Enregistrer la dépense"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Preview({ url, file, scanning }: { url: string | null; file?: File; scanning?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card shadow-card">
      {url ? (
        <img src={url} alt="Aperçu du ticket" className="max-h-[60vh] w-full object-contain" />
      ) : (
        <div className="flex h-56 flex-col items-center justify-center gap-2 text-muted-foreground"><FileText className="size-10" />{file?.name}</div>
      )}
      {scanning && <div className="absolute inset-x-0 h-1 animate-[scan_1.6s_ease-in-out_infinite] bg-accent shadow-scan" style={{ top: 0 }} />}
      <style>{`@keyframes scan{0%{top:0}50%{top:calc(100% - 4px)}100%{top:0}}`}</style>
    </div>
  );
}
