import { supabase } from "@/integrations/supabase/client";
import { duplicateMap, fetchExpenses, FIELD_LABELS, type Company } from "./data";
import { MONTHS_FR, formatAmount, formatDate, slugify } from "./format";
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

export type ExportResult = { blob: Blob; zipName: string; count: number; issues: number };

/** Builds the single PDF report (summary + control points + receipts) without downloading it. */
export async function generateExportBlob(company: Company, period: Period, onProgress?: (msg: string) => void): Promise<ExportResult> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  onProgress?.("Lecture des dépenses…");
  const all = await fetchExpenses(company.id, period);
  const { data: undated } = await supabase.from("expenses").select("ref").eq("company_id", company.id).is("expense_date", null);
  const dups = duplicateMap(all);
  const labelOf = (e: (typeof all)[number]) => shortDescription(e.categories?.name, e.description) || "Autres";
  // Tri par catégorie, puis par date
  const list = [...all].sort((a, b) => labelOf(a).localeCompare(labelOf(b), "fr") || (a.expense_date ?? "").localeCompare(b.expense_date ?? "") || (a.seq ?? 0) - (b.seq ?? 0));
  const num = new Map(list.map((e, k) => [e.id, k + 1]));

  // Téléchargement des justificatifs (une seule fois)
  const files: { e: (typeof list)[number]; data: Blob; isPdf: boolean; part: string }[] = [];
  let i = 0;
  for (const e of list) {
    for (const [k, r] of e.receipts.entries()) {
      i++;
      onProgress?.(`Justificatif ${i}…`);
      const { data, error } = await supabase.storage.from("receipts").download(r.path);
      if (error || !data) throw new Error(`Téléchargement impossible : ${r.filename}`);
      const mime = r.mime || data.type || "";
      files.push({ e, data, isPdf: mime.includes("pdf") || /\.pdf$/i.test(r.filename), part: e.receipts.length > 1 ? ` (${k + 1}/${e.receipts.length})` : "" });
    }
  }

  // Points de contrôle
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

  const vatOf = (e: (typeof list)[number]) => (e.vat_lines.length ? Math.round(e.vat_lines.reduce((s, l) => s + Number(l.amount ?? 0), 0) * 100) / 100 : null);
  const chfOf = (e: (typeof list)[number]) => (e.chf_amount != null ? Number(e.chf_amount) : e.currency === "CHF" && e.total_ttc != null ? Number(e.total_ttc) : 0);
  const safe = (t: string) => t.replace(/[\u202F\u00A0]/g, " ").replace(/[^\x20-\x7E\u00A0-\u00FF\u2019\u2013\u2014\u20AC\u00B7]/g, "");

  const build = async (maxSide: number, quality: number) => {
    const doc = await PDFDocument.create();
    doc.setTitle(`Rapport de frais ${company.name} ${period.label}`);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.106, 0.165, 0.29), grey = rgb(0.42, 0.45, 0.5), green = rgb(0.13, 0.55, 0.36), line = rgb(0.85, 0.87, 0.9);
    const W = 595.28, H = 841.89, M = 40;
    let page = doc.addPage([W, H]);
    let y = H - M;
    const text = (t: string, x: number, size = 9, f = font, color = navy, maxW?: number) => {
      let s = safe(t);
      if (maxW) while (s.length > 1 && f.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -2) + "…";
      page.drawText(s, { x, y, size, font: f, color });
    };
    const right = (t: string, xr: number, size = 9, f = font, color = navy) => { const s = safe(t); page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y, size, font: f, color }); };
    const need = (h: number) => { if (y - h < M) { page = doc.addPage([W, H]); y = H - M; } };
    const cols = { n: M, date: M + 22, sup: M + 82, desc: M + 222, ht: M + 365, tva: M + 435, ttc: W - M };
    const header = () => {
      need(30);
      text("N°", cols.n, 8, bold, grey); text("DATE", cols.date, 8, bold, grey); text("FOURNISSEUR", cols.sup, 8, bold, grey); text("DESCRIPTION", cols.desc, 8, bold, grey);
      right("HORS TVA", cols.ht, 8, bold, grey); right("TVA", cols.tva, 8, bold, grey); right("TOTAL", cols.ttc, 8, bold, grey);
      y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line }); y -= 13;
    };

    const grand = list.reduce((s, e) => s + chfOf(e), 0);
    text("Rapport de frais", M, 20, bold); right(formatAmount(grand), W - M, 16, bold, green); y -= 22;
    text(company.name, M, 11, font); y -= 15;
    text(`Période : ${period.label} (${formatDate(period.start)} – ${formatDate(period.end)})`, M, 9, font, grey); y -= 12;
    text(`Généré le ${formatDate(new Date().toISOString())} · ${list.length} dépense(s) · ${files.length} justificatif(s)`, M, 9, font, grey); y -= 26;

    const groups = new Map<string, typeof list>();
    for (const e of list) { const g = labelOf(e); groups.set(g, [...(groups.get(g) ?? []), e]); }
    for (const [g, items] of groups) {
      need(60);
      const sub = items.reduce((s, e) => s + chfOf(e), 0);
      text(`${g} — ${formatAmount(sub)}`, M, 12, bold); y -= 16;
      header();
      for (const e of items) {
        need(16);
        const cur = e.currency;
        text(String(num.get(e.id)), cols.n, 9, bold);
        text(formatDate(e.expense_date), cols.date);
        text(e.supplier || "—", cols.sup, 9, font, navy, 135);
        text(g, cols.desc, 9, font, navy, 80);
        right(e.amount_ht != null ? formatAmount(Number(e.amount_ht), cur) : "—", cols.ht);
        right(vatOf(e) != null ? formatAmount(vatOf(e), cur) : "—", cols.tva);
        right(e.total_ttc != null ? formatAmount(Number(e.total_ttc), cur) : "—", cols.ttc, 9, bold);
        y -= 5; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.3, color: line }); y -= 11;
      }
      const sHt = items.reduce((s, e) => s + Number(e.amount_ht ?? 0), 0), sVat = items.reduce((s, e) => s + (vatOf(e) ?? 0), 0);
      right(formatAmount(sHt), cols.ht, 9, bold); right(formatAmount(sVat), cols.tva, 9, bold); right(formatAmount(sub), cols.ttc, 9, bold);
      y -= 26;
    }
    if (!list.length) { text("Aucune dépense sur cette période.", M, 10, font, grey); y -= 20; }

    need(50);
    text("Points de contrôle", M, 12, bold); y -= 16;
    if (!issues.length) { text("Aucune anomalie détectée.", M, 9, font, grey); y -= 14; }
    for (const r of issues) { need(14); text(`${r[0]} : ${r[1]}${r[2] ? ` (${r[2]})` : ""}`, M, 9, font, navy, W - 2 * M); y -= 13; }
    y -= 10; need(14);
    text("Ce document prépare la comptabilité ; il ne constitue pas une décision fiscale.", M, 8, font, grey);

    // Justificatifs en fin de document
    for (const [n, f] of files.entries()) {
      onProgress?.(`Ajout des justificatifs ${n + 1}/${files.length}…`);
      const caption = `Justificatif n° ${num.get(f.e.id)}${f.part} · ${f.e.ref} · ${f.e.supplier ?? ""} · ${formatDate(f.e.expense_date)} · ${f.e.total_ttc != null ? formatAmount(Number(f.e.total_ttc), f.e.currency) : ""}`;
      if (f.isPdf) {
        try {
          const src = await PDFDocument.load(await f.data.arrayBuffer(), { ignoreEncryption: true });
          const pages = await doc.copyPages(src, src.getPageIndices());
          pages.forEach((p, k) => {
            doc.addPage(p);
            if (k === 0) p.drawText(safe(caption), { x: 20, y: 12, size: 8, font: bold, color: navy });
          });
          continue;
        } catch { /* PDF illisible : on mentionne seulement */ }
        page = doc.addPage([W, H]); y = H - M; text(caption, M, 10, bold); y -= 16; text("Justificatif PDF non intégrable : disponible dans l'application.", M, 9, font, grey);
        continue;
      }
      const jpg = await shrinkImage(f.data, maxSide, quality, true);
      page = doc.addPage([W, H]); y = H - M;
      text(caption, M, 10, bold, navy, W - 2 * M);
      try {
        const img = await doc.embedJpg(await jpg.arrayBuffer());
        const s = Math.min((W - 2 * M) / img.width, (H - 2 * M - 24) / img.height);
        page.drawImage(img, { x: (W - img.width * s) / 2, y: H - M - 20 - img.height * s, width: img.width * s, height: img.height * s });
      } catch { y -= 16; text("Image non lisible : disponible dans l'application.", M, 9, font, grey); }
    }
    return new Blob([await doc.save()], { type: "application/pdf" });
  };

  let blob = await build(1600, 0.7);
  // Viser moins de 10 Mo pour l'envoi par e-mail
  for (const [side, q] of [[1200, 0.55], [900, 0.45], [700, 0.4]] as const) {
    if (blob.size <= 9.5 * 1024 * 1024 || !files.some((f) => !f.isPdf)) break;
    blob = await build(side, q);
  }
  const zipName = `Rapport_frais_${slugify(company.name.replace(/\b(Sàrl|SA|Sarl|GmbH|AG)\b/gi, ""))}_${period.fileTag}.pdf`;

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
  return { blob, zipName, count: list.length, issues: issues.length };
}

