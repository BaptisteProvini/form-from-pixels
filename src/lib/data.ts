import {
  addReceipt,
  categoryById,
  getExpenseRow,
  getExpenseRows,
  listCategories,
  listCompanies,
  receiptsOf,
  vatLinesOf,
  type Category,
  type Company,
  type Expense,
  type Receipt,
  type VatLine,
} from "./db";
import { imageDHash, sha256Hex } from "./files";
import { findDuplicates, duplicateReasons, type DupCandidate } from "./duplicates";

export type { Category, Company, Expense, Receipt, VatLine };

export type ExpenseFull = Expense & { vat_lines: VatLine[]; receipts: Receipt[]; categories: { name: string } | null };

export const REQUIRED_FIELDS = ["expense_date", "supplier", "total_ttc", "category_id"] as const;
export const FIELD_LABELS: Record<string, string> = {
  expense_date: "Date",
  supplier: "Fournisseur",
  description: "Description",
  total_ttc: "Montant TTC",
  currency: "Devise",
  amount_ht: "Montant HT",
  vat_lines: "TVA",
  category: "Catégorie",
  category_id: "Catégorie",
  receipt: "Justificatif",
  chf_amount: "Contre-valeur CHF",
  payment_method: "Moyen de paiement",
  personal_advance: "Avance personnelle",
  comment: "Commentaire",
  status: "Statut",
  missing_fields: "Champs manquants",
};

export async function fetchCompanies(): Promise<Company[]> {
  return listCompanies();
}

export async function fetchCategories(companyId: string): Promise<Category[]> {
  return listCategories(companyId);
}

async function withRelations(e: Expense): Promise<ExpenseFull> {
  const [vat_lines, receipts, cat] = await Promise.all([vatLinesOf(e.id), receiptsOf(e.id), categoryById(e.category_id)]);
  return { ...e, vat_lines, receipts, categories: cat ? { name: cat.name } : null };
}

export async function fetchExpenses(companyId: string, range?: { start: string; end: string }): Promise<ExpenseFull[]> {
  let rows = await getExpenseRows(companyId);
  if (range) rows = rows.filter((e) => e.expense_date && e.expense_date >= range.start && e.expense_date <= range.end);
  // Tri : sans date en premier, puis date décroissante, puis numéro décroissant
  rows.sort((a, b) => {
    if (!a.expense_date !== !b.expense_date) return a.expense_date ? 1 : -1;
    return (b.expense_date ?? "").localeCompare(a.expense_date ?? "") || (b.seq ?? 0) - (a.seq ?? 0);
  });
  return Promise.all(rows.slice(0, 2000).map(withRelations));
}

export async function fetchUndated(companyId: string): Promise<{ ref: string | null }[]> {
  return (await getExpenseRows(companyId)).filter((e) => !e.expense_date).map((e) => ({ ref: e.ref }));
}

export async function fetchExpense(id: string): Promise<ExpenseFull> {
  const e = await getExpenseRow(id);
  if (!e) throw new Error("Dépense introuvable");
  return withRelations(e);
}

export function chfValue(e: Pick<Expense, "currency" | "total_ttc" | "chf_amount">): number | null {
  if (e.chf_amount != null) return Number(e.chf_amount);
  if (e.currency === "CHF" && e.total_ttc != null) return Number(e.total_ttc);
  return null;
}

export function computeMissing(e: Partial<Expense>, receiptCount: number): string[] {
  const out: string[] = [];
  for (const f of REQUIRED_FIELDS) if (e[f] === null || e[f] === undefined || e[f] === "") out.push(f);
  if (receiptCount === 0) out.push("receipt");
  return out;
}

export async function uploadReceipts(params: { companyId: string; expenseId: string; files: File[] }) {
  for (const file of params.files) {
    const sha = await sha256Hex(file);
    const phash = await imageDHash(file);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "justificatif";
    await addReceipt(
      {
        company_id: params.companyId,
        expense_id: params.expenseId,
        filename: file.name || safe,
        mime: file.type || "application/octet-stream",
        size_bytes: file.size,
        sha256: sha,
        phash,
      },
      file,
    );
  }
}

export function toCandidate(e: ExpenseFull): DupCandidate {
  return {
    id: e.id, ref: e.ref, expense_date: e.expense_date, supplier: e.supplier,
    total_ttc: e.total_ttc != null ? Number(e.total_ttc) : null, currency: e.currency,
    hashes: e.receipts.map((r) => r.sha256),
    phashes: e.receipts.map((r) => r.phash).filter((p): p is string => !!p),
  };
}

/** Checks a new/edited expense against existing ones of the same company. */
export async function checkDuplicates(
  companyId: string,
  e: { expense_date: string | null; supplier: string | null; total_ttc: number | null; currency: string },
  files: File[],
  excludeId?: string,
): Promise<{ ref: string; reasons: string[] }[]> {
  const hashes = await Promise.all(files.map(sha256Hex));
  const phashes = (await Promise.all(files.map(imageDHash))).filter((p): p is string => !!p);
  const existing = await fetchExpenses(companyId);
  const me: DupCandidate = { id: excludeId ?? "__new__", ...e, hashes, phashes };
  return existing
    .filter((x) => x.id !== excludeId)
    .map((x) => ({ ref: x.ref ?? "?", reasons: duplicateReasons(me, toCandidate(x)) }))
    .filter((r) => r.reasons.length > 0);
}

export function duplicateMap(list: ExpenseFull[]) {
  return findDuplicates(list.map(toCandidate));
}

/** Ids of expenses that look like duplicates of another one in the list. */
export function duplicateIds(list: ExpenseFull[]): Set<string> {
  return new Set(duplicateMap(list).keys());
}
