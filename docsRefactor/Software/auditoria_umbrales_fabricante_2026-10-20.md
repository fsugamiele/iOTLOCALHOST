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

## 4 · Cierre pendiente: las 71 reglas de la base
`docker exec -i node node - < tools/volcar_umbrales.js > umbrales.txt` (solo lectura). Lista cada regla con el umbral **resuelto** que usa el motor, la espera y la ventana, y al final todos los límites de ficha con su fuente. Con eso se contrastan las reglas creadas por UI y los presets (cat-GE-07/08, CB-05/06, baselines) que no están en las semillas.
