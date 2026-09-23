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

- Formulaire : renseigner `data-endpoint` dans `pages/contact.html` (Formspree, Netlify Forms…).
  Sans endpoint, le formulaire ouvre la messagerie du visiteur vers contact@socboard.fr.
- `pages/mentions-legales.html` : remplacer les champs entre crochets.
- Photo du fondateur : remplacer le monogramme « Y. » (`.founder__card`).

## Variantes de design

`python3 build.py` génère aussi les variantes déclarées dans `VARIANTS` (build.py) :

- `public/` : version principale (V2, inspirée DAQ / FMI / Finseo)
- `public-v4/` : essai « instrument », inspiré de jamiemckaye.com. Son CSS est dans
  `public-v4/assets/css/site.css`, sa page d'accueil dans `pages-v4/index.html` ;
  les autres pages sont partagées avec `pages/`.
