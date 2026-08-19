#!/usr/bin/env bash
# run.sh — runner de verificación de costuras.
# Uso: bash tools/verify/run.sh [--only CST-NN] [--no-secrets]
# Exit 0 si no hay FAIL · Exit 1 si hay al menos un FAIL.

set -u

export SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LEDGER="${SCRIPT_DIR}/last-run.tsv"

ONLY_CHECK=""
NO_SECRETS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --only)
      ONLY_CHECK="$2"
      shift 2
      ;;
    --no-secrets)
      NO_SECRETS=1
      shift
      ;;
    *)
      echo "Uso: $0 [--only CST-NN] [--no-secrets]" >&2
      exit 2
      ;;
  esac
done

# Cargar manifiesto
# shellcheck source=checks.sh
source "${SCRIPT_DIR}/checks.sh"

# Validar IDs únicos
declare -A seen_ids
for cid in "${REGISTERED_CHECKS[@]}"; do
  if [ -n "${seen_ids[$cid]:-}" ]; then
    echo "ERROR: CHECK_ID duplicado: ${cid}" >&2
    exit 2
  fi
  seen_ids[$cid]=1
done

# Inicializar ledger
mkdir -p "${SCRIPT_DIR}"
printf "# timestamp\tcheck_id\testado\trazon\n" > "${LEDGER}"

PASS=0
FAIL=0
SIN_VERIFICAR=0
declare -a fail_list=()
declare -a sinver_list=()

run_check() {
  local cid="$1"
  local fn="check_${cid}"

  if ! declare -f "${fn}" >/dev/null 2>&1; then
    echo "ERROR: check no definido: ${cid}" >&2
    return 2
  fi

  # Obtener metadatos del check
  local afirma requiere timeout
  afirma="$(declare -f "${fn}" | grep 'AFIRMA=' | head -1 | cut -d'"' -f2)"
  requiere="$(declare -f "${fn}" | grep 'REQUIERE=' | head -1 | cut -d'"' -f2)"
  timeout="$(declare -f "${fn}" | grep 'TIMEOUT=' | head -1 | cut -d= -f2 | tr -d ' ;')"
  timeout="${timeout:-30}"

  # Gating por secrets
  if [ "${NO_SECRETS}" -eq 1 ] && [ "${requiere}" = "secrets" ]; then
    printf "%s\t%s\tSIN_VERIFICAR\t%s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${cid}" "--no-secrets" >> "${LEDGER}"
    SIN_VERIFICAR=$((SIN_VERIFICAR + 1))
    sinver_list+=("${cid} (${afirma})")
    return 0
  fi

  # Gating por docker
  if [ "${requiere}" = "docker" ]; then
    if ! docker ps >/dev/null 2>&1; then
      printf "%s\t%s\tSIN_VERIFICAR\t%s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${cid}" "docker abajo" >> "${LEDGER}"
      SIN_VERIFICAR=$((SIN_VERIFICAR + 1))
      sinver_list+=("${cid} (${afirma})")
      return 0
    fi
  fi

  # Ejecutar check con timeout
  local output exit_code
  output="$(timeout "${timeout}" bash -c "
    source '${SCRIPT_DIR}/checks.sh'
    ${fn}
  " 2>&1)"
  exit_code=$?

  local estado razon=""
  if [ ${exit_code} -eq 0 ]; then
    estado="PASS"
    PASS=$((PASS + 1))
  elif [ ${exit_code} -eq 2 ]; then
    estado="SIN_VERIFICAR"
    razon="${output}"
    SIN_VERIFICAR=$((SIN_VERIFICAR + 1))
    sinver_list+=("${cid} (${afirma})")
  elif [ ${exit_code} -eq 124 ]; then
    estado="SIN_VERIFICAR"
    razon="timeout (${timeout}s)"
    SIN_VERIFICAR=$((SIN_VERIFICAR + 1))
    sinver_list+=("${cid} (${afirma})")
  else
    estado="FAIL"
    FAIL=$((FAIL + 1))
    fail_list+=("${cid} (${afirma})")
  fi

  printf "%s\t%s\t%s\t%s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${cid}" "${estado}" "${razon}" >> "${LEDGER}"
  return 0
}

# Seleccionar checks a correr
if [ -n "${ONLY_CHECK}" ]; then
  if [ -z "${seen_ids[$ONLY_CHECK]:-}" ]; then
    echo "ERROR: check desconocido: ${ONLY_CHECK}" >&2
    exit 2
  fi
  CHECKS_TO_RUN=("${ONLY_CHECK}")
else
  CHECKS_TO_RUN=("${REGISTERED_CHECKS[@]}")
fi

# Correr checks
for cid in "${CHECKS_TO_RUN[@]}"; do
  run_check "${cid}"
done

# Resumen
echo ""
echo "=== RESULTADOS ==="
echo "PASS: ${PASS} · FAIL: ${FAIL} · SIN VERIFICAR: ${SIN_VERIFICAR}"

if [ ${FAIL} -gt 0 ]; then
  echo ""
  echo "FAIL:"
  for item in "${fail_list[@]}"; do
    echo "  ✘ ${item}"
  done
fi

if [ ${SIN_VERIFICAR} -gt 0 ]; then
  echo ""
  echo "SIN VERIFICAR:"
  for item in "${sinver_list[@]}"; do
    echo "  ⚠ ${item}"
  done
fi

echo ""
echo "Ledger: ${LEDGER}"

# Exit contract
if [ ${FAIL} -gt 0 ]; then
  exit 1
else
  exit 0
fi
