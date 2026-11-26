"""Building blocks for lesson notes that raume draws as its own screens.

A lesson file imports this kit, builds its sections from these components
and calls render(). The result is one HTML file to add on the Notes screen
(Notes › Add): plain markup in rn-* classes with no styles or scripts of its
own -- raume supplies the look (css/site.css, .rn), dark mode, the study
controls (Quiz, English / Furigana), tap-for-romaji, tap-to-reveal and
the speakers (js/notes.js). Opened anywhere else it is readable, unstyled.

Every note has the same shape, so lessons read alike side by side:

- Sections come in one fixed order, each kind in its own colour and named
  in its header: Grammar, Conversation, Vocabulary, Practice, Watch out,
  Reference (OUTLINE). section() takes the kind; render() puts the sections
  in that order and numbers them.
- Japanese is written the way raume's own words are: furigana as
  漢字(かんじ) right after the kanji, particles in square brackets --
  わたし[は] がくせいです -- drawn bold blue, as everywhere in raume.
  r() and p() do the same inside an f-string.
- render() checks the Japanese before it writes anything: every kanji in a
  Japanese line has furigana, and every romaji line spells its Japanese
  (particles as wa / e / o, long vowels as ō or ou). It stops with a list of
  what to fix. stack(..., check=False) skips one line on purpose.
- A class note -- render(..., source="sakura" or "wsjj") -- has no word
  lists: the lesson's words go in words(), and render() writes them to a
  .csv beside the note for that class's vocabulary table (Customize ›
  Import a list). See words().

Notes are Japanese and English only -- never Polish: class material that
arrives with Polish glosses or translations keeps just the English.

Lesson files hold the reader's own notes, so they never go in the repo:
keep them in private-notes/ (gitignored) or anywhere outside it.

    python3 private-notes/2026-11-21.py
"""
import datetime
import html
import html.parser
import pathlib
import re
import unicodedata

# Section colours: raume's tile hues. ("pink" maps to clay -- raume has no pink.)
HUES = {"blue", "green", "orange", "purple", "teal", "indigo", "amber", "clay", "slate"}
ALIASES = {"pink": "clay"}

# The order every note's sections come in, each kind's name and colour.
OUTLINE = [
    ("grammar", "Grammar", "blue"),
    ("conversation", "Conversation", "teal"),
    ("vocabulary", "Vocabulary", "green"),
    ("practice", "Practice", "orange"),
    ("watch", "Watch out", "clay"),
    ("reference", "Reference", "slate"),
]
KINDS = {k: (name, hue) for k, name, hue in OUTLINE}

KANJI = "\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆ヶ"
_KANJI_RE = re.compile(f"[{KANJI}]")
_FURIGANA_RE = re.compile(f"([{KANJI}]+)[(（]([぀-ゟ゠-ヿー]+)[)）]")
_PARTICLE_RE = re.compile(r"\[([ぁ-ゖ]{1,3})\]")


def r(kanji, kana):
    """Kanji with furigana."""
    return f"<ruby>{kanji}<rt>{kana}</rt></ruby>"


def p(kana):
    """A particle: bold blue, read as a particle (は = wa)."""
    return f'<span class="particle">{kana}</span>'


def jp_markup(s):
    """漢字(かんじ) -> furigana, [は] -> a particle."""
    s = _FURIGANA_RE.sub(lambda m: r(m.group(1), m.group(2)), s)
    return _PARTICLE_RE.sub(lambda m: p(m.group(1)), s)


def az_key(romaji):
    return unicodedata.normalize("NFD", romaji).encode("ascii", "ignore").decode().lower()


def hl(t):
    """Highlights the part that matters, in the section's colour."""
    return f'<b class="rn-hl">{t}</b>'


def ok(t):
    return f'<span class="rn-ok">{t} ✓</span>'


def wrong(t):
    return f'<span class="rn-x">{t} ✗</span>'


_ENTITY_RE = re.compile(r"&(?!#?\w+;)")
_LT_RE = re.compile(r"<(?![A-Za-z/!])")


def _text(s):
    """Lets a stray & or < in plain text through without breaking the page."""
    s = str(s)
    return _LT_RE.sub("&lt;", _ENTITY_RE.sub("&amp;", s))


# ── checking the Japanese ───────────────────────────────────
_ROMA = dict(zip(
    "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわゐゑをん"
    "がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉゔ",
    "a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no ha hi fu he ho "
    "ma mi mu me mo ya yu yo ra ri ru re ro wa i e o n "
    "ga gi gu ge go za ji zu ze zo da ji zu de do ba bi bu be bo pa pi pu pe po a i u e o vu".split()))
