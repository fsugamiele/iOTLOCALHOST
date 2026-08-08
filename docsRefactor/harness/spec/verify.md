# SPEC — tools/verify/ (runner de verificación de costuras) · 2026-08-07

> DISEÑO. Este bloque NO escribe una línea de `tools/verify/`. La
> implementación es otro bloque, con esta spec aprobada primero (DEC-PROC-6).

## 0 · CANDADO
preguntas_abiertas: **0**

> Busqué activamente que diera >0 (la instrucción del GATE D lo pide como
> resultado válido). No encontré ninguna pregunta que un actor externo deba
> contestar: todas las decisiones de abajo caen dentro de la autoría de diseño
> de una herramienta interna. Las dos tensiones reales quedan en §8 como
> disenso REGISTRADO y no bloqueante, no como pregunta abierta.
>
> Si durante la implementación aparece una pregunta que esta spec no contesta:
> SE FRENA EL BLOQUE. Adenda ≠ especificación.

## 1 · Presupuesto de bloque
- **Un concern:** un runner que corre las afirmaciones "Verificación" de las 15 costuras del mapa y las clasifica en PASS · FAIL · SIN VERIFICAR.
- **Una decisión de diseño:** las verificaciones viven en **un manifiesto único EJECUTABLE** (`tools/verify/checks.sh`), **NO** embebidas en `COSTURAS.md` ni **un-archivo-por-check**. Fundamento en §2/§5.
- **Archivos a tocar (LISTA CERRADA — para el bloque de IMPLEMENTACIÓN, no este):**
  1. `tools/verify/checks.sh` — manifiesto: 15 funciones de check + registro
  2. `tools/verify/run.sh` — runner: itera el registro, aplica timeout/gating, escribe el ledger
  3. `tools/verify/last-run.tsv` — ledger (lo GENERA el runner; no se edita a mano)
- Total: **2 archivos escritos + 1 generado** · Límite: 6

> Un-archivo-por-check daría 15+ archivos y rompe el presupuesto y dispersa la
> fuente. Por eso el manifiesto único.

## 2 · Recon que lo funda
`recon/funcionalidades.md` (tabla F10) + `COSTURAS.md` (inventario CST-01..15 sembrado en el GATE C de este mismo bloque). Las celdas "Verificación" de esas 15 filas son el contenido inicial.

**Por qué NO se embebe en `COSTURAS.md` ni se importa parseándolo:** en #54 se descartó el parser de markdown por irregularidad de las celdas (vacías, multilínea, con `·`, con comando o sin él). Re-parsear `COSTURAS.md` para extraer comandos repetiría ese error. El manifiesto es un archivo shell ejecutable —no markdown, no irregular— y cada check **ES** su comando real, no una descripción parseable (DEC-PROC-5: se corre el path productivo, no un atajo que lo describe).

**Cómo se siembra:** las 15 verificaciones se **escriben a mano** (transcripción única de la celda "Verificación" de cada costura a su función en `checks.sh`). NO se auto-importan. Consecuencia asumida: `checks.sh` es canónico para el comando; la celda de `COSTURAS.md` queda como puntero humano (ver §8, disenso registrado).

## 3 · Consumidores (grep exhaustivo, no muestreo)
No hay consumidor en código todavía: **este bloque los crea**. Consumidores previstos, cerrados:
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| `tools/apertura.sh` (opcional, futuro) | bloque `--- INGESTA ---` | podría invocar `run.sh` y pegar el resumen 4/4/7; hoy NO lo invoca (fuera de alcance) |
| Franco / CI a mano | — | corre `bash tools/verify/run.sh`; lee stdout + exit code |
| Ledger `last-run.tsv` | generado | única fuente-máquina de "última corrida" por check |

## 4 · Campos que entran / salen / mutan
Un check declara estos campos (variables shell que el runner sourcea; NO prosa parseable):
| Campo | Entra | Sale | Muta | Dónde |
|---|---|---|---|---|
| `CHECK_ID` (=`CST-NN`) | ✓ | ✓ | | `checks.sh` (por función) |
| `AFIRMA` (la afirmación falsable) | ✓ | ✓ | | `checks.sh` |
| `PERTENECE` (`CST-NN` · `DEC-…`) | ✓ | ✓ | | `checks.sh` |
| `REQUIERE` (`none`\|`docker`\|`mongo`\|`secrets`) | ✓ | | | `checks.sh` |
| `TIMEOUT` (seg, default 30) | ✓ | | | `checks.sh` |
| `run()` (el comando real) | ✓ | | | `checks.sh` |
| estado (`PASS`\|`FAIL`\|`SIN_VERIFICAR`) | | ✓ | ✓ | calculado por `run.sh` |
| `timestamp` · `razón` (si SIN_VERIFICAR) | | ✓ | ✓ | ledger `last-run.tsv` |

