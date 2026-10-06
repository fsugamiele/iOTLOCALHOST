# SPEC — P0-3: bus DC negativo (−48 VDC telco) + reglas ELTEK alcanzables · 2026-10-06

**Dirección firmada por Franco:** el rectificador es **−48 VDC telco, NEGATIVO** (confirmado en
`mapeo_modbus_drivers.md §1`: *"`dc_bus_voltage` soporta 12/24/48/60 VDC · coincide con planta −48 VDC
telco"*). El **sim que publica negativo está CORRECTO**; el defecto fue de las reglas F3, sembradas
con umbrales **positivos** (`lt 52`/`lt 48`) asumiendo un signo equivocado. Corrección de una spec
previa que erróneamente proponía flipear el sim a positivo.

Dos decisiones de Franco (esta sesión):
1. **Negativo de punta a punta** — dashboard muestra −48/−54; reglas con umbrales negativos. **NO** se
   normaliza a magnitud (se descarta la opción driver→magnitud; se prioriza fidelidad al hardware).
2. **Valores provisorios estándar, marcados** — el mapa exacto de registros (escala/signo/flote/LVD)
   vive en el doc Eltek `350020.073` (no disponible) o en una lectura de controlador físico en lab.
   Hasta tenerlo, se usan los **estándar de planta −48 telco**, marcados **PROVISORIO · a confirmar**.

## 0 · CANDADO
**preguntas_abiertas: 0.** (Las abiertas reales — flote/LVD exactos, escala de registro — están
**acotadas y marcadas PROVISORIO**; DEC-PRED-1: no se inventa evidencia, queda explícito el a-confirmar.)

Decisiones cerradas:
- Convención **NEGATIVA**. "Tensión baja" = magnitud que cae = valor que **sube** (menos negativo) →
  comparador **`gt`** sobre negativo. Flote (sano) = más negativo; descarga = menos negativo (hacia 0).
- Valores PROVISORIOS (estándar −48 telco): **flote ≈ −54 V**, **baja ≈ −52 V**, **crítica ≈ −48 V**,
  **sobretensión ≈ −57 V**, **LVD ≈ −43,2 V**. A confirmar contra registro Eltek.
- El sim **flota ~−54 V** (normal) y en `eltek_discharge` **sube** (menos negativo) hacia el LVD
  (−43,2) — así cruza −52 (A1 baja) → −48 (A2 crítica) → −43,2 (LVD).
- `eltek-accel` sigue **retirada** (umbral de TASA, recalibración con histéresis en P2).
- GE-07 (rpm>1725) y GE-04 (coolant>105): traps de protección reales, NO bugs → re-activar GE-07.

## 1 · Presupuesto de bloque
- Tipo de bloque: **NORMAL**
- Un concern: las reglas DC se sembraron con el signo invertido (positivo) → muertas/permanentes.
- Una decisión de diseño: convención **negativa**; el sim flota en −54 y cae (menos negativo) en
  descarga; las reglas comparan con **`gt` sobre umbrales negativos**.
- Archivos a tocar (LISTA CERRADA):
  1. `tools/device_simulator/lib/sensor-engine.js` — `dc_bus_voltage`: init −54; `evolve` (flote ~−54 / descarga sube hacia −43,2); escenas `sensor_muerto` (−54) y `vibracion_anomala` (negativas, alrededor del flote).
- Total: **1 archivo · Límite: 6.**
- **Operaciones de datos (API productiva):** A1 → `D gt -52` (enable), A2 → `D gt -48` (enable),
  DC-05 → `D lt -57` (enable), DC-03 `mParams.target` 43,2 → **-43,2**, TR-09 hoja `dc_bus_voltage` `lt 50` → **`gt -50`**, re-enable GE-07.

## 2 · Recon que lo funda
`mapeo_modbus_drivers.md §1` (−48 VDC telco; registro exacto PENDIENTE doc 350020.073);
`sensor-engine.js:132,327-335` (init/evolve negativos — signo ya correcto, falta margen de flote);
auditoría C1/C4; seed F3 `manifest.js:144-174` (umbrales positivos = el error).

## 3 · Consumidores (grep exhaustivo)
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| Publicación dc_bus | `sensor-engine.js:132,327-335` | flote ~−54 (antes ~−48); descarga sube a −43,2 |
| Escenas demo M | `sensor-engine.js:671,685-692` | setpoints alrededor de −54 (negativos) |
| A1/A2 | `rulepacks` (config) | `D gt -52` / `D gt -48` + enable |
| DC-05 | `rulepacks` (config) | `D lt -57` + enable |
| DC-03 | `rulepacks` (config) | `mParams.target` −43,2 |
| TR-09 hoja | `rulepacks` (config) | hoja `dc_bus_voltage gt -50` |
| GE-07 | `rulepacks` (config) | re-enable |
| Dashboard NOC | lee `db.data` | dc_bus más negativo (flote −54) — sin discontinuidad de signo |

## 4 · Campos que mutan
| Qué | Muta | Dónde |
|---|---|---|
| `dc_bus_voltage` sim | flote −48 → **−54**; descarga → sube a −43,2 | sensor-engine |
| A1/A2 | `S`(manglada) → `D gt -52`/`gt -48`, enabled | config |
| DC-05 | `gt 57` → **`lt -57`**, enabled | config |
| DC-03 target | 43,2 → **−43,2** | config |
| TR-09 hoja dc | `lt 50` → **`gt -50`** | config |
| GE-07 | enabled:false → true | config |

## 5 · Comportamiento de cada control
| Control | Qué hace | Si falla |
|---|---|---|
| evolve normal | flota en [−54,5 ; −53,5] | ninguna alarma DC (sano) |
| evolve descarga | sube 0,4/tick hacia [−54,5 ; −43,0] | cruza −52→−48→−43,2 |
| A1 `gt -52` / A2 `gt -48` | warn / crítica cuando el bus sube (se descarga) | en flote −54 NO disparan |
| DC-05 `lt -57` | sobretensión (más negativo que −57) | no false-fire en flote −54 |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | Flote ~−54 | 0 alarmas DC (A1/A2/DC-05 en silencio) |
| 2 | `eltek_discharge` | bus sube → A1 (gt −52) warn → A2 (gt −48) crítica → DC-03 proyecta al LVD −43,2 |
| 3 | `eltek_dc_recupera` | bus vuelve a −54 → A1/A2 **resuelven** (por `ruleId:dId`, P0-1) |
| 4 | Registro Eltek real (futuro) | re-confirmar flote/LVD/escala vs doc 350020.073; ajustar umbrales si difieren (son PROVISORIOS) |
| 5 | GE-07/GE-04 | traps válidos; no disparan en sim (sin inyección) |

## 7 · Path real (DEC-PROC-5)
Sim: `evolve()` → MQTT → `db.data`+siteState. Reglas: `PUT /rulepacks/:packId` (validateRule) + `PATCH .../enabled`.

## 8 · Disenso registrado
| Posición A | Posición B | Estado |
|---|---|---|
| Normalizar a magnitud en driver (reglas positivas, intuitivo) | Negativo de punta a punta (fiel al hardware) | **Cerrado por Franco:** B |
| Esperar el registro exacto | Provisorios estándar marcados, probar ya | **Cerrado por Franco:** provisorios + marca |
| Recalibrar GE-04/GE-07 hacia abajo | Dejarlos como traps reales | **Cerrado:** traps |

## 9 · IDs reservados
- **DEC-REF-123** (convención bus DC = NEGATIVA −48 VDC telco; valores PROVISORIOS a confirmar con
  registro Eltek 350020.073 / lab). A anexar a `WanomiRefactor.md`.

## 10 · Cómo se prueba
1. **Flote:** sim normal → `dc_bus_voltage` ~−54; A1/A2/DC-05 en silencio.
2. **Descarga:** `eltek_dc_descarga` a un ELTEK → el bus sube (menos negativo); **A1 (gt −52) warn**, luego **A2 (gt −48) crítica**.
3. **Recupera:** `eltek_dc_recupera` → bus a −54 → A1/A2 **resuelven** (uno por equipo, P0-1).
4. **No false-fire:** en flote −54, DC-05 (`lt -57`) no dispara.
5. **Config:** GET packs → A1 `D gt -52` enabled, A2 `D gt -48` enabled, DC-05 `D lt -57` enabled, DC-03 target −43,2, TR-09 hoja `gt -50`, GE-07 enabled.

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| Umbrales DC | positivos (muertos/permanentes) | negativos alcanzables, silenciosos en flote | §10.2/§10.4 |
| Flote del sim | −48 (sin margen) | −54 (margen para alarma de descarga) | §10.1 |

## 12 · Reversión
Revert git de `sensor-engine.js`; reglas re-restauradas por API. Sin migración. Umbrales marcados
PROVISORIO → se re-ajustan al confirmar el registro Eltek (no requiere cambio estructural).
