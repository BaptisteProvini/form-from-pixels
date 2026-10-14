# Mes Frais Pro — Phase 1

## Ce qui sera construit
- **Connexion sécurisée** (e-mail + mot de passe), usage privé : chaque compte ne voit que ses propres données.
- **Sociétés** : création / modification / suppression illimitées, sélecteur toujours visible en haut. 3 sociétés de démo créées à la première connexion (Perenity Finance Sàrl, Provini Properties Sàrl, ProVini Living). Dépenses, catégories et exports strictement séparés par société.
- **Accueil** : gros bouton « Scanner une dépense », total du mois, nombre de justificatifs, TVA du mois, 5 dernières dépenses, alertes (infos incomplètes).
- **Scan** : appareil photo ou import image/PDF → aperçu avec « Reprendre » → analyse IA → formulaire pré-rempli modifiable (date, fournisseur, description, TTC, devise, HT, lignes de TVA multiples, catégorie, moyen de paiement, « avancée personnellement », commentaire). Les champs illisibles sont signalés en orange, jamais inventés. Ajout de justificatifs supplémentaires possible.
- **Catégories** : les 14 catégories par défaut par société + catégories personnalisées.
- **Archivage** : originaux stockés tels quels dans un espace privé, identifiant permanent DEP-0001 par société, empreinte numérique (SHA-256) pour l'intégrité et la détection de doublons, historique des modifications, suppression d'un justificatif bloquée après export.
- **Liste des dépenses** : filtres date, catégorie, fournisseur, montant, statut ; détail avec consultation / téléchargement de l'original.
- **Export comptable** : société + période (mois, trimestre, année, personnalisée) → ZIP réel `Provini_Properties_2026-10.zip` contenant `Depenses_Octobre_2026.xlsx` (toutes les colonnes demandées), `Justificatifs/DEP-0001_Restaurant.jpg`… et un rapport de contrôle (incomplets, doublons, manquants). Historique des exports, statut du mois, signalement des modifications postérieures à l'export.
- Formats suisses : CHF 1'250.50, dates JJ.MM.AAAA. Design clair, bleu nuit + vert, mobile-first, installable sur l'écran d'accueil (sans mode hors ligne).

## Ce que vous devez savoir avant validation
- **Analyse IA** : les photos de tickets sont envoyées, depuis le serveur, à Lovable AI (modèle de vision OpenAI via la passerelle Lovable, sans conservation des données par le fournisseur). Aucune clé API à fournir. Coût : déduit de vos crédits Lovable, de l'ordre de quelques centimes par ticket.
- **Hébergement** : Lovable Cloud. L'hébergement en Suisse n'est pas garanti ni vérifiable à ce stade (probablement UE). Sauvegardes automatiques de la plateforme.
- **Conformité** : l'app prépare la comptabilité ; elle ne sera pas présentée comme conforme à la conservation légale de 10 ans tant que ce n'est pas vérifié.
- Contre-valeur CHF : saisie manuelle en phase 1 (pas de taux de change automatique).

## Phase 2 ensuite
Graphiques par catégorie et évolution mensuelle, doublons avancés, export intégral des données.

## Détails techniques
- Lovable Cloud : tables companies, categories, expenses, expense_vat_lines, receipts, expense_history, exports, period_status ; RLS par user_id ; bucket privé `receipts`, URLs signées.
- Numérotation DEP via compteur par société (fonction SQL), hash SHA-256 calculé côté navigateur, contrôle unique par société pour doublons.
- Analyse : server function authentifiée, `openai/gpt-6-astra` sur /v1/responses, sortie JSON stricte avec champs nullables + liste des champs incertains ; PDF envoyé en entrée fichier.
- Export : génération côté navigateur avec `exceljs` + `jszip` à partir des fichiers téléchargés via URLs signées.
- PWA : manifeste + icônes uniquement.
