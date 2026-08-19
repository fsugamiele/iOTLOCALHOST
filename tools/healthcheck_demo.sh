#!/usr/bin/env bash
# healthcheck_demo.sh — smoke test previo a demo/reunión.
# 3 líneas OK/FALLA: sim vivo · resource EMQX is_alive · db.data crece.
# Exit 0 si las 3 OK. Exit 1 si alguna FALLA.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 1) Simulador vivo (ps -ef | grep, NUNCA pgrep)
if ps -ef | grep -v grep | grep -q "device_simulator/run.js"; then
  L1="OK  · simulador vivo"
  R1=0
else
  L1="FALLA · simulador NO corriendo — arrancar con: nohup node tools/device_simulator/run.js > logs/sim-CR00061.log 2>&1 &"
  R1=1
fi

# 2) Resource EMQX saver-webhook is_alive
SEC="$(grep '^EMQX_DEFAULT_APPLICATION_SECRET' "${REPO_ROOT}/.env" 2>/dev/null | cut -d= -f2 | tr -d '\r\n')"
if [ -z "${SEC}" ]; then
  L2="FALLA · no puedo leer EMQX_DEFAULT_APPLICATION_SECRET de .env"
  R2=1
else
  ALIVE="$(docker exec emqx curl -s -u "admin:${SEC}" \
    'http://localhost:8081/api/v4/resources' 2>/dev/null \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);r=[x for x in d.get("data",[]) if x.get("description")=="saver-webhook"];print(r[0].get("id","") if r else "")' 2>/dev/null)"
  if [ -n "${ALIVE}" ]; then
    ALIVE="$(docker exec emqx curl -s -u "admin:${SEC}" \
      "http://localhost:8081/api/v4/resources/${ALIVE}" 2>/dev/null \
      | python3 -c 'import json,sys;d=json.load(sys.stdin);s=d.get("data",{}).get("status",[]);print(s[0].get("is_alive") if s else "")' 2>/dev/null)"
  fi
  if [ "${ALIVE}" = "True" ]; then
    L2="OK  · resource saver-webhook is_alive=true"
    R2=0
  else
    L2="FALLA · resource saver-webhook is_alive=${ALIVE} — recuperar con: docs/runbook_emqx_saver.md"
    R2=1
  fi
fi

# 3) db.data creció en los últimos 60 s (7 devices CR00061)
MP="$(grep '^MONGO_PASSWORD' "${REPO_ROOT}/.env" 2>/dev/null | cut -d= -f2 | tr -d '\r\n')"
N="$(docker exec mongo mongo -u iotixmongo -p "${MP}" --authenticationDatabase admin --quiet --eval '
db=db.getSiblingDB("iotix");
const d=["fbXULu7a","Yf86psyC","59XYsglM","Z5tKK1rN","wrFwUpMt","4lkbkJtW","ftG9Msrp"];
const c=Date.now()-60*1000;
print(d.reduce((a,x)=>a+db.data.countDocuments({dId:x,time:{$gt:c}}),0));
' 2>/dev/null | tail -1 | tr -d '[:space:]')"
if [ -n "${N}" ] && [ "${N}" -gt 0 ] 2>/dev/null; then
  L3="OK  · db.data +${N} docs en 60 s (7 devices CR00061)"
  R3=0
else
  L3="FALLA · db.data sin crecimiento en 60 s — ver docs/runbook_emqx_saver.md"
  R3=1
fi

echo "${L1}"
echo "${L2}"
echo "${L3}"

exit $(( R1 | R2 | R3 ))
