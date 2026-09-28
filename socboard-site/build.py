#!/usr/bin/env python3
"""Assemble les pages du site SOCBoard.

pages/*.html  -> public/*.html
Chaque page commence par un bloc d'en-tête :

    <!--
    title: ...
    description: ...
    ctabar: no        (facultatif : masque la barre d'action mobile)
    -->

puis le contenu de <main>. Les partials (head, header, footer) sont
injectés autour. Aucune dépendance : python3 build.py
"""
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAGES = ROOT / "pages"
PARTIALS = ROOT / "partials"
OUT = ROOT / "public"

CHECK = (
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" '
    'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" '
    'stroke-linejoin="round"/></svg>'
)
ARROW = '<span class="arrow" aria-hidden="true">↗</span>'


def split_words(body: str) -> str:
    """Découpe le texte des éléments data-words en mots (<span class="w">).
    [[mot|n]] devient un mot-clé (classe k, data-k=n)."""
    def repl(m):
        out = []
        for tok in m.group(2).split():
            k = re.search(r"\[\[(.+?)\|(\d+)\]\]", tok)
            if k:
                text = tok.replace(k.group(0), k.group(1))
                out.append(f'<span class="w k" data-k="{k.group(2)}">{text}</span>')
            else:
                out.append(f'<span class="w">{tok}</span>')
        return m.group(1) + " ".join(out) + m.group(3)
    return re.sub(r"(<p[^>]*data-words[^>]*>)(.*?)(</p>)", repl, body, flags=re.S)


def parse(src: str):
    m = re.match(r"\s*<!--(.*?)-->\s*", src, re.S)
    meta = {}
    if m:
        for line in m.group(1).strip().splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        src = src[m.end():]
    return meta, src


# Variantes de design : même contenu, habillage différent.
# Chaque variante lit d'abord pages-<nom>/ (pages qui changent), puis pages/.
# Son CSS est écrit directement dans public-<nom>/assets/css/site.css ;
# le JS et le favicon sont copiés depuis public/.
VARIANTS = {
    "v4": {
        "fonts": "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap",
        "theme": "#141311",
    },
    # V5 : reprend le CSS de la V4 et ajoute sa propre surcouche (assets-v5/).
    "v5": {
        "fonts": "https://fonts.googleapis.com/css2?family=Geist:wght@300..800&family=Geist+Mono:wght@400;500&display=swap",
        "theme": "#11100e",
        "base_css": "v4",
        "extra": ["css/v5.css", "js/v5.js"],
    },
    # V6 : refonte claire inspirée de finseo.ai, sur la base du CSS principal (V2).
    # « v5:js/v5.js » réutilise le moteur d'animations de la V5 (sable, titres…).
    "v6": {
        "fonts": "https://fonts.googleapis.com/css2?family=Geist:wght@300..800&family=Geist+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap",
        "theme": "#f7f6f3",
        "base_css": "main",
        "extra": ["css/v6.css", "v5:js/v5.js"],
        "before_header": "partials/v6-announce.html",
        "en": True,
    },
}


# Version anglaise (V6) : pages-<variante>-en/ -> public-<variante>/en/, adresses en anglais.
EN_SLUGS = {
    "index.html": "index.html",
    "comment-ca-marche.html": "how-it-works.html",
    "pour-qui.html": "who-its-for.html",
    "tarifs.html": "pricing.html",
    "a-propos.html": "about.html",
    "faq.html": "faq.html",
    "contact.html": "contact.html",
    "mentions-legales.html": "legal-notice.html",
}
SITE = "https://socboard.fr/"


def lang_links(name, lang, bilingual):
    """Sélecteur FR/EN (en-tête + menu mobile) et balises hreflang pour la page `name` (nom français)."""
    if not bilingual:
        return "", "", ""
    fr_url = "" if name == "index.html" else name
    en_url = "en/" + ("" if name == "index.html" else EN_SLUGS[name])
    alternates = (f'<link rel="alternate" hreflang="fr" href="{SITE}{fr_url}">\n'
                  f'<link rel="alternate" hreflang="en" href="{SITE}{en_url}">\n'
                  f'<link rel="alternate" hreflang="x-default" href="{SITE}{fr_url}">\n')
    if lang == "fr":
        href = "en/" + EN_SLUGS[name]
        switch = f'<a class="lang-switch" href="{href}" hreflang="en" lang="en" aria-label="English version">EN</a>'
        mobile = f'<a class="lang-switch--mobile" href="{href}" hreflang="en" lang="en">English</a>'
    else:
        href = "../" + name
        switch = f'<a class="lang-switch" href="{href}" hreflang="fr" lang="fr" aria-label="Version française">FR</a>'
        mobile = f'<a class="lang-switch--mobile" href="{href}" hreflang="fr" lang="fr">Français</a>'
    return switch, mobile, alternates


