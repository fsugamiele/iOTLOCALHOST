# SPEC — G1e · Reglas M: muestras, eventos, entradas y desbalance · 2026-10-16

**Origen:** banco B2 (`plan_banco_conformidad_reglas.md` §6, cinco hallazgos).
**Firmado por Franco (2026-10-16, "si, aprobado"):** Qf1, Qf2, Qf3 y Qf5 como se recomendaron; **Qf4 = opción 2** (historia propia).

## 0 · CANDADO
preguntas_abiertas: 0. **IMPLEMENTADO (2026-10-16).** DEC-REF-150.

## 1 · Cambios (lista cerrada: `evaluators/typeM.js`, `ruleEngine.js`, `app/api/routes/rulepacks.js`, `tools/banco/b2.js`)
| # | Hoy | Con G1e |
|---|---|---|
| Qf1 | Pocas muestras en la ventana (regla recién cargada o serie rala) → receptividad nula → **E5 "Sin datos"**, aunque el equipo reporte. | **No es "Sin datos":** la instancia queda en su etapa, sin abrir ni cerrar. "Sin datos" queda para el silencio del equipo (G1c) y para un dato que falta de verdad (Qf3). La UI puede mostrar "Juntando muestras" (G3). |
| Qf2 | `stepJump` y `baseline` cumplen la condición en UNA muestra. Si llega otra muestra durante la espera (por ejemplo, el latido), el evento se pierde. | **Eventos:** avisan en esa misma muestra; la espera (`graceSec`) se ignora para estas dos métricas. Cierran como siempre: solos con el tiempo de cierre, o con confirmación si la regla es manual. |
| Qf3 | ratio/divergence: si la entrada del propio equipo está vieja, toman el mismo dato de **otro** equipo del mismo tipo. | Una entrada del mismo tipo de equipo que la regla se lee **solo del propio equipo**. Si está vieja → `stale` → "Sin datos" (la alarma abierta sigue abierta). Las entradas de **otro** tipo de equipo siguen buscándose en el sitio. |
| Qf4 | spread: el culpable es el más alejado de la mediana. Con 2 equipos hay empate y queda el primero de la lista. Además, si el culpable cambiaba, la alarma del anterior quedaba abierta. | **3 o más equipos:** mediana, como antes. **2 equipos:** el culpable es el que más se apartó del **promedio de su propia historia** (`mParams.historySec`, por defecto 600 s), con al menos el doble de movimiento que el otro. **Si no se distingue:** la alarma es del **sitio** (`ruleId:siteCode`) y la recomendación nombra a los dos equipos con sus valores. **En todos los casos:** cuando cambia el culpable (o pasa de equipo a sitio), la alarma anterior recibe "no se cumple" y se cierra. |
| Qf5 | Sensor clavado con ventana corta: con report-by-exception nunca junta muestras. | La API (`PUT /rulepacks`) **rechaza** un flatline con `mWindow.durationSec` < 900 s, con un mensaje que explica el motivo. El rechazo aplica **solo al crear la regla o al cambiar su ventana**: las existentes no bloquean la edición del resto del pack. |

## 2 · Casos raros
| # | Caso | Comportamiento |
|---|---|---|
| 1 | Regla M recién cargada | Sin instancia hasta tener muestras suficientes (Qf1). |
| 2 | `staleness` con un equipo todavía no visto en la sesión | No decide nada (antes: E5 si había instancia). |
| 3 | spread con 2 equipos sin historia (recién cargada) | Alarma del sitio, nombrando a los dos equipos. |
| 4 | Historia de spread tras un reinicio del edge | Vive en memoria y se reconstruye en `historySec` (mientras tanto, alarma del sitio). |

## 3 · Cómo se prueba
- Unidad 10/10 (Qf1, Qf2, Qf3 y Qf4, incluido el cambio de culpable y la alarma del sitio). Regresiones verdes: G1 39/39, G1b 20/20, G1c 9/9 y G1d 6/6.
- Banco: `banco.sh --b2 --only T,R,A`. Esperado en verde: bM-slope-3, bM-div-3, bM-spread-1/2/3, bM-jump-1/2, bM-base-1/2 y bM-flat-3 (rechazo de la API).