**Qué afirma un check (regla dura):** afirma el estado que la costura dice que **DEBERÍA** tener ("Cómo debería ser"). Si "debería" está VACÍO (NO DECIDIDO) o no hay comando positivo (NO VERIFICADO) → el check nace **SIN VERIFICAR** (placeholder que se delata solo en cada corrida). Un check **PASS exige evidencia POSITIVA**, nunca ausencia de evidencia.

## 5 · Comportamiento de cada control (flags del runner)
| Control | Qué hace | Validación | Qué pasa si falla |
|---|---|---|---|
| `run.sh` (sin flags) | corre los 15 checks, escribe ledger, imprime resumen | `CHECK_ID` únicos (aborta si hay repetido) | exit 1 solo si ≥1 FAIL |
| `--only CST-NN` | corre un check | id existe en el registro | error si no existe |
| `--no-secrets` | fuerza los `REQUIERE=secrets` a SIN VERIFICAR | — | para salidas que dejan la máquina |
| `TIMEOUT` por check | envuelve `run()` en `timeout ${TIMEOUT}` | — | si expira → **SIN VERIFICAR** (razón "timeout"), NUNCA FAIL |
| gating Docker | si `REQUIERE=docker` y `docker ps` no responde → SIN VERIFICAR (razón "docker abajo") | `docker ps` | no FAIL |
| gating secretos | `REQUIERE=secrets` **se corre con el idioma de `secretos.sh`**: sólo PRESENCIA (`[ -n "$V" ]`), NUNCA imprime valor ni `len` en el ledger | condicional explícito | prohibido `${VAR:+SET}${VAR:-UNSET}` |

**Decisión sobre secretos:** los checks que necesitan secretos **NO se saltean por defecto** (saltearlos oculta el punto ciego). Se corren con el idioma de `secretos.sh` (presencia SET/UNSET, jamás valor). Sólo `--no-secrets` los pasa a SIN VERIFICAR, para outputs que salen de la máquina.

**Exit contract:** FAIL ⇒ exit 1. SIN VERIFICAR ⇒ **no** falla la suite (exit 0) pero se imprime el conteo y la lista, arriba y en negrita. Cualquier política de "SIN VERIFICAR bloquea un release" es decisión de PROCESO, fuera del alcance del runner (§8).

## 6 · Casos raros — ENUMERADOS (prohibido "etc.")
| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | check cuyo comando **ya no existe** (binario/colección/archivo desaparecido) | **SIN VERIFICAR** razón "comando ausente". NUNCA FAIL — no probó nada. Se distingue de FAIL por el exit del comando (127/no-such vs contradicción) |
| 2 | check que **pasa por la razón equivocada** (p.ej. CST-03: `grep=0` porque el emisor no loguea en éxito, no porque no corrió) | prohibido PASS sobre una ausencia ambigua. Si la única señal es ausencia, el check nace **SIN VERIFICAR**. PASS exige evidencia positiva |
| 3 | **costura sin verificación** (CST-03, CST-13 con celda VACÍA) | NO se fabrica un check que finja. Se crea un placeholder que retorna **SIN VERIFICAR** razón "sin comando corrible" → la costura se delata sola cada corrida |
| 4 | check `REQUIERE=docker` con Docker caído | **SIN VERIFICAR** razón "docker abajo", no FAIL |
| 5 | check de secretos en salida que **deja la máquina** | `--no-secrets` lo fuerza a SIN VERIFICAR; jamás imprime `len` |
| 6 | **`CHECK_ID` duplicado** en el manifiesto | `run.sh` **aborta** antes de correr nada (invariante: ids únicos) |
| 7 | **divergencia** entre el comando del check y la celda "Verificación" de `COSTURAS.md` | el runner NO lo detecta (no parsea markdown, por diseño §2). Queda como deuda de sincronización manual, anotada en §8 |
| 8 | costura **DESVÍO** cuyo target sí es verificable (CST-15 V-PESADO) | el check afirma el target; si hoy se cumple → **PASS** y la fila CST-15 gana una ADENDA (append-only) que la mueve de DESVÍO; si no → FAIL. Correr el check es cómo se adjudica la tensión de §8 de Gate C2 |
| 9 | **Check mal formulado** — el comando mide algo distinto de lo que afirma (`grep -c` por ocurrencias, patrón que matchea un superstring, rango de líneas contra un archivo que cambió de tamaño) | El runner NO puede detectarlo solo. Mitigación obligatoria: todo check nuevo declara su resultado esperado Y se corre una vez contra un caso que DEBE fallar. Un check que nunca falló no está probado. Precedente: 3 instancias en #54-#56 |

