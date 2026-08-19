#!/usr/bin/env bash
# checks.sh — manifiesto ejecutable de verificaciones de costuras.
# Cada check es una función check_<ID> que define las variables y ejecuta run().
# El runner sourcea este archivo y llama a cada función.

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

_repo_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

_mongo_eval() {
  local root; root="$(_repo_root)"
  local mp; mp="$(grep '^MONGO_PASSWORD' "${root}/.env" | cut -d= -f2 | tr -d '\r\n')"
  docker exec mongo mongo -u iotixmongo -p "${mp}" --authenticationDatabase admin --quiet --eval "$1"
}

# -----------------------------------------------------------------------------
# Checks con comando positivo (pueden dar PASS)
# -----------------------------------------------------------------------------

check_CST-01() {
  CHECK_ID="CST-01"
  AFIRMA="La colección notifications tiene documentos (>0)"
  PERTENECE="CST-01"
  REQUIERE="docker"
  TIMEOUT=30
  local n
  n="$(_mongo_eval 'db=db.getSiblingDB("iotix"); print(db.notifications.countDocuments({}));' | tail -1 | tr -d '[:space:]')"
  [ -n "${n}" ] && [ "${n}" -gt 0 ] 2>/dev/null
}

check_CST-02() {
  CHECK_ID="CST-02"
  AFIRMA="El log del edge tiene líneas Telegram (>0)"
  PERTENECE="CST-02"
  REQUIERE="docker"
  TIMEOUT=30
  local n
  n="$(docker logs wanomi-edge 2>&1 | grep -c Telegram || true)"
  [ -n "${n}" ] && [ "${n}" -gt 0 ] 2>/dev/null
}

check_CST-05() {
  CHECK_ID="CST-05"
  AFIRMA="Hay notifications con correlationParent persistido (>0)"
  PERTENECE="CST-05"
  REQUIERE="docker"
  TIMEOUT=30
  local n
  n="$(_mongo_eval 'db=db.getSiblingDB("iotix"); print(db.notifications.find({correlationParent:{$exists:true}}).count());' | tail -1 | tr -d '[:space:]')"
  [ -n "${n}" ] && [ "${n}" -gt 0 ] 2>/dev/null
}

check_CST-06() {
  CHECK_ID="CST-06"
  AFIRMA="Hay al menos 1 rulepack cargado en Mongo"
  PERTENECE="CST-06"
  REQUIERE="docker"
  TIMEOUT=30
  local n
  n="$(_mongo_eval 'db=db.getSiblingDB("iotix"); print(db.rulepacks.distinct("packId").length);' | tail -1 | tr -d '[:space:]')"
  [ -n "${n}" ] && [ "${n}" -ge 1 ] 2>/dev/null
}

check_CST-12() {
  CHECK_ID="CST-12"
  AFIRMA="El healthcheck de ingesta da 3/3 OK"
  PERTENECE="CST-12"
  REQUIERE="docker"
  TIMEOUT=60
  local root; root="$(_repo_root)"
  "${root}/tools/healthcheck_demo.sh" >/dev/null 2>&1
}

check_CST-14() {
  CHECK_ID="CST-14"
  AFIRMA="EMQX_API_TOKEN y MONGO_PASSWORD están presentes en app/.env (SET)"
  PERTENECE="CST-14"
  REQUIERE="secrets"
  TIMEOUT=30
  local root; root="$(_repo_root)"
  local out
  out="$("${root}/tools/secretos.sh" "${root}/app/.env" EMQX_API_TOKEN MONGO_PASSWORD 2>/dev/null || true)"
  echo "${out}" | grep -q "EMQX_API_TOKEN: SET" && echo "${out}" | grep -q "MONGO_PASSWORD: SET"
}

# -----------------------------------------------------------------------------
# Checks placeholder (retornan 2 = SIN_VERIFICAR)
# -----------------------------------------------------------------------------

_placeholder() {
  echo "$1"
  return 2
}

check_CST-03() {
  CHECK_ID="CST-03"
  AFIRMA="El front consume notificaciones MQTT (sin comando corrible)"
  PERTENECE="CST-03"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "sin comando corrible: emisor silencioso en éxito"
}

check_CST-04() {
  CHECK_ID="CST-04"
  AFIRMA="Existe subscriber de wanomi/noc/+/event"
  PERTENECE="CST-04"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "ausencia ambigua: grep=0 no prueba ausencia"
}

check_CST-07() {
  CHECK_ID="CST-07"
  AFIRMA="El hot-reload de packs se dispara y recarga"
  PERTENECE="CST-07"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "PENDIENTE: requiere publicar en tópico reload y observar reloadState"
}

check_CST-08() {
  CHECK_ID="CST-08"
  AFIRMA="Los packs ats-inteliats-v1 y eltek-smartpack-v1 existen en DB"
  PERTENECE="CST-08"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "RETIRADA por DEC-REF-91: el pack se recrea desde cero en base nueva"
}

check_CST-09() {
  CHECK_ID="CST-09"
  AFIRMA="La escritura forense se ejercita (forensicevents > 0)"
  PERTENECE="CST-09"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "ausencia no positiva: forensicevents=0 no prueba que el dispatcher no exista"
}

check_CST-10() {
  CHECK_ID="CST-10"
  AFIRMA="Existe código productor de Connect (Modbus/SNMP/contacto seco)"
  PERTENECE="CST-10"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "ausencia no positiva: grep solo encuentra comentarios del simulador"
}

check_CST-11() {
  CHECK_ID="CST-11"
  AFIRMA="Existe productor de variables inferred"
  PERTENECE="CST-11"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "ausencia no positiva: grep vacío no prueba que no exista productor"
}

check_CST-13() {
  CHECK_ID="CST-13"
  AFIRMA="Existe fuente de tiempo confiable para la cadena forense"
  PERTENECE="CST-13"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "sin comando corrible: no hay verificación positiva de la fuente de tiempo"
}

check_CST-15() {
  CHECK_ID="CST-15"
  AFIRMA="El caché de /dashboard/noc no fuga entre scopes"
  PERTENECE="CST-15"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "V-PESADO pendiente: verificación compleja de DEC-REF-85-A no implementada"
}

check_CST-16() {
  CHECK_ID="CST-16"
  AFIRMA="El campo deviceType se puebla desde una fuente conocida"
  PERTENECE="CST-16"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "ABSORBIDA por CST-17/18 (DEC-REF-91): el origen del dato cambia de entidad"
}

check_CST-17() {
  CHECK_ID="CST-17"
  AFIRMA="La plantilla referencia variables de la ficha, no las copia"
  PERTENECE="CST-17"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "sin entidad que verificar: la ficha de equipo no existe todavía"
}

check_CST-18() {
  CHECK_ID="CST-18"
  AFIRMA="El deviceType se elige de un catálogo único con fabricante"
  PERTENECE="CST-18"
  REQUIERE="none"
  TIMEOUT=30
  _placeholder "sin catálogo contra el cual validar: la ficha de equipo no existe todavía"
}

# -----------------------------------------------------------------------------
# Registro de checks
# -----------------------------------------------------------------------------

REGISTERED_CHECKS=(
  CST-01 CST-02 CST-03 CST-04 CST-05 CST-06 CST-07 CST-08 CST-09
  CST-10 CST-11 CST-12 CST-13 CST-14 CST-15 CST-16 CST-17 CST-18
)
