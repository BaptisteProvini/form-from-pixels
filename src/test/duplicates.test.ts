import { describe, it, expect } from "vitest";
import { duplicateReasons, type DupCandidate } from "@/lib/duplicates";

const base: DupCandidate = { id: "a", expense_date: "2026-10-03", supplier: "Restaurant Le Lac", total_ttc: 64.5, currency: "CHF" };

describe("détection des doublons", () => {
  it("montant légèrement différent, même fournisseur et jour", () => {
    expect(duplicateReasons(base, { ...base, id: "b", total_ttc: 65 }).length).toBeGreaterThan(0);
  });
  it("date décalée de 2 jours, nom écrit différemment", () => {
    expect(duplicateReasons(base, { ...base, id: "b", supplier: "LE LAC SA", expense_date: "2026-10-05" }).length).toBeGreaterThan(0);
  });
  it("fichiers différents mais image ressemblante", () => {
    const r = duplicateReasons({ ...base, phashes: ["ffff0000ffff0000"] }, { ...base, id: "b", supplier: "Autre", total_ttc: 10, phashes: ["ffff0000ffff0003"] });
    expect(r).toContain("Image très ressemblante");
  });
  it("fournisseur et montant différents : pas un doublon", () => {
    expect(duplicateReasons(base, { ...base, id: "b", supplier: "Migros", total_ttc: 120 })).toEqual([]);
  });
  it("même fournisseur mais 10 jours d'écart : pas un doublon", () => {
    expect(duplicateReasons(base, { ...base, id: "b", expense_date: "2026-10-13" })).toEqual([]);
  });
});
