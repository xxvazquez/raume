"""Building blocks for lesson notes that raume draws as its own screens.

A lesson file imports this kit, builds its sections from these components
and calls render(). The result is one HTML file to add on the Notes screen
(Notes › Add): plain markup in rn-* classes with no styles or scripts of its
own -- raume supplies the look (css/site.css, .rn), dark mode, the study
controls (Quiz, Romaji / English / Furigana), tap-to-reveal and
tap-to-hear (js/notes.js). Opened anywhere else it is readable, unstyled.

Lesson files hold the reader's own notes, so they never go in the repo:
keep them in private-notes/ (gitignored) or anywhere outside it.

    python3 private-notes/lesson14.py
"""
import html
import pathlib
import unicodedata

# Section colours: raume's tile hues. ("pink" maps to clay -- raume has no pink.)
HUES = {"blue", "green", "orange", "purple", "teal", "indigo", "amber", "clay", "slate"}
ALIASES = {"pink": "clay"}


def r(kanji, kana):
    """Kanji with furigana."""
    return f"<ruby>{kanji}<rt>{kana}</rt></ruby>"


def az_key(romaji):
    return unicodedata.normalize("NFD", romaji).encode("ascii", "ignore").decode().lower()


def hl(t):
    """Highlights the part that matters, in the section's colour."""
    return f'<b class="rn-hl">{t}</b>'


def ok(t):
    return f'<span class="rn-ok">{t} ✓</span>'


def wrong(t):
    return f'<span class="rn-x">{t} ✗</span>'


# ── components ──────────────────────────────────────────────
def stack(jp, ro, en, tag=None, ans=False):
    """Japanese / romaji / English. ans=True marks it as something Quiz covers."""
    t = f'<div class="rn-tag">{tag}</div>' if tag else ""
    cls = "rn-st rn-ans" if ans else "rn-st"
    return (f'<div class="{cls}">{t}<div class="rn-jp" lang="ja">{jp}</div>'
            f'<div class="rn-ro">{ro}</div><div class="rn-en">{en}</div></div>')


def lst(rows, cols="qa", head=None, lead="em"):
    """rows: [(lead, [cell, ...])]. cols 'qa' = question + answer, 'one' = one column.
    lead: 'em' (an emoji), 'num' (a numbered dot) or 'lbl' (a short label)."""
    h = ""
    if head:
        h = '<div class="rn-r rn-hdr"><div></div>' + "".join(f"<div>{x}</div>" for x in head) + "</div>"
    out = []
    for l, cells in rows:
        cells = list(cells)
        # Quiz covers the Japanese you should produce: the answer column, or
        # every cell of a one-column list.
        if cols == "qa" and lead != "lbl":
            cells[-1] = cells[-1].replace('class="rn-st"', 'class="rn-st rn-ans"', 1)
        elif cols == "one":
            cells = [c.replace('class="rn-st"', 'class="rn-st rn-ans"', 1) for c in cells]
        out.append(f'<div class="rn-r"><div class="rn-lead rn-{lead}">{l}</div>' + "".join(cells) + "</div>")
    extra = " rn-labelled" if lead == "lbl" else ""
    return f'<div class="rn-list rn-{cols}{extra}">{h}{"".join(out)}</div>'


def tiles(items, n=4, az=False):
    """items: [(icon or '', jp, romaji, english)]. az=True sorts by romaji."""
    if az:
        items = sorted(items, key=lambda it: az_key(it[2]))
    out = []
    for it in items:
        icon = f'<div class="rn-ic" aria-hidden="true">{it[0]}</div>' if it[0] else ""
        out.append(f'<div class="rn-tile">{icon}{stack(*it[1:], ans=True)}</div>')
    return f'<div class="rn-tiles rn-c{n}">' + "".join(out) + "</div>"


def tip(mark, text):
    return f'<div class="rn-tip"><span class="rn-dot" aria-hidden="true">{mark}</span><div>{text}</div></div>'


def tips(*items):
    return '<div class="rn-tips">' + "".join(items) + "</div>"


def two(*blocks, flush=False):
    """Two blocks side by side (stacked on a phone)."""
    return f'<div class="rn-two{" rn-flush" if flush else ""}">' + "".join(blocks) + "</div>"


