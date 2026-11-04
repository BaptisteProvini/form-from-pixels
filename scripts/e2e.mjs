// Test de bout en bout dans un vrai navigateur (exécuté par GitHub Actions après la compilation).
// Scanne un ticket photographié, enregistre la dépense, génère le PDF, sauvegarde, vérifie le hors-ligne.
import { chromium } from "playwright";

const BASE = process.env.E2E_URL ?? "http://localhost:4173/form-from-pixels/";
const errors = [];
const log = (...a) => console.log("[e2e]", ...a);
const fail = (msg) => { console.error("[e2e] ÉCHEC :", msg); process.exitCode = 1; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, locale: "fr-CH" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
const external = new Set();
page.on("request", (r) => { const u = new URL(r.url()); if (!["localhost", "127.0.0.1"].includes(u.hostname) && !u.protocol.startsWith("blob") && !u.protocol.startsWith("data")) external.add(u.hostname); });

try {
  // 1. Ouverture
  await page.goto(BASE);
  await page.waitForURL(/#\/accueil/, { timeout: 15000 });
  await page.getByText("Scanner une dépense").first().waitFor({ timeout: 15000 });
  const company = await page.locator("select[aria-label=Société]").inputValue();
  log("accueil OK, société sélectionnée :", Boolean(company));

  // 2. Fabrication d'une photo de ticket dans le navigateur
  const png = await page.evaluate(() => {
    const lines = [
      "RESTAURANT LE LAC", "Quai du Mont-Blanc 12", "1201 Geneve", "",
      "Date 14.10.2026   12:41", "", "2x Plat du jour       49.00", "1x Eau minerale        6.50",
      "1x Cafe                4.80", "", "TOTAL CHF             60.30", "Visa                  60.30", "",
      "TVA 8.1% incl.         4.52", "Merci de votre visite",
    ];
    const c = document.createElement("canvas");
    c.width = 720; c.height = 60 + lines.length * 46;
    const g = c.getContext("2d");
    g.fillStyle = "#f4f1ea"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#222"; g.font = "30px 'DejaVu Sans Mono', monospace";
    lines.forEach((l, i) => g.fillText(l, 40, 60 + i * 46));
    return c.toDataURL("image/png").split(",")[1];
  });

  // 3. Scanner
  await page.goto(`${BASE}#/scanner`);
  await page.getByText("Importer une image ou un PDF").waitFor();
  await page.locator('input[type=file][accept="image/*,application/pdf"]:not([multiple])').setInputFiles({ name: "ticket.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.getByRole("button", { name: /Analyser/ }).click();
  const t0 = Date.now();
  await page.getByText("Vérifier la dépense").waitFor({ timeout: 180000 });
  log(`lecture du ticket : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const values = await page.evaluate(() => [...document.querySelectorAll("input, select")].map((e) => `${e.getAttribute("type") ?? e.tagName}:${e.value}`));
  log("champs lus :", values.filter((v) => !v.endsWith(":") && !v.startsWith("file")).join(" | "));
  const date = await page.locator('input[type=date]').first().inputValue();
  const total = await page.locator('input[inputmode=decimal]').first().inputValue();
  if (date !== "2026-10-14") fail(`date lue = « ${date} » (attendu 2026-10-14)`);
  if (total !== "60.3") fail(`total lu = « ${total} » (attendu 60.3)`);

  // Catégorie : si non trouvée, on la choisit
  const catSelect = page.locator("select").filter({ has: page.locator("option", { hasText: "— Choisir —" }) });
  if (!(await catSelect.inputValue())) {
    log("catégorie non devinée → choisie à la main");
    await catSelect.selectOption({ label: "Repas professionnels" });
  } else log("catégorie devinée :", await catSelect.locator("option:checked").textContent());
  const supplier = page.locator("main input:not([type]):not([inputmode])").first();
  log("fournisseur lu :", await supplier.inputValue());
  if (!(await supplier.inputValue())) await supplier.fill("Restaurant Le Lac");

  // 4. Enregistrement
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Enregistrer la dépense" }).click();
  await page.getByText(/DEP-0001 enregistrée/).waitFor({ timeout: 15000 });
  log("dépense enregistrée : DEP-0001");

  // 5. Liste + persistance après rechargement
  await page.goto(`${BASE}#/depenses`);
  await page.reload();
  await page.getByText("DEP-0001").first().waitFor({ timeout: 10000 });
  log("liste OK après rechargement");

  // 6. Détail : ouverture du justificatif stocké
  await page.getByText("DEP-0001").first().click();
  await page.getByText("Justificatifs originaux").waitFor();
  await page.getByText("ticket.png").waitFor();
  log("détail + justificatif OK");

  // 7. Export PDF du mois d'octobre 2026
  await page.goto(`${BASE}#/export`);
  await page.getByRole("button", { name: /Générer le rapport PDF/ }).waitFor();
  await page.locator("main select").nth(0).selectOption({ index: 9 });
  await page.locator("main select").nth(1).selectOption("2026");
  await page.getByRole("button", { name: /Générer le rapport PDF/ }).click();
  await page.getByText(/Rapport prêt/).waitFor({ timeout: 60000 });
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: /Ouvrir \/ télécharger le PDF/ }).click();
  const pdf = await dl;
  log("rapport PDF :", pdf.suggestedFilename());

  // 8. Sauvegarde
  await page.goto(`${BASE}#/reglages`);
  const bk = page.waitForEvent("download");
  await page.getByRole("button", { name: /Sauvegarder mes données/ }).click();
  const zip = await bk;
  log("sauvegarde :", zip.suggestedFilename());

  // 9. Hors connexion (service worker)
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload();
  await page.getByText("Scanner une dépense").first().waitFor({ timeout: 10000 });
  log("fonctionne hors connexion");
  await ctx.setOffline(false);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
  await page.screenshot({ path: "e2e-failure.png", fullPage: true }).catch(() => {});
  log("texte de la page :", (await page.locator("body").innerText().catch(() => "")).slice(0, 1500));
}

const realErrors = errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|ERR_INTERNET_DISCONNECTED/.test(e));
if (realErrors.length) { log("erreurs du navigateur :\n  " + realErrors.join("\n  ")); fail(`${realErrors.length} erreur(s) dans le navigateur`); }
if (external.size) fail(`appels à des serveurs externes : ${[...external].join(", ")}`);
else log("aucun appel à un serveur externe");
await browser.close();
