# Site vitrine SOCBoard

Site statique (HTML/CSS/JS, sans framework ni dépendance) pour socboard.fr.

- `pages/` : contenu de chaque page (à modifier)
- `partials/` : en-tête, `<head>` et pied de page communs
- `public/` : site généré, prêt à déployer (y compris `assets/`)

```bash
python3 build.py        # régénère public/*.html après toute modification
cd public && python3 -m http.server 8000   # aperçu local
```

Déploiement : publier le dossier `public/` tel quel (Netlify, Vercel, Cloudflare Pages, OVH…).

## À compléter avant la mise en ligne

- Formulaire : il envoie la demande à `/api/contact` (fonction Vercel dans `deploy/api/`),
  qui la transmet par e-mail via Resend. Configuration : voir `deploy/DEPLOY.md`.
  `deploy/` (API, `vercel.json` avec CSP et en-têtes de sécurité, guide) est copié
  dans chaque dossier généré par `python3 build.py`.
- `pages/mentions-legales.html` : remplacer les champs entre crochets.
- Photo du fondateur : remplacer le monogramme « Y. » (`.founder__card`).

## Variantes de design

`python3 build.py` génère aussi les variantes déclarées dans `VARIANTS` (build.py) :

- `public/` : version principale (V2, inspirée DAQ / FMI / Finseo)
- `public-v4/` : essai « instrument », inspiré de jamiemckaye.com. Son CSS est dans
  `public-v4/assets/css/site.css`, sa page d'accueil dans `pages-v4/index.html` ;
  les autres pages sont partagées avec `pages/`.
- `public-v5/` : refonte « sable », avec les textes de la v4. Le mot-clé du hero (« visible. ») et de la conclusion
  est dessiné par des grains qui s'assemblent, s'écartent sous le curseur et se dispersent
  au scroll ; défilement horizontal épinglé (constat → action), courbe mensuelle tracée au
  scroll, cartes d'offres empilées, boutons magnétiques. Reprend le CSS de la V4
  (copié au build) + `assets-v5/css/v5.css` et `assets-v5/js/v5.js` ; page d'accueil dans
  `pages-v5/index.html`. Tout est statique avec `prefers-reduced-motion`.
- `public-v6/` : refonte intégrale claire, inspirée de finseo.ai (blanc cassé, encre, cadre
  pointillé, hero centré en deux tons, rapport en grand panneau sombre, bento, tarifs en
  3 colonnes). Textes inchangés. CSS : base principale (V2) copiée au build +
  `assets-v6/css/v6.css` ; animations : moteur `assets-v5/js/v5.js` réutilisé ;
  accueil dans `pages-v6/index.html`, bandeau d'annonce dans `partials/v6-announce.html`,
  graphique du rapport dans `partials/v6-lines.svg`.

## Version anglaise (V6)

- Pages sources : `pages-v6-en/` (mêmes noms de fichiers que les pages françaises).
- Générées dans `public-v6/en/` avec des adresses anglaises (`EN_SLUGS` dans build.py :
  `pricing.html`, `how-it-works.html`, `who-its-for.html`, `about.html`, `legal-notice.html`…).
- En-tête, pied de page, bandeau et graphique : `partials/*-en.*`.
- Sélecteur FR/EN dans l'en-tête et le menu mobile, vers la page équivalente ;
  balises `hreflang` (fr, en, x-default) sur chaque page.
- Textes générés par le JavaScript (formulaire, copie, tarifs) : choisis selon `<html lang>`.
- Le formulaire anglais envoie les mêmes champs et valeurs que le français : l'e-mail reçu est identique.
