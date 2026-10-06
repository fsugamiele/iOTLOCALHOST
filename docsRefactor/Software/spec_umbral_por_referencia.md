# SPEC — Umbral por referencia a parámetro de instalación (P_nom) · 2026-10-05

**Dirección firmada por Franco** (sesión actual): llevar los umbrales que dependen de un valor
propio del sitio a "producto, no demo" — sin hornear el número en un pack compartido. Panel de
3 especialistas (datos/plataforma · motor/edge · producto/campo) convergió en la **opción (c):
la regla referencia un valor nombrado; el número vive como config de la instalación.**

Caso que lo funda: **GE-06** y **SG-05** usan `P_nom` (potencia nominal del grupo). Hoy exigirían
hornear ese número en packs compartidos (SG-05 vive en el pack del **ATS**, común a todo grupo) →
hallazgo DEC-PROC-3. **DC-07** (N·I_mod) comparte el problema pero necesita capacidad derivada →
**se difiere a un bloque aparte** (ver §8).

Linaje: **DEC-REF-18/#22** (`setpointSource`: la regla lee un setpoint publicado) + **DEC-REF-115**
(`device.autonomy`: override de instalación sobre la ficha — "el tanque es de la instalación, no del
modelo"). P_nom es idéntico en naturaleza al tanque.

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas para no dejar huecos:
- El valor vive en **`device.refParams`** (mapa genérico de parámetros de instalación), espejo de
  `device.autonomy` (DEC-REF-115). P_nom = `refParams.rated_kw`.
- Se hidrata en `siteState` como **pseudo-variable** del device (igual que la telemetría), de modo
  que cualquier evaluador la ve sin tocar su contrato.
- **SG-05** (umbral de una sola variable) usa **type C** (`setpointSource`), que YA resuelve
  "variable OP referencia". Único arreglo: aplicar `scale` (hoy no se aplica).
- **GE-06** (combinada) usa **`condition.ref`** nuevo en la hoja cross: la hoja compara contra un
  valor referenciado de otro device del sitio, no un literal.
- Ref ausente ⇒ la regla **NO dispara** (neutro `null`), nunca dispara con umbral basura
  (`on_missing_ref:'ignore'` en C; tri-state en la hoja cross). Cierra la "regla-fantasma".
- **Sin migración:** reglas y devices sin los campos nuevos se comportan **idéntico a hoy**.

## 1 · Presupuesto de bloque
- Tipo de bloque: **NORMAL**
- Un concern: un umbral que depende de la instalación (P_nom) no debe horrnearse en el pack.
- Una decisión de diseño: el número vive en `device.refParams` y la regla lo **referencia**
  (type C `setpointSource` para 1 variable; `condition.ref` para hoja cross).
- Archivos a tocar (LISTA CERRADA):
  1. `app/api/models/device.js` — agregar `refParams` (Object, default {}).
  2. `edge-engine/siteState.js` — hidratar `device.refParams.*` en `deviceState` + sumar `refParams` a la proyección.
  3. `edge-engine/evaluators/typeC.js` — aplicar `setpointSource.scale` al setpoint resuelto (hoy se ignora).
  4. `edge-engine/evaluators/typeCross.js` — resolver `condition.ref {deviceType, variable, scale}` en la hoja equipo, con tri-state si no resuelve.
  5. `app/api/models/rule_definition.js` — permitir `condition.ref` (value deja de ser required cuando hay ref).
  6. `app/api/services/ruleValidation.js` — validar `condition.ref` (exactamente uno de value|ref; op aritmético) en `validateD`/`validateCrossTree`; incluir refs en `collectCrossLeafRefs`.
- Total: **6 archivos · Límite: 6.**

> La UI de alta que captura `rated_kw` en el relevamiento = **bloque siguiente** (DEC-GTM-3). Para el
> piloto NEA, `rated_kw` se setea por edición de device / script hasta que exista el campo de alta.
> El sembrado de SG-05/GE-06 referenciando = op de datos posterior a este bloque (no es "tocar código").

## 2 · Recon que lo funda
Panel de especialistas (sesión 2026-10-05, 3 forks) + lecturas: `device.js:28-31` (precedente
`autonomy`), `rule_definition.js:47-51` (`setpointSource`), `typeC.js:11-25` (resuelve ref, **no**
aplica scale en :19), `typeCross.js` (hoja compara contra literal), `siteState.js:51-105` (hidratación
desde `db.data`; `siteId` solo para logs → packs globales). Catálogo de fallas (GE-06/SG-05/DC-07).

## 3 · Consumidores (grep exhaustivo)
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| Hidratación de estado | `edge-engine/siteState.js:71` (proyección Device), `:75-101` (loop) | Lee `refParams` y lo vuelca como pseudo-vars en `deviceState` |
| Evaluador type C | `edge-engine/evaluators/typeC.js:17-25` | Multiplica el setpoint resuelto por `setpointSource.scale` antes de comparar |
| Evaluador cross (hoja) | `edge-engine/evaluators/typeCross.js` (eval de hoja equipo → `evaluateD`) | Si la hoja trae `condition.ref`, resuelve el valor del device referenciado del site antes de comparar; `null` si no resuelve |
| Validación de reglas | `app/api/services/ruleValidation.js` `validateD`/`validateCrossTree`/`collectCrossLeafRefs` | Acepta `condition.ref`; exige uno de value|ref |
| Escritura de reglas | `app/api/routes/rulepacks.js:138-163` | Sin cambio de código: ya corre `validateRule` + `collectCrossLeafRefs` |
| Modelo regla | `app/api/models/rule_definition.js:22-25,47-51` | `condition.value` deja de ser required si hay `condition.ref` |

## 4 · Campos que entran / salen / mutan
| Campo | Entra | Sale | Muta | Dónde |
|---|---|---|---|---|
| `device.refParams` (Object, `{}` default) | ✓ | | | `device.js` |
| `rule_definition.condition.ref {deviceType, variable, scale}` | ✓ | | | `rule_definition.js` |
| `condition.value` required | | | ✓ (opcional si hay ref) | `rule_definition.js` |
| `setpointSource.scale` aplicado | | | ✓ (hoy ignorado) | `typeC.js` |
| pseudo-var `rated_kw` en `deviceState` | ✓ | | | `siteState.js` (runtime) |

## 5 · Comportamiento de cada control
| Control | Qué hace | Validación | Qué pasa si falla |
|---|---|---|---|
| `device.refParams.rated_kw` | P_nom del grupo instalado (kW) | número > 0 en el alta (DEC-GTM-3) | ausente → ref no resuelve → regla no dispara |
| `setpointSource.scale` (SG-05) | factor del umbral (0,9) | número > 0 (schema default 1) | default 1 = umbral crudo |
| `condition.ref` (GE-06) | apunta a {deviceType, variable} del site + scale | exactamente uno de value|ref; op aritmético | shape inválido → 400 en el PUT |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | `rated_kw` no cargado en el device | SG-05 (C, `on_missing_ref:ignore`) y GE-06 (ref→null) **no disparan**. Nunca con umbral 0/basura. |
| 2 | `rated_kw` = 0 o negativo | Tratado como ausente (ref no válida) → no dispara. |
| 3 | `condition` con value **y** ref a la vez | Rechazo 400 en validación (ambiguo). |
| 4 | `condition.ref` sin `scale` | scale = 1 (default). |
| 5 | Device referenciado no existe en el site (GE-06 apunta a un grupo que no está) | hoja = `null` tri-state → la combinada no dispara (ni error). |
| 6 | Varios devices del mismo deviceType en el site | Resolver por el device del propio contexto de evaluación; si la ref es a otro tipo, primero que matchee (espejo de la semántica cross actual). |
| 7 | Reload SF-3 tras cargar `rated_kw` | La pseudo-var se re-hidrata en el próximo arranque; en runtime entra al primer publish del device. |
| 8 | Regla vieja sin `condition.ref` | Camino literal intacto (DEC-PROC-5). |

## 7 · Path real del consumidor (DEC-PROC-5)
- Escritura de regla: `app/api/routes/rulepacks.js:165-169` → `RulePack.findOneAndUpdate(..., runValidators:true)` (**no** insertOne).
- Config de device: `app/api/routes/devices.js` (update) → `.save()`/`findOneAndUpdate` — **verificar la ruta real antes de tocar** (no asumir).
- Lectura en edge: `siteState.js` `.lean()` desde Mongo (mismo que lee el motor).

## 8 · Disenso registrado
| Posición A | Posición B | Qué evidencia las distinguiría | Estado |
|---|---|---|---|
| Un solo mecanismo (`condition.ref` también para SG-05) | Reusar type C para SG-05 + `condition.ref` solo para cross | Costo vs. dos superficies de ref | **Cerrado**: B (type C ya resuelve 1-variable; costo casi nulo) |
| DC-07 en este bloque | DC-07 aparte | DC-07 necesita capacidad derivada (suma-vs-suma / conteo vivo), supera el presupuesto | **Cerrado**: aparte (bloque futuro) |
| I_mod en ficha ELTEK (nominal) vs refParams de device | — | I_mod es dato de modelo (datasheet), no de instalación | Abierto (se resuelve en el bloque DC-07) |

## 9 · IDs reservados
- DEC propuestas: **DEC-REF-120** (umbral por referencia a parámetro de instalación) · **DEC-GTM-3**
  (alta captura P_nom obligatorio/tipado). A anexar a `WanomiRefactor.md` al firmar.
- Reglas a sembrar luego: `cat-SG-05` (type C), `cat-GE-06` (cross con ref).

## 10 · Cómo se prueba
1. Setear `refParams.rated_kw` en un device GEN/cummins del simulador (p. ej. 20).
2. Verificar que el edge lo hidrata: aparece `rated_kw` en `deviceState` (log/reload).
3. SG-05: forzar `load_kw` > 18 (20×0,9) con el simulador → dispara; bajarlo → resuelve. Con `rated_kw` ausente → NO dispara.
4. GE-06: `coolant_temp` > 95 **y** `load_kw` < 6 (20×0,3) → dispara; sin `rated_kw` → NO dispara.
5. Negativo: regla con value+ref → el PUT devuelve 400.
6. Regresión: una regla literal existente sigue disparando igual.

## 11 · Costuras que este bloque cambia
| CST | Antes | Después | Verificación |
|---|---|---|---|
| Umbral de regla | Solo literal (`condition.value`) | Literal **o** referencia (`condition.ref` / `setpointSource`) | §10.3-5 |
| Config de instalación en edge | Solo `db.data` + `device.autonomy` | + `device.refParams` hidratado | §10.2 |

## 12 · Reversión
- Quitar `condition.ref` de las reglas (vuelven a literal) y borrar `refParams` del device: comportamiento idéntico a hoy. Los 6 cambios son aditivos; sin migración de datos. Revert por git de los 6 archivos.
