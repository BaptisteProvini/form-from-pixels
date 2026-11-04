/**
 * Lecture des justificatifs par Google Gemini, avec la clé personnelle de l'utilisateur.
 * L'appel part directement du téléphone vers Google : aucun serveur intermédiaire.
 * Seule l'image du justificatif est envoyée ; les dépenses restent sur l'appareil.
 */
import type { AnalysisResult } from "./receipt-parser";

const KEY = "mfp.geminiKey";
// L'alias « latest » suit automatiquement la version actuelle de Gemini Flash ; les autres servent de secours.
const MODELS = ["gemini-flash-latest", "gemini-3-flash-preview", "gemini-3.1-flash-lite"];
const API = "https://generativelanguage.googleapis.com/v1beta";

export function getGeminiKey(): string | null {
  try {
    return localStorage.getItem(KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function setGeminiKey(key: string | null) {
  try {
    if (key?.trim()) localStorage.setItem(KEY, key.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
}

export class GeminiError extends Error {
  constructor(message: string, public readonly kind: "key" | "quota" | "network" | "other") {
    super(message);
  }
}

async function apiError(res: Response): Promise<GeminiError> {
  let msg = "";
  try {
    msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
  } catch {
    /* ignore */
  }
  if (res.status === 400 && /api key|API_KEY/i.test(msg)) return new GeminiError("Clé Gemini invalide. Vérifiez-la dans Réglages.", "key");
  if (res.status === 401 || res.status === 403) return new GeminiError("Clé Gemini refusée. Vérifiez-la dans Réglages.", "key");
  if (res.status === 429) return new GeminiError("Limite gratuite de Gemini atteinte pour le moment.", "quota");
  return new GeminiError(`Gemini indisponible (${res.status}).`, "other");
}

/** Vérifie la clé sans consommer de quota de lecture. */
export async function testGeminiKey(key: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API}/models?pageSize=1&key=${encodeURIComponent(key.trim())}`);
  } catch {
    throw new GeminiError("Pas de connexion internet.", "network");
  }
  if (!res.ok) throw await apiError(res);
}

/** Photo réduite à 1600 px en JPEG : envoi rapide et lecture toujours précise. */
async function toPayload(file: File): Promise<{ mime: string; data: string }> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  let blob: Blob = file;
  let mime = isPdf ? "application/pdf" : file.type || "image/jpeg";
  if (!isPdf) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("conversion"))), "image/jpeg", 0.88));
      mime = "image/jpeg";
    } catch {
      /* on envoie l'original */
    }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mime, data: btoa(bin) };
}

function prompt(categories: string[]): string {
  return `Tu lis un justificatif de dépense professionnelle (ticket de caisse, facture ou reçu), souvent suisse.
Extrais les informations et réponds uniquement avec le JSON demandé.

Règles strictes :
- N'invente jamais une valeur. Si une information est absente ou illisible, mets null et ajoute le champ à "uncertain_fields".
- Si tu proposes une valeur dont tu n'es pas sûr (chiffre peu lisible, ticket froissé), garde-la et ajoute le champ à "uncertain_fields".
- expense_date : date de l'achat au format AAAA-MM-JJ (les tickets suisses écrivent JJ.MM.AA ou JJ.MM.AAAA).
- supplier : nom du commerce ou de l'entreprise émettrice, avec une orthographe correcte (pas l'adresse, pas le slogan).
- description : 2 à 6 mots en français résumant l'achat (ex. « Sandwichs », « Parking 3 h », « Plein d'essence »).
- total_ttc : montant total payé, TVA comprise (nombre, point décimal). Pas un sous-total, pas le montant rendu.
- currency : code ISO (CHF, EUR, USD…). « Fr. » ou « SFr » = CHF.
- amount_ht : uniquement s'il est imprimé ou se déduit exactement (total − TVA), sinon null.
- vat_lines : une ligne par taux de TVA imprimé, avec le taux en % (ex. 8.1, 2.6, 3.8) et le montant de TVA. Si seul le taux est imprimé (« TVA incl. 8.1 % »), calcule le montant (total × taux / (100 + taux)) arrondi au centime et ajoute "vat_lines" à "uncertain_fields". Liste vide s'il n'y a aucune TVA.
- category : exactement une de ces catégories, ou null si aucune ne convient : ${categories.map((c) => `« ${c} »`).join(", ")}.
- readable : false si le document n'est pas un justificatif ou est totalement illisible.
- notes : une courte remarque utile en français (ex. « Pourboire inclus »), sinon null.
Noms possibles dans "uncertain_fields" : expense_date, supplier, description, total_ttc, currency, amount_ht, vat_lines, category.`;
}

const nullable = (type: string) => ({ type, nullable: true });
const SCHEMA = {
  type: "OBJECT",
  properties: {
    expense_date: nullable("STRING"),
    supplier: nullable("STRING"),
    description: nullable("STRING"),
    total_ttc: nullable("NUMBER"),
    currency: nullable("STRING"),
    amount_ht: nullable("NUMBER"),
    vat_lines: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { rate: nullable("NUMBER"), amount: nullable("NUMBER") } },
    },
    category: nullable("STRING"),
    uncertain_fields: { type: "ARRAY", items: { type: "STRING" } },
    readable: { type: "BOOLEAN" },
    notes: nullable("STRING"),
  },
  required: ["expense_date", "supplier", "total_ttc", "currency", "vat_lines", "category", "uncertain_fields", "readable"],
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/['’\s]/g, "").replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Contrôle et nettoie la réponse : rien d'incohérent n'arrive dans le formulaire. */
export function sanitize(raw: Record<string, unknown>, categories: string[]): AnalysisResult {
  const uncertain = new Set(Array.isArray(raw.uncertain_fields) ? raw.uncertain_fields.filter((x): x is string => typeof x === "string") : []);
  let date = str(raw.expense_date);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { date = null; uncertain.add("expense_date"); }
  const catRaw = str(raw.category);
  const category = catRaw ? categories.find((c) => c.toLowerCase() === catRaw.toLowerCase()) ?? null : null;
  if (catRaw && !category) uncertain.add("category");
  const currency = str(raw.currency)?.toUpperCase().slice(0, 3) ?? null;
  const vat = (Array.isArray(raw.vat_lines) ? raw.vat_lines : [])
    .map((l) => ({ rate: num((l as Record<string, unknown>)?.rate), amount: num((l as Record<string, unknown>)?.amount) }))
    .filter((l) => (l.rate != null && l.rate > 0 && l.rate <= 30) || (l.amount != null && l.amount > 0));
  const total = num(raw.total_ttc);
  if (total == null) uncertain.add("total_ttc");
  if (!date) uncertain.add("expense_date");
  if (!category) uncertain.add("category");
  return {
    expense_date: date,
    supplier: str(raw.supplier),
    description: str(raw.description),
    total_ttc: total,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : "CHF",
    amount_ht: num(raw.amount_ht),
    vat_lines: vat,
    category,
    uncertain_fields: [...uncertain],
    readable: raw.readable !== false,
    notes: str(raw.notes),
  };
}

export async function analyzeWithGemini(file: File, categories: string[], key: string): Promise<AnalysisResult> {
  const { mime, data } = await toPayload(file);
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt(categories) }, { inline_data: { mime_type: mime, data } }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
  });
  let lastErr: GeminiError | null = null;
  for (const model of MODELS) {
    let res: Response;
    try {
      res = await fetch(`${API}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch {
      throw new GeminiError("Pas de connexion internet.", "network");
    }
    if (res.status === 404) { lastErr = new GeminiError("Modèle Gemini introuvable.", "other"); continue; }
    if (!res.ok) {
      const err = await apiError(res);
      if (err.kind === "key") throw err;
      lastErr = err;
      if (err.kind === "quota" || res.status >= 500) continue;
      throw err;
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    try {
      return sanitize(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")), categories);
    } catch {
      lastErr = new GeminiError("Réponse de Gemini illisible.", "other");
    }
  }
  throw lastErr ?? new GeminiError("Gemini indisponible.", "other");
}
