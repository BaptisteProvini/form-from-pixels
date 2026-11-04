import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Mail } from "lucide-react";
import { toast } from "sonner";
import { listExports, listPeriodStatus, setPeriodStatus } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/components/company-context";
import { selectCls } from "@/components/expense-form";
import { buildPeriod, generateExportBlob } from "@/lib/export";
import { downloadBlob } from "@/lib/files";
import { MONTHS_FR, PERIOD_STATUS, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/export")({
  head: () => ({ meta: [{ title: "Export comptable — Mes Frais Pro" }, { name: "description", content: "Générer le rapport PDF pour le comptable." }, { property: "og:title", content: "Export comptable — Mes Frais Pro" }, { property: "og:description", content: "Récapitulatif et justificatifs en un seul PDF." }] }),
  component: ExportPage,
});

function filesShareSupported(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    return typeof nav.canShare === "function" && nav.canShare({ files: [file] } as ShareData);
  } catch {
    return false;
  }
}

function ExportPage() {
  const { company } = useCompany();
  const qc = useQueryClient();
  const now = new Date();
  const [kind, setKind] = useState<"mois" | "trimestre" | "annee" | "perso">("mois");
  const [year, setYear] = useState(now.getFullYear());
  const [idx, setIdx] = useState(now.getMonth());
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [shareable, setShareable] = useState<{ blob: Blob; name: string } | null>(null);

  const { data: exports = [] } = useQuery({
    queryKey: ["exports", company!.id],
    queryFn: () => listExports(company!.id),
  });
  const { data: statuses = [] } = useQuery({
    queryKey: ["period_status", company!.id],
    queryFn: () => listPeriodStatus(company!.id),
  });

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}` };
  });

  async function setStatus(month: string, status: string) {
    try {
      await setPeriodStatus(company!.id, month, status);
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Erreur");
    }
    qc.invalidateQueries({ queryKey: ["period_status", company!.id] });
  }

  async function run() {
    if (kind === "perso" && (!start || !end || start > end)) return toast.error("Choisissez des dates valides.");
    const period = buildPeriod(kind, year, idx, { start, end });
    setBusy("Préparation…");
    try {
      const r = await generateExportBlob(company!, period, setBusy);
      setShareable({ blob: r.blob, name: r.zipName });
      toast.success(`Rapport prêt (${r.count} dépenses${r.issues ? `, ${r.issues} point(s) de contrôle` : ""})`);
      qc.invalidateQueries({ queryKey: ["exports", company!.id] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    } finally {
      setBusy(null);
    }
  }

  async function shareReport() {
    if (!shareable) return;
    const file = new File([shareable.blob], shareable.name, { type: "application/pdf" });
    if (!filesShareSupported(file)) {
      downloadBlob(shareable.blob, shareable.name);
      toast.info("Partage direct indisponible sur cet appareil : le fichier a été téléchargé, joignez-le depuis votre application e-mail.");
      return;
    }
    try {
      await navigator.share({ files: [file], title: shareable.name });
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") toast.error("Partage impossible. Utilisez le fichier téléchargé.");
    }
  }

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-3xl font-semibold text-primary">Export comptable</h1>
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-card">
        <p className="text-sm text-muted-foreground">{company!.name}</p>
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-secondary p-1 text-sm">
          {(["mois", "trimestre", "annee", "perso"] as const).map((k) => (
            <button key={k} onClick={() => { setKind(k); setIdx(k === "trimestre" ? Math.floor(now.getMonth() / 3) : now.getMonth()); }}
              className={`rounded-md py-1.5 font-medium ${kind === k ? "bg-card text-primary shadow-card" : "text-muted-foreground"}`}>
              {k === "mois" ? "Mois" : k === "trimestre" ? "Trimestre" : k === "annee" ? "Année" : "Dates"}
            </button>
          ))}
        </div>
        {kind === "perso" ? (
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Du" />
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Au" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {kind !== "annee" && (
              <select className={selectCls} value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
                {(kind === "mois" ? MONTHS_FR : ["T1", "T2", "T3", "T4"]).map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            )}
            <select className={selectCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
        )}
        <Button variant="accent" size="xl" className="w-full" disabled={!!busy} onClick={run}>
          <FileText className="!size-5" /> {busy ?? "Générer le rapport PDF"}
        </Button>
        {shareable && (
          <div className="space-y-2 rounded-xl border border-accent/40 bg-secondary p-3">
            <p className="text-sm font-medium">{shareable.name} · {(shareable.blob.size / 1024 / 1024).toFixed(1)} Mo</p>
            <Button variant="accent" size="xl" className="w-full" disabled={!!busy} onClick={shareReport}>
              <Mail className="!size-5" /> Envoyer par e-mail
            </Button>
            <Button variant="outline" size="xl" className="w-full" disabled={!!busy} onClick={() => downloadBlob(shareable.blob, shareable.name)}>
              <FileText className="!size-5" /> Ouvrir / télécharger le PDF
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Un seul PDF : récapitulatif par catégorie (hors TVA, TVA, total), points de contrôle, puis tous les justificatifs.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Statut des mois</h2>
        {months.map((m) => {
          const s = statuses.find((x) => x.month === m.key)?.status ?? "en_cours";
          return (
            <div key={m.key} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
              <span className="font-medium">{m.label}</span>
              <select className={`${selectCls} w-48`} value={s} onChange={(e) => setStatus(m.key, e.target.value)}>
                {Object.entries(PERIOD_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historique des exports</h2>
        {exports.length === 0 && <p className="text-sm text-muted-foreground">Aucun export.</p>}
        {exports.map((x) => (
          <div key={x.id} className="rounded-xl border bg-card p-3 text-sm">
            <div className="font-semibold">{x.filename}</div>
            <div className="text-muted-foreground">{x.label} · {x.expense_count} dépenses · le {formatDate(x.created_at)}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
