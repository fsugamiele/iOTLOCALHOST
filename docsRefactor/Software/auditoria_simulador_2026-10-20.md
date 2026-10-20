# Auditoría del simulador (motor sim, escenarios y su correlación con el sistema) · 2026-10-20

**Pedido (Franco):** "Estoy observando inconsistencias y bugs en el simulador que pueden provocar falsas lecturas de las reglas… audita el motor sim, escenarios y su correlación con las demás páginas y funciones del sistema y determina su estado."
**Alcance:** `tools/device_simulator/` (run.js, lib/device.js, lib/sensor-engine.js), `app/api/routes/simulator.js`, `services/simScriptRunner.js`, `pages/demo/simulator.vue` + `components/Simulator/EquipmentCard.vue`, herramientas de prueba (`tools/banco/*`, `tools/probar_en_vivo.js`) y su efecto sobre el motor (edge) y las reglas.
**Método:** lectura del código + evidencia de los diagnósticos del 19/10 (`diagnostico_reglas`, `probar_en_vivo`) + prueba de comportamiento del simulador con un broker falso (13 casos) corrida sobre la versión anterior y la corregida.

## 0 · Veredicto
El simulador **no fue roto por las pruebas**: el historial (git) muestra un solo cambio reciente al motor del sim (16/10, `mute_sensor`, aditivo y limpio). Las inconsistencias vienen de **defectos de diseño que ya estaban** y que las pruebas dejaron a la vista, sobre todo uno: **el estado compartido del sitio quedaba pegado** después de un reset. Con eso, un "sifoneo" de prueba siguió vaciando los dos tanques del sitio con el motor apagado durante días.

Estado: **usable con cuidado → corregido en lo que es código** (5 defectos, probados), con **6 puntos de modelo o configuración de reglas** que requieren decisión.

## 1 · Defectos de código — CORREGIDOS (verificados con prueba)
Prueba: `scratchpad/simtest.js` (broker falso). Versión anterior: **5 ok · 8 con falla**. Versión corregida: **13 ok · 0**.

| # | Severidad | Defecto | Evidencia | Corrección |
|---|---|---|---|---|
| S1 | **Alta** | El `reset` de un equipo NO limpiaba el estado compartido del sitio (`siphon_lph`, `eltek_load_high`, `eltek_discharge`, `fuel_eff_factor`, `cummins_oil_failure`, `cummins_setpoint_suppressed`). Quedaba hasta reiniciar el proceso. | 19/10: GEN y Cummins, **detenidos**, bajaban ~6 %/h a la vez (36,6→32,3 % y 67,8→63,5 % en 41 min); los dos llegaron a 0 % de madrugada y "recargaron" a 75 % por un reset. Prueba: sin corrección, tras el reset el tanque sigue cayendo 7,9 % en 60 lecturas. | El equipo recuerda qué claves del sitio fijaron SUS escenarios y el reset las borra (`device.js`, `_sharedKeys`). |
| S7 | Media | El reset del ATS no detenía al grupo del sitio (`gen_running` quedaba en true). | Prueba. | Reset del ATS resincroniza `gen_running`. |
| S2 | Media | La batería del **GEN** cargaba con la marcha del **ATS/Cummins**, no con la suya: GEN en marcha propia (generador_marcha) → batería 12,6 V; GEN detenido con ATS en marcha → 14 V. Falsas lecturas para "Batería de arranque baja / degradada / Cargador caído". | Prueba (12,65 V en marcha). | Cada grupo carga con su marcha (`sensor-engine.js`, battery_voltage). |
| S4 | Media | Refrigerante en marcha topeaba en 95 °C y el setpoint de alarma (HET) oscila 94,5–95,5 °C → la regla C "Temperatura de refrigerante alta" se cumplía **sin falla**. | Prueba: 188 cruces en 20.000 lecturas. Avisos "calibrated" del 5–6/10. | Régimen normal 75–90 °C. La sobretemperatura real sigue en `falla_sobretemperatura`. |
| S5 | Baja | La transición de marcha pisaba rpm / presión de aceite **fijadas a mano**. | Prueba (1800 fijado → 1500). | La transición respeta lo fijado. |
| S6 | Media | No había forma de soltar UN valor fijado: solo `reset`, que devuelve **todo** el equipo al estado inicial (tanque a 75 % de golpe = el motor lo lee como recarga; dispara "salto"/"fuera de lo habitual · suba"). `probar_en_vivo.js` usaba reset. | Prueba. | Comando `release_sensor` + `POST /api/simulator/release`; `probar_en_vivo.js` lo usa. |

Descartado tras la prueba: rpm a la deriva en marchas largas (la rampa la reencauza cada lectura: 1490–1510 en 5000 lecturas).

**Para que tome efecto:** reiniciar `wanomi-sim` (además limpia el estado pegado de antes de la corrección) y `node` (ruta nueva).

