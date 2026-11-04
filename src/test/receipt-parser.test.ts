import { describe, it, expect } from "vitest";
import { amountsIn, findDate, parseReceiptText } from "@/lib/receipt-parser";
import { DEFAULT_CATEGORIES } from "@/lib/db";

const today = new Date(2026, 10, 4);
const parse = (t: string, fromOcr = true) => parseReceiptText(t, DEFAULT_CATEGORIES, { fromOcr, today });

describe("lecture des tickets", () => {
  it("restaurant suisse romand avec TVA 8.1 %", () => {
    const r = parse(`RESTAURANT LE LAC
Quai du Mont-Blanc 12
1201 Genève
Table 4    14.10.2026 12:41
2x Plat du jour        49.00
1x Eau minérale         6.50
1x Café                 4.80
TOTAL CHF              60.30
Visa                   60.30
TVA 8.1% incl.          4.52
CHE-123.456.789 MWST
Merci de votre visite`);
    expect(r.expense_date).toBe("2026-10-14");
    expect(r.total_ttc).toBe(60.3);
    expect(r.currency).toBe("CHF");
    expect(r.supplier).toBe("Restaurant Le Lac");
    expect(r.category).toBe("Repas professionnels");
    expect(r.vat_lines).toEqual([{ rate: 8.1, amount: 4.52 }]);
    expect(r.uncertain_fields).not.toContain("total_ttc");
  });

  it("station-service en allemand avec tableau de TVA", () => {
    const r = parse(`AVIA Tankstelle Zürich
Datum: 03.11.26  Zeit 07:55
Bleifrei 95   42.31 L x 1.92
Total CHF 81.24
MWST  Satz   Netto   MWST   Brutto
A     8.1%   75.15   6.09   81.24
Karte Mastercard`);
    expect(r.expense_date).toBe("2026-11-03");
    expect(r.total_ttc).toBe(81.24);
    expect(r.category).toBe("Carburant");
    expect(r.vat_lines).toEqual([{ rate: 8.1, amount: 6.09 }]);
    expect(r.amount_ht).toBe(75.15);
  });

  it("facture française en euros, plusieurs taux", () => {
    const r = parse(
      `Hôtel des Arts
Facture n° 2026-118
Date : 21 oct. 2026
Nuitée chambre double      120,00
Petit-déjeuner              18,00
Total HT                  127,73
TVA 10%  sur 109,09         10,91
TVA 5,5% sur 18,64           1,03
Total TTC                 € 139,67`,
      false,
    );
    expect(r.expense_date).toBe("2026-10-21");
    expect(r.currency).toBe("EUR");
    expect(r.total_ttc).toBe(139.67);
    expect(r.category).toBe("Hébergement et hôtels");
    expect(r.vat_lines).toEqual([
      { rate: 10, amount: 10.91 },
      { rate: 5.5, amount: 1.03 },
    ]);
    expect(r.amount_ht).toBe(127.73);
    expect(r.uncertain_fields).not.toContain("supplier");
  });

  it("ticket illisible : rien n'est inventé", () => {
    const r = parse("~~ ,, ..");
    expect(r.readable).toBe(false);
    expect(r.total_ttc).toBeNull();
    expect(r.expense_date).toBeNull();
    expect(r.uncertain_fields).toEqual(expect.arrayContaining(["expense_date", "total_ttc"]));
  });

  it("sans mot « total » : montant proposé mais à vérifier", () => {
    const r = parse(`Parking Plainpalais
15.10.2026
Durée 2h15
CHF 7.50`);
    expect(r.total_ttc).toBe(7.5);
    expect(r.category).toBe("Parking");
    expect(r.uncertain_fields).toContain("total_ttc");
  });

  it("les dates ne sont pas prises pour des montants", () => {
    expect(amountsIn("Datum 14.10.2026")).toEqual([]);
    expect(amountsIn("Total 1'250.50")).toEqual([1250.5]);
    expect(amountsIn("Montant 12,40")).toEqual([12.4]);
  });

  it("date future ou absurde ignorée", () => {
    expect(findDate("Le 31.12.2031", today)).toBeNull();
    expect(findDate("Le 31.02.2026", today)).toBeNull();
    expect(findDate("2026-10-01", today)).toBe("2026-10-01");
  });
});
