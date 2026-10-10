#!/bin/sh
# Cambia la version publicada en index.html (la etiqueta <meta name="va-version"> y todos los
# ?v= de los CSS/JS) de una sola vez. Uso: tools/set-version.sh 2026.10.10-1
set -eu
if [ $# -ne 1 ]; then
  echo "Uso: $0 <version>   (ej. $0 2026.10.10-1)" >&2
  exit 1
fi
NEW="$1"
case "$NEW" in
  *[!0-9A-Za-z.-]*) echo "Version invalida: solo letras, numeros, '.' y '-'." >&2; exit 1 ;;
esac
DIR=$(cd "$(dirname "$0")/.." && pwd)
FILE="$DIR/index.html"
sed -i.bak -E \
  -e "s/(<meta name=\"va-version\" content=\")[0-9A-Za-z.-]+/\1$NEW/" \
  -e "s/(\.(css|js)\?v=)[0-9A-Za-z.-]+/\1$NEW/g" \
  "$FILE"
rm -f "$FILE.bak"
COUNT=$(grep -o "$NEW" "$FILE" | wc -l)
echo "index.html: version $NEW en $COUNT lugares."
