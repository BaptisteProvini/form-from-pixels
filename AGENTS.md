## Mes Frais Pro — architecture

- Application 100 % côté client (Vite + React + TanStack Router, routage par `#`), publiée sur GitHub Pages.
- Aucune dépendance à un service tiers à l'exécution : pas de base distante, pas d'IA externe, pas de CDN
  (polices via @fontsource, Tesseract et ses langues copiés dans `public/ocr` par `scripts/copy-ocr-assets.mjs`).
- Données dans IndexedDB (`src/lib/db.ts`). La numérotation DEP-0001, l'historique des modifications,
  le marquage « modifiée après export » et l'interdiction de supprimer une dépense exportée sont appliqués dans `db.ts`.
- Lecture des tickets : `src/lib/ocr.ts` (texte PDF ou OCR) puis `src/lib/receipt-parser.ts` (fonctions pures testées).
  Ne jamais inventer une valeur : en cas de doute, la proposer et l'ajouter à `uncertain_fields`.
- Les justificatifs n'existent que sur l'appareil : la sauvegarde ZIP (Réglages) est la seule copie de secours.
