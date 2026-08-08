# CIERRE — BLOQUE HARNESS-2 (auditar y sellar el trabajo sin commitear) · 2026-08-08

> Sesión #56, tramo paralelo. Tipo: **LIGERO** — artefactos reversibles con
> `git revert`. No se rehízo trabajo: se auditó, se probó y se selló.

## 1 · Afirmaciones — una fila por afirmación, SIN EXCEPCIÓN
| # | Afirmación | Evidencia | Verificación corrible | Estado |
|---|---|---|---|---|
| 1 | `apertura.sh` existe y es READ-ONLY (no muta git ni los 3 archivos de gobierno) | `evidencia/harness2-scripts.md` §2.1 | `diff pre/post` vacío + `md5sum -c` OK | PROBADO |
| 2 | `apertura.sh` no imprime valores de secretos | evidencia §2.2 | `grep -cE '[a-f0-9]{32}' apertura.out` → 0 | PROBADO |
| 3 | `secretos.sh` existe, es READ-ONLY y emite solo nombres (no valores) | evidencia §2.3 | `grep -cE '[a-f0-9]{32}'` → 0; salida cruda | PROBADO |
| 4 | `secretos.sh` no emite longitud por defecto (`len` pasa a `--len`) | Parte A de la corrección de la sala | `secretos.sh \| grep -o 'len=' \| wc -l` → 0; `--len` → 10 | PROBADO |
| 5 | 16 costuras en el inventario: 15 sembradas + CST-16 por omisión detectada | `COSTURAS.md` | `grep -c '^### CST-'` → 16 | PROBADO |
| 6 | Las 15 originales = 12 de F10 + 3 extra; 7 filas de F10 excluidas por lógica interna | encabezado del Inventario | conteo de estados acotado a bloques suma 15 | PROBADO |
| 7 | Distribución de estados de las 15: 4 CONFORME · 4 DESVÍO · 4 NO VERIFICADO · 3 NO DECIDIDO · 0 CONTRADICCIÓN | volcado PASO 2 | `grep '^\| Estado '` acotado a CST | PROBADO |
| 8 | spec de `verify/` escrita, NO implementada | `spec/verify.md` §0 (DISEÑO) · líneas 3-4 | `ls tools/verify/` → no existe | PROBADO |
| 9 | CST-16: el ATS `59XYsglM` tiene `deviceType: ""` — único de 13 devices | query Mongo del PASO 2-bis | `db.devices.find(...)` corrida 2026-08-08 | PROBADO |
| 10 | Atribución del sembrado corregida: #55 → #56 tramo paralelo | `COSTURAS.md` encabezado Inventario | `grep -c 'HARNESS-2 (#55)'` → 0 | PROBADO |
| 11 | `verify.md` §6 gana la fila 9 "Check mal formulado" (lección del gate `grep -c`) | `spec/verify.md` §6 | `grep -c 'Check mal formulado'` → 1 | PROBADO |

## 2 · Veredicto del falsador
**no corresponde — bloque ligero.** La revisión de la sala cumplió la función
(detectó la fuga de `len` por defecto y el gate `grep -c` mal formulado, ambos
antes del disco). Todas las afirmaciones de §1 son verificables directamente por
comando corrible; ninguna descansa en el transcript.

## 3 · Costuras actualizadas — CANDADO ANTI-PODREDUMBRE
| CST | Estado anterior | Estado nuevo | Verificación |
|---|---|---|---|
| CST-01..15 | (sin commitear) | selladas en git, sin cambio de semántica | `grep -c '^### CST-'` = 16 |
| CST-16 | inexistente en inventario | NO DECIDIDO — registro→selector de reglas | `grep -c '^### CST-'` sube 15→16 |

El inventario pasa a **16 costuras** (15 del sembrado inicial + CST-16 por
omisión detectada). "Próximo libre" avanza a **CST-17**. Ninguna de las 15 vio
editada su semántica; solo se agregó una fila y se corrigió la atribución del
encabezado.

## 4 · Contradicciones con el corpus
| Fila | Qué dice | Qué encontramos | Adenda a escribir |
|---|---|---|---|
| Encabezado Inventario | "sembrado en HARNESS-2 (#55)" | el carry-over de #55 declara COSTURAS vacío y pendiente → se hizo en #56 | corregido in situ (no es fila de corpus, es metadato del mapa) |
| CST-08 vs carry-over #2 | pack ATS `ats-inteliats-v1` sin sembrar (CST-08) **y** carry-over #2 dice "3 reglas tipo D no disparan" | **arbitraje:** son DOS faltas EN SERIE sobre la misma capacidad — el pack ATS NO existe en DB (CST-08) **y** el `deviceType` del ATS está vacío (CST-16). Aunque se siembre el pack, no dispararía mientras `deviceType=""` | registrado en CST-16 "Consecuencia del desvío"; recon del ATS pendiente (DEC-REF-81 iii) antes de escribir dato |

## 5 · Qué queda abierto
- **Recon del ATS (bloque PESADO aparte):** de dónde se puebla `deviceType`, qué
  string espera el selector de packs, si el vacío es el sembrado o un borrado.
- **CST-07 y CST-15:** verificaciones escritas, `última corrida: PENDIENTE`.
- **spec `verify/`:** aprobada como diseño; su implementación es otro bloque.

## 6 · Registro
- Filas a escribir: ninguna en el corpus (bloque de artefactos del harness, no de
  decisiones). CST-16 es fila del mapa, no del corpus.
- Bump de versión: **n/a** — no toca `WanomiRefactor.md`.
