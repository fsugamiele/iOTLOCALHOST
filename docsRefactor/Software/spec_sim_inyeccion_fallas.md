# SPEC — P2: inyección de fallas en el simulador · 2026-10-06

**Dirección firmada por Franco:** último bloque P2. El sim nunca genera fallas de motor →
`fault_code` siempre 0, `coolant_temp` tope 95, `rpm` tope 1500. Por eso el backtest (DEC-REF-131)
marca "muertas" las reglas-TRAP GE-04 (coolant>105), GE-07 (rpm>1725), GE-12/16/17 (fault_code),
AR-02 (fault_code 1438) — **no por estar mal, sino porque no hay datos de falla**. Faltan escenarios
nombrados que inyecten esas fallas (hoy solo existe `cummins_oil_failure` para GE-01/02).

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- Escenarios **pre-grabados** en `SCENARIOS` (como `cummins_oil_failure`/`sensor_muerto`), disparables
  por el canal de control (`{command:'scenario', value:'<nombre>'}`), que **pinean** la falla
  (`holdVars`) y luego la **recuperan** (step de reset) → el trap **dispara Y resuelve** (ciclo completo).
- Variables confirmadas en el device cummins (`fault_code`/`coolant_temp`/`rpm` en `_state`) → el
  scenario no aborta. Alcance: **traps cummins** (GE-04/07/12/16/17/AR-02). GEN (crank) y bitmaps = futuro.
- No cambia `evolve` ni el estado inicial: solo agrega escenarios (test/demo). Sin noCleanup → al
  terminar, `evolve` retoma el valor normal (coolant/rpm) y el reset deja `fault_code` en 0.

## 1 · Presupuesto de bloque
- Tipo de bloque: **LIGERO**
- Un concern: las reglas-trap no se pueden ejercitar (el sim no produce la falla) → cobertura no demostrable.
- Una decisión de diseño: escenarios de falla que pinean + recuperan (fire→resolve), reusando el mecanismo `holdVars`/`steps`.
- Archivos a tocar (LISTA CERRADA):
  1. `tools/device_simulator/lib/sensor-engine.js` — nuevos escenarios de falla cummins en `SCENARIOS`.
- Total: **1 archivo · Límite: 6.**

## 2 · Recon que lo funda
Auditoría C7 (fault_code siempre 0); backtest (traps muertos por falta de datos); `sensor-engine.js`
(`rpm` tope 1500 :209, `coolant_temp` tope 95 :231, `fault_code` init 0 :98 sin evolve, `cummins_oil_failure`
:226/833 como precedente); `device.js:_runScenario` (holdVars + steps + cleanup).

## 3 · Consumidores
| Consumidor | Qué |
|---|---|
| operador/tester (control MQTT) | dispara una falla para VER el trap en acción (fire→resolve) |
| backtest / supervisor | una ventana con la falla inyectada deja de marcar el trap como "muerto" |

## 4 · Escenarios nuevos (cummins)
| Scenario | Inyecta | Ejercita |
|---|---|---|
| `falla_sobretemperatura` | coolant_temp 110 → 88 | GE-04 (>105) |
| `falla_sobrevelocidad` | rpm 1800 → 1500 | GE-07 (>1725) |
| `falla_codigo_filtro_aire` | fault_code 488 → 0 | GE-12 (==488) + GE-17 (≠0) |
| `falla_enlace_ecu` | fault_code 781 → 0 | GE-16 (==781) + GE-17 |
| `falla_no_arranca` | fault_code 1438 → 0 | AR-02 (==1438) + GE-17 |

## 5 · Comportamiento
| Control | Qué hace |
|---|---|
| `holdVars` | congela y republica la variable de falla durante el escenario |
| step de reset | al final del hold devuelve la variable a normal → el trap RESUELVE |
| fin del escenario | cleanup retoma `evolve` (coolant/rpm) o deja fault_code en 0 |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | `falla_sobretemperatura` en un cummins | GE-04 dispara (110>105); al resetear a 88 resuelve |
| 2 | `falla_codigo_filtro_aire` | GE-12 (eq 488) y GE-17 (neq 0) disparan; reset a 0 resuelve |
| 3 | scenario en un device sin la variable | aborta con warning (ya lo hace `_runScenario`) |
| 4 | fin de duración | el valor vuelve a normal (no queda la falla pegada) |

## 7 · Path real (DEC-PROC-5)
Sim (producto): `_runScenario` pinea/publica por MQTT → `db.data`+siteState → el motor evalúa los traps.

## 8 · Disenso registrado
| Posición A | Posición B | Estado |
|---|---|---|
| Fallas también en GEN/bitmaps ahora | Solo traps cummins (vars confirmadas) | **Cerrado:** B (GEN/bitmaps = futuro; evitar abortos) |
| noCleanup (falla persistente) | reset + cleanup (fire→resolve) | **Cerrado:** reset (demostrar el ciclo completo, no dejar la falla pegada) |

## 9 · IDs reservados
- **DEC-REF-133** (escenarios de inyección de fallas en el sim para ejercitar los traps).

## 10 · Cómo se prueba
Disparar `falla_sobretemperatura` y `falla_codigo_filtro_aire` sobre un device cummins (vía
`simulator/<dId>/control`) → ver en `notifications`/log del edge que **GE-04** y **GE-12/GE-17**
disparan (y resuelven al recuperarse). Luego el backtest sobre esa ventana ya no los marca "muertos".

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| Cobertura de traps | no demostrable (sin datos de falla) | ejercitable por escenario (fire→resolve) | §10 |

## 12 · Reversión
Revert git de `sensor-engine.js` (quita los escenarios). Sin efecto sobre el runtime normal.
