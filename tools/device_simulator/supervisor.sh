#!/usr/bin/env bash
# supervisor.sh — mantiene VIVO el simulador de devices (P1 · sesión #79).
#
# Causa raíz que corta: el sim moría en silencio (excepción no atrapada,
# OOM, cierre de shell) y nada lo relanzaba → sitios offline por horas con
# el stack sano (medido 2026-09-19: 12 h sin telemetría, uptime KPI al 14%).
#
# Qué hace:
#   · Instancia única vía flock (no pisa un supervisor ya corriendo).
#   · Relanza el sim siempre que termina, con backoff: si vivió < 15 s
#     (flap: credenciales malas, backend caído) duplica la espera hasta
#     60 s; si vivió bien, vuelve a 5 s.
#   · Credenciales: grep puntual de app/.env (NUNCA sourcear el archivo —
#     MQTT_PORT=8083 ahí es WebSocket y el sim usa TCP 1883).
#
# Uso:
#   setsid nohup bash tools/device_simulator/supervisor.sh >> logs/sim-CR00061.log 2>&1 < /dev/null &
#
# Para frenarlo: matar el proceso supervisor.sh Y el run.js hijo
# (o `pkill -f supervisor.sh; pkill -f device_simulator/run.js`).

set -u
cd "$(dirname "$0")/../.." || exit 1   # repo root

LOCK=/tmp/wanomi-sim-supervisor.lock
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[supervisor] $(date -u +%FT%TZ) ya hay otro supervisor corriendo (lock $LOCK) — salgo"
  exit 1
fi

E=$(grep -E '^TEST_USER_EMAIL=' app/.env | cut -d= -f2- | tr -d '"'"'"'\r')
W=$(grep -E '^TEST_USER_PWD='   app/.env | cut -d= -f2- | tr -d '"'"'"'\r')
if [ -z "$E" ] || [ -z "$W" ]; then
  echo "[supervisor] $(date -u +%FT%TZ) TEST_USER_EMAIL/TEST_USER_PWD no encontrados en app/.env — salgo"
  exit 1
fi

BACKOFF=5
MIN_LIFE_OK_S=15

while true; do
  echo "[supervisor] $(date -u +%FT%TZ) lanzando simulador"
  start=$(date +%s)
  USER_EMAIL="$E" USER_PASSWORD="$W" SIMULATOR_MODE=true node tools/device_simulator/run.js
  rc=$?
  lived=$(( $(date +%s) - start ))
  echo "[supervisor] $(date -u +%FT%TZ) simulador terminó rc=$rc tras ${lived}s — reinicio en ${BACKOFF}s"
  sleep "$BACKOFF"
  if [ "$lived" -lt "$MIN_LIFE_OK_S" ]; then
    [ "$BACKOFF" -lt 60 ] && BACKOFF=$(( BACKOFF * 2 ))
  else
    BACKOFF=5
  fi
done
