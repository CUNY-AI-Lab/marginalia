"""Build the preloaded demo workspaces in public/demo/.

Usage:
    python3 -I scripts/demo/build_demo.py <source-dir>

<source-dir> holds the downloaded texts (treated as untrusted data):
    pg408.txt    The Souls of Black Folk (Gutenberg #408)
    pg2376.txt   Up from Slavery (Gutenberg #2376)
    pg3279.txt   Canterbury Pieces (Gutenberg #3279)
    pg3420.txt   A Vindication of the Rights of Woman (Gutenberg #3420)
    pg5427.txt   Emile, trans. Foxley (Gutenberg #5427)
    pg27083.txt  The Subjection of Women (Gutenberg #27083)
    pg30755.txt  The Stones of Venice, vol. 2 (Gutenberg #30755)
    ws/*.txt     Wikisource pages converted by wikisource_text.py
                 (page2 = Lovelace's Notes, page3 = Cooper, erewhonNN = Erewhon 1872)

Writes public/demo/<slug>.json (WorkspaceBundle), public/demo/index.json and a
plain-text copy of every paper under <source-dir>/out/ for reading. Identity
layers come from scripts/demo/identity_layers.json; `raw` is rebuilt here with
the same template as parseIdentityLayerResponse() in src/lib/prompts.ts.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, "public", "demo")
SHARED_AT = 1794873600000  # Date.UTC(2026, 10, 17)
DESCRIPTION_TAIL = "Public-domain texts from Project Gutenberg/Wikisource; some are excerpts."


# ---------------------------------------------------------------- cleaning

def clean(text):
    """Whitespace normalisation plus plain-text transcription conventions."""
    text = re.sub(r"\{\d+\}", "", text)                 # Gutenberg page markers like {180}
    text = re.sub(r"(?<![A-Za-z0-9])_([^_]+?)_(?![A-Za-z0-9])", r"\1", text)  # _italic_ markup
    text = re.sub(r"\s*\n\s*(--|—)|(--|—)\s*\n\s*", lambda m: m.group(1) or m.group(2), text)  # dash at a line wrap
    text = text.replace("--", "—")                      # plain-text em dashes
    text = re.sub(r"\[Illustration\]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"(\* ){3,}\*", "* * *", text)        # long elision rows
    text = text.replace(" ", " ")
    return text


def gut_block(path, start, end, start_after=0):
    """Return the text between the first `start` (at/after offset) and the next `end`."""
    with open(path, encoding="utf-8-sig") as f:
        text = f.read().replace("\r\n", "\n")
    i = text.index(start, start_after)
    j = text.index(end, i + len(start))
    return text[i:j]


def gut_paras(block):
    out = []
    for p in re.split(r"\n[ \t]*\n", block):
        lines = [l for l in p.split("\n") if l.strip()]
        if len(lines) > 1 and all(re.match(r"[ \t]+\S", l) for l in lines):
            p = " / ".join(l.strip() for l in lines)  # indented verse or list: keep line breaks visible
        c = clean(p)
        if c:
            out.append(c)
    return out


def split_inline_footnotes(paras):
    """Move Gutenberg inline '[Footnote: ...]' notes into their own paragraph after the host."""
    out = []
    for p in paras:
        notes = re.findall(r"\s*\[Footnote: [^\]]*\]", p)
        for n in notes:
            p = p.replace(n, "")
        out.append(re.sub(r"\s+", " ", p).strip())
        out.extend(n.strip() for n in notes)
    return out


def ws_paras(path):
    with open(path, encoding="utf-8") as f:
        return [p.strip() for p in f.read().split("\n\n") if p.strip()]


def unmath(p):
    """Turn [MATH ...] spans from wikisource_text.py into inline text."""
    def fix(m):
        s = m.group(1).strip()
        s = re.sub(r",(?=\S)", ", ", s)
        s = re.sub(r"\s*=\s*", " = ", s)
        return " " + s + " "
    p = re.sub(r"\s*\[MATH (.*?)\]\s*", fix, p)
    p = re.sub(r"\s+([,.;:)])", r"\1", p)
    p = re.sub(r"\(\s+", "(", p)
    return re.sub(r"\s+", " ", p).strip()


def decap_opening(p):
    """'THE writer' -> 'The writer': undo the small-caps first word of a chapter."""
    return re.sub(r'^(["“]?)([A-Z])([A-Z]+)\b(?=[ ,])', lambda m: m.group(1) + m.group(2) + m.group(3).lower(), p, count=1)


def H(level, text):
    return {"type": level, "content": text}


def B(text):
    return {"type": "body", "content": text}


# ---------------------------------------------------------------- papers

def ruskin(src):
    block = gut_block(os.path.join(src, "pg30755.txt"), "CHAPTER VI.\n\nTHE NATURE OF GOTHIC.",
                      "§ XXVI. The second mental element")
    paras = [re.sub(r"\[\d+\]", "", p) for p in gut_paras(block)]  # footnote markers (notes not included)
    assert paras[0] == "CHAPTER VI." and paras[1] == "THE NATURE OF GOTHIC.", paras[:2]
    assert paras[-1].endswith("true Gothic cannot exist without it."), paras[-1]
    return [H("h1", "The Nature of Gothic (opening: Savageness)")] + [B(p) for p in paras[2:]]


def lovelace(src):
    ps = ws_paras(os.path.join(src, "ws", "page2.txt"))
    def at(prefix):
        hits = [i for i, p in enumerate(ps) if p.startswith(prefix)]
        assert len(hits) == 1, (prefix, hits)
        return hits[0]

    a0 = at("In studying the action of the Analytical Engine")
    a1 = at("Note B.—Page 676.")
    note_a = ps[a0:a1]
    # Merge the display formula that splits one sentence across three blocks.
    k = next(i for i, p in enumerate(note_a) if p.startswith("[MATH Δⁿu_z=0] ;"))
    note_a[k - 1:k + 2] = [note_a[k - 1] + " " + note_a[k] + " " + note_a[k + 1]]

    g0 = at("It is desirable to guard against the possibility")
    g_cont = at("knowledge, various collateral influences")
    g_end = at("It can provide for singular values.")
    note_g = [ps[g0], ps[g0 + 1] + " " + ps[g_cont]] + ps[g_cont + 1:g_end]
    assert ps[g0 + 1].startswith("The Analytical Engine has no pretensions")

    out = [H("h1", "Notes by the Translator: Note A and Note G (selections)"), H("h2", "Note A")]
    # The signature "A. A. L." closes Note A; it was a separate right-aligned line.
    assert note_a[-1].endswith("calculating engines.A. A. L."), note_a[-1][-40:]
    note_a[-1:] = [note_a[-1][:-len("A. A. L.")], "A. A. L."]
    out += [B(unmath(p)) for p in note_a]
    out += [H("h2", "Note G")]
    out += [B(unmath(p)) for p in note_g]
    for p in out:
        assert "[MATH" not in p["content"]
    return out


def butler_darwin(src):
    block = gut_block(os.path.join(src, "pg3279.txt"), "SIR—There are few things", "Lucubratio Ebria\n")
    paras = gut_paras(block)
    assert paras[-1] == "CELLARIUS" and paras[-2] == "I am, Sir, etc.,", paras[-2:]
    return [H("h1", "Darwin Among the Machines")] + [B(p) for p in paras]


def butler_erewhon(src):
    out = [H("h1", "The Book of the Machines (Erewhon, 1872, chs. 21–23)")]
    for n in (21, 22, 23):
        ps = ws_paras(os.path.join(src, "ws", f"erewhon{n}.txt"))
        assert re.match(r"CHAPTER [XVI]+\.$", ps[0]), ps[0]
        num = ps[0].split()[1].rstrip(".")
        names = {"THE BOOK OF THE MACHINES.": "The Book of the Machines",
                 "THE MACHINES—continued.": "The Machines—continued",
                 "THE MACHINES—concluded.": "The Machines—concluded"}
        out.append(H("h2", f"Chapter {num}: {names[ps[1]]}"))
        body = [clean(p) for p in ps[2:]]
        body[0] = decap_opening(body[0])
        out += [B(p) for p in body]
    return out


def souls_chapter(src, title, next_title):
    block = gut_block(os.path.join(src, "pg408.txt"), "\n" + title + "\n", "\n" + next_title + "\n", start_after=3000)
    paras = gut_paras(block)
    assert paras[0] == title
    # Drop the chapter's verse epigraph and its attribution, which precede the
    # [Illustration] of musical bars (removed by clean()).
    raw = re.split(r"\n[ \t]*\n", block)
    k = next(i for i, p in enumerate(raw) if "[Illustration]" in p)
    body = gut_paras("\n\n".join(raw[k + 1:]))
    # trailing roman numeral of the next chapter
    while body and re.fullmatch(r"[IVX]+\.", body[-1]):
        body.pop()
    return [H("h1", title)] + [B(p) for p in body]


def washington(src):
    block = gut_block(os.path.join(src, "pg2376.txt"), "Chapter XIV.\nThe Atlanta Exposition Address", "Chapter XV.\n")
    paras = gut_paras(block)
    assert paras[0].startswith("Chapter XIV.")
    out = [H("h1", "The Atlanta Exposition Address (Up from Slavery, ch. 14)")]
    out += [B(p) for p in paras[1:]]
    return out


def cooper(src):
    ps = ws_paras(os.path.join(src, "ws", "page3.txt"))
    assert ps[0].startswith("THE HIGHER EDUCATION OF WOM"), ps[0]
    body = [clean(p) for p in ps[1:]]
    body[0] = decap_opening(body[0])
    return [H("h1", "The Higher Education of Woman")] + [B(p) for p in body]


def wollstonecraft(src):
    block = gut_block(os.path.join(src, "pg3420.txt"), "CHAPTER 5.\n\nANIMADVERSIONS", "SECTION 5.2.")
    paras = gut_paras(block)
    assert paras[0] == "CHAPTER 5." and paras[3] == "SECTION 5.1.", paras[:4]
    out = [H("h1", "A Vindication of the Rights of Woman, ch. 5, sect. I (on Rousseau)"),
           H("h2", "Chapter 5. Animadversions on Some of the Writers Who Have Rendered Women Objects of Pity, Bordering on Contempt"),
           B(paras[2]),
           H("h3", "Section I")]
    out += [B(p) for p in paras[4:]]
    return out


def rousseau(src):
    block = gut_block(os.path.join(src, "pg5427.txt"), "\nBOOK V\n",
                      "If boys are incapable of forming any true idea of religion")
    paras = split_inline_footnotes(gut_paras(block))
    assert paras[0] == "BOOK V"
    k = paras.index("SOPHY, OR WOMAN")
    out = [H("h1", "Emile, Book V: Sophy, or Woman (opening)"), H("h2", "Book V")]
    out += [B(p) for p in paras[1:k]]
    out += [H("h3", "Sophy, or Woman")]
    out += [B(p) for p in paras[k + 1:]]
    return out


def mill(src):
    block = gut_block(os.path.join(src, "pg27083.txt"), "\nCHAPTER I.\n", "\nCHAPTER II.\n")
    paras = gut_paras(block)
    assert paras[0] == "CHAPTER I."
    return [H("h1", "The Subjection of Women, ch. 1"), H("h2", "Chapter I")] + [B(p) for p in paras[1:]]


# ---------------------------------------------------------------- sets

SETS = [
    {
        "slug": "minds-and-machines",
        "name": "Minds and Machines, 1843–1872",
        "lead": ("Ruskin argues that demanding machine-like precision turns workmen into tools and shuts "
                 "thought out of their work; Lovelace explains what a calculating engine can and cannot do; "
                 "Butler imagines machines evolving into humanity's successors."),
        "papers": [
            ("ruskin", "The Nature of Gothic (opening: Savageness)", "John Ruskin", 1853, "chapter", ruskin),
            ("lovelace", "Notes by the Translator: Note A and Note G (selections)", "Ada Lovelace", 1843, "article", lovelace),
            ("butler-darwin", "Darwin Among the Machines", "Samuel Butler", 1863, "article", butler_darwin),
            ("butler-erewhon", "The Book of the Machines (Erewhon, 1872, chs. 21–23)", "Samuel Butler", 1872, "chapter", butler_erewhon),
        ],
    },
    {
        "slug": "education-debate",
        "name": "The Education Debate, 1892–1903",
        "lead": ("Washington argues that Black Southerners should build up through industrial training and "
                 "defer the fight for political rights; Du Bois answers that higher education and the ballot "
                 "cannot wait; Cooper makes the case for the higher education of Black women."),
        "papers": [
            ("dubois-washington", "Of Mr. Booker T. Washington and Others", "W. E. B. Du Bois", 1903, "chapter",
             lambda s: souls_chapter(s, "Of Mr. Booker T. Washington and Others", "Of the Meaning of Progress")),
            ("washington-atlanta", "The Atlanta Exposition Address (Up from Slavery, ch. 14)", "Booker T. Washington", 1895, "chapter", washington),
            ("dubois-training", "Of the Training of Black Men", "W. E. B. Du Bois", 1903, "chapter",
             lambda s: souls_chapter(s, "Of the Training of Black Men", "Of the Black Belt")),
            ("cooper", "The Higher Education of Woman", "Anna Julia Cooper", 1892, "chapter", cooper),
        ],
    },
    {
        "slug": "women-and-reason",
        "name": "Women, Reason, and Education, 1762–1869",
        "lead": ("Rousseau holds that women should be educated to please and serve men; Wollstonecraft answers "
                 "him point by point, insisting that virtue and reason have no sex; Mill argues that the "
                 "subordination of women rests on custom and force, not on any knowledge of their nature."),
        "papers": [
            ("wollstonecraft", "A Vindication of the Rights of Woman, ch. 5, sect. I (on Rousseau)", "Mary Wollstonecraft", 1792, "chapter", wollstonecraft),
            ("rousseau", "Emile, Book V: Sophy, or Woman (opening)", "Jean-Jacques Rousseau (trans. Barbara Foxley)", 1762, "chapter", rousseau),
            ("mill", "The Subjection of Women, ch. 1", "John Stuart Mill", 1869, "chapter", mill),
        ],
    },
]


def build_raw(layer):
    """Same template as parseIdentityLayerResponse() in src/lib/prompts.ts."""
    samples = "\n".join(f'"{q}"' for q in layer["voiceSamples"])
    return (f"CORE COMMITMENTS:\n{layer['coreCommitments']}\n\n"
            f"ANTAGONISTS:\n{layer['antagonists']}\n\n"
            f"CHARACTERISTIC MOVES:\n{layer['characteristicMoves']}\n\n"
            f"KEY VOCABULARY:\n{', '.join(layer['vocabulary'])}\n\n"
            f"TRIGGERS:\n{layer['triggers']}\n\n"
            f"CHARACTERISTIC PASSAGES:\n{samples}")


def full_text(paragraphs):
    marks = {"h1": "# ", "h2": "## ", "h3": "### ", "body": ""}
    return "\n\n".join(marks[p["type"]] + p["content"] for p in paragraphs)


def main():
    src = sys.argv[1]
    layers_path = os.path.join(HERE, "identity_layers.json")
    layers = {}
    if os.path.exists(layers_path):
        with open(layers_path, encoding="utf-8") as f:
            layers = json.load(f)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(src, "out"), exist_ok=True)
    index = []
    for s in SETS:
        papers, meta, words = [], [], 0
        for key, title, author, year, ptype, fn in s["papers"]:
            paragraphs = fn(src)
            assert paragraphs[0]["type"] == "h1"
            ft = full_text(paragraphs)
            n = sum(len(p["content"].split()) for p in paragraphs if p["type"] == "body")
            words += n
            paper = {"title": title, "author": author, "type": ptype, "fullText": ft, "paragraphs": paragraphs}
            if key in layers:
                layer = {k: layers[key][k] for k in ("coreCommitments", "antagonists", "characteristicMoves",
                                                     "vocabulary", "triggers", "voiceSamples")}
                layer["raw"] = build_raw(layer)
                paper["identityLayer"] = layer
            else:
                print(f"WARNING: no identity layer for {key}", file=sys.stderr)
            papers.append(paper)
            meta.append({"title": title, "author": author, "year": year})
            with open(os.path.join(src, "out", f"{key}.txt"), "w", encoding="utf-8") as f:
                f.write(ft + "\n")
            print(f"{s['slug']:20} {key:20} {n:6} words  {len(paragraphs):4} paragraphs")
        description = f"{s['lead']} {DESCRIPTION_TAIL}"
        bundle = {"version": 1, "sharedAt": SHARED_AT,
                  "workspace": {"name": s["name"], "description": description},
                  "papers": papers}
        path = os.path.join(OUT, f"{s['slug']}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  -> {os.path.relpath(path, REPO)}: {os.path.getsize(path):,} bytes, {words} words")
        index.append({"slug": s["slug"], "name": s["name"], "description": description,
                      "papers": meta, "words": words})
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
