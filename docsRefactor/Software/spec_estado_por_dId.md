# SPEC — P0-1: estado del motor por `ruleId:dId` + supresión de re-fire · 2026-10-06

**Dirección firmada por Franco** (sesión actual): primer bloque del plan de corrección
(`plan_correccion_motor_reglas_2026-10-05.md` P0-1). Ataca el defecto de mayor retorno de la
auditoría: el estado del motor se clava por `ruleId` **sin `dId`**, así que con 2+ equipos del
mismo deviceType se mezclan (A1), el tipo S resuelve de más (A2) y las reglas re-disparan cada
cooldown mientras la condición sigue activa (A3).

Medido hoy: **82–89%** de los resolves ELTEK cierran el equipo equivocado; **≈829 fires/día** en
3 reglas; `cat-eltek-A2` re-dispara con mediana **315 s ≈ su cooldown**.

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- **Clave de estado = identidad de la instancia de alarma.** D/S/M (por equipo) → `${ruleId}:${dId}`.
  cross (por sitio) → `${ruleId}:${siteCode}`. Un helper `stateKey(rule, dId, siteCode)` la calcula.
- **`mState` (type M) YA usa `${ruleId}:${dId}`** → sin cambio. **`crossState` (firedKey) YA es
  `${siteCode}:${ruleId}`** (su propio dedup) → sin cambio. Lo que cambia: `cooldownState`,
  `activeState`, `windowState`(S) y las sub-keys derivadas (`:no-setpoint*`, `:resolveStart`).
- **Anti-refire:** `fireAlarm` NO re-notifica si la `stateKey` ya está en `activeState`. El cooldown
  gobierna solo el **primer** fire y el re-disparo **tras** un resolve. (cross ya suprime vía firedKey;
  esto unifica D/S/M con esa semántica.)
- **Tipo S resuelve solo si `count < countThreshold`** tras la purga deslizante, no ante cualquier
  mensaje no-matching.
- **Recordatorio periódico** de una alarma activa (reminder cada N h): **DIFERIDO** (§8). Este bloque
  solo suprime el re-fire; el campo `reminderSec` se agrega después si se decide.
- **Sin migración:** el estado vive en memoria del edge; se reconstruye solo. Separador `:` (mismo
  que `mState`), limpieza por prefijo `${ruleId}:`.

## 1 · Presupuesto de bloque
- Tipo de bloque: **NORMAL**
- Un concern: el estado compartido entre equipos genera falsas alarmas (cierres cruzados, re-fire, resolve prematuro).
- Una decisión de diseño: clave de estado por **identidad de instancia** (`ruleId:dId` / `ruleId:siteCode`) + **anti-refire por `activeState`**.
- Archivos a tocar (LISTA CERRADA):
  1. `edge-engine/ruleEngine.js` — `stateKey` helper; `fireAlarm`/`fireResolve` por `stateKey`; anti-refire; tipo S resuelve-por-count; keys `:no-setpoint*`/`:resolveStart` por `stateKey`; `processStalenessTick` por `${ruleId}:${dId}`.
  2. `edge-engine/evaluators/typeS.js` — `windowState` por `${ruleId}:${dId}` (recibe `dId`).
  3. `edge-engine/reloadState.js` — `cleanupStateForRules` limpia por prefijo `${ruleId}:`; `resolvedRuleIds` devuelve pares `{ruleId, suffix}`.
  4. `edge-engine/index.js` — resolve-by-edit por `{ruleId, suffix}` (device/site correcto); `oldRuleDefs` chequea activos por prefijo.
- Total: **4 archivos · Límite: 6.**

## 2 · Recon que lo funda
Auditoría H1/H2/H3 (A1/A2/A3) + mediciones. Verificado: `ruleEngine.js:286-341` (fireAlarm/fireResolve por `ruleId`), `:166-175` (S resuelve sin mirar count), `:70-72,230` (sub-keys), `:258-284` (tick); `typeS.js:19,30,37`; `reloadState.js:91-118`; `index.js:130-160` (resolve-by-edit por `ruleId` + `findDeviceIdByType`).

## 3 · Consumidores (grep exhaustivo)
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| fireAlarm / fireResolve | `ruleEngine.js:286-367` | key `rule.ruleId` → `stateKey`; anti-refire (return si activo) |
| Dispatch D | `ruleEngine.js:205-247` | resolveStart por `stateKey`; resolve con `stateKey` |
| Dispatch S | `ruleEngine.js:156-176` | resuelve solo si `count < countThreshold`; pasa `dId` a evaluateS |
| Dispatch C (EDGE-2) | `ruleEngine.js:70-152` | keys `:no-setpoint*` por `stateKey` (episodio por equipo) |
| Dispatch M | `ruleEngine.js:178-199` | cooldown/active por `stateKey` (mState ya por dId) |
| Staleness tick | `ruleEngine.js:258-284` | fireAlarm/fireResolve por `${ruleId}:${dId}` |
| evaluateS | `typeS.js:10-44` | firma `(rule, value, windowState, dId)`; key por dId |
| Reload cleanup | `reloadState.js:91-118` | prefijo `${ruleId}:`; `resolvedRuleIds` → `{ruleId, suffix}` |
| Resolve-by-edit | `index.js:130-160` | itera pares; `deviceId` = suffix (D/S/M) o `findDeviceIdByType` (cross) |
| crossState | `typeCross.js` | **sin cambio** (ya site-scoped) |

