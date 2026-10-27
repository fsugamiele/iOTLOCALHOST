# SPEC — Textos de la alarma desde la ficha («¿Qué tan grave es y qué hay que hacer?») · 2026-10-27 · A FIRMAR (Qt1–Qt6)

**Origen:** Franco 2026-10-27 — todas las alarmas deben tener completos los cuatro campos del paso 4 del editor («Para la confiabilidad, este aviso indica», «Qué tiene que hacer el operador», «Qué significa esta alarma», «Pasos a seguir»), y la información debe salir de la **ficha**.
**Insumo:** volcado `tools/textos_reglas.js` (27/10, 73 reglas).

## 0 · CANDADO
- Los textos técnicos citan su fuente (manual del fabricante). Sin manual → texto genérico marcado **PROVISORIO** (ComAp InteliATS, Eltek Smartpack: falta el doc. 350020.073).
- Mismo criterio que los umbrales (decisión «Permitir y avisar», spec_perfiles_controladora): el texto heredado se ve como «● de la ficha»; se puede reemplazar en la regla y el editor avisa.
- Los textos no cambian la regla para el motor (no cierran alarmas; DISPLAY_ONLY).

## 1 · Estado actual (volcado 27/10)
| Campo | Completo | Falta |
|---|---|---|
| Para la confiabilidad (`eventClass`) | 73 | 0 |
| Qué tiene que hacer el operador (`recommendation`) | 73 | 0 (calidad despareja: mayúsculas, «Acción:» repetido, textos que no corresponden) |
| Qué significa (`meaning`) | 10 | 63 |
| Pasos a seguir (`steps`) | 11 | 62 |

### De dónde puede salir cada regla
| Origen | Reglas | Cuáles |
|---|---|---|
| **Límite de la ficha** (la condición principal usa `limitRef`) | 20 | A0, A1, G2 (combustible Cummins), GE-04, GE-07, GA1, GA2, F1a, F1b, F2a, F2b, eltek-A1, eltek-A2, DC-09, D4, gen-fuel-warn, gen-fuel-crit, gen-batt-warn, AR-07, gen-autonomy-warn |
| **Código de falla del perfil** (diccionario PCC 1302: nombre, lógica, causas) | 6 | GE-12 (488), GE-16 (781), AR-02 (1438), GE-1463, GE-1131, GE-17 (cualquiera: el texto se arma con el código activo) |
| **Propio de la regla** (combinadas, derivadas, número fijo) | 47 | cascada de energía (M1, C1, TR-03/04/09/10, F4), tendencias y anomalías (baseline, slope, projection, ratio, spread, flatline, staleness), sifoneo, ejercicio, robo de baterías, umbrales fijos (B1, B2, DC-05, SG-02/03/04, AR-03/04/06…) |

**Observación:** varias reglas «propias» lo son solo porque usan un **número fijo** donde debería haber un límite de ficha: B1 (80 A), B2 (95 A), DC-05 (−57 V), SG-02/SG-03 (198/242 V del grupo), SG-04 (48,5–51,5 Hz), F4 y M1 (100 V), AR-04 (9,6 V). El supervisor ya marcó DC-05. Pasarlas a la ficha (con fuente) las suma al grupo que hereda textos: **20 → ~30**.

## 2 · Hallazgos del volcado (aparte de los textos)
| # | Regla | Problema |
|---|---|---|
| H1 | eltek-baseline-temperature | Condición **imposible**: `baseline > 3 AND baseline < −3` (nunca se cumple). Debe ser **OR**. |
| H2 | cat-GE-16 (código 781) | ~~El manual clasifica el 781 como advertencia~~ **Corregido 27/10:** el manual (A040D969 §9.8.25, pág. 220 del PDF) **no indica** el tipo del 781; el «advertencia» del perfil era inferido. Se mantiene crítica hasta confirmarlo en el equipo (InPower). |
| H3 | cat-AR-08 | «Qué hacer» habla de poner en AUTO; la regla es «sin ejercicio semanal» (no corresponde). |
| H4 | gen-autonomy-crit | Umbral fijo 12 h mientras la de aviso usa la ficha; el texto dice `{umbral}`. |
| H5 | cummins-pcc-sifoneo-divergencia, cat-CB-05, GEN-sifoneo-motor-apagado | Pasos escritos en **un solo renglón** separados por «;». |
| H6 | cummins-pcc-oil-life | Acumula sobre `coolant_temp` ponderado por rpm: confirmar que la variable es la intencional. |