_PAIRS = {
    "うぃ": "wi", "うぇ": "we", "うぉ": "wo", "ゔぁ": "va", "ゔぃ": "vi", "ゔぇ": "ve", "ゔぉ": "vo",
    "しぇ": "she", "じぇ": "je", "ちぇ": "che", "てぃ": "ti", "でぃ": "di", "とぅ": "tu", "どぅ": "du",
    "ふぁ": "fa", "ふぃ": "fi", "ふぇ": "fe", "ふぉ": "fo", "つぁ": "tsa",
}
for _k, _stem in zip("きぎしじちぢにひびぴみり", "ky gy sh j ch j ny hy by py my ry".split()):
    for _small, _v in zip("ゃゅょ", "auo"):
        _PAIRS[_k + _small] = _stem + _v
_PARTICLE_SAYS = {"は": "wa", "へ": "e", "を": "o"}


def kana_romaji(s):
    """Hepburn romaji for kana. \x01 marks a particle は / へ / を."""
    s = unicodedata.normalize("NFKC", s)
    s = "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)
    out, i, double = [], 0, False
    while i < len(s):
        c = s[i]
        if c == "\x01" and i + 1 < len(s):
            syl = _PARTICLE_SAYS.get(s[i + 1], _ROMA.get(s[i + 1], ""))
            i += 2
        elif s[i:i + 2] in _PAIRS:
            syl, i = _PAIRS[s[i:i + 2]], i + 2
        elif c in _ROMA:
            syl, i = _ROMA[c], i + 1
        elif c == "っ":
            double, i = True, i + 1
            continue
        elif c == "ー":
            prev = "".join(out)
            syl, i = (prev[-1] if prev and prev[-1] in "aeiou" else ""), i + 1
        elif c.isascii() and c.isalnum():
            syl, i = c.lower(), i + 1
        else:
            i += 1
            continue
        if double and syl:
            syl = ("t" if syl.startswith("ch") else syl[0]) + syl
        double = False
        out.append(syl)
    return "".join(out)


def _same_spelling(a):
    """Folds the ways one word can be spelt: ō / oo / ou, shimbun / shinbun."""
    a = unicodedata.normalize("NFKD", a.lower())
    out = []
    for ch in a:
        if ch in "\u0304\u0302" and out:
            out.append(out[-1])
        elif not unicodedata.combining(ch):
            out.append(ch)
    a = re.sub(r"[^a-z0-9]", "", "".join(out))
    a = a.replace("tch", "cch").replace("ou", "o")
    a = re.sub(r"m(?=[bmp])", "n", a)
    return re.sub(r"([aeiou])\1+", r"\1", a)


class _Reading(html.parser.HTMLParser):
    """A Japanese line's reading (furigana for kanji, particles marked) and
    any kanji left without furigana."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.bare, self.stack = [], [], []
        self.base, self.rt = [], []

    def _in(self, what):
        return any(what in f for f in self.stack)

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get("class") or ""
        flags = {tag}
        if tag == "span" and "particle" in cls.split():
            flags.add("particle")
        if tag == "ruby":
            self.base, self.rt = [], []
        self.stack.append(flags)

    def handle_endtag(self, tag):
        while self.stack:
            flags = self.stack.pop()
            if tag in flags:
                break
        if tag == "ruby":
            self.out.append("".join(self.rt) or "".join(self.base))

    def handle_data(self, data):
        if self._in("rp"):
            return
        if self._in("rt"):
            self.rt.append(data)
        elif self._in("ruby"):
            self.base.append(data)
        else:
            self.bare.extend(_KANJI_RE.findall(data))
            if self._in("particle"):
                data = "".join("\x01" + c for c in data)
            self.out.append(data)


_problems = []

# raume's 102 N5 kanji (the N5 Kanji tables in data/vocabulary.js): a lesson
# note uses only these; a word with any other kanji is written in kana, as a
# beginner textbook does (じてんしゃ, まち, しずか).
_N5 = set(re.findall(r'"type":"kanji","jp":\[\{"kanji":"(.)"',
                     (pathlib.Path(__file__).resolve().parents[1] / "data" / "vocabulary.js").read_text(encoding="utf-8")))


def _check(jp, ro):
    rd = _Reading()
    rd.feed(jp)
    rd.close()
    plain = re.sub(r"<[^>]+>", "", jp)
    if rd.bare:
        _problems.append(f"no furigana on {''.join(dict.fromkeys(rd.bare))}: {plain}")
    beyond = [c for c in dict.fromkeys(_KANJI_RE.findall(re.sub(r"<rt>.*?</rt>", "", jp))) if _N5 and c not in _N5]
    if beyond:
        _problems.append(f"{''.join(beyond)} isn't one of raume's N5 kanji -- write the word in kana: {plain}")
    if ro and not rd.bare:
        said = kana_romaji("".join(rd.out))
        if _same_spelling(said) != _same_spelling(html.unescape(re.sub(r"<[^>]+>", "", ro))):
            _problems.append(f"romaji doesn't match: {plain} -> {ro!r} (the Japanese says {said!r})")


# ── components ──────────────────────────────────────────────
def stack(jp, ro, en, tag=None, ans=False, check=True):
    """Japanese / romaji / English. ans=True marks it as something Quiz covers;
    check=False leaves this line out of render()'s Japanese check."""
    jp = jp_markup(jp)
    if check:
        _check(jp, ro)
    t = f'<div class="rn-tag">{_text(tag)}</div>' if tag else ""
    cls = "rn-st rn-ans" if ans else "rn-st"
    return (f'<div class="{cls}">{t}<div class="rn-jp" lang="ja">{jp}</div>'
            f'<div class="rn-ro">{_text(ro)}</div><div class="rn-en">{_text(en)}</div></div>')


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


