#!/usr/bin/env bash
# ============================================================================
# WN-SITE-CORE  ·  Export de fabricacion  ·  kicad-cli (KiCad 8)
# Correr DESPUES de rutear y pasar DRC. Genera Gerbers + Excellon + CPL.
# Uso:   ./wanomi_export_gerbers.sh ruta/al/WN-SITE-CORE.kicad_pcb
# Salida: ./fab/  (+ WN-SITE-CORE_fab.zip listo para JLCPCB)
# Requiere: kicad-cli en PATH (KiCad 8). Verificar: kicad-cli version
# ============================================================================
set -euo pipefail

PCB="${1:?Pasar la ruta al .kicad_pcb}"
OUT="fab"
NAME="$(basename "${PCB%.kicad_pcb}")"

mkdir -p "$OUT"

echo ">> Gerbers (4 capas + mascara + serigrafia + Edge.Cuts)"
# Capas de un 4-layer estandar; ajustar si renombraste planos.
kicad-cli pcb export gerbers \
  --layers "F.Cu,In1.Cu,In2.Cu,B.Cu,F.Paste,B.Paste,F.Silkscreen,B.Silkscreen,F.Mask,B.Mask,Edge.Cuts" \
  --no-protel-ext \
  --subtract-soldermask \
  --output "$OUT/" \
  "$PCB"

echo ">> Excellon drill (PTH+NPTH, mapa incluido)"
kicad-cli pcb export drill \
  --format excellon \
  --drill-origin plot \
  --excellon-units mm \
  --generate-map \
  --map-format gerberx2 \
  --output "$OUT/" \
  "$PCB"

echo ">> CPL / centroid (pick & place) para montaje"
kicad-cli pcb export pos \
  --side both \
  --format csv \
  --units mm \
  --use-drill-file-origin \
  --output "$OUT/${NAME}_cpl.csv" \
  "$PCB"

echo ">> PDF de fabricacion (control visual)"
kicad-cli pcb export pdf \
  --layers "F.Cu,B.Cu,F.Silkscreen,Edge.Cuts" \
  --output "$OUT/${NAME}_fab.pdf" \
  "$PCB"

echo ">> Empaquetando para JLCPCB"
( cd "$OUT" && zip -q "${NAME}_fab.zip" *.gbr *.drl *.gbrjob 2>/dev/null || zip -q "${NAME}_fab.zip" ./* )

echo "OK -> $OUT/  (subir ${NAME}_fab.zip a JLCPCB; CPL + BOM Rev B para PCBA)"
echo "Recordar en JLCPCB: 4 capas, 1.6 mm, ENIG, mascara roja en zona HV si se separo en serigrafia."
