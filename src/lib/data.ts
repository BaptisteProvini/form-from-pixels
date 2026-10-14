import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { sha256Hex } from "./files";

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
    });
    if (error) throw error;
  }
}

/** Returns refs of expenses in this company already holding an identical file. */
export async function findDuplicateFiles(companyId: string, files: File[], excludeExpenseId?: string) {
  const hashes = await Promise.all(files.map(sha256Hex));
  if (!hashes.length) return [];
  const { data } = await supabase
    .from("receipts")
    .select("expense_id, sha256, expenses(ref)")
    .eq("company_id", companyId)
    .in("sha256", hashes);
  return (data ?? [])
    .filter((r) => r.expense_id !== excludeExpenseId)
    .map((r) => (r as unknown as { expenses: { ref: string } | null }).expenses?.ref ?? "?");
}

export async function findSimilarExpenses(
  companyId: string,
  e: { expense_date: string | null; total_ttc: number | null },
  excludeId?: string,
) {
  if (!e.expense_date || e.total_ttc == null) return [];
  const { data } = await supabase
    .from("expenses")
    .select("id, ref, supplier")
    .eq("company_id", companyId)
    .eq("expense_date", e.expense_date)
    .eq("total_ttc", e.total_ttc);
  return (data ?? []).filter((d) => d.id !== excludeId);
}

/** Duplicate detection within a list (same date + amount, or same file hash). */
export function duplicateIds(list: ExpenseFull[]): Set<string> {
  const ids = new Set<string>();
  const byKey = new Map<string, string>();
  const byHash = new Map<string, string>();
  for (const e of list) {
    if (e.expense_date && e.total_ttc != null) {
      const k = `${e.expense_date}|${Number(e.total_ttc).toFixed(2)}|${e.currency}`;
      const prev = byKey.get(k);
      if (prev) { ids.add(prev); ids.add(e.id); } else byKey.set(k, e.id);
    }
    for (const r of e.receipts) {
      const prev = byHash.get(r.sha256);
      if (prev && prev !== e.id) { ids.add(prev); ids.add(e.id); } else byHash.set(r.sha256, e.id);
    }
  }
  return ids;
}
