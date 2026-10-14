import { supabase } from "@/integrations/supabase/client";
import { duplicateMap, fetchExpenses, FIELD_LABELS, type Company } from "./data";
import { MONTHS_FR, PAYMENT_METHODS, STATUS_LABELS, formatDate, slugify } from "./format";
import { downloadBlob, extOf } from "./files";

export type Period = { start: string; end: string; label: string; fileTag: string; sheetTag: string };

export function buildPeriod(kind: "mois" | "trimestre" | "annee" | "perso", year: number, idx: number, custom?: { start: string; end: string }): Period {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (kind === "mois") {
    return { start: iso(new Date(year, idx, 1)), end: iso(new Date(year, idx + 1, 0)), label: `${MONTHS_FR[idx]} ${year}`, fileTag: `${year}-${String(idx + 1).padStart(2, "0")}`, sheetTag: `${slugify(MONTHS_FR[idx])}_${year}` };
  }
  if (kind === "trimestre") {
    return { start: iso(new Date(year, idx * 3, 1)), end: iso(new Date(year, idx * 3 + 3, 0)), label: `T${idx + 1} ${year}`, fileTag: `${year}-T${idx + 1}`, sheetTag: `T${idx + 1}_${year}` };
  }
  if (kind === "annee") return { start: `${year}-01-01`, end: `${year}-12-31`, label: `Année ${year}`, fileTag: `${year}`, sheetTag: `${year}` };
  const c = custom!;
  return { start: c.start, end: c.end, label: `${formatDate(c.start)} – ${formatDate(c.end)}`, fileTag: `${c.start}_${c.end}`, sheetTag: `${c.start}_${c.end}` };
}

