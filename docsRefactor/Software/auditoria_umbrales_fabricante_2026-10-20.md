# Auditoría de umbrales de falla vs documentación de fabricante · 2026-10-20

**Pedido (Franco):** "revisemos también la configuración de las diferentes reglas para confirmar que los parámetros en umbrales de falla sean correctos con respecto a las especificaciones que brindan los documentos de fabricante".
**Alcance de esta primera pasada:** los límites de ficha (`tools/seed_fichas/fichas.js`), que alimentan a la mayoría de las reglas por `limitRef`, y las 32 reglas sembradas. Las 71 reglas de la base (las creadas por UI, presets y banco) se cierran con el volcado `tools/volcar_umbrales.js` (§4).
**Candado:** no se cambia ningún umbral sin firma. Las decisiones ya tomadas (combustible 15 %, refrigerante aviso 100 °C) se citan y no se reabren.

## 1 · Fuentes usadas
| Equipo | Documento | Qué aporta |
|---|---|---|
| Cummins (PCC) | *Operator Manual Generator Set with PowerCommand 2100*, p. 2-2 y 3-7 | aceite: aviso 188 kPa (27 psi), corte 100 kPa (38 kPa en ralentí); refrigerante: aviso 100 °C, corte 110 °C; aviso de refrigerante frío < 21 °C; 3 ciclos de arranque (15 s / 15 s); sistema de arranque 24 V |
| Grupo (NFPA 110) | `registros_consolidado_gef.md` §4 (bitmap 40016) | combustible 25/10 %, aceite 2,0/1,0 bar, motor 95/105 °C, batería 24 V 22–30 / 20–32 V, sobrevelocidad b2 |
| Eltek Smartpack S | *Smartpack S Controller User's Guide*, p. 28 y 31 | **solo ejemplos, no valores por defecto:** sobretensión mayor 57,00 V (hist. 0,10 V, 5 s); LVD 43,0 V / reconexión 48,0 V. Los valores por defecto están en 350020.073 (*Functionality Description*), que no tenemos |
| ComAp InteliATS NT | `mapeo_modbus_drivers.md` | los umbrales de red (Mains <V / >V / <f / >f) y de batería son **setpoints leíbles** del propio controlador (reg. 8305/8307/8310/8312, 8387/9587), en % del nominal. El manual público no trae los valores por defecto |

## 2 · Veredicto por límite de ficha
| Equipo · medición | Configurado | Fabricante / norma | Veredicto |
|---|---|---|---|
| Cummins · presión de aceite | aviso < 200 · crítico < 100 kPa | PC2100: aviso 188 · corte 100 kPa | ✅ **Correcto.** El aviso queda 12 kPa más conservador (adelanta el aviso). Ver P3 por el ralentí. |
| Cummins · refrigerante | aviso > 100 · crítico > 105 °C | PC2100: aviso 100 · corte 110 °C | ✅ **Correcto.** Aviso = fabricante (DEC-REF-87). El crítico salta 5 °C **antes** del corte del grupo: anticipa, que es el pilar. |
| Cummins · rpm | aviso > 1575 · crítico > 1725 | NFPA b2; 115 % de 1500 | ✅ Coherente (115 % es el estándar de sobrevelocidad). Sin valor numérico en el manual PC2100. |
| Cummins · intentos de arranque | ≥ 3 | PC2100: 3 ciclos por defecto (1–7 configurable) | ✅ **Correcto.** |
| Batería de arranque | 11,8 / 11,0 · 15 / 16 V (base 12 V, escala con `battery_nominal_v`) | NFPA escalado: 11 / 10 · 15 / 16 V | ✅ Sobretensión = norma. Baja tensión **más exigente** que la norma (decisión Franco). Ver P2: el PC2100 es de **24 V**. |
| Combustible | aviso < 25 · crítico < 15 % | NFPA ref.: 25 / 10 % | ✅ Decisión Franco (15 %). No se reabre. |
| GEN · tensión del alternador | < 13,0 · > 14,8 V con el motor en marcha | regulador 12 V típico 13,8–14,4 V | ⚠ **Fijo en 12 V**: no escala con la tensión nominal como la batería. En un grupo de 24 V salta siempre (P1). |
| GEN · escape | 550 / 600 °C | sin datasheet | ⏳ PROVISORIO (ya declarado). Con dos termocuplas por banco conviene sumar la **diferencia entre bancos** (P5). |
| ATS · tensión de red | 198 / 242 V (±10 %) | ComAp: setpoint leíble (8305/8307) | ⚠ Valor razonable, pero fijo. El catálogo ComAp prevé reglas **auto-calibradas** contra el setpoint del propio ATS (P4). |
| ATS · frecuencia | 49,5 / 50,5 Hz (±1 %) | ComAp: setpoint leíble (8310/8312) | ⚠ Ídem P4. |
| ELTEK · bus DC | aviso > −52 · crítico > −48 · sobretensión < −57 V | Eltek UG: sobretensión mayor 57,00 V (ejemplo) · LVD 43 V | ✅ Sobretensión coincide con el ejemplo del fabricante. ⏳ Baja tensión sigue PROVISORIO hasta 350020.073 (P6). |
| ELTEK · temperatura | 35 / 45 °C | sin dato (batería VRLA: nominal 20–25 °C) | ⏳ PROVISORIO. |
| ELTEK · corriente de carga (B1/B2) | > 80 / > 95 A | depende de los módulos instalados | ⚠ **Absoluto**: debería ser % de la capacidad instalada del rectificador (P7). |

