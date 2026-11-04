# Mes Frais Pro

Application de tri des frais professionnels : on photographie un ticket, l'application lit la date,
le montant, la TVA, le fournisseur et propose une catégorie, puis prépare le rapport PDF mensuel
pour le comptable.

**Entièrement autonome :** aucun compte, aucun serveur, aucun abonnement.

- Les dépenses et les justificatifs sont enregistrés **sur le téléphone** (IndexedDB).
- La lecture des tickets se fait **sur le téléphone** (Tesseract, fichiers hébergés avec l'app ;
  texte extrait directement pour les PDF numériques).
- L'application est un site statique publié gratuitement sur **GitHub Pages** et fonctionne hors connexion.
- **Sauvegarde / restauration** en un fichier ZIP depuis l'écran Réglages.

## Utiliser sur iPhone

1. Ouvrir le lien GitHub Pages dans **Safari**.
2. Partager → **« Sur l'écran d'accueil »**.
3. Lancer l'app depuis l'icône (les données y sont conservées durablement).
4. Faire une sauvegarde régulièrement (Réglages → Sauvegarder mes données).

## Développement

Node.js 22 :

```sh
npm install --legacy-peer-deps
npm run dev      # http://localhost:5173
npm test
npm run build    # dossier dist/
```

Chaque `git push` sur `main` compile, teste et publie l'application (`.github/workflows/publier.yml`).

## Organisation du code

- `src/lib/db.ts` — stockage local (sociétés, catégories, dépenses, TVA, justificatifs, historique, exports, sauvegarde).
- `src/lib/data.ts` — requêtes utilisées par les écrans, doublons, champs manquants.
- `src/lib/ocr.ts` — lecture d'une photo ou d'un PDF sur l'appareil.
- `src/lib/receipt-parser.ts` — extraction date / montant / TVA / fournisseur / catégorie à partir du texte.
- `src/lib/export.ts` — rapport PDF pour le comptable.
- `src/routes/_app/*` — écrans Accueil, Dépenses, Scanner, Export, Réglages.