## 7 · Path real del consumidor (DEC-PROC-5)
- **El runner escribe el ledger** por `printf`/`>` a `tools/verify/last-run.tsv` (archivo plano). NO Mongo, NO `.save()`.
- **Cada check LEE el path productivo real**, no un atajo: `db.<col>.countDocuments()` vía `mongosh` (no un dump cacheado), `docker` para liveness, `grep` sobre el árbol real. El comando del check ES el path, no su descripción.
- archivo:línea: `tools/verify/run.sh` (a crear) · Escribe por: `printf >> last-run.tsv`.

## 8 · Disenso registrado
| Posición A | Posición B | Qué evidencia las distinguiría | Estado |
|---|---|---|---|
| `checks.sh` es canónico para el comando; `COSTURAS.md` "última corrida" queda manual | `COSTURAS.md` debe ser la única fuente y el runner escribe de vuelta | escribir de vuelta al markdown reintroduce el parser descartado en #54 | Resuelto por diseño a favor de A; registrado |
| SIN VERIFICAR no falla la suite (exit 0) | SIN VERIFICAR debería gatear un release | una política de release existiría o no | Fuera de alcance del runner; decisión de proceso |

> Disenso no resuelto NO bloquea. Disenso invisible sí hace daño.

## 9 · IDs reservados
Los checks **reusan** los IDs de costura `CST-01..CST-15` (1:1 con las filas del mapa). No se abre familia nueva. Si una costura necesita más de un check (p.ej. CST-15 podría querer un check de la key y otro de V-PESADO), se sufija `-a`/`-b` como las adendas del corpus. Reservados: `CST-01..15` + sufijos.

## 10 · Cómo se prueba
Correr `bash tools/verify/run.sh` contra la DB de hoy debe reproducir la distribución de estados del mapa:
- **4 PASS** — las CONFORME: CST-01, -02, -05, -06.
- **~4 FAIL** — las DESVÍO: CST-08, -10, -11 y (swing) CST-15. **CST-15 es el swing**: si el check de V-PESADO se cumple hoy, sale PASS y dispara la adenda del caso raro #8; si no, FAIL. Es el runner ganándose el sueldo.
- **7 SIN VERIFICAR** — exactamente los puntos ciegos: NO VERIFICADO (CST-03, -04, -07, -09) + NO DECIDIDO (CST-12, -13, -14).

Aceptación del runner: el conjunto SIN VERIFICAR debe ser **idéntico** al conjunto de costuras NO DECIDIDO ∪ NO VERIFICADO del mapa. Si el runner marca PASS/FAIL a una costura sin target verificable, el runner está mintiendo — es un bug del runner, no de la costura.

## 11 · Costuras que este bloque cambia
| CST | Antes | Después | Verificación nueva o modificada |
|---|---|---|---|
| (todas 01–15) | celda "Verificación" en prosa, sin ejecutor | mismo texto + espejo ejecutable en `checks.sh` | el bloque **materializa** los comandos; NO muta el estado ni ningún campo de las filas |
| CST-15 | DESVÍO (V-PESADO PENDIENTE) | posible ADENDA si el check PASA (caso raro #8) | la única fila que el runner puede llegar a mover, y solo por adenda append-only |

> Ninguna semántica de las filas se edita. El ledger, no `COSTURAS.md`, guarda "última corrida".

## 12 · Reversión
Bloque LIGERO, aditivo, reversible con `git revert`: son archivos nuevos bajo `tools/verify/` (read-only sobre el sistema salvo el ledger, que es su propio archivo generado). Borrar `tools/verify/` deja el mapa y todo lo demás intactos.