**Resumen:** 7 límites correctos contra fabricante o norma, 3 provisorios ya declarados, y 4 con un defecto de modelo (P1, P4, P7, y P2 a verificar), no de valor.

## 3 · Propuestas (para firmar)
| # | Propuesta | Recomendación |
|---|---|---|
| P1 | Tensión del alternador del GEN fija en 12 V | Hacerla relativa a `battery_nominal_v`, como la batería (13,0 / 14,8 → 26,0 / 29,6 V en 24 V). |
| P2 | El PC2100 arranca con **24 V** | Verificar que los Cummins tengan `battery_nominal_v` = 24 en la ficha del equipo. El volcado lo muestra. |
| P3 | Aceite con el motor en ralentí: el fabricante corta recién a 38 kPa | Las reglas A0/A1 ya exigen rpm > 300 y 60 s de espera. Si algún sitio usa ralentí de calentamiento, el crítico < 100 kPa saltaría en falso. **Recomiendo** exigir rpm > 1350 (90 % del nominal) en lugar de > 300. |
| P4 | Red del ATS con umbral fijo | Mantener ±10 % como respaldo y sumar las reglas "C" del catálogo ComAp, que leen el setpoint del propio ATS cuando el driver Connect esté vivo. |
| P5 | Escape por banco (Sense) | Regla nueva: \|banco A − banco B\| > 40 °C con el motor en marcha (inyector). **Valor a decidir**; la anomalía del simulador da 45–50 °C. |
| P6 | ELTEK baja tensión provisoria | Conseguir 350020.073 (o leer los setpoints del Smartpack del sitio por Modbus). Mientras tanto, −52 V queda como aviso de "en descarga" (≈ 2,17 V/celda). |
| P7 | Corriente del rectificador absoluta | Pasarla a % de la capacidad instalada (nº de módulos × corriente nominal), dato de la ficha del equipo. |
| P8 | Refrigerante frío (calefactor de bloque) | Regla nueva con el dato del fabricante: < 21 °C con el motor detenido → aviso (el grupo arrancaría frío). |

## 4 · Las 70 reglas de la base (volcado de Franco, 2026-10-20)
`tools/volcar_umbrales.js` (solo lectura). Las fichas en la base coinciden con la semilla (§2).

