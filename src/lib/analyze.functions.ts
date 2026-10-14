import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AnalysisResult = {
  expense_date: string | null;
  supplier: string | null;
  description: string | null;
  total_ttc: number | null;
  currency: string | null;
  amount_ht: number | null;
  vat_lines: { rate: number | null; amount: number | null }[];
  category: string | null;
  uncertain_fields: string[];
  readable: boolean;
  notes: string | null;
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["expense_date", "supplier", "description", "total_ttc", "currency", "amount_ht", "vat_lines", "category", "uncertain_fields", "readable", "notes"],
  properties: {
    expense_date: { type: ["string", "null"], description: "Date du ticket au format YYYY-MM-DD, null si illisible ou absente" },
    supplier: { type: ["string", "null"] },
    description: { type: ["string", "null"], description: "Description courte de l'achat en français" },
    total_ttc: { type: ["number", "null"], description: "Montant total payé TTC" },
    currency: { type: ["string", "null"], description: "Code ISO 4217, ex. CHF, EUR, USD" },
    amount_ht: { type: ["number", "null"], description: "Montant hors taxes si explicitement indiqué ou calculable depuis le ticket" },
    vat_lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rate", "amount"],
        properties: { rate: { type: ["number", "null"] }, amount: { type: ["number", "null"] } },
      },
    },
    category: { type: ["string", "null"], description: "Une des catégories fournies, exactement" },
    uncertain_fields: { type: "array", items: { type: "string", enum: ["expense_date", "supplier", "description", "total_ttc", "currency", "amount_ht", "vat_lines", "category"] } },
    readable: { type: "boolean" },
    notes: { type: ["string", "null"] },
  },
} as const;

export const analyzeReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dataBase64: string; mime: string; filename: string; categories: string[] }) => {
    if (!input?.dataBase64 || input.dataBase64.length > 15_000_000) throw new Error("Fichier invalide ou trop volumineux");
    if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(input.mime)) throw new Error("Format non supporté");
    return input;
  })
  .handler(async ({ data }): Promise<{ ok: true; result: AnalysisResult } | { ok: false; error: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, error: "Analyse IA non configurée." };

    const filePart =
      data.mime === "application/pdf"
        ? { type: "input_file", filename: data.filename || "ticket.pdf", file_data: `data:application/pdf;base64,${data.dataBase64}` }
        : { type: "input_image", image_url: `data:${data.mime};base64,${data.dataBase64}` };

    const instructions = `Tu es un assistant comptable suisse. Tu extrais les données d'un justificatif de dépense (ticket, facture, reçu) suisse, français ou international.
Règles strictes :
- N'invente JAMAIS une date, un montant ou une TVA. Si une valeur n'est pas lisible ou absente, mets null et ajoute le champ à uncertain_fields.
- Si une valeur est lisible mais douteuse (flou, partiellement coupé), donne-la et ajoute le champ à uncertain_fields.
- total_ttc = montant total effectivement payé.
- Si plusieurs taux de TVA (ex. 8.1 % et 2.6 %), une ligne par taux dans vat_lines. Tableau vide si aucune TVA indiquée.
- amount_ht uniquement s'il est indiqué ou déductible exactement des lignes du ticket.
- category : choisis la plus pertinente parmi : ${data.categories.join(" | ")}.
- readable = false si le document n'est pas un justificatif ou est globalement illisible.
- notes : remarque courte en français si utile (ex. "ticket coupé en bas"), sinon null.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions,
        input: [{ role: "user", content: [{ type: "input_text", text: "Analyse ce justificatif." }, filePart] }],
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_schema", name: "receipt", strict: true, schema } },
      }),
    });

    if (!res.ok || !res.body) {
      let msg = "";
      try { msg = (await res.json())?.error?.message ?? ""; } catch { /* ignore */ }
      if (res.status === 402) return { ok: false, error: msg || "Crédits IA insuffisants. Rechargez dans Paramètres → Plans & crédits." };
      if (res.status === 429) return { ok: false, error: "Trop de demandes, réessayez dans un instant." };
      if (res.status === 403) return { ok: false, error: msg || "Accès à l'analyse IA refusé." };
      return { ok: false, error: msg || `Erreur d'analyse (${res.status}).` };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    let failed: string | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "response.failed" || ev.type === "error") failed = ev.response?.error?.message ?? ev.message ?? "Analyse échouée";
          else if (ev.type === "response.refusal.delta") failed = "Le document n'a pas pu être analysé.";
        } catch { /* partial */ }
      }
    }
    if (failed) return { ok: false, error: failed };
    try {
      const result = JSON.parse(text) as AnalysisResult;
      return { ok: true, result };
    } catch {
      return { ok: false, error: "Réponse de l'IA illisible. Saisissez les informations manuellement." };
    }
  });
