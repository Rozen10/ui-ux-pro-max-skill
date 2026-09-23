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
        "theme": "#0a0a0a",
    },
}


def build(variant=None):
    out = OUT if variant is None else ROOT / f"public-{variant}"
    overrides = None if variant is None else ROOT / f"pages-{variant}"
    head = (PARTIALS / "head.html").read_text(encoding="utf-8")
    if variant:
        cfg = VARIANTS[variant]
        head = re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^"]*">',
                      f'<link rel="stylesheet" href="{cfg["fonts"]}">', head)
        head = re.sub(r'<meta name="theme-color" content="[^"]*">',
                      f'<meta name="theme-color" content="{cfg["theme"]}">', head)
        head = head.replace('<html lang="fr">', f'<html lang="fr" data-variant="{variant}">')
        (out / "assets" / "js").mkdir(parents=True, exist_ok=True)
        shutil.copy(OUT / "assets" / "js" / "site.js", out / "assets" / "js" / "site.js")
        shutil.copy(OUT / "assets" / "favicon.svg", out / "assets" / "favicon.svg")
    header = (PARTIALS / "header.html").read_text(encoding="utf-8")
    footer = (PARTIALS / "footer.html").read_text(encoding="utf-8")

    for page in sorted(PAGES.glob("*.html")):
        if overrides and (overrides / page.name).exists():
            page = overrides / page.name
        meta, body = parse(page.read_text(encoding="utf-8"))
        name = page.name
        canonical = "" if name == "index.html" else name

        h = (head.replace("{{title}}", meta.get("title", "SOCBoard"))
                 .replace("{{description}}", meta.get("description", ""))
                 .replace("{{canonical}}", canonical))
        nav = header.replace(f'<a href="{name}">', f'<a href="{name}" aria-current="page">')
        foot = footer
        if meta.get("ctabar") == "no":
            foot = re.sub(r'<div class="cta-bar".*?</div>\n', "", foot, count=1, flags=re.S)

        body = body.replace("{{check}}", CHECK).replace("{{arrow}}", ARROW)
        for part in re.findall(r"\{\{partial:([\w.-]+)\}\}", body):
            body = body.replace("{{partial:%s}}" % part, (PARTIALS / part).read_text(encoding="utf-8"))
        if "{{bars}}" in body:
            body = body.replace("{{bars}}", (PARTIALS / "report-bars.svg").read_text(encoding="utf-8"))
        body = split_words(body)
        html = f'{h}{nav}<main id="contenu">\n{body.rstrip()}\n</main>\n{foot}'
        (out / name).write_text(html, encoding="utf-8")
        print("  ", out.name + "/" + name)


if __name__ == "__main__":
    build()
    for v in VARIANTS:
        build(v)