### 4.1 · Defectos (la regla no hace lo que dice)
| # | Regla | En la base | Debería | Efecto |
|---|---|---|---|---|
| R1 | cat-eltek-A1 · bus DC baja | `lt -52` (número fijo) | `gt` [ficha:warning] = −52 (semilla y spec_signo_bus_dc firmada) | En flote (−54) **siempre cumple**: alarma permanente o, peor, nunca se resuelve. |
| R2 | cat-eltek-A2 · bus DC crítica | `lt -48` (número fijo) | `gt` [ficha:trip] = −48 | Ídem, crítica permanente. |
| R3 | cat-TR-09 · cascada completa | hoja ELTEK `lt -48` | `gt -50` (spec_signo_bus_dc) | Salta apenas hay corte sin grupo, **sin esperar a que caigan las baterías**: no mide la cascada. |
| R4 | eltek-accel-dc-bus-voltage | `slope lt -2` | descarga = el valor sube → `slope gt` | Mira la sobrecarga, no la descarga. La spec la dejaba retirada. |
| R5 | cummins-pcc-oil-life · cambio de aceite | `accumulator` sobre coolant_temp ≥ 250 | 250 h de marcha (GEF §4) | **Corregido tras leer el motor:** el accumulator suma **horas** ponderadas por la temperatura (no grados). Queda a verificar que no sume con el motor detenido y con qué `mParams` (no salen en el volcado). |
| R6 | banco-conformidad · «BATERIA EN DESSCARGA» | salto de aceite ≥ 8 | — | Ya reportada (auditoría del simulador): salta en cada arranque. |

**R1–R4 contradicen la spec firmada** (DEC-REF-123).

### 4.1 bis · Deriva contra la foto original (`tools/deriva_reglas.js`, 41 de 70 cambiaron)
La mayoría son cambios buscados (atar a la ficha, sentido de "fuera de lo habitual", decisiones de Franco). Los que **invierten o anulan** la regla:

| Clave | Regla | Antes → hoy | Efecto |
|---|---|---|---|
| A1 / A2 | bus DC baja / crítica | `gt −52` / `gt −48` → `lt` | alarma permanente en flote |
| TR09 | cascada completa | ELTEK `gt −50` → `lt −48` | no espera a las baterías |
| AR08 | grupo sin ejercicio semanal | dutyCycle `lt 0,1 %` → `gt 0,1 %` | avisa cuando **sí** hizo ejercicio (la métrica está en %) |
| ACCEL | tensión DC empeora más rápido | `acceleration` → `slope lt −2` | mira la sobrecarga; la spec la dejaba retirada |
| M1C1 | pérdida de AC / corte sin arranque | red `< 100` → `< [ficha:warning]` 198 | un bajón de tensión = "corte" crítico |
| AR04 | batería degradada en el arranque | espera 0 → 60 s | el arranque dura ~15 s: no dispara nunca |

**Causa encontrada en el editor:** al abrir una regla sin espera, el editor mostraba 60 s y al guardar la escribía (20 reglas pasaron de "sin espera" a 60 s). Corregido en `ruleModelV2.js`: una regla existente sin espera se abre con 0 (las nuevas siguen en 60). Las inversiones de `gt`/`lt` no tienen causa en el código del editor: son ediciones.

Otros cambios a mirar (no invierten): Cummins GA1 48 → 24 h; AR-06 cargador caído 12,9 V / 30 min → 12 V / 60 s (detecta mucho más tarde); tres reglas casi iguales para el mismo sifoneo (gen-sifoneo-divergencia, cat-CB-05, GEN-sifoneo-motor-apagado) → una pérdida dispara tres alarmas; las dos "divergencia" (caudalímetro vs nivel) pasaron a "fuera de lo habitual" y ya no comparan el caudalímetro.

Corrección: `tools/fix_umbrales_auditoria.js` (por la API, solo las claves pasadas; probada contra una API falsa: aplica las 8 y una segunda corrida da "ya está bien").

