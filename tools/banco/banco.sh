#!/usr/bin/env bash
# Banco de conformidad — B0 · tipo D. Orquesta desde el HOST (WSL):
#   fase principal (contenedor node) → reinicio del edge (C10) → fase posterior + informe.
# Uso:
#   bash tools/banco/banco.sh --b1 --dId XXXXXXXX --var VARIABLE [--sp OTRA] [--T 100]   (B1)
#   bash tools/banco/banco.sh --list
#   bash tools/banco/banco.sh --dId XXXXXXXX --var VARIABLE [--T 100] [--silence 600]
#   --silence = FSM_SILENCE_SEC del edge (default 600). Para un banco más corto: FSM_SILENCE_SEC=60
#   en edge-engine/.env.edge + docker restart wanomi-edge, y correr con --silence 60.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ "${1:-}" == "--b1" ]]; then
  shift
  LOG="banco_B1_$(date +%Y%m%d_%H%M).log"
  echo "Banco B1 (umbral de ficha · S · C · cross) — dura ~20 min. Salida también en $LOG"
  cat tools/banco/lib.js tools/banco/b1.js | docker exec -i node node - "$@" 2>&1 | tee "$LOG"
  exit 0
fi
if [[ "${1:-}" == "--list" ]]; then
  docker exec -i node node - --list < tools/banco/run.js; exit 0
fi
LOG="banco_D_$(date +%Y%m%d_%H%M).log"
echo "Banco D — dura ~15 min + el silencio de C7. Salida también en $LOG"
docker exec -i node node - "$@" < tools/banco/run.js 2>&1 | tee "$LOG"
echo "── C10: reinicio del edge con la alarma abierta ──" | tee -a "$LOG"
docker restart wanomi-edge | tee -a "$LOG"
docker exec -i node node - --post < tools/banco/run.js 2>&1 | tee -a "$LOG"
echo "Informe guardado en $LOG"
