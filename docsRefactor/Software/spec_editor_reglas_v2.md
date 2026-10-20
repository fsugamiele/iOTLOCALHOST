# SPEC — Editor de reglas v2 + "¿funciona?" + log legible · 2026-10-18

**Origen:** Franco probó el editor K3 (2026-10-18): el diseño es el mismo de antes con cambios que lo empeoraron, los pasos son confusos y al guardar no hay forma de comprobar si la regla funciona (ni en el log del edge, que sigue como antes de GRAFCET).
**Causa (propia):** el K3 extendió el editor viejo (modo frase + modo grupos) en vez de construir el diseño del mockup aprobado.
**Firmado por Franco (2026-10-18, "aprobado las recomendaciones"):** Qi1–Qi4 como se recomendaron.

## 0 · CANDADO
Mockup validado por Franco (2026-10-18, "correcto, aprobado, avanza"), con dos agregados: selector **Equipos** con el nombre real del dispositivo (botones con ×) y **gráfico con Play** debajo de cada condición + ciclo de la regla completa, con **datos reales de las últimas 24 h** (de ejemplo solo si no hay historia).
**IMPLEMENTADO (2026-10-18):**
- Edge: `ruleLog.js` (Qi3), `pick` como lista de equipos `{mode, dIds}` (`typeCombined.js`, `combinedRule.js`).
- QA: `qa/lib/simulate.js` + `POST /simulate` (motor real, sin avisar) · API: `POST /api/qa/simulate`, `GET /api/rulepacks/:packId/devices`, `GET /api/rulepacks/:packId/rules/:ruleId/now` (rulefsm + últimas transiciones).
- Front: `RuleEditorV2.vue` + `ruleModelV2.js` (1 condición sobre este equipo → regla simple D/C/M; si no → combinada), resumen "Ahora" en `RuleCard.vue`, editor anterior como respaldo (Qi4) y para lo que v2 no representa ("N veces en T", desbalance, grupos anidados, sumas).
- Pruebas: modelo ida y vuelta 11/11 · motor 30/30 · simulación con base simulada · render del editor (SSR) con y sin datos.

## 1 · Decisiones
| # | Decisión |
|---|---|
| Qi1 | Primero un mockup interactivo del editor nuevo; se programa recién cuando el flujo esté validado. |
| Qi2 | Panel **Ahora** (etapa de la regla por equipo + estado de cada condición, en vivo) en el editor de la regla guardada y un resumen en la tarjeta de la lista. |
| Qi3 | El log del edge **reemplaza** las líneas `[ALARM]` por una línea por cambio de etapa, con el nombre de la regla, el equipo y el porqué. |
| Qi4 | El editor viejo queda como respaldo oculto una versión, hasta que el nuevo pase su banco. |
| Qi5 | (Franco 2026-10-19, opción A) "Fuera de lo habitual" (baseline) se elige con sentido: **baje** más de lo habitual (`lt −v`) o **suba** más de lo habitual (`gt v`). El motor no cambia: el desvío ya era con signo y «mayor que» solo detectaba subidas (las reglas de pérdida de combustible solo veían recargas). `tools/fix_baseline_direccion.js` corrige cat-CB-05, GEN-sifoneo-motor-apagado y cummins-pcc-sifoneo-divergencia. |

## 2 · Editor v2 (una sola pantalla, cuatro pasos)
1. **¿Qué vas a vigilar?** nombre + "una alarma por: cada <equipo> / todo el sitio".
2. **¿Cuándo tiene que avisar?** tarjetas de condición: Equipo · Medición · Qué mirar (su valor actual, contra el límite del equipo, si sube o baja rápido, cuándo va a llegar a un valor…) · comparación · valor y, según lo elegido, "llega a", "comparada con", "mirando los últimos N min", "cuenta durante N s". Cada tarjeta muestra su frase y lo que le falta. Con dos o más: "avisar cuando se cumplan todas / alguna".
3. **¿Cuánto esperar y cómo se cierra?** espera, cierre, "se cierra sola / espera confirmación".
4. **¿Qué tan grave es y qué hay que hacer?** gravedad + recomendación.
- Costado: **La regla dice** (frase completa, en vivo) y **Probar con las últimas 24 h** (backtest de QA: veces que habría avisado, tiempo en alarma, sin datos, y qué condición faltó cuando estuvo cerca).
- No hay "modo simple / modo grupos": una regla de una condición es una regla con una tarjeta. Lo que se guarda (tipo D/C/S/M/cross) lo decide el editor sin mostrarlo.

## 3 · "¿Funciona?" (Qi2)
- **Ahora:** lee `rulefsm` (etapa, desde cuándo, `lastCtx.leaves`) por instancia; se actualiza solo. Texto por etapa: Vigilando / Observando (avisa si sigue N s) / Alarma / Recuperándose / Sin datos / Esperando confirmación.
- **Prueba 24 h:** `POST /api/qa/backtest` con la regla en edición (antes de guardar).

## 4 · Log legible (Qi3)
`HH:MM:SS «<nombre de la regla>» <equipo>: <etapa> → <etapa> · <porqué>` y, al pasar a Observando/Alarma, una línea por condición (`C1 sí · <frase>`). Reemplaza `[ALARM] …`.

## 5 · Pendiente de validar en el mockup
Flujo de los 4 pasos, nombres de "Qué mirar", panel Ahora, línea de log.