# Each word is listed once per note: a class note is for reviewing at a
# glance, so a word list that repeats another one (the same adjectives again
# as opposite pairs) is noise. render() stops on a repeat.
_listed = {}


def _note_listed(jp, where):
    for word in re.split(r"\s*[↔⇔→/／・]\s*", _text(re.sub(r"<[^>]+>", "", jp_markup(jp)))):
        word = re.sub(r"[（(][^)）]*[)）]|\s", "", word)
        if not word:
            continue
        if word in _listed and _listed[word] != where:
            _problems.append(f"{word} is listed twice (in “{_listed[word]}” and “{where}”) -- list each word once")
        _listed.setdefault(word, where)


def tiles(items, n=4, az=False):
    """items: [(icon or '', jp, romaji, english)]: a word list, drawn as one
    card with a row per word. n (2, 3 or 4) is no longer used for layout and
    is only checked. az=True sorts by romaji."""
    if n not in (2, 3, 4):
        raise ValueError(f"tiles: n is 2, 3 or 4, not {n!r}")
    if az:
        items = sorted(items, key=lambda it: az_key(it[2]))
    where = re.sub(r"<[^>]+>", "", items[0][1]) if items else ""
    _tiles_used.append(where)
    for it in items:
        _note_listed(it[1], f"the list starting {where}")
    out = []
    for it in items:
        icon = f'<div class="rn-ic" aria-hidden="true">{it[0]}</div>' if it[0] else ""
        out.append(f'<div class="rn-tile">{icon}{stack(*it[1:], ans=True)}</div>')
    return f'<div class="rn-tiles rn-c{n}">' + "".join(out) + "</div>"


# A class note (Sakura, WSJJ) holds the lesson -- patterns, rules, practice
# -- and no word lists: its words go to that class's vocabulary table.
# words() takes them without drawing anything, and render(source=...) writes
# them to <date>.<source>.csv in raume's Import a list format
# (japanese(furigana),romaji,english), to import into the reader's own table
# for that class. A class table gets every word of the lesson, even ones
# raume's own tables already have -- it is the list of what that class
# taught. A word already sent by an earlier note of the same class is left
# out.
SOURCES = ("sakura", "wsjj")
_words = []
_tiles_used = []


def words(items):
    """items: [(jp, romaji, english)] -- the lesson's vocabulary, one word
    each, Japanese written as in a word list (漢字(かんじ), no particles).
    Nothing shows in the note."""
    for jp, ro, en in items:
        _check(jp_markup(jp), ro)
        _note_listed(jp, "the lesson's words")
        if re.search(r"\s|\[|[,，]", jp) or re.search(f"(?<![{KANJI}])[(（]", jp):
            _problems.append(f"{jp}: a word for its table is one word -- no spaces, particles or (な)")
        _words.append((jp.replace("（", "(").replace("）", ")"), ro.lower(), en.replace(" · ", ", ")))


def _write_words(out_html, date, source):
    out_dir = pathlib.Path(out_html).parent
    sent = set()
    for f in out_dir.glob(f"*.{source}.csv"):
        if f.name.split(".")[0] < date:
            sent.update(line.split(",")[0] for line in f.read_text(encoding="utf-8").splitlines()[1:])
    rows = []
    for jp, ro, en in _words:
        if jp in sent:
            continue
        rows.append(f"{jp},{ro},{en}")
    out = out_dir / f"{pathlib.Path(out_html).stem}.{source}.csv"
    out.write_text("japanese,romaji,english\n" + "".join(x + "\n" for x in rows), encoding="utf-8")
    print(f"{len(rows)} of {len(_words)} words -> {out.name}")


