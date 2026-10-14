/** Fuzzy duplicate detection between expenses. Pure functions (tested). */
export type DupCandidate = {
  id: string;
  ref?: string | null;
  expense_date: string | null;
  supplier: string | null;
  total_ttc: number | null;
  currency: string;
  hashes?: string[]; // sha256 of files
  phashes?: string[]; // perceptual hashes of images (hex)
};

export function normalizeSupplier(s: string | null): string[] {
  if (!s) return [];
  const stop = new Set(["sa", "sarl", "sàrl", "ag", "gmbh", "sas", "sarl", "ltd", "inc", "le", "la", "les", "de", "du", "des", "the", "restaurant", "station"]);
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !stop.has(t));
}

export function supplierSimilarity(a: string | null, b: string | null): number {
  const ta = normalizeSupplier(a), tb = normalizeSupplier(b);
  if (!ta.length || !tb.length) return 0;
  const ja = ta.join(""), jb = tb.join("");
  if (ja === jb || ja.includes(jb) || jb.includes(ja)) return 1;
  const sa = new Set(ta), sb = new Set(tb);
  let inter = 0;
  for (const t of sa) if (sb.has(t) || [...sb].some((u) => (u.length >= 4 && t.startsWith(u)) || (t.length >= 4 && u.startsWith(t)))) inter++;
  return inter / Math.min(sa.size, sb.size);
}

export function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/** Amounts close if within max(1 unit, 2 %). */
export function amountsClose(a: number | null, b: number | null, pct = 0.02): boolean {
  if (a == null || b == null) return false;
  const x = Number(a), y = Number(b);
  return Math.abs(x - y) <= Math.max(1, pct * Math.max(Math.abs(x), Math.abs(y)));
}

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let v = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (v) { d += v & 1; v >>= 1; }
  }
  return d;
}

export const PHASH_THRESHOLD = 10;

/** Returns human-readable reasons (French) if a and b look like duplicates, else []. */
export function duplicateReasons(a: DupCandidate, b: DupCandidate): string[] {
  const reasons: string[] = [];
  if (a.hashes?.some((h) => b.hashes?.includes(h))) reasons.push("Fichier identique");
  else if (a.phashes?.some((p) => b.phashes?.some((q) => hamming(p, q) <= PHASH_THRESHOLD))) reasons.push("Image très ressemblante");

  const sameCur = a.currency === b.currency;
  const days = daysBetween(a.expense_date, b.expense_date);
  const sim = supplierSimilarity(a.supplier, b.supplier);
  const exact = sameCur && a.total_ttc != null && b.total_ttc != null && Number(a.total_ttc).toFixed(2) === Number(b.total_ttc).toFixed(2);

  if (exact && days === 0) reasons.push("Même date et même montant");
  else if (sameCur && sim >= 0.5 && days !== null && days <= 3 && amountsClose(a.total_ttc, b.total_ttc)) reasons.push("Même fournisseur, date et montant proches");
  else if (sameCur && sim >= 0.5 && days === 0 && amountsClose(a.total_ttc, b.total_ttc, 0.1)) reasons.push("Même fournisseur le même jour, montant proche");
  else if (exact && sim >= 0.5 && days === null) reasons.push("Même fournisseur et même montant");
  return reasons;
}

/** Map of expense id -> list of { otherId, ref, reasons }. */
export function findDuplicates(list: DupCandidate[]) {
  const out = new Map<string, { id: string; ref: string | null | undefined; reasons: string[] }[]>();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const r = duplicateReasons(a, b);
      if (!r.length) continue;
      out.set(a.id, [...(out.get(a.id) ?? []), { id: b.id, ref: b.ref, reasons: r }]);
      out.set(b.id, [...(out.get(b.id) ?? []), { id: a.id, ref: a.ref, reasons: r }]);
    }
  }
  return out;
}
