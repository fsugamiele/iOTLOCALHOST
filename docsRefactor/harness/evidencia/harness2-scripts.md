# EVIDENCIA — apertura.sh + secretos.sh son READ-ONLY y no filtran valores · 2026-08-08

## 0 · DECLARACIONES OBLIGATORIAS
- Zona horaria de TODO timestamp de este doc:  **UTC**
- path_ejercido:                               **read**
- archivo:línea del consumidor REAL:           el operador / la sala que lee el
  stdout (`tools/apertura.sh`, `tools/secretos.sh`) — no hay consumidor de código
- ¿Coincide con el path de producción?         **n/a** — son tooling de sesión,
  no un path productivo que escriba en Mongo/EMQX. No se afirma nada sobre producción.

## 1 · Ventana de observación
- Cadencia de publicación del emisor: **n/a** — scripts one-shot, sin emisor periódico
- Duración de la observación:         una corrida completa de cada script
- ¿Ventana >= 2 ciclos?               **n/a**

> No aplica el criterio de taps vs cadencia: no se observa un flujo, se prueba
> que dos ejecuciones no mutan estado. La prueba es diferencial (pre/post), no temporal.

## 2 · Comandos y salida CRUDA

### 2.1 · apertura.sh — ¿modifica algo?
```
git status --porcelain > /tmp/pre.txt
md5sum COSTURAS.md wanomi.md WanomiRefactor.md > /tmp/pre.md5
bash tools/apertura.sh                          # exit=0
git status --porcelain > /tmp/post.txt
diff /tmp/pre.txt /tmp/post.txt   → SIN CAMBIOS EN GIT
md5sum -c /tmp/pre.md5:
  docsRefactor/harness/COSTURAS.md: OK
  docs/wanomi.md: OK
  docsRefactor/WanomiRefactor.md: OK
```
El working tree y los 3 archivos de gobierno quedan byte-idénticos. El encabezado
que declara "READ-ONLY / No modifica nada" (`apertura.sh:2-3`) queda **probado**,
no asumido.

### 2.2 · apertura.sh — ¿filtra secretos?
```
grep -cE '[a-f0-9]{32}' /tmp/apertura.out   → 0
```
No imprime ningún hash/token de 32+ hex. Solo emite branch, HEAD, conteos, línea 4
del corpus, última entrada de bitácora, `docker ps`, healthcheck y estado del sim.

### 2.3 · secretos.sh — ¿modifica algo? ¿filtra valores?
```
bash tools/secretos.sh                          # exit=0
diff pre/post git   → SIN CAMBIOS EN GIT
md5sum -c app/.env  → OK
bash tools/secretos.sh | grep -cE '[a-f0-9]{32}'   → 0
grep -c 'VAR:+SET' tools/*.sh:
  tools/healthcheck_demo.sh:0
  tools/apertura.sh:0
  tools/secretos.sh:1        ← único match: el comentario de PROHIBICIÓN (línea 5)
```
Salida (10 claves de riesgo detectadas, todas SET):
  EMQX_API_TOKEN · EMQX_DEFAULT_APPLICATION_SECRET ·
  EMQX_NODE_SUPERUSER_PASSWORD · FORENSIC_HMAC_SECRET · JWT_SECRET ·
  MONGODB_URI · MONGO_PASSWORD · MQTT_PASS · TELEGRAM_BOT_TOKEN ·
  TEST_USER_PWD

Ninguna UNSET. Las longitudes se revisaron EN SESIÓN y NO se persisten acá:
son metadato que estrecha el espacio de búsqueda (la propia nota del script lo
advierte, y un repo versionado es "salir de la máquina"). Excepción registrada:
JWT_SECRET y FORENSIC_HMAC_SECRET tienen len=64, criterio de aceptación de la
rotación de #54 y estándar público de `openssl rand -hex 32`.

El único `VAR:+SET` del árbol de tools es el comentario que PROHÍBE ese idioma
(`secretos.sh:5`), no un uso. El script usa el condicional explícito `[ -n "$V" ]`
mandado por `CLAUDE.md:37`.

## 3 · Veredicto
| Qué se afirma | Evidencia | Veredicto |
|---|---|---|
| apertura.sh no modifica git ni los 3 archivos de gobierno | diff vacío + `md5sum -c` OK (§2.1) | PROBADO |
| apertura.sh no imprime valores de secretos | `grep -cE '[a-f0-9]{32}'` = 0 (§2.2) | PROBADO |
| secretos.sh no modifica git ni app/.env | diff vacío + `md5sum -c` OK (§2.3) | PROBADO |
| secretos.sh emite solo nombres, nunca valores | grep hex = 0; salida cruda (§2.3) | PROBADO |
| secretos.sh no emite longitud por defecto | `len` pasa a flag `--len` (Parte A) | PROBADO |
| secretos.sh no usa el idioma prohibido `VAR:+SET` | el único match es el comentario de prohibición | PROBADO |

## 4 · Qué NO prueba esta evidencia
- **No prueba corrección funcional del contenido reportado.** Que apertura.sh no
  mute nada no dice que sus conteos (`sin push`, `modificados`) sean correctos en
  todo escenario; solo que la corrida es read-only.
- **No cubre entradas adversarias.** `secretos.sh` se probó sobre `app/.env` con el
  set de riesgo por defecto. No se probó con un archivo con valores que contengan
  hex de 32 en el NOMBRE de la clave, ni con claves pasadas por argumento.
- **No dice nada de producción.** Son tooling local; ningún path de Mongo/EMQX/edge
  se ejerció ni se afirma sobre él (§0).
- **`grep '[a-f0-9]{32}'` es un heurístico**, no una prueba de no-fuga total: un
  secreto corto (`EMQX_API_TOKEN`) no matchea ese patrón. Pero el script nunca
  imprime el valor de ninguno, corto o largo — eso se ve en la salida cruda.
- **Hallazgo de la propia evidencia:** la primera redacción de este documento
  incluía la tabla completa de longitudes de los 10 secretos. Habría versionado en
  git que EMQX_API_TOKEN tiene 6 caracteres — fuerza bruta trivial. Detectado en la
  revisión de la sala antes de escribir. Causa raíz: `secretos.sh` emitía `len` por
  DEFECTO. Corregido: `len` pasa a flag `--len`. Familia RISK-SEC, 6ª instancia:
  esta vez el filtrado no era del valor sino del metadato.
- **Segundo hallazgo — la verificación misma estaba mal escrita.** El gate de la
  sala pedía `grep -c 'len=' … # esperado 2`. `grep -c` cuenta LÍNEAS con match, no
  ocurrencias: con los dos secretos en una sola línea el resultado correcto es 1. El
  agente frenó en vez de reescribir la prosa para satisfacer el conteo. Tercera
  instancia en el harness de medición mal formulada (previas: `grep -c "typeC"`
  matcheando `typeCross`; `DEC-01..20 = 0` que SÍ deformó `§3` de CLAUDE.md y hubo
  que restaurar los punteros). Comando correcto: `grep -o 'patrón' archivo | wc -l`.
  La lección va a la spec de `verify/` como caso raro obligatorio: una verificación
  mal escrita no falla ruidosamente, deforma lo que mide.
