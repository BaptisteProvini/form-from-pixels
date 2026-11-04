import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Check, Download, Upload, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { countExpenses, createCategory, createCompany, deleteCategory, deleteCompany, exportBackup, importBackup, renameCompany } from "@/lib/db";
import { downloadBlob } from "@/lib/files";
import { toISODate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/components/company-context";
import { fetchCategories } from "@/lib/data";

export const Route = createFileRoute("/_app/reglages")({
  head: () => ({ meta: [{ title: "Réglages — Mes Frais Pro" }, { name: "description", content: "Sociétés et catégories." }, { property: "og:title", content: "Réglages — Mes Frais Pro" }, { property: "og:description", content: "Sociétés et catégories." }] }),
  component: Settings,
});

function Settings() {
  const { companies, company } = useCompany();
  const qc = useQueryClient();
  const [newCo, setNewCo] = useState("");
  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const { data: cats = [] } = useQuery({ queryKey: ["categories", company?.id], queryFn: () => fetchCategories(company!.id), enabled: !!company });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["companies"] }); qc.invalidateQueries({ queryKey: ["categories"] }); };

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      return false;
    }
  };

  async function addCompany() {
    if (!newCo.trim()) return;
    if (await run(() => createCompany(newCo.trim()))) setNewCo("");
  }
  async function rename() {
    if (!editing?.name.trim()) return;
    const ed = editing;
    if (await run(() => renameCompany(ed.id, ed.name.trim()))) setEditing(null);
  }
  async function delCompany(id: string, name: string) {
    const count = await countExpenses(id);
    if (count) return toast.error(`${name} contient ${count} dépense(s) : suppression impossible pour préserver l'archive.`);
    if (!window.confirm(`Supprimer ${name} ?`)) return;
    await run(() => deleteCompany(id));
  }
  async function addCat() {
    if (!newCat.trim() || !company) return;
    if (await run(() => createCategory(company.id, newCat.trim()))) setNewCat("");
  }
  async function delCat(id: string) {
    await run(() => deleteCategory(id));
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <h1 className="font-display text-3xl font-semibold text-primary">Réglages</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sociétés</h2>
        {companies.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl border bg-card p-3">
            {editing?.id === c.id ? (
              <>
                <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && rename()} />
                <button onClick={rename} aria-label="Valider" className="p-2 text-accent"><Check className="size-4" /></button>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium">{c.name}</span>
                <button onClick={() => setEditing({ id: c.id, name: c.name })} aria-label="Renommer" className="p-2 text-muted-foreground"><Pencil className="size-4" /></button>
                <button onClick={() => delCompany(c.id, c.name)} aria-label="Supprimer" className="p-2 text-muted-foreground"><Trash2 className="size-4" /></button>
              </>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <Input placeholder="Nouvelle société" value={newCo} onChange={(e) => setNewCo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCompany()} />
          <Button onClick={addCompany}><Plus /> Ajouter</Button>
        </div>
      </section>

      {company && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Catégories — {company.name}</h2>
          <div className="flex gap-2">
            <Input placeholder="Nouvelle catégorie" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCat()} />
            <Button onClick={addCat}><Plus /> Ajouter</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <span key={c.id} className="flex items-center gap-1 rounded-full border bg-card py-1 pl-3 pr-1 text-sm">
                {c.name}
                {!c.is_default && <button onClick={() => delCat(c.id)} aria-label="Supprimer" className="rounded-full p-1 text-muted-foreground hover:bg-secondary"><Trash2 className="size-3" /></button>}
              </span>
            ))}
          </div>
        </section>
      )}

      <BackupSection onRestored={() => qc.invalidateQueries()} />

      <section className="rounded-2xl border bg-secondary/50 p-4 text-xs leading-relaxed text-muted-foreground">
        Vos dépenses et justificatifs sont enregistrés uniquement sur cet appareil, sans compte ni serveur. Faites une sauvegarde régulièrement (par exemple après chaque export mensuel) et gardez-la dans Fichiers, iCloud Drive ou sur votre ordinateur. L'application prépare la comptabilité ; elle ne remplace pas l'avis de votre fiduciaire et sa conformité aux exigences légales de conservation n'a pas encore été vérifiée.
      </section>
    </div>
  );
}

const LAST_BACKUP = "mfp.lastBackup";

function BackupSection({ onRestored }: { onRestored: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

  useEffect(() => {
    try { setLast(localStorage.getItem(LAST_BACKUP)); } catch { /* ignore */ }
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  async function backup() {
    setBusy("Préparation de la sauvegarde…");
    try {
      const blob = await exportBackup();
      const name = `Sauvegarde_Mes_Frais_Pro_${toISODate(new Date())}.zip`;
      const file = new File([blob], name, { type: "application/zip" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      let shared = false;
      try {
        if (nav.canShare?.({ files: [file] } as ShareData)) {
          await navigator.share({ files: [file], title: name });
          shared = true;
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
      if (!shared) downloadBlob(blob, name);
      const t = new Date().toISOString();
      try { localStorage.setItem(LAST_BACKUP, t); } catch { /* ignore */ }
      setLast(t);
      toast.success("Sauvegarde créée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sauvegarde impossible");
    } finally {
      setBusy(null);
    }
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    if (!window.confirm("Restaurer cette sauvegarde ? Toutes les données actuelles de cet appareil seront remplacées.")) return;
    setBusy("Restauration…");
    try {
      const r = await importBackup(file);
      onRestored();
      toast.success(`Sauvegarde restaurée : ${r.expenses} dépense(s), ${r.receipts} justificatif(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restauration impossible");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sauvegarde</h2>
      <input ref={inputRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-card">
        <p className="text-sm text-muted-foreground">
          Un seul fichier ZIP avec toutes vos sociétés, dépenses et justificatifs.{" "}
          {last ? `Dernière sauvegarde : ${new Date(last).toLocaleDateString("fr-CH")}.` : "Aucune sauvegarde pour l'instant."}
        </p>
        <Button variant="accent" size="lg" className="w-full" disabled={!!busy} onClick={backup}>
          <Download /> {busy ?? "Sauvegarder mes données"}
        </Button>
        <Button variant="outline" size="lg" className="w-full" disabled={!!busy} onClick={() => inputRef.current?.click()}>
          <Upload /> Restaurer une sauvegarde
        </Button>
      </div>
      {!standalone && (
        <div className="flex gap-2 rounded-xl border border-warning bg-warning/10 p-3 text-xs text-warning-foreground">
          <Smartphone className="size-4 shrink-0" />
          <span>Sur iPhone, ajoutez l'application à l'écran d'accueil (Safari → Partager → « Sur l'écran d'accueil ») : vos données y sont conservées durablement.</span>
        </div>
      )}
      {persisted && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Stockage protégé contre l'effacement automatique.</p>
      )}
    </section>
  );
}