/** Builds the ZIP and saves it to the device's downloads. */
export async function generateExport(company: Company, period: Period, onProgress?: (msg: string) => void) {
  const r = await generateExportBlob(company, period, onProgress);
  downloadBlob(r.blob, r.zipName);
  return { zipName: r.zipName, count: r.count, issues: r.issues };
}

/** Libellé court par catégorie (ex. « Lunch », « Essence ») au lieu du détail du ticket. */
const SHORT_LABELS: Record<string, string> = {
  "Repas professionnels": "Lunch",
  "Carburant": "Essence",
  "Parking": "Parking",
  "Transports et déplacements": "Transport",
  "Hébergement et hôtels": "Hôtel",
  "Marketing et publicité": "Publicité",
  "Informatique et logiciels": "Informatique",
  "Télécommunications": "Téléphone",
  "Fournitures de bureau": "Fournitures",
  "Matériel professionnel": "Matériel",
  "Formation": "Formation",
  "Frais de représentation": "Représentation",
  "Frais bancaires": "Frais bancaires",
  "Vêtements professionnels": "Vêtements",
  "Entretien et réparations": "Entretien",
};

export function shortDescription(category: string | null | undefined, description: string | null | undefined): string {
  if (category && SHORT_LABELS[category]) return SHORT_LABELS[category];
  return category || description || "";
}

async function shrinkImage(data: Blob, maxSide: number, quality: number, forceJpeg = false): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(data);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    return out && (forceJpeg || out.size < data.size) ? out : data;
  } catch {
    return data;
  }
}