## 3 · Diseño
1. **Ficha → textos por límite.** Cada límite de una medición (`variables[].limits[]`, atención / parada) suma: `meaning` (qué pasa físicamente y qué consecuencia tiene), `causes[]`, `operatorAction` (una acción del NOC en una frase), `steps[]` (primero remoto, después en sitio) y `source`.
2. **Herencia.** Una regla con un campo vacío toma el texto del límite de la ficha de su **medición principal** (`rule.variable` y el `limitRef` de esa condición), al leer (igual que hoy el umbral: `resolvePacksForRead`). `{umbral}` se completa con el valor del equipo.
3. **Códigos de falla.** Las reglas por código toman del perfil de la controladora: meaning = «El controlador informa el código N: <nombre>. <lógica>»; steps = causas del manual; operatorAction según el tipo (parada → despacho; advertencia → programar revisión). GE-17 arma el texto con el **código activo** en el detalle de la alarma.
4. **Reglas propias.** Textos escritos en la regla, basados en su condición real (las 47).
5. **Editor y detalle.** Texto heredado con «● de la ficha / del perfil»; si se cambia, aviso «Estás reemplazando un texto predefinido» y «Volver a la ficha». En Fichas, una sección «Textos de la alarma» por límite.
6. **Supervisor.** Control «regla sin textos» (alguno de los cuatro vacío después de la herencia) en Calidad de las reglas.

## 4 · Preguntas a firmar
| # | Pregunta | Recomendación |
|---|---|---|
| Qt1 | ¿Textos en la ficha por **límite** (atención ≠ parada) o por **medición**? | **Por límite**: «presión de aceite baja» (programar revisión) no se atiende igual que «parada por presión de aceite» (despacho). |
| Qt2 | ¿Pasar a la ficha los umbrales fijos de §1 (B1, B2, DC-05, SG-02/03/04, F4, M1, AR-04)? | **Sí**, con su fuente; así heredan textos y siguen a la controladora / el equipo. Los que no tengan fuente quedan PROVISORIO. |
| Qt3 | Herencia: ¿la regla guarda una **copia** del texto o lo **lee** de la ficha? | **Lo lee** (como el umbral): corregir la ficha corrige todas las reglas y todos los sitios. La copia solo existe si alguien lo reemplaza en la regla. |
| Qt4 | Sin manual (ComAp, Eltek): ¿texto genérico PROVISORIO o dejar vacío? | **Genérico PROVISORIO**, con la marca visible en el editor y en el detalle de la alarma. |
| Qt5 | ¿Corregir H1–H4 en la misma tanda? | **Sí** H1 (OR) y H5 (separar pasos); **H2–H4 y H6 los decidís vos**: severidad de GE-16, texto de AR-08, ficha para gen-autonomy-crit, variable de oil-life. |
| Qt6 | ¿Campos obligatorios en el editor? | **Sí para crítica y advertencia**, después de la herencia (si la ficha ya lo trae, no hay que escribir nada). |

## 5 · Orden propuesto (bloques)
**T1** modelo de ficha + herencia en la lectura + editor/detalle con marca · **T2** completar la ficha del Cummins con el manual PCC 1302 y los perfiles de código · **T3** pasar umbrales fijos a la ficha (Qt2) · **T4** textos de las 47 reglas propias (los reviso con Franco por pack) · **T5** ComAp / Eltek provisorios · **T6** control «regla sin textos» y obligatoriedad en el editor.