## 2 · Modelo del simulador — requieren decisión
| # | Punto | Efecto en reglas | Propuesta |
|---|---|---|---|
| M1 | **Un escenario apaga TODA la publicación del equipo mientras dura** (`_cancelActiveTimers`): weekly_exercise 5 min sobre el ATS, fuel_drawdown 6 min sobre el Cummins, etc. Solo publican las variables del escenario. | "Equipo que deja de reportar" / "Sin datos" falsos si su umbral es menor a la duración; variables congeladas durante el escenario (documentado en DEC-REF-79-B-A como secuencia obligatoria). | Que el escenario congele solo las variables que toca y el resto siga evolucionando. |
| M2 | **La cascada de energía no está acoplada:** el corte de red (ATS) no afecta a los rectificadores; "grupo no arranca" no descarga el bus DC; la red del GEN (`mains_voltage`) es independiente de la del ATS y queda en 0 tras `genset_no_start` hasta un reset. | La regla "Sitio en riesgo de caída (cascada completa)" y las de rectificador en descarga solo se pueden demostrar componiendo escenarios a mano; el GEN puede decir "sin red" con el ATS en 220 V. | Escenario de sitio "corte de red" que mueva ATS + GEN + ELTEK juntos. |
| M3 | **Dos grupos en el sitio:** el Cummins arranca con el ATS (estado compartido); el GEN (legado) solo con su `genset_running`. | Reglas del GEN que esperan reaccionar a un corte de red no lo ven. | Definir si el GEN representa al mismo grupo que el Cummins (y acoplarlo) o retirarlo del sitio demo. |
| M4 | **"Cleanup" de los escenarios pre-grabados no existe:** `noCleanup` y la descripción de weekly_exercise ("restaura el ATS") sugieren que algunos vuelven solos; en el código **todos persisten hasta Reset** (decisión de banco manual). `noCleanup` solo se usa al **clonar** un escenario a guion (define si el guion termina con reset). | Lectura confusa del catálogo. | Alinear los textos a "persiste hasta Reset". |
| M5 | **Validación cruzada de tipos:** la API valida el valor contra el tipo de la **plantilla**; el motor lo normaliza contra el tipo de la **ficha**. Si difieren, un valor aceptado por el simulador lo descarta el motor (`Valor descartado`). | Reglas que "no ven" valores inyectados. | `tools/diagnostico_simulador.js` lista las diferencias por equipo. |
| M6 | El simulador agrupa el estado compartido por `device.siteId`; el motor usa `site.devices`. | Si difieren, los escenarios "del sitio" afectan a otro grupo de equipos. | Lo verifica `tools/diagnostico_simulador.js`. |

## 3 · Reglas que el simulador hace saltar sin falla real (configuración)
| Regla | Causa | Propuesta |
|---|---|---|
| Marcha inestable (Oscilación) — varianza de rpm > 15 en 1 h | La rampa de arranque/parada (0↔1500) entra en la ventana: varianza 226–320 en cada arranque (16/10). | Condición extra "en marcha estable" (rpm > 300 toda la ventana) o ventana más corta con espera. |
| Sensor de nivel clavado — cambia < 0,2 % con el grupo en marcha | Con el consumo real (0,023 %/min) el tanque baja 0,15–0,45 % en la ventana: queda pegado al umbral → 7 avisos el 19/10. | Umbral 0,05 % o ventana ≥ 30 min. |
| "Salto brusco" (stepJump) en sifoneo | Mide el salto en **valor absoluto**: una recarga o un reset del simulador (+45 %) también lo cumple. | Mismo criterio que Qi5: elegir sentido (baje / suba). |
| "Fuera de lo habitual" para pérdida lenta | Un vaciado constante da como máximo z ≈ −1,7 (−√3): nunca llega a −3. Solo ve caídas bruscas. | Pérdida lenta con "si baja rápido" (tendencia) y motor detenido. |
| «BATERIA EN DESSCARGA» [GEN-sifoneo-de-combustible] en el pack **banco-conformidad** | Regla suelta en el pack del banco: nombre de batería, id de sifoneo, mide **salto de presión de aceite ≥ 8** → salta en cada arranque (0→40). El banco vacía ese pack al correr. | Borrarla o moverla a su pack real. |

## 4 · Correlación con el resto del sistema — estado
- **Roster (DEC-REF-110):** OK — los equipos `wanomi-sim` entran y salen solos cada 45 s.
- **Panel del simulador / guiones:** OK — abrir la página usa `snapshot` (no pisa valores). Los guiones con limpieza "reset" ahora también limpian el estado del sitio que fijaron.
- **Motor (edge):** OK — prueba en vivo del 19/10: con el Cummins en 10 % la regla pasó a Alarma en el acto. Las alarmas que "no saltaron" ese día fueron por datos (lecturas en 0 sin motor activo) y por el error de dirección de "fuera de lo habitual" (Qi5, corregido).
- **Simulación de reglas (QA):** corregida el 19/10 (límites de ficha). No conoce el estado compartido del simulador: reproduce las lecturas guardadas, no la física.
- **Banco de conformidad:** limpia con `reset` por equipo → con S1 ahora también limpia el estado del sitio. Necesita el simulador en exclusiva mientras corre.

## 5 · Herramientas nuevas
- `tools/diagnostico_simulador.js` (solo lectura): por equipo simulado, sitio del simulador vs del motor, plantilla vs ficha, reglas que esperan variables que no se publican, lecturas de 24 h y firmas de estado pegado (tanque que baja con el motor detenido, recargas bruscas). `docker exec -i node node - < tools/diagnostico_simulador.js`
- `POST /api/simulator/release` {dId, sensor} y comando `release_sensor`.
