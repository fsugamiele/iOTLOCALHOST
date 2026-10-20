# SPEC — Simulador: cascada de energía acoplada + Wanomi Sense sobre el grupo · 2026-10-20

**Origen:** auditoría del simulador 2026-10-20, puntos M1–M3 (`auditoria_simulador_2026-10-20.md`). Franco: "avanza con la cascada".
**Problema:** el pilar del pitch (DEC-GTM-2) es leer la cascada **corte de red → ATS → grupo → rectificador** como UN evento de sitio. En el simulador cada equipo va por su lado: el corte de red solo existe en el ATS, los rectificadores no se enteran, el GEN tiene su propia "red", y un escenario apaga todas las demás mediciones del equipo mientras dura. La regla "Sitio en riesgo de caída (cascada completa)" solo se puede demostrar componiendo escenarios a mano.

**Firmado por Franco (2026-10-20):** Qk1 = A ampliada ("agreguemos sensores que no contamos en la controladora PowerCommand… vibración, inyectores, caudal de aire y combustible"), Qk2 = A, Qk3 = A ampliada ("sumaría escenarios para detectar anomalías de los nuevos sensores"), Qk4 = A. Sensores y escenarios de §5 aprobados ("Aprobado las recomendaciones") con un detalle: **`vibration_signature` se mantiene categórica**; se suman los valores numéricos y la firma se deriva de ellos ("continúa con tu idea").

## 0 · CANDADO
- Diagnóstico previo OK (2026-10-20): los 15 equipos simulados están en el mismo sitio para el simulador y para el motor (M6 sin hallazgos).
- El motor de reglas (edge) no cambia: solo el simulador, la plantilla y la ficha del GEN.
- Umbrales (límites de ficha) de las variables nuevas: NO se inventan — quedan sin límite hasta que Franco los decida; las reglas de anomalías son un bloque aparte.
- **IMPLEMENTADO (2026-10-20):** `sensor-engine.js` (hechos del sitio `mains_ok` / `gen_running` / `gen_crank_failures`, tanque compartido `tank_pct`, descarga DC por tiempo real `SIM_DC_DISCHARGE_MIN`=20 y recarga 0,5 V/min, temperatura ELTEK, sensores Sense, firma de vibración derivada, 8 escenarios nuevos y los de red ampliados), `device.js` (Qk4: los escenarios no cortan la publicación; escenarios de sitio en equipos que no tienen todas las variables), `lib/sense_gen_vars.js` (fuente única de las variables Sense), `tools/sync_sense_gen.js` (ficha + plantillas GEN vía API). Pruebas de comportamiento: 22/22 (cascada y anomalías) + 13/13 (auditoría).

## 1 · Modelo propuesto (física del sitio en el estado compartido)
Tres hechos del sitio, que cada equipo LEE en cada lectura (no los fija un escenario equipo por equipo):

| Hecho del sitio | Quién lo cambia | Quién lo lee |
|---|---|---|
| `red_presente` (sí/no) | escenarios de red | ATS (tensión/frecuencia de red), GEN (tensión de red), rectificadores |
| `grupo_en_marcha` (ya existe: `gen_running`) | el ATS al transferir (STARTING → RUNNING) | Cummins (rpm, aceite, refrigerante, consumo, batería), GEN según Qk1 |
| `grupo_no_arranca` (sí/no) | escenario de falla | el ATS: intenta arrancar y queda en STARTING → falla; el grupo registra intentos fallidos |

Reglas de la física:
1. **Corte de red:** ATS red = 0 V / 0 Hz → tras 2 s pide arranque (STARTING). Si el grupo arranca, a los 8 s RUNNING y transfiere; si no, 3 intentos fallidos y queda en falla.
2. **Rectificadores:** con red **o** grupo en marcha → flote (−54 V) y vuelven a cargar; sin ninguna de las dos → descarga hacia el LVD (−43,2 V) a la velocidad de Qk2.
3. **Vuelve la red:** ATS red 220 V → retransfiere → STOPPED a los 5 s → el grupo se detiene; rectificadores recuperan.
4. Un escenario ya **no apaga** las demás mediciones del equipo: congela solo las que toca (M1).
5. Reset del sitio (todos sus equipos) vuelve todo al reposo (red presente, grupo detenido).

## 2 · Escenarios (mismos nombres, efecto completo)
- `mains_failure_ats_transfer` → corte de red con arranque correcto (sitio sostenido por el grupo).
- `mains_failure_gen_no_start` → corte de red y el grupo no arranca → rectificadores en descarga → cascada completa.
- `mains_restore` → vuelve la red.
- Los demás (sifoneo, aceite, setpoints, fallas Cummins, ELTEK) quedan igual.