def tip(mark, text, ex=None, check=True):
    """A tip: `text` is the rule, short; `ex` its examples, one per line --
    (jp, romaji, english) tuples (checked like any Japanese line; romaji or
    english may be "") or ready markup such as ok() / wrong(). Keep the
    Japanese out of `text` and in `ex`, so a tip reads rule first, then a
    line per example, never one run-on sentence. check=False leaves the
    examples out of render()'s Japanese check (digits: 7じ = shichiji)."""
    lines = ""
    for e in ex or []:
        if isinstance(e, str):
            lines += f'<div class="rn-ex">{e}</div>'
            continue
        jp, ro, en = e
        jp = jp_markup(jp)
        # "ひと → ひとたち" / "hito → hitotachi": each side checked on its own.
        jps, ros = jp.split("→"), ro.split("→") if ro else []
        for i, part in enumerate(jps if check else []):
            _check(part.strip(), ros[i].strip() if len(ros) == len(jps) else "")
        lines += (f'<div class="rn-ex"><span class="rn-ex-jp" lang="ja">{jp}</span>'
                  + (f'<span class="rn-ex-ro">{_text(ro)}</span>' if ro else "")
                  + (f'<span class="rn-ex-en">{_text(en)}</span>' if en else "") + "</div>")
    return f'<div class="rn-tip"><span class="rn-dot" aria-hidden="true">{mark}</span><div>{text}{lines}</div></div>'


def tips(*items):
    return '<div class="rn-tips">' + "".join(items) + "</div>"


def two(*blocks, flush=False):
    """Two blocks side by side (stacked on a phone)."""
    return f'<div class="rn-two{" rn-flush" if flush else ""}">' + "".join(blocks) + "</div>"


def formula(lines):
    """lines: (label, jp, romaji, english). The older (label, jp, "romaji ·
    english") still works -- raume splits it onto two lines."""
    rows = ""
    for line in lines:
        lab, jp, ro = line[:3]
        en = line[3] if len(line) > 3 else ""
        rows += (f'<div class="rn-fl"><span class="rn-lab">{lab}</span><div><div class="rn-fj" lang="ja">{jp_markup(jp)}</div>'
                 f'<div class="rn-fr">{_text(ro)}</div>' + (f'<div class="rn-fe">{_text(en)}</div>' if en else "") + "</div></div>")
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


def section(kind, title, sub, body):
    """One section of the note. kind is where it goes in the note and its
    colour (OUTLINE): grammar, conversation, vocabulary, practice, watch or
    reference. render() orders and numbers them."""
    if kind not in KINDS:
        raise ValueError(f"unknown section kind {kind!r} -- one of: {', '.join(KINDS)}")
    return (kind, title, sub, body)


def _section_html(n, kind, title, sub, body):
    name, color = KINDS[kind]
    sub = f"{name} · {sub}" if sub else name
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
def lesson_name(date):
    """2026-11-21 -> "Sat 21 Nov 2026": what a lesson note is called (the
    app shows it as the device writes dates, never "21st")."""
    d = datetime.date.fromisoformat(date)
    return f"{d:%a} {d.day} {d:%b} {d.year}"


def render(out_html, date, title, desc, sections, eyebrow=None, source=None):
    """date: the lesson's date, YYYY-MM-DD -- the Notes list is ordered by it.
    The note is named by its date ("Sat 21 Nov 2026", or `eyebrow` if
    given): that is its title in raume and its row in the list; `title` is
    the lesson's topic, the heading over the description. sections: from
    section(), in any order -- they're put in OUTLINE order and numbered.
    source: "sakura" or "wsjj" for a class note -- its words() go to the
    class's table file (see words()) and it may not have word lists.
    Nothing is written while the Japanese check has problems."""
    if source is not None and source not in SOURCES:
        raise ValueError(f"render: source is one of {SOURCES} or None, not {source!r}")
    if source:
        _problems.extend(f"the word list starting {w} -- a class note has no word lists: move it into words()"
                         for w in _tiles_used)
    elif _words:
        _problems.append("words() goes in a class note: render(..., source=\"sakura\" or \"wsjj\")")
    if _problems:
        raise SystemExit("Fix these before the note is written:\n" + "\n".join("  - " + x for x in _problems))
    order = {k: i for i, (k, _, _) in enumerate(OUTLINE)}
    sections = sorted(sections, key=lambda s: order[s[0]])
    body = "".join(_section_html(i + 1, *s) for i, s in enumerate(sections))
    eyebrow = eyebrow or lesson_name(date)
    name = eyebrow
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
{body}
</article>
</body>
</html>
"""
    pathlib.Path(out_html).write_text(page, encoding="utf-8")
    if source:
        _write_words(out_html, date, source)
    return page