### 4.2 · Umbrales a revisar contra fabricante
| # | Regla | Hoy | Referencia | Propuesta |
|---|---|---|---|---|
| R7 | cummins-M1 «Pérdida de AC» (crítica) y cummins-C1 «corte sostenido sin arranque» | red < 198 V | 198 V es **subtensión** (F1a ya la avisa). El ComAp arranca el grupo recién con su *Mains <V trip* | Usar < 100 V (como TR-03 y TR-09), o el setpoint del ATS (P4). Hoy un bajón de tensión da "corte de energía" crítico. |
| R8 | cummins-GA1 autonomía baja | < 24 h fijo | ficha 48 h (el GEN la usa) | Pasar a [ficha:warning]: dos grupos con criterios distintos. |
| R9 | cat-GE-04 «Sobretemperatura (parada)» | > 105 °C | PC2100 corta a **110 °C** | Valor bien (anticipa); cambiar el nombre a "antes de la parada" y atarlo a [ficha:trip]. |
| R10 | cat-DC-09 rectificador caliente | > 60 °C | ficha ELTEK 35/45 (PROVISORIO) | Misma medición con dos criterios; definir cuál (P6). |
| R11 | cat-SG-04 frecuencia del grupo | solo < 48,5 Hz | falta el lado alto | Sumar > 51,5 Hz (±3 %). |
| R12 | gen-batt-warn 11,8 · cat-AR-04 9,6 · cat-AR-06 12 · cat-AR-07 14,8 | números fijos de 12 V | ficha relativa a la tensión nominal; sobrecarga ficha = 15 V | Atarlas a la ficha (escala a 24 V) y alinear AR-07 (14,8) con la ficha (15). |
| R13 | A0, GE-07, F1a/F1b/F2a/F2b | números fijos iguales a la ficha | — | Atarlas a la ficha: hoy cambiar la ficha no las mueve (DEC-PROC-3). |
| R14 | cat-GE-08 marcha inestable | pendiente de rpm ±15 | — | Ya pendiente (auditoría del simulador). |

Sin observaciones: D4 (3 arranques = fabricante), G2 / gen-fuel (15 %, decisión), A1 Cummins (100 kPa = corte del fabricante), DC-05 (−57 V = ejemplo Eltek), AR-08 ejercicio semanal, staleness 15 min.

## 5 · Firmado y aplicado (Franco 2026-10-20: "aplica las recomendaciones")
`docker exec -i node node - --apply A1,A2,TR09,AR08,ACCEL,M1C1,AR04,GA1,AR06,SG04,FICHA < tools/fix_umbrales_auditoria.js`
- **A1, A2, TR09, ACCEL** → vuelven a la spec firmada (convención negativa). **AR08, M1C1** → versión original. **AR04** → espera 0 s.
- **GA1** → autonomía baja del Cummins atada a la ficha (48 h, igual que el GEN). **AR06** → cargador caído vuelve a < 12,9 V durante 30 min.
- **SG04** → frecuencia del grupo vigila los dos lados (< 48,5 o > 51,5 Hz).
- **FICHA** → A0, GE-07, GE-04 (renombrada "antes de la parada"), F1a/F1b/F2a/F2b, gen-batt-warn y AR-07 leen el límite de la ficha; AR-07 pasa de 14,8 a 15 V (ficha).
- Editor: una regla sin espera ya no se guarda con 60 s (rebuild del front).

Quedan abiertos: P1 (alternador relativo), P2 (`battery_nominal_v` = 24 en los Cummins), P3 (aceite en ralentí), P4/P6/P7, P5/P8 (reglas nuevas), R10 (DC-09 60 °C vs ficha 45), R5 (vida de aceite con el motor detenido), sifoneo triplicado, y AR-04 9,6 V / AR-06 sin escala a 24 V.

## 6 · Segunda tanda — firmada por Franco 2026-10-22
`docker exec -i node node - --apply ALT,DC09,ACEITE,SIFON < tools/fix_umbrales_auditoria2.js`
- **ALT (P1)** → ficha GEN: tensión del alternador relativa a la tensión nominal de batería (24 V → 26,0 / 29,6 V). También en `tools/seed_fichas/fichas.js`.
- **DC09 (R10)** → «Rectificador caliente» atada al límite crítico de la ficha ELTEK (45 °C, PROVISORIO).
- **ACEITE (R5)** → vida de aceite cuenta solo con el motor en marcha: factor = rpm / 1500 (detenido suma 0). Se pierde el ajuste por temperatura.
- **SIFON** → escalera: cat-CB-05 aviso (z < −3) · gen-sifoneo-divergencia renombrada «Sifoneo de combustible», crítica, z < −5 · GEN-sifoneo-motor-apagado apagada (duplicada).
- Limpieza: `tools/borrar_regla_banco.js` borra «BATERIA EN DESSCARGA» de banco-conformidad (R6).

Quedan abiertos: P5 (diferencia de escape entre bancos) y P8 (refrigerante frío), reglas nuevas con valor a decidir.
