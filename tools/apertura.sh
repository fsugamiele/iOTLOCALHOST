#!/usr/bin/env bash
# Apertura de sesión Wanomi — READ-ONLY.
# Nunca imprime valores de secretos. No modifica nada.
# Uso: bash tools/apertura.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BRANCH=$(git branch --show-current 2>/dev/null)
HEAD_LINE=$(git log -1 --oneline 2>/dev/null)
AHEAD=$(git log "origin/${BRANCH}..HEAD" --oneline 2>/dev/null | wc -l)
DIRTY=$(git status --porcelain 2>/dev/null | grep -vc '^??')
UNTRACKED=$(git status --porcelain 2>/dev/null | grep -c '^??')
CORPUS=$(sed -n '4p' docsRefactor/WanomiRefactor.md 2>/dev/null | cut -c1-60)
BITACORA=$(grep -n '^## Sesión #' docs/wanomi.md 2>/dev/null | tail -1)

echo "=========================================="
echo " APERTURA · $(date -u '+%Y-%m-%dT%H:%M:%SZ') UTC"
echo "=========================================="
echo
echo "--- GIT ---"
echo "branch      : ${BRANCH}"
echo "HEAD        : ${HEAD_LINE}"
echo "sin push    : ${AHEAD} commits"
echo "modificados : ${DIRTY} · sin trackear: ${UNTRACKED}"
echo
git status --porcelain 2>/dev/null | head -20
echo
echo "--- CORPUS ---"
echo "${CORPUS}"
echo "última entrada de bitácora: ${BITACORA}"
echo
echo "--- CONTENEDORES ---"
docker ps --format '{{.Names}}\t{{.Status}}' 2>&1
echo
echo "--- INGESTA ---"
bash tools/healthcheck_demo.sh 2>&1
echo "healthcheck exit=$?"
ps -ef | grep device_simulator | grep -v grep >/dev/null 2>&1 \
  && echo "sim: VIVO" \
  || echo "sim: CAÍDO — relanzar con el comando de abajo"
echo
echo "=========================================="
echo " PEGAR ESTO EN LA SALA (Claude web)"
echo "=========================================="
echo "Corpus  : ${CORPUS}"
echo "Commit  : ${HEAD_LINE}"
echo "Sin push: ${AHEAD} · modificados: ${DIRTY}"
echo "Bitácora: ${BITACORA}"
echo "=========================================="
echo
echo "Si el sim está caído, ESTE es el único arranque válido"
echo "(NO sourcear app/.env — MQTT_PORT=8083 es WebSocket, el sim usa TCP):"
cat <<'ARRANQUE'
E=$(grep -E '^TEST_USER_EMAIL=' app/.env|cut -d= -f2-|tr -d '"'"'"'\r')
W=$(grep -E '^TEST_USER_PWD='   app/.env|cut -d= -f2-|tr -d '"'"'"'\r')
USER_EMAIL="$E" USER_PASSWORD="$W" SIMULATOR_MODE=true \
  nohup node tools/device_simulator/run.js >> logs/sim-CR00061.log 2>&1 &
unset E W
ARRANQUE
echo
echo "Recordatorio: si commiteaste corpus, RE-SUBIR WanomiRefactor.md"
echo "y wanomi.md al proyecto de Claude web."