def render(out, pages, head, header, footer, variant, lang="fr"):
    cfg = VARIANTS.get(variant, {}) if variant else {}
    bilingual = bool(cfg.get("en"))
    for page, name in pages:
        meta, body = parse(page.read_text(encoding="utf-8"))
        out_name = EN_SLUGS[name] if lang == "en" else name
        if lang == "en":
            canonical = "en/" + ("" if name == "index.html" else out_name)
        else:
            canonical = "" if name == "index.html" else name
        switch, mobile, alternates = lang_links(name, lang, bilingual)

        h = (head.replace("{{title}}", meta.get("title", "SOCBoard"))
                 .replace("{{description}}", meta.get("description", ""))
                 .replace("{{canonical}}", canonical))
        if alternates:
            h = h.replace('<link rel="icon"', alternates + '<link rel="icon"', 1)
        nav = header.replace(f'<a href="{name}">', f'<a href="{name}" aria-current="page">')
        nav = nav.replace("{{lang}}", switch).replace("{{lang_mobile}}", mobile)
        before = cfg.get("before_header")
        if before:
            if lang == "en":
                before = before.replace(".html", "-en.html")
            nav = (ROOT / before).read_text(encoding="utf-8") + nav
        foot = footer
        if meta.get("ctabar") == "no":
            foot = re.sub(r'<div class="cta-bar".*?</div>\n', "", foot, count=1, flags=re.S)

        body = body.replace("{{check}}", CHECK).replace("{{arrow}}", ARROW)
        for part in re.findall(r"\{\{partial:([\w.-]+)\}\}", body):
            body = body.replace("{{partial:%s}}" % part, (PARTIALS / part).read_text(encoding="utf-8"))
        if "{{bars}}" in body:
            body = body.replace("{{bars}}", (PARTIALS / "report-bars.svg").read_text(encoding="utf-8"))
        body = split_words(body)
        if variant:
            for rel in cfg.get("extra", []):
                rel = rel.rpartition(":")[2]
                if rel.endswith(".js"):
                    foot = foot.replace("</body>", f'<script src="assets/{rel}" defer></script>\n</body>')
        html = f'{h}{nav}<main id="contenu">\n{body.rstrip()}\n</main>\n{foot}'
        if lang == "en":
            # pages anglaises dans en/ : ressources un niveau plus haut, liens internes vers les adresses anglaises
            html = re.sub(r'(href|src)="assets/', r'\1="../assets/', html)
            for fr, en in EN_SLUGS.items():
                html = re.sub(r'href="%s([?#"])' % re.escape(fr), r'href="%s\1' % en, html)
            html = html.replace('href="../' + EN_SLUGS[name] + '"', 'href="../' + name + '"')
        (out / out_name).write_text(html, encoding="utf-8")
        print("  ", (out.parent.name + "/en/" if lang == "en" else out.name + "/") + out_name)


def build(variant=None):
    out = OUT if variant is None else ROOT / f"public-{variant}"
    overrides = None if variant is None else ROOT / f"pages-{variant}"
    head = (PARTIALS / "head.html").read_text(encoding="utf-8")
    cfg = VARIANTS[variant] if variant else {}
    if variant:
        head = re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^"]*">',
                      f'<link rel="stylesheet" href="{cfg["fonts"]}">', head)
        head = re.sub(r'<meta name="theme-color" content="[^"]*">',
                      f'<meta name="theme-color" content="{cfg["theme"]}">', head)
        head = head.replace('<html lang="fr">', f'<html lang="fr" data-variant="{variant}">')
        head = head.replace('<meta name="theme-color"', f'<meta name="sb-variant" content="{variant}">\n<meta name="theme-color"', 1)
        (out / "assets" / "js").mkdir(parents=True, exist_ok=True)
        shutil.copy(OUT / "assets" / "js" / "site.js", out / "assets" / "js" / "site.js")
        shutil.copy(OUT / "assets" / "js" / "boot.js", out / "assets" / "js" / "boot.js")
        shutil.copy(OUT / "assets" / "favicon.svg", out / "assets" / "favicon.svg")
        if cfg.get("base_css"):
            (out / "assets" / "css").mkdir(parents=True, exist_ok=True)
            base = OUT if cfg["base_css"] == "main" else ROOT / f"public-{cfg['base_css']}"
            shutil.copy(base / "assets" / "css" / "site.css", out / "assets" / "css" / "site.css")
        for rel in cfg.get("extra", []):
            src_variant, _, rel = rel.rpartition(":")
            src = ROOT / f"assets-{src_variant or variant}" / rel
            (out / "assets" / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, out / "assets" / rel)
            if rel.endswith(".css"):
                head = head.replace('<link rel="stylesheet" href="assets/css/site.css">',
                                    f'<link rel="stylesheet" href="assets/css/site.css">\n<link rel="stylesheet" href="assets/{rel}">')
    # Déploiement Vercel : fonction d'envoi du formulaire + en-têtes de sécurité
    shutil.copytree(ROOT / "deploy", out, dirs_exist_ok=True)
    header = (PARTIALS / "header.html").read_text(encoding="utf-8")
    footer = (PARTIALS / "footer.html").read_text(encoding="utf-8")

    pages = []
    for page in sorted(PAGES.glob("*.html")):
        name = page.name
        if overrides and (overrides / name).exists():
            page = overrides / name
        pages.append((page, name))
    render(out, pages, head, header, footer, variant)

    if cfg.get("en"):
        en_dir = ROOT / f"pages-{variant}-en"
        (out / "en").mkdir(exist_ok=True)
        head_en = (head.replace('<html lang="fr"', '<html lang="en"')
                       .replace('content="fr_FR"', 'content="en_GB"'))
        render(out / "en", [(en_dir / n, n) for n in sorted(EN_SLUGS) if (en_dir / n).exists()],
               head_en, (PARTIALS / "header-en.html").read_text(encoding="utf-8"),
               (PARTIALS / "footer-en.html").read_text(encoding="utf-8"), variant, lang="en")


if __name__ == "__main__":
    build()
    for v in VARIANTS:
        build(v)
