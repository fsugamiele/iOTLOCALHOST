# SPEC — G1d · Reevaluar cuando cambia lo que la regla mira (C y S) · 2026-10-16

**Origen:** banco B1 (`plan_banco_conformidad_reglas.md` §6): C2 y S4 en rojo, S3 como decisión de diseño.
**Dirección firmada por Franco (2026-10-16):** el protocolo manda "al modificarse un dato, repetir el proceso".
S3 = **opción A**: una regla "N veces en T" cierra cuando en la ventana quedan menos de N.

## 0 · CANDADO
preguntas_abiertas: 0. **IMPLEMENTADO (2026-10-16).** DEC-REF-149.

## 1 · Cambios (lista cerrada: `evaluators/typeS.js`, `ruleEngine.js`, `index.js`, `tools/banco/b1.js`)
| # | Hoy | Con G1d |
|---|---|---|
| C2 | Una regla C solo se evalúa cuando llega su variable medida. Si cambia el setpoint con la alarma abierta, nada pasa hasta el próximo valor. | La regla C también se evalúa cuando llega su **setpoint**, con el último valor medido. El umbral nuevo rige al instante. |
| S3 | Un valor que no coincide devolvía "no se cumple": el primer valor normal cerraba la alarma con N todavía en la ventana. | Un valor que no coincide no suma, pero la condición sigue cumplida **mientras queden N en la ventana** (A). |
| S4 | La ventana solo se purgaba al llegar un mensaje. Sin mensajes, la alarma quedaba abierta para siempre. | Un **tick de ventanas** (cada 5 s) purga las ventanas de las instancias S en curso (E2, E3, E4, E6) y entrega la receptividad. La alarma se cierra sola cuando quedan menos de N. |

## 2 · Casos raros
| # | Caso | Comportamiento |
|---|---|---|
| 1 | Reinicio del edge con una alarma S abierta | La ventana vive en memoria. Sin historia, el tick **no decide** y la instancia espera el próximo mensaje: no hay cierre falso. **Limitación conocida:** el primer mensaje tras el reinicio arranca la ventana de cero. |
| 2 | S en "Sin datos" (E5) | El tick de ventanas no la toca: "Sin datos" no abre ni cierra. |
| 3 | Mensaje de setpoint sin ningún valor medido todavía | La regla C no se evalúa (no hay valor con qué comparar). |
| 4 | Regla C cuyo setpoint es la misma variable medida | Sin cambio: se evalúa una sola vez por mensaje. |

## 3 · Cómo se prueba
- Unidad: 6/6 (`S3=A`, cierre sola al vaciarse la ventana, sin cierre falso tras un reinicio, C2), más las regresiones G1 39/39, G1b 20/20 y G1c 9/9.
- Banco: `banco.sh --b1 --only S,C`. Esperado: S3a, S3b, S4 y C2 en VERDE.
