/**
 * Stockage local sur l'appareil (IndexedDB). Remplace l'ancienne base Lovable Cloud :
 * aucune donnée ne quitte le téléphone, aucun compte n'est nécessaire.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type Company = { id: string; name: string; next_seq: number; created_at: string };
export type Category = { id: string; company_id: string; name: string; is_default: boolean; created_at: string };
export type VatLine = { id: string; expense_id: string; rate: number | null; amount: number | null; created_at: string };
export type Receipt = {
  id: string;
  company_id: string;
  expense_id: string;
  path: string;
  filename: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  phash: string | null;
  created_at: string;
};
export type Expense = {
  id: string;
  company_id: string;
  seq: number | null;
  ref: string | null;
  expense_date: string | null;
  supplier: string | null;
  description: string | null;
  total_ttc: number | null;
  currency: string;
  amount_ht: number | null;
  chf_amount: number | null;
  category_id: string | null;
  payment_method: string;
  personal_advance: boolean;
  comment: string | null;
  status: string;
  missing_fields: string[];
  exported_at: string | null;
  modified_after_export: boolean;
  created_at: string;
  updated_at: string;
};
export type HistoryEntry = { id: string; expense_id: string; action: "creation" | "modification"; changes: Record<string, unknown> | null; created_at: string };
export type ExportEntry = { id: string; company_id: string; period_start: string; period_end: string; label: string; filename: string; expense_count: number; created_at: string };
export type PeriodStatus = { company_id: string; month: string; status: string; updated_at: string };
type StoredFile = { id: string; data: ArrayBuffer; type: string };

interface FraisDB extends DBSchema {
  companies: { key: string; value: Company };
  categories: { key: string; value: Category; indexes: { by_company: string } };
  expenses: { key: string; value: Expense; indexes: { by_company: string } };
  vat_lines: { key: string; value: VatLine; indexes: { by_expense: string } };
  receipts: { key: string; value: Receipt; indexes: { by_expense: string; by_company: string } };
  files: { key: string; value: StoredFile };
  history: { key: string; value: HistoryEntry; indexes: { by_expense: string } };
  exports: { key: string; value: ExportEntry; indexes: { by_company: string } };
  period_status: { key: [string, string]; value: PeriodStatus; indexes: { by_company: string } };
}

export const DEFAULT_CATEGORIES = [
  "Repas professionnels", "Carburant", "Parking", "Transports et déplacements", "Hébergement et hôtels",
  "Marketing et publicité", "Informatique et logiciels", "Télécommunications", "Fournitures de bureau",
  "Matériel professionnel", "Formation", "Frais de représentation", "Frais bancaires",
  "Vêtements professionnels", "Entretien et réparations", "Autres dépenses",
];
const DEFAULT_COMPANIES = ["Perenity Finance Sàrl", "Provini Properties Sàrl", "ProVini Living"];

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();

const ls = {
  get: (k: string) => { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
  set: (k: string, v: string) => { try { globalThis.localStorage?.setItem(k, v); } catch { /* ignore */ } },
};

let dbPromise: Promise<IDBPDatabase<FraisDB>> | null = null;

export function db(): Promise<IDBPDatabase<FraisDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FraisDB>("mes-frais-pro", 1, {
      upgrade(d) {
        d.createObjectStore("companies", { keyPath: "id" });
        d.createObjectStore("categories", { keyPath: "id" }).createIndex("by_company", "company_id");
        d.createObjectStore("expenses", { keyPath: "id" }).createIndex("by_company", "company_id");
        d.createObjectStore("vat_lines", { keyPath: "id" }).createIndex("by_expense", "expense_id");
        const r = d.createObjectStore("receipts", { keyPath: "id" });
        r.createIndex("by_expense", "expense_id");
        r.createIndex("by_company", "company_id");
        d.createObjectStore("files", { keyPath: "id" });
        d.createObjectStore("history", { keyPath: "id" }).createIndex("by_expense", "expense_id");
        d.createObjectStore("exports", { keyPath: "id" }).createIndex("by_company", "company_id");
        d.createObjectStore("period_status", { keyPath: ["company_id", "month"] }).createIndex("by_company", "company_id");
      },
    }).then(async (d) => {
      // Premier lancement : mêmes sociétés et catégories que l'application d'origine.
      if ((await d.count("companies")) === 0 && ls.get("mfp.seeded") !== "1") {
        const t0 = Date.now();
        for (const [i, name] of DEFAULT_COMPANIES.entries()) await insertCompany(d, name, new Date(t0 + i).toISOString());
        ls.set("mfp.seeded", "1");
      }
      return d;
    });
  }
  return dbPromise;
}