## 3 · Preguntas a firmar
| # | Pregunta | Recomendación |
|---|---|---|
| Qk1 | El **GEN** del sitio demo, ¿es el mismo grupo que el Cummins? | **Sí: el GEN pasa a ser el equipo Wanomi *Sense* montado sobre el mismo grupo** (marcha y tanque del mismo grupo, con su propio sensor). Encaja con Connect (leer la controladora Cummins) + Sense (medir con sensor propio). Alternativa: sacarlo del sitio demo. |
| Qk2 | Velocidad de descarga de las baterías sin red ni grupo | **Comprimida y declarada** (como fuel_drawdown): de flote al LVD en ~20 min, parametrizable (`SIM_DC_DISCHARGE_MIN`). Real serían horas. |
| Qk3 | Escenarios | **Conservar los nombres** y ampliar su efecto (la UI, los guiones y el banco siguen funcionando). |
| Qk4 | Arreglar M1 (el escenario apaga las demás mediciones) en este mismo bloque | **Sí:** con la cascada los escenarios duran minutos y hoy dejarían al equipo sin reportar. |

## 4 · Verificación
Prueba de comportamiento con broker falso (como la auditoría) para las tres secuencias, y en vivo con `probar_en_vivo` / el panel: la regla "Sitio en riesgo de caída (cascada completa)" tiene que pasar a Alarma solo en `mains_failure_gen_no_start`.

## 5 · Wanomi Sense sobre el grupo (Qk1 ampliada)
El GEN del sitio demo es el equipo **Wanomi Sense montado sobre el mismo grupo** que lee el Cummins (Connect): misma marcha (`gen_running` del sitio) y **mismo tanque** (el Sense lee el nivel real con su ultrasónico; el Cummins publica el de su sensor de fábrica). En sitios sin Cummins, el GEN sigue siendo un grupo propio.

| Variable nueva (GEN) | Tipo · unidad | Sensor | Normal en marcha | Detenido |
|---|---|---|---|---|
| `vib_rms` | float · mm/s | acelerómetro triaxial en el bloque | 2,2–2,8 | ~0,1 |
| `vib_firing` | float · mm/s | ídem, banda de la frecuencia de encendido | 1,0–1,4 | 0 |
| `vib_peak_hz` | float · Hz | ídem, pico del espectro | ~75 (6 cil. a 1500 rpm) | 0 |
| `vibration_signature` | **categorical (se mantiene)** | derivada de `vib_rms`: < 4,5 normal · < 7,1 warning · < 11,2 anomaly · ≥ critical | normal | normal |
| `exhaust_temp_a` / `exhaust_temp_b` | float · °C | termocupla K por banco | 340–360 c/u | enfría a ambiente |
| `exhaust_temp` (existente) | float · °C | promedio de los dos bancos | | |
| `air_filter_dp` | float · kPa | presión diferencial del filtro de aire | ≈ 0,12 × kW (~1,2) | 0 |
| `fuel_supply_pressure` | float · bar | transductor en la alimentación | 3,7–3,9 | ~0,3 |
| `fuel_return_rate` | float · L/h | caudalímetro de retorno | 4,2–4,8 | 0 |
| `water_in_fuel` | bool | sensor del separador | 0 | 0 |

## 6 · Escenarios de anomalías (Qk3 ampliada) — rol GEN, correr con el grupo en marcha
| Escenario | Efecto coherente |
|---|---|
| `inyector_tapado` | banco B −50 °C · `vib_firing` ×2,5 · pico a 12,5 Hz (½ orden) · consumo +6 % |
| `inyector_goteando` | banco B +45 °C · retorno −40 % · consumo +10 % |
| `filtro_aire_obstruido` | `air_filter_dp` ×4 · escape +30 °C en ambos bancos · consumo +5 % |
| `filtro_combustible_tapado` | `fuel_supply_pressure` ~1,6 bar · retorno −30 % |
| `desbalance_mecanico` | `vib_rms` ~9,5 mm/s · pico a 25 Hz (1× rpm) → firma «anomaly» |
| `agua_en_combustible` | `water_in_fuel` = 1 (también detenido) |
| `sensor_fabrica_miente` | el Cummins publica el tanque +18 % sobre el real; el Sense lee el real |
| `sense_normal` | limpia la anomalía y el desvío del sensor de fábrica |