## 4 · Campos que entran / salen / mutan
| Qué | Muta | Dónde |
|---|---|---|
| clave de `cooldownState`/`activeState` | `ruleId` → `${ruleId}:${dId}` o `${ruleId}:${siteCode}` | ruleEngine, index |
| clave de `windowState`(S) | `ruleId` → `${ruleId}:${dId}` | typeS |
| condición de resolve S | "cualquier no-match" → "`count < countThreshold`" | ruleEngine |
| re-notificación | "cada cooldown mientras activa" → "una por episodio" | ruleEngine (fireAlarm) |
| `resolvedRuleIds` | `string[]` → `{ruleId, suffix}[]` | reloadState, index |
| datos persistidos | — (estado en memoria, sin migración) | — |

## 5 · Comportamiento de cada control
| Control | Qué hace | Qué pasa si falla |
|---|---|---|
| `stateKey(rule,dId,siteCode)` | cross→`${ruleId}:${siteCode}`; resto→`${ruleId}:${dId}` | — |
| anti-refire | `fireAlarm` return temprano si `activeState.has(stateKey)` | sin él, re-fire cada cooldown (bug actual) |
| S resuelve-por-count | resolve solo con `count < countThreshold` | sin él, resolve prematuro (A2) |
| cleanup por prefijo | borra `${ruleId}:*` de los 4 maps | sin él, estado zombie por dId tras reload |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | 2 equipos mismo deviceType, misma regla D | estados independientes: fire de A no silencia a B; resolve de B no cierra a A |
| 2 | Regla cross (site-level) | estado por `${ruleId}:${siteCode}` (1 instancia/site); la notificación se ancla al device del mensaje (sin cambio) |
| 3 | Regla activa, llega otro mensaje que cumple | **no re-notifica**; al dejar de cumplir → resolve (borra active+cooldown, DEC-REF-102 D-1) → próximo cumplimiento re-dispara |
| 4 | Tipo S: ventana sigue ≥ countThreshold y llega un no-match | **no resuelve** (count sigue ≥ umbral); resuelve solo cuando la purga baja count < umbral |
| 5 | Reload edita/elimina una regla activa en 2 equipos | emite **1 resolve por equipo** (no uno solo) |
| 6 | Staleness tick | cada equipo su propio cooldown/active (`${ruleId}:${dId}`) |
| 7 | Type C sin setpoint en 2 equipos | episodios EDGE-2 independientes por equipo (keys `:no-setpoint` por `stateKey`) |
| 8 | 1 solo equipo del tipo (hoy el caso común) | idéntico a hoy (sufijo único) — regresión nula |

## 7 · Path real del consumidor (DEC-PROC-5)
- Estado: Maps en memoria del proceso edge (`index.js` los crea y los pasa por argumento). No hay
  `.save()`/Mongo — es runtime puro. El reload (SF-3) reconstruye snapshot y limpia estado.
- Emisión: `notify()` (notificationRouter) — mismo canal que hoy (fire/resolve a Mongo+Telegram).

## 8 · Disenso registrado
| Posición A | Posición B | Evidencia que las distingue | Estado |
|---|---|---|---|
| Implementar `reminderSec` (recordatorio periódico) ahora | Solo suprimir re-fire; reminder después | ¿el operador quiere recordatorios de alarma abierta? | **Cerrado:** B (el re-fire cada 300 s ES el bug; reminder opt-in futuro) |
| cross también por `dId` del device que dispara | cross por `siteCode` (es site-level) | múltiples devices disparando el mismo cross | **Cerrado:** B |
| Separador de clave propio (`::`) | `:` como `mState` | colisión de prefijo en cleanup | **Cerrado:** `:` (cleanup por prefijo `${ruleId}:` cubre ambos sufijos) |

## 9 · IDs reservados
- DEC propuesta: **DEC-REF-122** (estado del motor por identidad de instancia + anti-refire; corrige
  DEC-REF-64/102 sobre multi-equipo). A anexar a `WanomiRefactor.md` al firmar.

## 10 · Cómo se prueba (medible sobre `notifications`, con simulador de 2+ ELTEK)
1. **Cruce (A1):** reactivar `cat-eltek-A2` o una regla con 2 devices → **0%** resolves con `dId` cruzado (hoy 82–89%).
2. **Anti-refire (A3):** una regla persistentemente verdadera emite **1 fire por episodio** (no cada ~315 s). `cat-eltek-A2` de 2755 → ~1/episodio.
3. **Tipo S (A2):** con 2 devices publicando intercalado, la ventana de uno no cuenta los eventos del otro; no hay fire→resolve cada ~30 s por no-match cruzado.
4. **Reload:** editar una regla activa en 2 devices → **2 resolves** (uno por device), no uno.
5. **Regresión:** sitio con 1 solo device del tipo → comportamiento idéntico a hoy.
6. **Zombie:** tras reload que elimina una regla activa en N devices, `activeState` queda sin keys `${ruleId}:*`.

## 11 · Costuras que este bloque cambia
| CST | Antes | Después | Verificación |
|---|---|---|---|
| Identidad del estado de alarma | por `ruleId` (colisiona entre equipos) | por instancia (`ruleId:dId` / `ruleId:siteCode`) | §10.1/§10.3 |
| Ciclo de vida de re-notificación | re-fire cada cooldown | 1 por episodio | §10.2 |
| Resolve de tipo S | ante cualquier no-match | solo si count < umbral | §10.3 |

## 12 · Reversión
Estado en memoria; revert por git de los 4 archivos restaura el comportamiento anterior. Sin
migración de datos. Un reinicio del edge con el código viejo reconstruye el estado por `ruleId`.
