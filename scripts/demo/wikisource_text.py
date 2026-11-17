"""Convert a saved Wikisource `action=parse` JSON response into plain paragraphs.

Usage: python3 -I wikisource_text.py <page.json> <out.txt>

Writes one paragraph per blank-line-separated block. Verse line breaks (<br>,
which these pages use only inside poems) become " / ". Page-number spans,
footnote reference markers, headers and other `ws-noexport` furniture are
dropped. MathML is flattened to text, with super/subscripts written as
Unicode where possible, and wrapped in [MATH ...] so that formula-heavy
paragraphs can be recognised and left out of excerpts.
"""
import json
import re
import sys
from html.parser import HTMLParser

BLOCK = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "tr", "dd", "dl", "ul", "ol", "center"}
SKIP_CLASSES = ("ws-noexport", "pagenum", "reference", "mw-editsection", "wst-header", "ws-header",
                "mw-cite-backlink", "mw-references-wrap", "references")
VOID = {"br", "hr", "img", "link", "meta", "input", "wbr"}
BR = "⁣/"  # placeholder for a verse line break

SUP = str.maketrans("0123456789+-=()nix", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣ")
SUB = str.maketrans("0123456789+-=()aexz", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₓ\u0000")


def script(text, table, fallback):
    t = text.strip()
    if t and all(ch.translate(table) != ch and ch.translate(table) != "\u0000" for ch in t):
        return t.translate(table)
    return f"{fallback}({t})" if len(t) > 1 else f"{fallback}{t}"


class Node:
    def __init__(self, tag):
        self.tag = tag
        self.kids = []

    def text(self):
        parts = [k if isinstance(k, str) else k.text() for k in self.kids]
        if self.tag in ("msup", "msub") and len(self.kids) >= 2:
            base, idx = parts[0], parts[1]
            if self.tag == "msup":
                return base + script(idx, SUP, "^")
            return base + script(idx, SUB, "_")
        if self.tag == "msubsup" and len(parts) >= 3:
            return parts[0] + script(parts[1], SUB, "_") + script(parts[2], SUP, "^")
        if self.tag == "mfrac" and len(parts) >= 2:
            return f"{parts[0]}/{parts[1]}"
        return "".join(parts)


class Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.cur = []
        self.skip_depth = None
        self.depth = 0
        self.math = []  # stack of Nodes while inside <math>

    def flush(self):
        text = "".join(self.cur)
        text = re.sub(r"[ \t\r\n​­]+", " ", text).strip()
        text = re.sub(r"(\s*" + BR + r"\s*)+", " " + BR + " ", text).strip()
        text = re.sub(r"^" + BR + r"\s*|\s*" + BR + r"$", "", text).replace(BR, "/").strip()
        if text:
            self.out.append(text)
        self.cur = []

    def handle_starttag(self, tag, attrs):
        cls = (dict(attrs).get("class") or "").split()
        if tag in VOID:
            if tag == "br" and self.skip_depth is None and not self.math:
                self.cur.append(" " + BR + " ")
            return
        self.depth += 1
        if self.skip_depth is not None:
            return
        if tag in ("style", "script", "annotation") or any(c in SKIP_CLASSES for c in cls):
            self.skip_depth = self.depth
            return
        if tag == "math" or self.math:
            node = Node(tag)
            if self.math:
                self.math[-1].kids.append(node)
            self.math.append(node)
            return
        if tag in BLOCK:
            self.flush()

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if self.skip_depth is not None:
            if self.depth == self.skip_depth:
                self.skip_depth = None
            self.depth -= 1
            return
        self.depth -= 1
        if self.math:
            node = self.math.pop()
            if not self.math:
                self.cur.append(" [MATH " + node.text() + "] ")
            return
        if tag in BLOCK:
            self.flush()

    def handle_data(self, data):
        if self.skip_depth is not None:
            return
        if self.math:
            self.math[-1].kids.append(data.strip())
            return
        self.cur.append(data)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f:
        html = json.load(f)["parse"]["text"]["*"]
    ex = Extractor()
    ex.feed(html)
    ex.close()
    ex.flush()
    with open(dst, "w", encoding="utf-8") as f:
        f.write("\n\n".join(ex.out) + "\n")


if __name__ == "__main__":
    main()