def formula(lines):
    rows = "".join(
        f'<div class="rn-fl"><span class="rn-lab">{lab}</span><div><div class="rn-fj" lang="ja">{jp}</div><div class="rn-fr">{ro}</div></div></div>'
        for lab, jp, ro in lines
    )
    return f'<div class="rn-formula">{rows}</div>'


def kinds(*cards):
    """Side-by-side explainer cards: (title, subtitle, jp, romaji, english)."""
    return two(*(
        f'<div class="rn-card rn-pad"><div class="rn-kind">{t}</div><div class="rn-kind-sub">{sub}</div>{stack(jp, ro, en)}</div>'
        for t, sub, jp, ro, en in cards
    ))


def slot(t):
    return f'<span class="rn-slot">{t}</span>'


def cols2(block):
    """A long one-column list in two columns on a wide screen."""
    return f'<div class="rn-cols2">{block}</div>'


def h3(t):
    return f'<h3 class="rn-h3">{t}</h3>'


def section(n, color, title, sub, body):
    """color: one of raume's tile hues -- blue, green, orange, purple, teal,
    indigo, amber, clay, slate."""
    color = ALIASES.get(color, color)
    if color not in HUES:
        raise ValueError(f"unknown section colour {color!r}")
    return (f'<section class="rn-sec" data-tile="{color}"><h2 class="rn-sec-head">'
            f'<span class="rn-sec-num" aria-hidden="true">{n}</span><span>{title}</span>'
            f'<span class="rn-sub">{sub}</span></h2>{body}</section>')


# ── position pictograms ─────────────────────────────────────
def _cube(x=24, y=16, s=22, d=7):
    return (f'<path class="pk" d="M{x} {y} L{x+d} {y-d} L{x+s+d} {y-d} L{x+s+d} {y+s-d} L{x+s} {y+s} Z"/>'
            f'<rect class="pk" x="{x}" y="{y}" width="{s}" height="{s}"/>'
            f'<path class="pk-line" d="M{x+s} {y} L{x+s+d} {y-d}"/>')


def _dot(cx, cy, rr=4.2):
    return f'<circle class="pk-dot" cx="{cx}" cy="{cy}" r="{rr}"/>'


def _sq(x, y, s=18, on=False):
    return f'<rect class="{"pk-on" if on else "pk"}" x="{x}" y="{y}" width="{s}" height="{s}" rx="1.5"/>'


def _svg(inner):
    return f'<svg viewBox="0 0 80 50" width="80" height="50" aria-hidden="true">{inner}</svg>'


PICT = {
    "ue": _svg(_cube(28, 22) + _dot(42, 9)),
    "shita": _svg(_cube(28, 14) + _dot(39, 45)),
    "naka": _svg(_cube(28, 18) + _dot(39, 29)),
    "soto": _svg('<rect class="pk-dash" x="18" y="12" width="34" height="30" rx="2"/>' + _dot(64, 27)),
    "mae": _svg(_cube(30, 16) + _dot(32, 38, 6)),
    "ushiro": _svg(_dot(55, 12, 6) + _cube(28, 20)),
    "migi": _svg(_cube(22, 18) + _dot(66, 29)),
    "hidari": _svg(_cube(38, 18) + _dot(14, 29)),
    "tonari": _svg(_sq(16, 16) + _sq(44, 16, on=True)),
    "yoko": _svg(_sq(22, 16) + _dot(50, 25)),
    "aida": _svg(_sq(8, 16) + _sq(54, 16) + _dot(40, 25)),
    "chikaku": _svg('<circle class="pk-halo" cx="40" cy="25" r="21"/>' + _sq(31, 16) + _dot(56, 16)),
}


# ── page ────────────────────────────────────────────────────
def render(out_html, date, eyebrow, title, desc, sections):
    """date: the lesson's date, YYYY-MM-DD -- the Notes list is ordered by it.
    eyebrow: a short series name, "Lesson 14". The note's name in raume (its
    title, and its row in the list) is "<eyebrow> · <title>"."""
    name = f"{eyebrow} · {title}"
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="raume-note" content="1">
<meta name="raume-note-date" content="{date}">
<title>{html.escape(html.unescape(name), quote=False)}</title>
</head>
<body>
<article class="rn">
<header class="rn-top"><p class="rn-eyebrow">{eyebrow}</p><h1>{title}</h1><p class="rn-desc">{desc}</p></header>
{"".join(sections)}
</article>
</body>
</html>
"""
    pathlib.Path(out_html).write_text(page)
    return page
