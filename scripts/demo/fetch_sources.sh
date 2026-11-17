#!/bin/sh
# Download the demo source texts into a fresh directory (treat it as untrusted data),
# then convert the Wikisource pages to plain paragraphs.
#
# Usage: sh scripts/demo/fetch_sources.sh <empty-dir>
# Then:  python3 -I scripts/demo/build_demo.py <dir> && node scripts/demo/check-demo.mjs
#
# Gutenberg files come from the PGLAF mirror (gutenberg.pglaf.org), which serves the
# same cache/epub plain-text files as www.gutenberg.org.
set -eu
DIR=$1
HERE=$(cd "$(dirname "$0")" && pwd)
UA="marginalia-demo-builder/1.0"
mkdir -p "$DIR/ws"

for id in 408 2376 3279 3420 5427 27083 30755; do
  curl -sSL -m 300 -A "$UA" -o "$DIR/pg$id.txt" "https://gutenberg.pglaf.org/cache/epub/$id/pg$id.txt"
done

ws() {  # ws <out-name> <page title>
  curl -sS -m 120 -A "$UA" --get "https://en.wikisource.org/w/api.php" \
    --data-urlencode "action=parse" --data-urlencode "page=$2" \
    --data-urlencode "prop=wikitext|text" --data-urlencode "format=json" -o "$DIR/ws/$1.json"
  python3 -I "$HERE/wikisource_text.py" "$DIR/ws/$1.json" "$DIR/ws/$1.txt"
}
ws page2 "Scientific Memoirs/3/Sketch of the Analytical Engine invented by Charles Babbage, Esq./Notes by the Translator"
ws page3 "A Voice from the South/The Higher Education of Woman"
for n in 21 22 23; do ws "erewhon$n" "Erewhon; or Over the Range (1872)/Chapter $n"; done
echo "fetched into $DIR"
