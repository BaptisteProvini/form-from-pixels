import { describe, it, expect } from "vitest";
import { formatAmount, formatDate, slugify } from "@/lib/format";

describe("formats suisses", () => {
  it("montant CHF avec apostrophe", () => {
    expect(formatAmount(1250.5)).toBe("CHF 1’250.50");
  });
  it("devise étrangère", () => {
    expect(formatAmount(1234567.891, "EUR")).toBe("EUR 1’234’567.89");
  });
  it("date JJ.MM.AAAA", () => {
    expect(formatDate("2026-10-03")).toBe("03.10.2026");
  });
  it("nom de fichier", () => {
    expect(slugify("Publicité Meta")).toBe("Publicite_Meta");
  });
});
