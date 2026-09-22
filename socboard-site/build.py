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
ARROW = '<span class="arrow" aria-hidden="true">→</span>'


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


def build():
    head = (PARTIALS / "head.html").read_text(encoding="utf-8")
    header = (PARTIALS / "header.html").read_text(encoding="utf-8")
    footer = (PARTIALS / "footer.html").read_text(encoding="utf-8")

    for page in sorted(PAGES.glob("*.html")):
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
        html = f'{h}{nav}<main id="contenu">\n{body.rstrip()}\n</main>\n{foot}'
        (OUT / name).write_text(html, encoding="utf-8")
        print("  ", name)


if __name__ == "__main__":
    build()
