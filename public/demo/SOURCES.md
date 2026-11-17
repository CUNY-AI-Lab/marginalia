# Demo workspace sources

All texts are in the public domain. They were downloaded on 2026-11-17 from Project Gutenberg (through its PGLAF mirror, `gutenberg.pglaf.org/cache/epub/<id>/pg<id>.txt`, because www.gutenberg.org was down for maintenance that day) or from English Wikisource (MediaWiki `action=parse`). The bundles are rebuilt with:

```sh
sh scripts/demo/fetch_sources.sh <empty-scratch-dir>
python3 -I scripts/demo/build_demo.py <empty-scratch-dir>
node scripts/demo/check-demo.mjs
```

Identity layers are hand-written from a reading of each excerpt and live in `scripts/demo/identity_layers.json`; `build_demo.py` builds `raw` from them with the same template as `parseIdentityLayerResponse()`.

## Editing applied to every text

- Gutenberg headers, footers, licence text, transcriber notes and editorial headnotes removed.
- Hard-wrapped lines joined and whitespace collapsed. Line breaks in verse (and in Ruskin's short numbered list) are shown as ` / `, because the reader renders each paragraph as one block.
- Gutenberg plain-text conventions undone: `_italic_` underscores removed, `--` turned into an em dash, `{180}`-style page markers removed. Words in CAPITALS (Gutenberg's rendering of italics in Wollstonecraft) are left as they are.
- Headings (`#`, `##`, `###`) are editorial labels for navigation, not source text.
- Spelling, punctuation and the original printers' errors are kept, for example "tho Analytical Engine" (Lovelace), "You must either made a tool" (Ruskin), "[in the [a past position" (Cooper).

## 1. Minds and Machines, 1843–1872 (`minds-and-machines.json`)

| Text | Edition | Source | What is included |
|---|---|---|---|
| John Ruskin, "The Nature of Gothic" (1853) | *The Stones of Venice*, vol. II, ch. VI; Library Edition of *The Complete Works of John Ruskin* | Gutenberg #30755, https://www.gutenberg.org/ebooks/30755 | The opening of the chapter, §§ I–XXV, through the end of the first element, Savageness (about 8,000 words). Footnote reference numbers [56]–[58] removed; the notes themselves are not included. |
| Ada Lovelace, "Notes by the Translator" (1843) | *Scientific Memoirs*, vol. 3, ed. Richard Taylor (London: Richard and John E. Taylor, 1843), appended to her translation of L. F. Menabrea's "Sketch of the Analytical Engine" | Wikisource (from the scan `Scientific Memoirs, Vol. 3 (1843).djvu`), https://en.wikisource.org/wiki/Scientific_Memoirs/3/Sketch_of_the_Analytical_Engine_invented_by_Charles_Babbage,_Esq./Notes_by_the_Translator | **Note A**, from "In studying the action of the Analytical Engine" to the signature "A. A. L." (its opening formula-heavy paragraphs are left out). **Note G**, its prose opening (the "no pretensions whatever to originate any thing" passage) and the list of what the engine can do, stopping before the integration examples and the Bernoulli-number computation and table. Notes B–F are omitted. The few inline formulas are written as plain text (e.g. "Δⁿu_z = 0", "(+, +, +, +, +, +)"); a display formula that split one sentence across three blocks is rejoined; a Note G sentence interrupted by the Bernoulli diagram is rejoined. About 5,500 words. |
| Samuel Butler, "Darwin Among the Machines" (1863) | Letter to *The Press*, Christchurch, 13 June 1863, signed "Cellarius"; as reprinted in *Canterbury Pieces* (London: A. C. Fifield, 1914) | Gutenberg #3279, https://www.gutenberg.org/ebooks/3279 | The complete letter (about 1,700 words, below the 2,000-word target because the letter is short). The 1914 editor's headnote and bracketed date line are omitted. |
| Samuel Butler, "The Book of the Machines" (1872) | *Erewhon; or Over the Range*, first edition (London: Trübner & Co., 1872) | Wikisource (from `Erewhon-1872-003.djvu`), https://en.wikisource.org/wiki/Erewhon;_or_Over_the_Range_(1872)/Chapter_21 and Chapters 22 and 23 | Chapters XXI–XXIII complete ("The Book of the Machines", "The Machines—continued", "The Machines—concluded"), about 9,500 words. These are chapters XXIII–XXV in Butler's revised 1901 edition (the text on Gutenberg, #1906); the 1872 text was used to keep the date right. The small-caps first word of each chapter is lowercased ("THE writer" → "The writer"). |

**Substitution.** Thomas Carlyle's "Signs of the Times" (1829) could not be obtained cleanly. It is not in any Carlyle volume on Project Gutenberg (the full catalog has none of his essay collections), and on Wikisource only 3 of its pages in *The Works of Thomas Carlyle*, vol. 27 are transcribed. Ruskin's "The Nature of Gothic" takes its place as the lead text: a comparable Victorian critique of what mechanised work does to minds. The set name changed from "1829–1872" to "1843–1872" to match.

## 2. The Education Debate, 1892–1903 (`education-debate.json`)

| Text | Edition | Source | What is included |
|---|---|---|---|
| W. E. B. Du Bois, "Of Mr. Booker T. Washington and Others" (1903) | *The Souls of Black Folk*, ch. III | Gutenberg #408, https://www.gutenberg.org/ebooks/408 | The complete chapter (about 4,700 words). The verse epigraph and the bars of music at the chapter head are omitted. |
| Booker T. Washington, "The Atlanta Exposition Address" (delivered 18 September 1895) | *Up from Slavery* (1901), ch. XIV, "The Atlanta Exposition Address" | Gutenberg #2376, https://www.gutenberg.org/ebooks/2376 | The complete chapter (about 4,700 words): the full text of the address inside Washington's own account of it, its reception, letters from Grover Cleveland and D. C. Gilman, and his comments on the vote. The address by itself is only about 1,000 words, so the chapter is used. |
| W. E. B. Du Bois, "Of the Training of Black Men" (1903) | *The Souls of Black Folk*, ch. VI | Gutenberg #408, https://www.gutenberg.org/ebooks/408 | The complete chapter (about 5,500 words); epigraph and music omitted. |
| Anna Julia Cooper, "The Higher Education of Woman" (1892) | *A Voice from the South, by a Black Woman of the South* (1892) | Wikisource (from `A Voice from the South (Cooper).djvu`), https://en.wikisource.org/wiki/A_Voice_from_the_South/The_Higher_Education_of_Woman | The complete essay (about 6,700 words). The printed heading in the scan reads "The Higher Education of Women"; the book's contents and Wikisource use "Woman", which is the title used here. |

**Choice made.** For the fourth text the brief allowed Cooper or Washington's "Industrial Education for the Negro" (*The Negro Problem*, 1903; Gutenberg #15041). Cooper was available cleanly and adds the argument about Black women's education, so she is used. Because her essay is from 1892, the set name changed from "1895–1903" to "1892–1903".

## 3. Women, Reason, and Education, 1762–1869 (`women-and-reason.json`)

| Text | Edition | Source | What is included |
|---|---|---|---|
| Mary Wollstonecraft, *A Vindication of the Rights of Woman* (1792) | Gutenberg transcription (its edition is not stated in the file) | Gutenberg #3420, https://www.gutenberg.org/ebooks/3420 | Chapter 5's title and one-sentence introduction, then Section I (her reply to Rousseau) complete, about 6,500 words. Rows of elision asterisks inside her quotations are shortened to "* * *". Her own footnote is kept where it stands. |
| Jean-Jacques Rousseau, *Emile*, Book V (1762) | Translated by Barbara Foxley (Everyman's Library, 1911) | Gutenberg #5427, https://www.gutenberg.org/ebooks/5427 | From the start of Book V through the paragraph ending "the true glory and happiness of a good woman" (about 10,600 words), stopping where Rousseau turns to girls' religious instruction. Book V as a whole runs to about 45,000 words. Two inline "[Footnote: …]" notes are moved into their own paragraphs directly after the paragraph they belong to. |
| John Stuart Mill, *The Subjection of Women* (1869) | First edition (London: Longmans, Green, Reader, and Dyer, 1869) | Gutenberg #27083, https://www.gutenberg.org/ebooks/27083 | Chapter I complete (about 12,100 words, slightly over the 12,000 target), including Mill's footnote on Mme de Staël. |

## Wikisource revisions

The Wikisource pages are transclusions of proofread scan pages. Main-page revisions current when fetched: "Notes by the Translator" 4593328; Cooper 15037046; *Erewhon* (1872) ch. 21 15459723, ch. 22 15456282, ch. 23 15456283.
