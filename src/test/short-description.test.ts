import { describe, it, expect } from "vitest";
import { shortDescription } from "@/lib/export";

describe("libellé court export", () => {
  it("repas professionnel → Lunch", () => expect(shortDescription("Repas professionnels", "2x menu du jour, café")).toBe("Lunch"));
  it("carburant → Essence", () => expect(shortDescription("Carburant", "Sans plomb 95 42.1 L")).toBe("Essence"));
});
