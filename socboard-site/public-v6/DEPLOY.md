# Mise en production du formulaire SOCBoard

Le formulaire s’envoie à `/api/contact`, fonction Vercel qui transmet la demande à Resend. Aucun secret d’envoi n’est placé dans le navigateur.

## Configuration Vercel

Définir comme racine du projet Vercel le dossier généré à publier (par exemple `socboard-site/public-v5`) ; `python3 build.py` y copie `api/`, `vercel.json` et ce guide, puis ajouter ces variables dans **Settings → Environment Variables** (Production, et Preview si nécessaire) :

- `RESEND_API_KEY` : clé Resend limitée à l’envoi, conservée comme variable sensible.
- `CONTACT_FROM_EMAIL` : adresse expéditrice appartenant à un domaine vérifié dans Resend, par exemple `SOCBoard <contact@socboard.fr>`.
- `SITE_ORIGIN` : facultatif, origine exacte d’un domaine de prévisualisation autorisé, sans chemin ni slash final.

Vérifier dans Resend le domaine expéditeur et ses enregistrements DNS SPF/DKIM avant le déploiement. Les demandes sont envoyées à `youssou@socboard.fr` et les réponses au message peuvent être adressées directement au client.

Après avoir ajouté ou modifié les variables, redéployer le projet. Ne jamais ajouter la clé Resend à un fichier HTML, JavaScript ou à Git.

## Protection contre l’abus

La fonction vérifie l’origine, le type et la taille de la requête, valide et borne les champs, inclut un champ piège et applique une limite de débit en mémoire par instance. Cette dernière est une protection complémentaire, pas une limite globale persistante. En production, activer aussi une règle de limitation de débit Vercel ciblant `POST /api/contact`.

Le fichier `vercel.json` ajoute la CSP, HSTS et les en-têtes de sécurité sur le site.
