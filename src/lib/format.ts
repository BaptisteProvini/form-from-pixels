/** Swiss formatting helpers: CHF 1’250.50, dates JJ.MM.AAAA */
export function formatAmount(value: number | null | undefined, currency = "CHF"): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, "’");
  return `${currency} ${neg ? "-" : ""}${grouped}.${dec}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export const PAYMENT_METHODS: Record<string, string> = {
  carte_pro: "Carte bancaire professionnelle",
  carte_perso: "Carte bancaire personnelle",
  compte_pro: "Compte bancaire professionnel",
  especes: "Espèces",
  autre: "Autre",
};

export const STATUS_LABELS: Record<string, string> = {
  a_valider: "À valider",
  valide: "Validée",
};

export const PERIOD_STATUS: Record<string, string> = {
  en_cours: "En cours",
  pret: "Prêt pour export",
  transmis: "Transmis au comptable",
};

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthRange(year: number, month0: number) {
  return {
    start: toISODate(new Date(year, month0, 1)),
    end: toISODate(new Date(year, month0 + 1, 0)),
  };
}