async function insertCompany(d: IDBPDatabase<FraisDB>, name: string, createdAt = now()): Promise<Company> {
  const c: Company = { id: uid(), name, next_seq: 1, created_at: createdAt };
  const tx = d.transaction(["companies", "categories"], "readwrite");
  await tx.objectStore("companies").put(c);
  for (const n of DEFAULT_CATEGORIES) {
    await tx.objectStore("categories").put({ id: uid(), company_id: c.id, name: n, is_default: true, created_at: now() });
  }
  await tx.done;
  return c;
}

/* ---------- Sociétés et catégories ---------- */

export async function listCompanies(): Promise<Company[]> {
  const all = await (await db()).getAll("companies");
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export async function createCompany(name: string): Promise<Company> {
  return insertCompany(await db(), name);
}

export async function renameCompany(id: string, name: string) {
  const d = await db();
  const c = await d.get("companies", id);
  if (c) await d.put("companies", { ...c, name });
}

export async function countExpenses(companyId: string): Promise<number> {
  return (await db()).countFromIndex("expenses", "by_company", companyId);
}

export async function deleteCompany(id: string) {
  const d = await db();
  if (await countExpenses(id)) throw new Error("Cette société contient des dépenses.");
  const tx = d.transaction(["companies", "categories", "exports", "period_status"], "readwrite");
  for (const c of await tx.objectStore("categories").index("by_company").getAll(id)) await tx.objectStore("categories").delete(c.id);
  for (const x of await tx.objectStore("exports").index("by_company").getAll(id)) await tx.objectStore("exports").delete(x.id);
  for (const p of await tx.objectStore("period_status").index("by_company").getAll(id)) await tx.objectStore("period_status").delete([p.company_id, p.month]);
  await tx.objectStore("companies").delete(id);
  await tx.done;
}

export async function listCategories(companyId: string): Promise<Category[]> {
  const all = await (await db()).getAllFromIndex("categories", "by_company", companyId);
  return all.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function createCategory(companyId: string, name: string): Promise<Category> {
  const existing = await listCategories(companyId);
  if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error("Cette catégorie existe déjà.");
  const c: Category = { id: uid(), company_id: companyId, name, is_default: false, created_at: now() };
  await (await db()).put("categories", c);
  return c;
}

export async function deleteCategory(id: string) {
  const d = await db();
  const tx = d.transaction(["categories", "expenses"], "readwrite");
  const cat = await tx.objectStore("categories").get(id);
  if (cat) {
    for (const e of await tx.objectStore("expenses").index("by_company").getAll(cat.company_id)) {
      if (e.category_id === id) await tx.objectStore("expenses").put({ ...e, category_id: null });
    }
    await tx.objectStore("categories").delete(id);
  }
  await tx.done;
}

/* ---------- Dépenses ---------- */

export type ExpenseInput = Pick<
  Expense,
  "expense_date" | "supplier" | "description" | "total_ttc" | "currency" | "amount_ht" | "chf_amount" | "category_id" | "payment_method" | "personal_advance" | "comment"
> & Partial<Pick<Expense, "missing_fields" | "status">>;

export async function getExpenseRows(companyId: string): Promise<Expense[]> {
  return (await db()).getAllFromIndex("expenses", "by_company", companyId);
}

export async function getExpenseRow(id: string): Promise<Expense | undefined> {
  return (await db()).get("expenses", id);
}

export async function vatLinesOf(expenseId: string): Promise<VatLine[]> {
  return (await db()).getAllFromIndex("vat_lines", "by_expense", expenseId);
}

export async function receiptsOf(expenseId: string): Promise<Receipt[]> {
  const r = await (await db()).getAllFromIndex("receipts", "by_expense", expenseId);
  return r.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function categoryById(id: string | null): Promise<Category | undefined> {
  if (!id) return undefined;
  return (await db()).get("categories", id);
}

export async function insertExpense(companyId: string, row: ExpenseInput, vat: { rate: number | null; amount: number | null }[]): Promise<Expense> {
  const d = await db();
  const tx = d.transaction(["companies", "expenses", "vat_lines", "history", "categories"], "readwrite");
  const company = await tx.objectStore("companies").get(companyId);
  if (!company) throw new Error("Société invalide");
  if (row.category_id) {
    const cat = await tx.objectStore("categories").get(row.category_id);
    if (!cat || cat.company_id !== companyId) throw new Error("Catégorie invalide pour cette société");
  }
  const seq = company.next_seq;
  await tx.objectStore("companies").put({ ...company, next_seq: seq + 1 });
  const t = now();
  const e: Expense = {
    id: uid(),
    company_id: companyId,
    seq,
    ref: `DEP-${String(seq).padStart(4, "0")}`,
    status: "a_valider",
    missing_fields: [],
    exported_at: null,
    modified_after_export: false,
    created_at: t,
    updated_at: t,
    ...row,
  };
  await tx.objectStore("expenses").put(e);
  for (const l of vat) await tx.objectStore("vat_lines").put({ id: uid(), expense_id: e.id, rate: l.rate, amount: l.amount, created_at: t });
  await tx.objectStore("history").put({ id: uid(), expense_id: e.id, action: "creation", changes: { ...e }, created_at: t });
  await tx.done;
  return e;
}

const IGNORED_DIFF = new Set(["updated_at", "modified_after_export", "exported_at"]);

/** Met à jour une dépense en gardant l'historique et le marquage « modifiée après export ». */
export async function updateExpense(id: string, patch: Partial<Expense>, vat?: { rate: number | null; amount: number | null }[]) {
  const d = await db();
  const tx = d.transaction(["expenses", "vat_lines", "history", "categories"], "readwrite");
  const old = await tx.objectStore("expenses").get(id);
  if (!old) throw new Error("Dépense introuvable");
  if (patch.category_id) {
    const cat = await tx.objectStore("categories").get(patch.category_id);
    if (!cat || cat.company_id !== old.company_id) throw new Error("Catégorie invalide pour cette société");
  }
  const next: Expense = { ...old, ...patch, id: old.id, seq: old.seq, ref: old.ref, company_id: old.company_id, updated_at: now() };
  const diff: Record<string, unknown> = {};
  for (const k of Object.keys(next) as (keyof Expense)[]) {
    if (IGNORED_DIFF.has(k)) continue;
    if (JSON.stringify(old[k] ?? null) !== JSON.stringify(next[k] ?? null)) diff[k] = { avant: old[k] ?? null, apres: next[k] ?? null };
  }
  if (vat) {
    const oldVat = await tx.objectStore("vat_lines").index("by_expense").getAll(id);
    const a = JSON.stringify(oldVat.map((l) => [l.rate, l.amount]));
    const b = JSON.stringify(vat.map((l) => [l.rate, l.amount]));
    if (a !== b) diff.vat_lines = { avant: JSON.parse(a), apres: JSON.parse(b) };
    for (const l of oldVat) await tx.objectStore("vat_lines").delete(l.id);
    for (const l of vat) await tx.objectStore("vat_lines").put({ id: uid(), expense_id: id, rate: l.rate, amount: l.amount, created_at: now() });
  }
  if (Object.keys(diff).length) {
    if (old.exported_at && next.exported_at === old.exported_at) next.modified_after_export = true;
    await tx.objectStore("history").put({ id: uid(), expense_id: id, action: "modification", changes: diff, created_at: now() });
  }
  await tx.objectStore("expenses").put(next);
  await tx.done;
  return next;
}

/** Marquage d'export : ne crée pas d'entrée d'historique (comme l'ancien déclencheur). */
export async function setExportFlags(ids: string[], flags: Partial<Pick<Expense, "exported_at" | "modified_after_export">>) {
  const d = await db();
  const tx = d.transaction("expenses", "readwrite");
  for (const id of ids) {
    const e = await tx.store.get(id);
    if (e) await tx.store.put({ ...e, ...flags });
  }
  await tx.done;
}

export async function deleteExpense(id: string) {
  const d = await db();
  const tx = d.transaction(["expenses", "vat_lines", "receipts", "files", "history"], "readwrite");
  const e = await tx.objectStore("expenses").get(id);
  if (!e) return;
  if (e.exported_at) throw new Error("Dépense déjà exportée : suppression interdite");
  for (const l of await tx.objectStore("vat_lines").index("by_expense").getAll(id)) await tx.objectStore("vat_lines").delete(l.id);
  for (const r of await tx.objectStore("receipts").index("by_expense").getAll(id)) {
    await tx.objectStore("files").delete(r.id);
    await tx.objectStore("receipts").delete(r.id);
  }
  for (const h of await tx.objectStore("history").index("by_expense").getAll(id)) await tx.objectStore("history").delete(h.id);
  await tx.objectStore("expenses").delete(id);
  await tx.done;
}

export async function historyOf(expenseId: string): Promise<HistoryEntry[]> {
  const h = await (await db()).getAllFromIndex("history", "by_expense", expenseId);
  return h.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/* ---------- Justificatifs ---------- */

export async function addReceipt(meta: Omit<Receipt, "id" | "path" | "created_at">, file: Blob): Promise<Receipt> {
  const id = uid();
  const r: Receipt = { ...meta, id, path: id, created_at: now() };
  const data = await file.arrayBuffer();
  const d = await db();
  const tx = d.transaction(["receipts", "files"], "readwrite");
  await tx.objectStore("files").put({ id, data, type: meta.mime });
  await tx.objectStore("receipts").put(r);
  await tx.done;
  return r;
}

export async function receiptBlob(id: string): Promise<Blob> {
  const f = await (await db()).get("files", id);
  if (!f) throw new Error("Justificatif introuvable sur cet appareil");
  return new Blob([f.data], { type: f.type });
}

/* ---------- Exports et statuts de période ---------- */

export async function listExports(companyId: string): Promise<ExportEntry[]> {
  const x = await (await db()).getAllFromIndex("exports", "by_company", companyId);
  return x.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addExport(x: Omit<ExportEntry, "id" | "created_at">) {
  await (await db()).put("exports", { ...x, id: uid(), created_at: now() });
}

export async function listPeriodStatus(companyId: string): Promise<PeriodStatus[]> {
  return (await db()).getAllFromIndex("period_status", "by_company", companyId);
}

export async function setPeriodStatus(companyId: string, month: string, status: string) {
  await (await db()).put("period_status", { company_id: companyId, month, status, updated_at: now() });
}

/* ---------- Sauvegarde / restauration ---------- */

const STORES = ["companies", "categories", "expenses", "vat_lines", "receipts", "history", "exports", "period_status"] as const;

/** Fichier ZIP contenant toutes les données (data.json) et tous les justificatifs (files/). */
export async function exportBackup(): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const d = await db();
  const zip = new JSZip();
  const data: Record<string, unknown[]> = {};
  for (const s of STORES) data[s] = await d.getAll(s);
  zip.file("data.json", JSON.stringify({ app: "mes-frais-pro", version: 1, created_at: now(), data }, null, 1));
  const files = zip.folder("files")!;
  for (const r of data.receipts as Receipt[]) {
    const f = await d.get("files", r.id);
    if (f) files.file(r.id, f.data);
  }
  return zip.generateAsync({ type: "uint8array", compression: "STORE" }).then((u) => new Blob([u as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
}

/** Remplace toutes les données de l'appareil par celles de la sauvegarde. */
export async function importBackup(file: Blob): Promise<{ expenses: number; receipts: number }> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const json = await zip.file("data.json")?.async("string");
  if (!json) throw new Error("Fichier de sauvegarde invalide (data.json manquant).");
  const parsed = JSON.parse(json) as { app?: string; data?: Record<string, unknown[]> };
  if (parsed.app !== "mes-frais-pro" || !parsed.data) throw new Error("Ce fichier n'est pas une sauvegarde Mes Frais Pro.");
  const fileData: StoredFile[] = [];
  for (const r of (parsed.data.receipts ?? []) as Receipt[]) {
    const f = zip.file(`files/${r.id}`);
    if (f) fileData.push({ id: r.id, data: await f.async("arraybuffer"), type: r.mime });
  }
  const d = await db();
  const tx = d.transaction([...STORES, "files"], "readwrite");
  for (const s of [...STORES, "files"] as const) await tx.objectStore(s).clear();
  for (const s of STORES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of parsed.data[s] ?? []) await tx.objectStore(s).put(row as any);
  }
  for (const f of fileData) await tx.objectStore("files").put(f);
  await tx.done;
  return { expenses: (parsed.data.expenses ?? []).length, receipts: fileData.length };
}
