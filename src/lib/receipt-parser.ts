/**
 * Extraction des informations d'un ticket à partir de son texte (lu sur l'appareil).
 * Fonctions pures, testées dans src/test/receipt-parser.test.ts.
 * Règle d'or reprise de l'ancienne version : ne jamais inventer une valeur ;
 * en cas de doute, la valeur est proposée mais signalée « À vérifier ».
 */

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

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Montants au format 12.50 / 12,50 / 1'250.50 / 1 250,50 / 1’250.– */
const AMOUNT_RE = /(?<![\d.,'’])(-?\d{1,3}(?:['’ ]\d{3})+|-?\d+)\s?[.,]\s?(\d{2}|-{1,2}|–)(?![\d%]|[.,]\d)/g;

export function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const int = m[1].replace(/['’ ]/g, "");
    const dec = /^\d{2}$/.test(m[2]) ? m[2] : "00";
    const v = Number(`${int}.${dec}`);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/* ---------- Date ---------- */

const MONTHS: Record<string, number> = {
  janv: 1, jan: 1, janvier: 1, januar: 1, january: 1,
  fevr: 2, fev: 2, fevrier: 2, feb: 2, februar: 2, february: 2,
  mars: 3, mar: 3, marz: 3, maerz: 3, march: 3,
  avr: 4, avril: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, juni: 6, june: 6,
  juil: 7, juillet: 7, jul: 7, juli: 7, july: 7,
  aout: 8, aug: 8, august: 8,
  sept: 9, sep: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, okt: 10, oktober: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, decembre: 12, dez: 12, dezember: 12, december: 12,
};

function validDate(y: number, m: number, d: number, today: Date): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  const max = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const min = new Date(today.getFullYear() - 6, 0, 1);
  if (dt > max || dt < min) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function findDate(text: string, today = new Date()): string | null {
  const t = norm(text);
  const candidates: { iso: string; pos: number }[] = [];
  // 2026-10-14
  for (const m of t.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const iso = validDate(+m[1], +m[2], +m[3], today);
    if (iso) candidates.push({ iso, pos: m.index! });
  }
  // 14.10.2026 · 14/10/26 · 14-10-2026
  for (const m of t.matchAll(/\b(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4}|\d{2})(?![\d.,]\d)/g)) {
    const iso = validDate(+m[3], +m[2], +m[1], today);
    if (iso) candidates.push({ iso, pos: m.index! });
  }
  // 14 oct. 2026 · 14. Oktober 2026
  for (const m of t.matchAll(/\b(\d{1,2})\.?\s*([a-z]{3,9})\.?\s*(\d{4})\b/g)) {
    const mo = MONTHS[m[2]] ?? MONTHS[m[2].slice(0, 4)] ?? MONTHS[m[2].slice(0, 3)];
    if (!mo) continue;
    const iso = validDate(+m[3], mo, +m[1], today);
    if (iso) candidates.push({ iso, pos: m.index! });
  }
  if (!candidates.length) return null;
  // Priorité à une date proche des mots « date / datum »
  const kw = /(date|datum|le |du )/g;
  let best = candidates.sort((a, b) => a.pos - b.pos)[0];
  for (const k of t.matchAll(kw)) {
    const near = candidates.find((c) => c.pos >= k.index! && c.pos - k.index! < 25);
    if (near) { best = near; break; }
  }
  return best.iso;
}

/* ---------- Devise ---------- */

export function findCurrency(text: string): string | null {
  const t = text.toUpperCase();
  const score: Record<string, number> = {
    CHF: (t.match(/\bCHF\b|\bSFR\b|\bFR\.\s?\d/g) ?? []).length,
    EUR: (t.match(/€|\bEUR\b|\bEURO/g) ?? []).length,
    USD: (t.match(/\bUSD\b|US\$|\$\s?\d/g) ?? []).length,
    GBP: (t.match(/£|\bGBP\b/g) ?? []).length,
  };
  const top = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return top[1] > 0 ? top[0] : null;
}

/* ---------- Total ---------- */

const TOTAL_KW = /(\btotal\b|\btotaal\b|\btot\.|gesamt|\bsumme\b|\bbetrag\b|a payer|net a payer|zu (be)?zahlen|montant (total|du|paye)|\bmontant\b|amount due|grand total|\bsaldo\b|\bbar\b|\bespeces\b|\bcarte\b|\bkarte\b|\bvisa\b|mastercard|maestro|\btwint\b|postfinance|\bec\b|\bdebit\b|\bpaye\b|\bbezahlt\b)/;
const STRONG_TOTAL_KW = /(\btotal\b|gesamt|\bsumme\b|a payer|zu (be)?zahlen|montant total|amount due|grand total)/;
const NOT_TOTAL_KW = /(sous[- ]?total|subtotal|zwischensumme|\btva\b|mwst|\bmws\b|\bvat\b|\btax\b|\bust\b|rendu|ruckgeld|retour|change|monnaie|\bhors\b|\bht\b|netto|excl|ohne)/;

export function findTotal(lines: string[]): { value: number | null; sure: boolean } {
  const n = lines.map(norm);
  const strong: number[] = [];
  const weak: number[] = [];
  n.forEach((l, i) => {
    if (!TOTAL_KW.test(l) || NOT_TOTAL_KW.test(l)) return;
    let a = amountsIn(lines[i]);
    if (!a.length && i + 1 < lines.length) a = amountsIn(lines[i + 1]);
    if (!a.length) return;
    (STRONG_TOTAL_KW.test(l) ? strong : weak).push(Math.max(...a));
  });
  if (strong.length) {
    const v = Math.max(...strong);
    return { value: v, sure: weak.length === 0 || weak.some((w) => Math.abs(w - v) < 0.01) || strong.length > 1 };
  }
  if (weak.length) return { value: Math.max(...weak), sure: false };
  const all = lines.flatMap(amountsIn).filter((x) => x > 0 && x < 100000);
  return { value: all.length ? Math.max(...all) : null, sure: false };
}

/* ---------- TVA ---------- */

const VAT_KW = /(\btva\b|mwst|\bmws\b|\bvat\b|\btax\b|\bust\b|\biva\b|\bmwst\.)/;
const KNOWN_RATES = [8.1, 2.6, 3.8, 7.7, 2.5, 3.7, 20, 10, 5.5, 2.1, 19, 7, 22];

export function findVat(lines: string[], total: number | null): { lines: { rate: number | null; amount: number | null }[]; sure: boolean } {
  const out: { rate: number | null; amount: number | null; ok: boolean }[] = [];
  lines.forEach((raw, i) => {
    const l = norm(raw);
    const rateMatch = /(\d{1,2}(?:[.,]\d{1,2})?)\s?%/.exec(l);
    if (!VAT_KW.test(l) && !rateMatch) return;
    if (!VAT_KW.test(l) && !(i > 0 && VAT_KW.test(norm(lines[i - 1]))) && !(i > 1 && VAT_KW.test(norm(lines[i - 2])))) return;
    if (/(incl|inkl|compris|enthalten)/.test(l) && !rateMatch && !amountsIn(raw).length) return;
    const rate = rateMatch ? Number(rateMatch[1].replace(",", ".")) : null;
    if (rate != null && (rate <= 0 || rate > 30)) return;
    const amounts = amountsIn(raw.replace(/(\d{1,2}(?:[.,]\d{1,2})?)\s?%/g, " ")).filter((a) => a > 0);
    if (!amounts.length) return;
    let pick: number | null = null;
    let ok = false;
    if (rate != null) {
      // Montant de TVA cohérent avec une base ou un total présent sur la ligne (ou le total du ticket)
      const bases = [...amounts, ...(total != null ? [total] : [])];
      for (const a of amounts) {
        for (const b of bases) {
          if (b === a) continue;
          if (Math.abs(b * rate / 100 - a) <= 0.03 || Math.abs((b * rate) / (100 + rate) - a) <= 0.03) { pick = a; ok = true; break; }
        }
        if (ok) break;
      }
    }
    if (pick == null) pick = Math.min(...amounts);
    if (total != null && pick >= total) return;
    if (!out.some((o) => o.rate === rate && o.amount === pick)) out.push({ rate, amount: pick, ok: ok && KNOWN_RATES.includes(rate!) });
  });
  // Une seule ligne par taux : on garde la plus cohérente
  const byRate = new Map<string, { rate: number | null; amount: number | null; ok: boolean }>();
  for (const o of out) {
    const k = String(o.rate);
    const prev = byRate.get(k);
    if (!prev || (o.ok && !prev.ok)) byRate.set(k, o);
  }
  const res = [...byRate.values()];
  return { lines: res.map(({ rate, amount }) => ({ rate, amount })), sure: res.length > 0 && res.every((r) => r.ok) };
}

/* ---------- Fournisseur ---------- */

const NOT_SUPPLIER = /(ticket|quittung|beleg|recu|facture|rechnung|invoice|receipt|kassenbon|bienvenue|willkommen|merci|danke|\bbon\b|\bcaisse\b|\bkasse\b|\btel\b|\btel\.|\bfax\b|www\.|http|@|\bche-|mwst|\btva\b|\bnr\b|n°|\bdate\b|\bdatum\b|\bheure\b|\bzeit\b|\buhr\b)/;

export function findSupplier(lines: string[]): string | null {
  for (const raw of lines.slice(0, 8)) {
    const l = raw.trim().replace(/\s{2,}/g, " ");
    const letters = (l.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
    if (letters < 3 || letters < l.replace(/\s/g, "").length * 0.5) continue;
    if (NOT_SUPPLIER.test(norm(l))) continue;
    if (amountsIn(l).length) continue;
    const clean = l.replace(/[^\p{L}\p{N}&'’.,\- ]/gu, "").trim();
    if (clean.length < 3) continue;
    // Majuscules OCR → casse lisible
    return clean === clean.toUpperCase() ? clean.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : clean;
  }
  return null;
}

/* ---------- Catégorie ---------- */

const CATEGORY_RULES: [string, RegExp][] = [
  ["Carburant", /(essence|diesel|sans plomb|bleifrei|benzin|carburant|\blitre|\bliter\b|\bltr\b|pompe|zapfsaule|tamoil|\bavia\b|\bshell\b|\bbp\b|agrola|socar|\besso\b|migrol|\beni\b|ruedi russel|adblue)/],
  ["Parking", /(parking|parkhaus|stationnement|parcmetre|parkuhr|horodateur|parkgebuhr|onepark|parkingpay)/],
  ["Hébergement et hôtels", /(hotel|nuitee|ubernachtung|booking\.com|airbnb|chambre|zimmer|taxe de sejour|kurtaxe|check-?in|check-?out)/],
  ["Transports et déplacements", /(\bcff\b|\bsbb\b|\bffs\b|\btpg\b|\btl\b|billet|fahrkarte|\btaxi\b|\buber\b|\btrain\b|\bbahn\b|flixbus|easyjet|swiss international|lufthansa|vignette|peage|\bmaut\b|mobility|publibike)/],
  ["Télécommunications", /(swisscom|sunrise|\bsalt\b|wingo|yallo|natel|forfait mobile|roaming)/],
  ["Informatique et logiciels", /(apple\.com|app store|microsoft|adobe|google workspace|software|logiciel|licence|lizenz|digitec|galaxus|interdiscount|\bfust\b|brack|ordinateur|laptop|\busb\b|chatgpt|openai|anthropic|claude)/],
  ["Marketing et publicité", /(publicite|werbung|meta ads|facebook ads|linkedin|google ads|flyer|imprimerie|druckerei|onlineprinters|vistaprint)/],
  ["Fournitures de bureau", /(papeterie|office world|papier|stylo|cartouche|toner|enveloppe|classeur|\bla poste\b|\bpost\b|timbre|briefmarke)/],
  ["Formation", /(formation|\bcours\b|seminaire|seminar|\bkurs\b|conference|workshop|inscription|weiterbildung)/],
  ["Frais bancaires", /(frais bancaires|bankgebuhr|\bubs\b|raiffeisen|postfinance|\bbcv\b|\bbcge\b|\bbcn\b|\bzkb\b|commission bancaire)/],
  ["Entretien et réparations", /(garage|reparation|reparatur|\bpneu|reifen|lavage|waschanlage|entretien|carrosserie|vidange)/],
  ["Vêtements professionnels", /(vetement|kleidung|chaussure|schuhe|\bh&m\b|\bzara\b|manor)/],
  ["Matériel professionnel", /(hornbach|\bjumbo\b|bauhaus|outillage|werkzeug|\bikea\b|do it|coop bau)/],
  ["Repas professionnels", /(restaurant|\bcafe\b|caffe|brasserie|pizzeria|bistro|trattoria|osteria|auberge|gasthof|beizli|\bbar\b.*\d|couvert|\bmenu\b|\bplat\b|boisson|biere|\bbier\b|\bvin\b|\bwein\b|getranke|lunch|diner|dejeuner|mcdonald|burger|sushi|kebab|pourboire|trinkgeld|\btable\b|\btisch\b|starbucks|boulangerie|backerei|take ?away|manora|\bcoop\b.*resto|migros restaurant)/],
];

export function guessCategory(text: string, available: string[]): string | null {
  const t = norm(text);
  for (const [name, re] of CATEGORY_RULES) {
    if (re.test(t)) {
      const match = available.find((a) => a.toLowerCase() === name.toLowerCase());
      if (match) return match;
    }
  }
  return null;
}

/* ---------- Hors taxes ---------- */

export function findHT(lines: string[]): number | null {
  for (const raw of lines) {
    const l = norm(raw);
    if (/(hors tax|\bht\b|total net|netto|ohne mwst|exkl|excl|sous[- ]?total|subtotal|zwischensumme)/.test(l)) {
      const a = amountsIn(raw);
      if (a.length) return Math.max(...a);
    }
  }
  return null;
}

/* ---------- Assemblage ---------- */

export function parseReceiptText(text: string, categories: string[], opts: { fromOcr: boolean; today?: Date } = { fromOcr: true }): AnalysisResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const alnum = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const readable = alnum >= 15 && lines.length >= 2;

  const uncertain = new Set<string>();
  const date = findDate(text, opts.today);
  const total = findTotal(lines);
  const currency = findCurrency(text);
  const vat = findVat(lines, total.value);
  const supplier = findSupplier(lines);
  const category = guessCategory(text, categories);

  let ht = findHT(lines);
  if (ht != null && total.value != null && ht > total.value) ht = null;
  if (ht == null && vat.sure && total.value != null) {
    const sumVat = vat.lines.reduce((s, l) => s + (l.amount ?? 0), 0);
    ht = round2(total.value - sumVat);
  }

  if (!date) uncertain.add("expense_date");
  if (total.value == null || !total.sure) uncertain.add("total_ttc");
  if (!currency) uncertain.add("currency");
  if (vat.lines.length && !vat.sure) uncertain.add("vat_lines");
  if (!supplier || opts.fromOcr) uncertain.add("supplier");
  if (!category) uncertain.add("category");
  if (ht != null && !vat.sure) uncertain.add("amount_ht");

  return {
    expense_date: date,
    supplier,
    description: null,
    total_ttc: total.value,
    currency: currency ?? "CHF",
    amount_ht: ht,
    vat_lines: vat.lines,
    category,
    uncertain_fields: [...uncertain],
    readable,
    notes: readable ? "Lecture automatique sur l'appareil : vérifiez les champs signalés avant d'enregistrer." : null,
  };
}
