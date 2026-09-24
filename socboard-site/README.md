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
