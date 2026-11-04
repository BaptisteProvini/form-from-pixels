// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  addReceipt, deleteExpense, exportBackup, historyOf, importBackup, insertExpense,
  listCategories, listCompanies, receiptBlob, setExportFlags, updateExpense,
} from "@/lib/db";
import { fetchExpense, fetchExpenses } from "@/lib/data";

const row = {
  expense_date: "2026-10-14", supplier: "Le Lac", description: null, total_ttc: 60.3, currency: "CHF",
  amount_ht: null, chf_amount: null, category_id: null, payment_method: "carte_pro", personal_advance: false, comment: null,
};

describe("stockage sur l'appareil", () => {
  it("crée les sociétés et catégories d'origine au premier lancement", async () => {
    const cos = await listCompanies();
    expect(cos.map((c) => c.name)).toEqual(["Perenity Finance Sàrl", "Provini Properties Sàrl", "ProVini Living"]);
    expect((await listCategories(cos[0].id)).length).toBe(16);
  });

  it("numérote, historise et verrouille après export", async () => {
    const [co] = await listCompanies();
    const a = await insertExpense(co.id, row, [{ rate: 8.1, amount: 4.52 }]);
    const b = await insertExpense(co.id, { ...row, total_ttc: 12 }, []);
    expect([a.ref, b.ref]).toEqual(["DEP-0001", "DEP-0002"]);

    await updateExpense(a.id, { supplier: "Restaurant Le Lac" });
    const h = await historyOf(a.id);
    expect(h[0].action).toBe("modification");
    expect(Object.keys(h[0].changes!)).toEqual(["supplier"]);

    await setExportFlags([a.id], { exported_at: new Date().toISOString() });
    await updateExpense(a.id, { total_ttc: 61 });
    expect((await fetchExpense(a.id)).modified_after_export).toBe(true);
    await expect(deleteExpense(a.id)).rejects.toThrow(/exportée/);

    const full = await fetchExpense(a.id);
    expect(full.vat_lines.map((l) => l.rate)).toEqual([8.1]);
  });

  it("sauvegarde puis restaure données et justificatifs", async () => {
    const [co] = await listCompanies();
    const [e] = await fetchExpenses(co.id);
    const r = await addReceipt(
      { company_id: co.id, expense_id: e.id, filename: "t.jpg", mime: "image/jpeg", size_bytes: 3, sha256: "x", phash: null },
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    );
    const zip = await exportBackup();
    await deleteExpense(e.id).catch(() => {});
    const res = await importBackup(zip);
    expect(res.expenses).toBe(2);
    expect(res.receipts).toBe(1);
    expect(new Uint8Array(await (await receiptBlob(r.id)).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
