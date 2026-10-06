# SPEC — P2: deadband / histéresis nativo en type D · 2026-10-06

**Dirección firmada por Franco:** bloque P2. Auditoría P2-15: una regla D cuyo valor oscila con
ruido JUSTO en el umbral hace flapping (fire→resolve→fire). El backtest (DEC-REF-131) lo midió en
`cat-eltek-A2` (D `gt -48`, bus oscilando en −48 → 52 episodios/día). Solución: **banda de histéresis**
— dispara en el umbral, pero **resuelve solo cuando el valor cruza un umbral de resolución más holgado**
(`value ± deadband`). Entre ambos = zona pegajosa: queda activa, sin re-notificar (anti-refire P0-1).

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- **`condition.deadband`** (Number opcional, solo type D hoy). Dispara con `condition` normal; resuelve
  cuando el valor cruza el umbral de resolución: `gt/gte` → `value ≤ V − deadband`; `lt/lte` →
  `value ≥ V + deadband`; `eq/neq` → sin banda (resuelve como hoy).
- **Solo afecta el RESOLVE**, no el fire (el fire sigue en `V`). En la zona pegajosa la regla queda
  ACTIVA y silenciosa (anti-refire). Compatible con `resolveGraceSec` (el grace corre una vez que el
  valor cruzó el umbral de resolución).
- **Sin deadband (default)** → comportamiento idéntico a hoy (resuelve apenas `!triggered`).
- Alcance: **type D**. Cross/S/M quedan fuera (cross tiene su firedKey/graceSec; M/S su propia lógica) — futuro.

## 1 · Presupuesto de bloque
- Tipo de bloque: **LIGERO**
- Un concern: reglas D con ruido en el umbral hacen flapping (fire/resolve en ráfaga).
- Una decisión de diseño: banda de histéresis en el resolve de type D (`condition.deadband`).
- Archivos a tocar (LISTA CERRADA):
  1. `edge-engine/evaluators/typeD.js` — `resolveClears(rule, value)` (deadband-aware) + export.
  2. `edge-engine/ruleEngine.js` — usar `resolveClears` en la rama de resolve de type D.
  3. `app/api/models/rule_definition.js` — `condition.deadband` (Number opcional).
- Total: **3 archivos · Límite: 6.**

## 2 · Recon que lo funda
Auditoría P2-15 + backtest A2 (52 ep/día); `typeD.js` (comparador puro); `ruleEngine.js` rama
`!triggered && type D && activeState.has(key)` (resolve + resolveGraceSec); `rule_definition.js:22-25`
(ConditionSchema). Precedente: `seeds/migrate_deadband_p2.js` (se había pensado).

## 3 · Consumidores
| Consumidor | archivo | Qué le cambia |
|---|---|---|
| resolve de type D | `ruleEngine.js` | resuelve solo si `resolveClears` (cruzó la banda) |
| comparador D | `typeD.js` | + `resolveClears` (no toca `evaluateD`/el fire) |
| schema | `rule_definition.js` | `condition.deadband` opcional |

## 4 · Campos que mutan
| Qué | Antes | Después |
|---|---|---|
| resolve de D | apenas `!triggered` | cuando el valor cruza `V ± deadband` (si hay banda) |
| `condition.deadband` | no existía | opcional (Number) |

## 5 · Comportamiento
| Control | Qué hace |
|---|---|
| `resolveClears(rule,v)` | sin deadband→true; gt/gte→`v≤V−d`; lt/lte→`v≥V+d`; eq/neq→true |
| rama resolve D | si `!resolveClears` → queda activa (cancela grace pendiente); si clears → resolve (con resolveGraceSec) |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | gt −48, deadband 2, valor oscila −47/−49 | 1 episodio (fija; resuelve solo si v ≤ −50) |
| 2 | sin deadband | idéntico a hoy (resuelve en `!triggered`) |
| 3 | eq/neq con deadband | sin banda (resuelve como hoy) |
| 4 | deadband + resolveGraceSec | el grace corre tras cruzar la banda |
| 5 | valor null en zona activa | resolveClears=true (no se queda pegada sin dato) |

## 7 · Path real (DEC-PROC-5)
Runtime del edge (ruleEngine/typeD) + schema app. Sin migración (campo opcional, default sin banda).

## 8 · Disenso registrado
| Posición A | Posición B | Estado |
|---|---|---|
| Deadband también en cross/S/M | Solo type D | **Cerrado:** D (los otros tienen su propia lógica de ciclo; futuro) |
| `resolveCondition` explícito {op,value} | `deadband` (offset) | **Cerrado:** offset (más simple; una banda simétrica cubre el caso) |

## 9 · IDs reservados
- **DEC-REF-132** (deadband/histéresis en type D vía `condition.deadband`).

## 10 · Cómo se prueba
- **Unit (determinista):** máquina fire/pegajoso/resolve con `evaluateD`+`resolveClears` real sobre
  una serie oscilante (−47/−49 alrededor de −48): deadband 0 → N episodios (flap); deadband 2 → 1.
- **Opcional live/backtest:** agregar deadband a A2 y ver caer los episodios/día.

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| resolve de D | flap por ruido en el umbral | banda de histéresis (1 episodio) | §10 unit |

## 12 · Reversión
Revert git de los 3 archivos. Reglas sin `deadband` → comportamiento actual. Sin migración.