export async function generateExport(company: Company, period: Period, onProgress?: (msg: string) => void) {
  const [{ default: ExcelJS }, { default: JSZip }] = await Promise.all([import("exceljs"), import("jszip")]);
  onProgress?.("Lecture des dépenses…");
  const list = (await fetchExpenses(company.id, period)).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  // also include expenses without date (flagged in report)
  const { data: undated } = await supabase.from("expenses").select("ref").eq("company_id", company.id).is("expense_date", null);
  const dups = duplicateMap(list);

  const zip = new JSZip();
  const folder = zip.folder("Justificatifs")!;
  const refsByExpense = new Map<string, string[]>();
  let i = 0;
  for (const e of list) {
    const names: string[] = [];
    const base = `${e.ref}_${slugify(e.supplier || e.categories?.name || "Depense") || "Depense"}`;
    for (const [k, r] of e.receipts.entries()) {
      i++;
      onProgress?.(`Justificatif ${i}…`);
      const { data, error } = await supabase.storage.from("receipts").download(r.path);
      if (error || !data) throw new Error(`Téléchargement impossible : ${r.filename}`);
      const name = `${base}${e.receipts.length > 1 ? `_${k + 1}` : ""}.${extOf(r.filename, r.mime)}`;
      folder.file(name, data);
      names.push(name);
    }
    refsByExpense.set(e.id, names);
  }

  onProgress?.("Création du fichier Excel…");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mes Frais Pro";
  const ws = wb.addWorksheet("Dépenses", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Identifiant unique", key: "ref", width: 12 },
    { header: "Date", key: "date", width: 12 },
    { header: "Fournisseur", key: "supplier", width: 28 },
    { header: "Description", key: "description", width: 34 },
    { header: "Catégorie", key: "category", width: 24 },
    { header: "Montant HT", key: "ht", width: 13, style: { numFmt: "#,##0.00" } },
    { header: "TVA", key: "vat", width: 11, style: { numFmt: "#,##0.00" } },
    { header: "Taux de TVA", key: "rate", width: 14 },
    { header: "Montant TTC", key: "ttc", width: 13, style: { numFmt: "#,##0.00" } },
    { header: "Devise", key: "currency", width: 8 },
    { header: "Contre-valeur CHF", key: "chf", width: 16, style: { numFmt: "#,##0.00" } },
    { header: "Société", key: "company", width: 26 },
    { header: "Moyen de paiement", key: "payment", width: 28 },
    { header: "Avancée personnellement", key: "advance", width: 12 },
    { header: "Commentaire", key: "comment", width: 30 },
    { header: "Référence des justificatifs", key: "files", width: 40 },
    { header: "Statut de validation", key: "status", width: 18 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2A4A" } };

  for (const e of list) {
    const vatTotal = e.vat_lines.reduce((s, l) => s + Number(l.amount ?? 0), 0);
    ws.addRow({
      ref: e.ref,
      date: formatDate(e.expense_date),
      supplier: e.supplier ?? "",
      description: e.description ?? "",
      category: e.categories?.name ?? "",
      ht: e.amount_ht != null ? Number(e.amount_ht) : null,
      vat: e.vat_lines.length ? Math.round(vatTotal * 100) / 100 : null,
      rate: e.vat_lines.map((l) => (l.rate != null ? `${l.rate}%` : "?")).join(" / "),
      ttc: e.total_ttc != null ? Number(e.total_ttc) : null,
      currency: e.currency,
      chf: e.chf_amount != null ? Number(e.chf_amount) : e.currency === "CHF" && e.total_ttc != null ? Number(e.total_ttc) : null,
      company: company.name,
      payment: PAYMENT_METHODS[e.payment_method] ?? e.payment_method,
      advance: e.personal_advance ? "Oui" : "Non",
      comment: e.comment ?? "",
      files: (refsByExpense.get(e.id) ?? []).join(", "),
      status: (STATUS_LABELS[e.status] ?? e.status) + (e.modified_after_export ? " (modifiée après export)" : ""),
    });
  }

  // Control report
  const issues: string[][] = [];
  for (const e of list) {
    const m = e.missing_fields.filter((f) => f !== "receipt");
    if (m.length) issues.push([e.ref!, "Informations incomplètes", m.map((f) => FIELD_LABELS[f] ?? f).join(", ")]);
    if (e.receipts.length === 0) issues.push([e.ref!, "Justificatif manquant", ""]);
    for (const d of dups.get(e.id) ?? []) issues.push([e.ref!, "Doublon suspect", `Avec ${d.ref} : ${d.reasons.join(", ")}`]);
    if (e.status !== "valide") issues.push([e.ref!, "Non validée", ""]);
    if (e.currency !== "CHF" && e.chf_amount == null) issues.push([e.ref!, "Contre-valeur CHF manquante", e.currency]);
    if (e.modified_after_export) issues.push([e.ref!, "Modifiée après un export précédent", ""]);
  }
  for (const u of undated ?? []) issues.push([u.ref ?? "?", "Dépense sans date (non incluse dans la période)", ""]);

  const rs = wb.addWorksheet("Rapport de contrôle");
  rs.columns = [{ header: "Dépense", width: 12 }, { header: "Contrôle", width: 44 }, { header: "Détail", width: 60 }];
  rs.getRow(1).font = { bold: true };
  if (issues.length === 0) rs.addRow(["—", "Aucune anomalie détectée", ""]);
  issues.forEach((r) => rs.addRow(r));

  const xlsxName = `Depenses_${period.sheetTag}.xlsx`;
  zip.file(xlsxName, await wb.xlsx.writeBuffer());

  const report = [
    `RAPPORT DE CONTRÔLE — ${company.name}`,
    `Période : ${period.label} (${formatDate(period.start)} – ${formatDate(period.end)})`,
    `Généré le : ${new Date().toLocaleString("fr-CH")}`,
    `Dépenses : ${list.length} · Justificatifs : ${i}`,
    "",
    ...(issues.length ? issues.map((r) => `- ${r[0]} : ${r[1]}${r[2] ? ` (${r[2]})` : ""}`) : ["Aucune anomalie détectée."]),
    "",
    "Ce document prépare la comptabilité ; il ne constitue pas une décision fiscale.",
  ].join("\r\n");
  zip.file("Rapport_de_controle.txt", report);

  onProgress?.("Compression…");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const zipName = `${slugify(company.name.replace(/\b(Sàrl|SA|Sarl|GmbH|AG)\b/gi, ""))}_${period.fileTag}.zip`;
  downloadBlob(blob, zipName);

  // record export, lock expenses
  const ids = list.filter((e) => !e.exported_at).map((e) => e.id);
  const now = new Date().toISOString();
  if (ids.length) await supabase.from("expenses").update({ exported_at: now }).in("id", ids);
  const reexported = list.filter((e) => e.modified_after_export).map((e) => e.id);
  if (reexported.length) await supabase.from("expenses").update({ modified_after_export: false, exported_at: now }).in("id", reexported);
  await supabase.from("exports").insert({
    company_id: company.id,
    period_start: period.start,
    period_end: period.end,
    label: period.label,
    filename: zipName,
    expense_count: list.length,
  });
  return { zipName, count: list.length, issues: issues.length };
}
