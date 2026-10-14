import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { imageDHash, sha256Hex } from "./files";
import { findDuplicates, duplicateReasons, type DupCandidate } from "./duplicates";

export type Company = Tables<"companies">;
export type Category = Tables<"categories">;
export type Expense = Tables<"expenses">;
export type VatLine = Tables<"vat_lines">;
export type Receipt = Tables<"receipts">;

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
};

export async function fetchCompanies(): Promise<Company[]> {
  const { data, error } = await supabase.from("companies").select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function fetchCategories(companyId: string): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").eq("company_id", companyId).order("name");
  if (error) throw error;
  return data;
}

export async function fetchExpenses(companyId: string, range?: { start: string; end: string }): Promise<ExpenseFull[]> {
  let q = supabase
    .from("expenses")
    .select("*, vat_lines(*), receipts(*), categories(name)")
    .eq("company_id", companyId)
    .order("expense_date", { ascending: false, nullsFirst: true })
    .order("seq", { ascending: false })
    .limit(2000);
  if (range) q = q.gte("expense_date", range.start).lte("expense_date", range.end);
  const { data, error } = await q;
  if (error) throw error;
  return data as unknown as ExpenseFull[];
}

export async function fetchExpense(id: string): Promise<ExpenseFull> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*, vat_lines(*), receipts(*), categories(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as ExpenseFull;
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

export async function uploadReceipts(params: { userId: string; companyId: string; expenseId: string; files: File[] }) {
  for (const file of params.files) {
    const sha = await sha256Hex(file);
    const phash = await imageDHash(file);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "justificatif";
    const path = `${params.userId}/${params.companyId}/${params.expenseId}/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await supabase.storage.from("receipts").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) throw upErr;
    const { error } = await supabase.from("receipts").insert({
      company_id: params.companyId,
      expense_id: params.expenseId,
      path,
      filename: file.name || safe,
      mime: file.type || "application/octet-stream",
      size_bytes: file.size,
      sha256: sha,
      phash,
    });
    if (error) throw error;
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
