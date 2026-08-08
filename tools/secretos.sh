#!/usr/bin/env bash
# Presencia de variables de entorno SIN exponer valores.
#
# EL ÚNICO IDIOMA VÁLIDO es el condicional explícito de abajo.
# PROHIBIDO: ${VAR:+SET}${VAR:-UNSET}  ← FILTRA el valor cuando la
# variable está definida. El operador :- devuelve el VALOR, no el
# literal. Causó 5 recurrencias de RISK-SEC; el corpus tenía la
# receta errónea hasta la enmienda de #54.
#
# Uso: bash tools/secretos.sh [--len] [archivo] [CLAVE1 CLAVE2 ...]
#   --len : muestra la longitud de cada valor. OFF por defecto — la longitud
#           estrecha el espacio de búsqueda; usar solo en pantalla.
# Sin claves, lista todas las de riesgo del archivo.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

SHOW_LEN=0
if [ "${1:-}" = "--len" ]; then SHOW_LEN=1; shift; fi

FILE="${1:-app/.env}"
shift 2>/dev/null || true

if [ ! -f "$FILE" ]; then
  echo "ERROR: no existe $FILE"; exit 1
fi

if [ $# -gt 0 ]; then
  KEYS="$*"
else
  KEYS=$(grep -oE '^[A-Z_][A-Z0-9_]*=' "$FILE" \
    | sed 's/=$//' \
    | grep -E 'SECRET|PASSWORD|PWD|TOKEN|URI|_PASS$' \
    | sort -u)
fi

echo "Presencia en ${FILE} (solo nombres; longitud solo con --len; NUNCA valores):"
echo
for K in $KEYS; do
  V=$(grep -E "^${K}=" "$FILE" | head -1 | cut -d= -f2- | tr -d '\r')
  if [ -n "$V" ]; then
    if [ "$SHOW_LEN" = "1" ]; then
      echo "  ${K}: SET (len=${#V})"
    else
      echo "  ${K}: SET"
    fi
  else
    echo "  ${K}: UNSET"
  fi
done
echo
echo "NOTA: por defecto NO se emite la longitud — es información que"
echo "estrecha el espacio de búsqueda de un secreto. Usar --len solo"
echo "en pantalla, NUNCA en un archivo versionado ni en un transcript."
