# Biblioteca de fallas · Cummins PowerCommand 1.1 / 1.1R / 1.2 (PCC 1302)

**Fuente principal:** *Manual de servicio Controlador PowerCommand 1.1 / 1.1R / 1.2*, Cummins **A040D969 (Edición 1), 1-2011**, 268 pp. — §8.3 (umbrales configurables), §9 (Localización de averías), §9.8 (códigos de falla con lógica, causas y diagnóstico).
**Complementos:** *PowerCommand 1.1 control system — Specification sheet* (HMI211) · *Operator Manual PowerCommand 2100* (valores citados en `auditoria_umbrales_fabricante_2026-10-20.md`).
**Datos estructurados:** `cummins_pcc1302.json` (mismo contenido, para cargar ficha y perfil).

> **Nota del fabricante (§9.6):** todo código de tipo «advertencia» puede reconfigurarse como «parada» con InPower. Se documentan los valores **predeterminados**; en campo hay que confirmar la configuración de cada sitio.

## 1 · Umbrales
Ver `../cummins_pcc1302_manual_servicio.md` §2 (protecciones configurables: rango, retardo, código) y §3 (umbrales **fijos** de la lógica: 146 = 107,2 °C / 5 s · 415 = 180 kPa / 10 s · 488 = 85 °C / 90 s · 1447 = 85 % / 10 s · 1471 = 110 % / 60 s · 1472 = 150 % · 1992 = +15 %). Valor que usa Wanomi y su porqué: `../../Software/auditoria_umbrales_fabricante_2026-10-20.md` y `spec_perfiles_controladora.md` (perfil `cummins-pcc1302`).

## 2 · Cobertura Wanomi

- **90 códigos** documentados: 72 con procedimiento completo de localización de averías (§9.8) y 18 citados en otras secciones (sin procedimiento).
- **12 códigos** tienen una regla Wanomi que los vigila (directa por código o por la misma medición); el resto llega por «Cualquier código de falla activo» (cat-GE-17), que en el detalle de la alarma muestra nombre y causas del código activo.
- Tipo «no indicado en el manual»: el manual no dice si es advertencia o parada; en el perfil se cargó un tipo **inferido** (marcado en el JSON como `tipoInferido`). Hay que confirmarlo en el equipo (InPower) antes de fijar la severidad de una regla.

## 3 · Fallas por sistema (resumen)

| Sistema | Código | Falla | Tipo | Medición Wanomi | Regla Wanomi |
|---|---|---|---|---|---|
| Arranque y parada | 1123 | Parada después de derivación | no indicado en el manual (inferido: shutdown) | — | GE-17 (genérica) |
| Arranque y parada | 1244 | Parada normal del motor | no indicado en el manual | — | GE-17 (genérica) |
| Arranque y parada | 1245 | Falla de parada de motor | no indicado en el manual | — | GE-17 (genérica) |
| Arranque y parada | 1311 | Bandeja de rupturas | Parada | — | GE-17 (genérica) |
| Arranque y parada | 1416 | Falla de parada anulada por derivación | no indicado en el manual (inferido: warning) | — | GE-17 (genérica) |
| Arranque y parada | 1417 | Falla de apagado | no indicado en el manual | — | GE-17 (genérica) |
| Arranque y parada | 1433 | Parada de emergencia local | no indicado en el manual | — | GE-17 (genérica) |
| Arranque y parada | 1434 | Parada de emergencia remota | no indicado en el manual | — | GE-17 (genérica) |
| Arranque y parada | 1438 | Falla de arranque | Parada | — | cat-AR-02 |
| Arranque y parada | 1541 | Parada común | no indicado en el manual (inferido: event) | — | GE-17 (genérica) |
| Arranque y parada | 2729 | Pérdida de módulo de E/S | Advertencia | — | GE-17 (genérica) |
| Arranque y parada | 2731 | Pérdida de módulo de E/S | Parada | — | GE-17 (genérica) |
| Aceite | 135 | Sensor de presión de aceite FDR - alto | Advertencia | cummins-pcc.oil_pressure | GE-17 (genérica) |
| Aceite | 141 | Sensor de presión de aceite FDR - bajo | Advertencia | cummins-pcc.oil_pressure | GE-17 (genérica) |
| Aceite | 143 | Presión de aceite del motor baja | Advertencia | cummins-pcc.oil_pressure | cummins-A0 (por la medición) |
| Aceite | 415 | Presión de aceite del motor baja | Parada | cummins-pcc.oil_pressure | cummins-A1 (por la medición) |
| Aceite | 421 | Alta temperatura del aceite del motor | no indicado en el manual | cummins-pcc.oil_pressure | GE-17 (genérica) |
| Refrigeración | 144 | Temperatura de refrigerante del motor FDR alto | Advertencia | cummins-pcc.coolant_temp | GE-17 (genérica) |
| Refrigeración | 146 | Temperatura del refrigerante del motor superior a la normal | Advertencia | cummins-pcc.coolant_temp | cat-GE-04 (por la medición, límite de ficha) |
| Refrigeración | 151 | Temperatura del refrigerante del motor alta | Parada | cummins-pcc.coolant_temp | cat-GE-04 (por la medición) |
| Refrigeración | 153 | Temperatura del múltiple de admisión FDR alta | Advertencia | — | GE-17 (genérica) |
| Refrigeración | 154 | Temperatura del múltiple de admisión FDR baja | Advertencia | — | GE-17 (genérica) |
| Refrigeración | 155 | Temperatura del múltiple de admisión alta | Parada | — | GE-17 (genérica) |
| Refrigeración | 195 | Sensor de nivel del refrigerante FDR alto | Advertencia | cummins-pcc.coolant_temp | GE-17 (genérica) |
| Refrigeración | 196 | Sensor de nivel del refrigerante FDR bajo | Advertencia | cummins-pcc.coolant_temp | GE-17 (genérica) |
| Refrigeración | 197 | Bajo nivel del refrigerante | Advertencia | cummins-pcc.coolant_temp | GE-17 (genérica) |
| Refrigeración | 436 | Temperatura del múltiple de admisión FDR AUX 101 | Advertencia | — | GE-17 (genérica) |
| Refrigeración | 488 | Alta temperatura del múltiple de admisión | Advertencia | — | cat-GE-12 |
| Refrigeración | 1317 | Nivel de refrigerante bajo | Parada | cummins-pcc.coolant_temp | GE-17 (genérica) |
| Refrigeración | 1435 | Baja temperatura del refrigerante | no indicado en el manual (inferido: warning) | cummins-pcc.coolant_temp | cummins-refrigerante-frio (por la medición) |
| Refrigeración | 1847 | Alta temperatura del refrigerante del motor | Parada | cummins-pcc.coolant_temp | GE-17 (genérica) |
| Refrigeración | 2112 | Temperatura de entrada del refrigerante AUX 101 FDR | Advertencia | cummins-pcc.coolant_temp | GE-17 (genérica) |
| Combustible | 118 | Presión de combustible FDR alta | Advertencia | cummins-pcc.fuel_rate / fuel_level | GE-17 (genérica) |
| Combustible | 119 | Sensor de presión de combustible FDR bajo | Advertencia | cummins-pcc.fuel_rate / fuel_level | GE-17 (genérica) |
| Combustible | 418 | Agua en el combustible | no indicado en el manual (inferido: warning) | cummins-pcc.fuel_rate / fuel_level | GE-17 (genérica) |
| Combustible | 1312 | Entrada #2 del cliente | no indicado en el manual (inferido: configurable) | — | GE-17 (genérica) |
| Combustible | 1318 | Combustible bajo | Parada | cummins-pcc.fuel_rate / fuel_level | GE-17 (genérica) |
| Combustible | 2224 | Nivel de combustible AUX 101 FDR | Advertencia | cummins-pcc.fuel_rate / fuel_level | GE-17 (genérica) |
| Velocidad y regulación | 121 | Detección de pérdida de velocidad | Parada | cummins-pcc.rpm | GE-17 (genérica) |
| Velocidad y regulación | 234 | Alta velocidad del motor | Parada | cummins-pcc.rpm | cat-GE-07 (por la medición) |
| Velocidad y regulación | 1448 | Subfrecuencia | no indicado en el manual (inferido: shutdown) | ATS.gen_freq | GE-17 (genérica) |
| Velocidad y regulación | 1449 | Sobrefrecuencia | no indicado en el manual (inferido: shutdown) | ATS.gen_freq | GE-17 (genérica) |
| Velocidad y regulación | 1468 | Listo para cargar | no indicado en el manual (inferido: event) | — | GE-17 (genérica) |
| Velocidad y regulación | 1469 | No coinciden velocidad y frecuencia | no indicado en el manual (inferido: shutdown) | cummins-pcc.rpm | GE-17 (genérica) |
| Velocidad y regulación | 1992 | La velocidad del cigüeñal del motor está sobre la velocidad nominal | Advertencia | cummins-pcc.rpm | cat-GE-07 (por la medición) |
| Velocidad y regulación | 2693 | Compensación de velocidad FDR | Advertencia | cummins-pcc.rpm | GE-17 (genérica) |
| Batería y carga | 441 | Bajo voltaje de la batería | Advertencia | cummins-pcc.battery_voltage | GE-17 (genérica) |
| Batería y carga | 442 | Alto voltaje de la batería | Advertencia | cummins-pcc.battery_voltage | GE-17 (genérica) |
| Batería y carga | 1442 | Batería débil | no indicado en el manual (inferido: warning) | cummins-pcc.battery_voltage | GE-17 (genérica) |
| Batería y carga | 2678 | Falla del cargador (alternador de carga) | no indicado en el manual (inferido: warning) | — | GE-17 (genérica) |
| Salida eléctrica (alternador / AVR) | 1446 | Alto voltaje de CA | no indicado en el manual (inferido: shutdown) | ATS.gen_voltage | GE-17 (genérica) |
| Salida eléctrica (alternador / AVR) | 1447 | Voltaje de CA bajo | Parada | ATS.gen_voltage | GE-17 (genérica) |
| Salida eléctrica (alternador / AVR) | 1471 | Corriente CA alta | Advertencia | — | GE-17 (genérica) |
| Salida eléctrica (alternador / AVR) | 1472 | Corriente CA alta | Parada | — | GE-17 (genérica) |
| Salida eléctrica (alternador / AVR) | 1667 | Temperatura de escape del AUX 101 FDR | Advertencia | — | GE-17 (genérica) |
| Salida eléctrica (alternador / AVR) | 2398 | Temperatura ambiental AUX 101 FDR | Advertencia | — | GE-17 (genérica) |
| Salida eléctrica (alternador / AVR) | 2542 | Compensación de voltaje AUX 101 FDR | Advertencia | ATS.gen_voltage | GE-17 (genérica) |
| Salida eléctrica (alternador / AVR) | 2694 | RTD del alternador FDR | Advertencia | — | GE-17 (genérica) |
| Salida eléctrica (alternador / AVR) | 2696 | Alta temperatura del RTD del alternador | Advertencia | — | GE-17 (genérica) |
| Salida eléctrica (alternador / AVR) | 2972 | Sobrecarga de campo | no indicado en el manual | — | GE-17 (genérica) |
| Comunicación con el motor (ECM / CAN) | 426 | El enlace de datos J1939 no puede transmitir | no indicado en el manual | — | GE-17 (genérica) |
| Comunicación con el motor (ECM / CAN) | 427 | Enlace de datos CAN degradado | no indicado en el manual | — | GE-17 (genérica) |
| Comunicación con el motor (ECM / CAN) | 781 | Falló el enlace de datos de CAN del ECM | no indicado en el manual | — | cat-GE-16 |
| Comunicación con el motor (ECM / CAN) | 1117 | Pérdida de energía del ECM | Advertencia | — | GE-17 (genérica) |
| Comunicación con el motor (ECM / CAN) | 1248 | Advertencia de motor | no indicado en el manual | — | GE-17 (genérica) |
| Comunicación con el motor (ECM / CAN) | 2545 | Se requiere reposición del interruptor con llave | Advertencia | — | GE-17 (genérica) |
| Modo de operación | 1131 | Modo en derivación (battle short) activo | no indicado en el manual (inferido: warning) | — | cat-GE-1131 |
| Modo de operación | 1463 | No en automático | no indicado en el manual (inferido: warning) | — | cat-GE-1463 |
| Otros / entradas del cliente | 1483 | Alarma común | no indicado en el manual (inferido: event) | — | GE-17 (genérica) |
| Otros / entradas del cliente | 1540 | Advertencia común | no indicado en el manual (inferido: event) | — | GE-17 (genérica) |
| Otros / entradas del cliente | 1853 | Falla 1 del anunciador | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 1854 | Falla 2 del anunciador | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 1855 | Falla 3 del anunciador | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 1944 | Error de configuración de la salida del anunciador | Advertencia | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2619 | Entrada #1 de falla AUX 101 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2621 | Entrada #2 de falla AUX 101 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2622 | Entrada #3 de falla AUX 101 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2623 | Entrada #4 de falla AUX 101 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2624 | Entrada #5 de falla AUX 101 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2625 | Entrada #6 de falla AUX 101 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2626 | Entrada #7 de falla AUX 101 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2627 | Entrada #8 de falla AUX 101 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2628 | Entrada #1 de falla AUX 102 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2629 | Entrada #2 de falla AUX 102 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2631 | Entrada #3 de falla AUX 102 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2632 | Entrada #4 de falla AUX 102 | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2897 | Bloque de memoria de fábrica dañado | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2898 | Bloque de memoria periódico o de fallas dañado | no indicado en el manual (inferido: warning) | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2899 | Bloque de memoria del usuario dañado | no indicado en el manual | — | GE-17 (genérica) |
| Otros / entradas del cliente | 2911 | Bloque de memoria de ajuste fino dañado | no indicado en el manual | — | GE-17 (genérica) |

## 4 · Localización de averías por código

Formato: **qué detecta** (lógica del controlador) · **causas probables** en el orden del fabricante · **verificación y reparación** (resumen de los pasos del manual). Lo que se puede verificar a distancia desde Wanomi se indica en «Desde Wanomi».

### 118 · Presión de combustible FDR alta — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 161 del PDF* · sistema: Combustible

**Qué detecta:** La señal del sensor de presión del combustible está fuera de rango (cortocircuito en alta tensión).

**Causas probables:**
1. Conexiones defectuosas del sensor de presión de combustible
2. Sensor de presión de combustible defectuoso
3. Arnés del motor defectuoso
4. Arnés de extensión defectuoso
5. Verificar las calibraciones en el ECM y en los controles de PowerCommand

**Verificación y reparación (manual):**
- *Conexiones defectuosas del sensor de presión de combustible*: Inspeccionar el sensor de presión de combustible y los pasadores del conector del arnés del motor. → Desconectar el conector del arnés del motor del sensor de presión de combustible. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de presión de combustible defectuoso*: Sensor activo. → Comprobar el voltaje de alimentación del sensor de presión de combustible. → Desconectar el conector del arnés del motor del sensor de presión de combustible. → Instalar el cable multiconector del sensor de presión de aceite entre el sensor y el conector del arnés del sensor.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el conector del arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar el arnés de extensión y los pasadores del conector de control. → Desconectar el conector del arnés de extensión del control. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Verificar las calibraciones en el ECM y en los controles de PowerCommand*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web InCal, la calibración es correcta. En caso contrario, actualice la calibración al valor más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.fuel_rate / fuel_level` en el detalle de la alarma antes de despachar.

### 119 · Sensor de presión de combustible FDR bajo — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 164 del PDF* · sistema: Combustible

**Qué detecta:** La señal del sensor de presión de combustible está fuera de gama (cortocircuito en alta tensión).

**Causas probables:**
1. Conexiones defectuosas del sensor de presión de combustible
2. Sensor de presión de combustible defectuoso
3. Arnés del motor defectuoso
4. Arnés de extensión defectuoso
5. Verificar las calibraciones en el ECM y en los controles de PowerCommand

**Verificación y reparación (manual):**
- *Conexiones defectuosas del sensor de presión de combustible*: Inspeccionar el sensor de presión de combustible y los pasadores del conector del arnés del motor. → Desconectar el conector del arnés del motor del sensor de presión de combustible. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de presión de combustible defectuoso*: Sensor activo. → Comprobar el voltaje de alimentación del sensor de presión de combustible. → Desconectar el conector del arnés del motor del sensor de presión de combustible. → Instalar el cable multiconector del sensor de presión de aceite entre el sensor y el conector del arnés del sensor.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el conector del arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar el arnés de extensión y los pasadores del conector de control. → Desconectar el conector del arnés de extensión del control. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Verificar las calibraciones en el ECM y en los controles de PowerCommand*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web InCal, la calibración es correcta. En caso contrario, actualice la calibración al valor más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.fuel_rate / fuel_level` en el detalle de la alarma antes de despachar.

### 121 · Detección de pérdida de velocidad — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 167 del PDF* · sistema: Velocidad y regulación

**Qué detecta:** No se detecta ninguna señal de velocidad en una de estas dos señales: velocidad del cigüeñal del motor o posición del árbol de levas.

**Causas probables:**
1. Conexiones defectuosas del sensor de velocidad del cigüeñal
2. Sensor de velocidad del cigüeñal defectuoso
3. Conexiones defectuosas del sensor de posición del árbol de levas
4. Sensor de posición del árbol de levas defectuoso
5. Arnés del motor defectuoso
6. Arnés de extensión defectuoso
7. Volante de destino del cigüeñal dañado
8. Verificar las calibraciones en el ECM y en los controles de PowerCommand

**Verificación y reparación (manual):**
- *Conexiones defectuosas del sensor de velocidad del cigüeñal*: Inspeccionar el sensor de velocidad del cigüeñal y los pasadores del arnés del motor. → Desconectar el conector del arnés del motor del sensor de velocidad del cigüeñal. → Inspeccionar si hay pasadores corroídos, doblados, rotos, plegados, expandidos o sueltos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de velocidad del cigüeñal defectuoso*: Revisar el suministro de voltaje del sensor de velocidad del cigüeñal. → Desconectar el conector del arnés del motor del sensor de velocidad del cigüeñal. → Instalar el cable multiconector del sensor de velocidad entre el sensor y el conector del arnés del sensor. → Medir el voltaje de alimentación conectando los conectores de suministro y de retorno del cable multiconector al multímetro. Si la lectura se encuentra entre 4,75 y 5,25 VCC, el voltaje de alimentación será correcto.
- *Conexiones defectuosas del sensor de posición del árbol de levas*: Inspeccionar el sensor de posición del árbol de levas y los pasadores del arnés del motor. → Desconectar el sensor de posición del árbol de levas del conector del arnés del motor. → Inspeccionar si hay pasadores corroídos, doblados, rotos, plegados, expandidos o sueltos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de posición del árbol de levas defectuoso*: Revisar el suministro de voltaje del sensor de posición del árbol de levas. → Desconectar el sensor de posición del árbol de levas del conector del arnés del motor. → Instalar el cable multiconector del sensor de velocidad entre el sensor y el conector del arnés del sensor. → Medir el voltaje de alimentación conectando los conectores de suministro y de retorno del cable multiconector al multímetro. Si la lectura se encuentra entre 4,75 y 5,25 VCC, el voltaje de alimentación será correcto.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el conector del arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar el arnés de extensión y los pasadores de control. → Desconectar el conector del arnés de extensión del control. → Inspeccionar si hay pasadores corroídos, doblados, rotos, plegados, expandidos o sueltos. → Inspeccionar si hay signos de humedad en el conector.
- *Volante de destino del cigüeñal dañado*: Inspeccionar visualmente el volante de destino del cigüeñal. → Inspeccionar si hay dientes dañados, deformados, faltantes o quebrados del volante de destino. → Inspeccionar si hay evidencia de corrosión u otros materiales en los dientes del volante de destino o a su alrededor. → Inspeccionar si hay suciedad o desechos en los dientes del volante de destino.
- *Verificar las calibraciones en el ECM y en los controles de PowerCommand.*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web InCal, la calibración es correcta. En caso contrario, actualice la calibración al valor más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.rpm` en el detalle de la alarma antes de despachar.

### 135 · Sensor de presión de aceite FDR - alto — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 173 del PDF* · sistema: Aceite

**Qué detecta:** El sensor de presión de aceite del motor está fuera de rango (cortocircuito en alta tensión). El mensaje "OIL PRESSURE SENSOR OOR" (Sensor de presión de aceite fuera de rango) se visualiza si la condición de falla se detecta durante más de 10 segundos.

**Causas probables:**
1. Falla en las conexiones del sensor de presión de aceite.
2. Falla en el sensor de presión de aceite
3. Falla en el arnés del motor
4. Falla en el arnés de extensión
5. Verificar las calibraciones en el ECM y en los controles de PowerCommand

**Verificación y reparación (manual):**
- *Falla en las conexiones del sensor de presión de aceite.*: Inspeccionar visualmente el sensor de presión de aceite y los pasadores del arnés del motor. → Desconectar el conector del arnés del motor del sensor de velocidad del cigüeñal. → Inspeccionar si hay pasadores corroídos, doblados, rotos, plegados, expandidos o sueltos. → Inspeccionar si hay signos de humedad en el conector.
- *Falla en el sensor de presión de aceite*: Comprobar el voltaje de alimentación del sensor de presión de aceite. → Desconectar el conector del arnés del motor del sensor de presión de aceite. → Instalar el cable multiconector del sensor de presión de aceite entre el sensor y el conector del arnés del sensor. → Medir el voltaje de alimentación conectando los conectores de suministro y de retorno del cable multiconector al multímetro. Si la lectura se encuentra entre 4,75 y 5,25 VCC, el voltaje de alimentación será correcto.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el conector del arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar el arnés de extensión y los pasadores del conector de control del grupo electrógeno. → Desconectar el conector del arnés de extensión del control. → Inspeccionar si hay pasadores corroídos, doblados, rotos, plegados, expandidos o sueltos. → Inspeccionar si hay signos de humedad en el conector.
- *Verificar las calibraciones en el ECM y en los controles de PowerCommand*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web InCal, la calibración es correcta. En caso contrario, actualice la calibración al valor más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.oil_pressure` en el detalle de la alarma antes de despachar.

### 141 · Sensor de presión de aceite FDR - bajo — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 176 del PDF* · sistema: Aceite

**Qué detecta:** El sensor de presión de aceite está fuera de rango (cortocircuito en baja tensión). Aparece una advertencia "OIL PRESSURE SENSOR OOR" (Sensor de presión de aceite fuera de rango) después de que se detecta la condición de falla durante 10 segundos.

**Causas probables:**
1. Falla en las conexiones del sensor de presión de aceite.
2. Falla en el sensor de presión de aceite
3. Falla en el arnés del motor
4. Falla en el arnés de extensión
5. Verificar las calibraciones en el ECM y en los controles de PowerCommand

**Verificación y reparación (manual):**
- *Falla en las conexiones del sensor de presión de aceite.*: Inspeccionar visualmente el sensor de presión de aceite y los pasadores del conector del arnés. → Desconectar el conector del arnés del motor del sensor de velocidad del cigüeñal. → Inspeccionar si hay pasadores corroídos, doblados, rotos, plegados, expandidos o sueltos. → Inspeccionar si hay signos de humedad en el conector.
- *Falla en el sensor de presión de aceite*: Comprobar el voltaje de alimentación del sensor de presión de aceite. → Desconectar el conector del arnés del motor del sensor de presión de aceite. → Instalar el cable multiconector del sensor de presión de aceite entre el sensor y el conector del arnés del sensor. → Medir el voltaje de alimentación conectando los conectores de suministro y de retorno del cable multiconector al multímetro. Si la lectura se encuentra entre 4,75 y 5,25 VCC, el voltaje de alimentación será correcto.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el conector del arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar el arnés de extensión y los pasadores del conector de control del grupo electrógeno. → Desconectar el conector del arnés de extensión del control. → Inspeccionar si hay pasadores corroídos, doblados, rotos, plegados, expandidos o sueltos. → Inspeccionar si hay signos de humedad en el conector.
- *Verificar las calibraciones en el ECM y en los controles de PowerCommand*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web InCal, la calibración es correcta. En caso contrario, actualice la calibración al valor más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.oil_pressure` en el detalle de la alarma antes de despachar.

### 143 · Presión de aceite del motor baja — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 179 del PDF* · sistema: Aceite

**Qué detecta:** La presión de aceite del motor está por debajo del umbral de advertencia de baja presión de aceite.

**Causas probables:**
1. El novel de aceite de lubricación está bajo
2. Fuga externa
3. El aceite de lubricación no cumple con las especificaciones
4. El aceite de lubricación está contaminado con refrigerante o combustible
5. La oblicuidad del motor durante la operación excede la especificación
6. La temperatura del refrigerante está sobre la especificación
7. La tubería del filtro de aceite de lubricación no está correctamente enrutada
8. El regulador principal de presión de aceite está defectuoso
9. La tubería de succión o transferencia del aceite de lubricación está suelta o rota
10. la bomba de aceite de lubricación está defectuosa
11. Se instaló el refrigerante del aceite de lubricación incorrecto
12. El refrigerante del aceite de lubricación está conectado
13. La temperatura del aceite de lubricación está sobre la especificación
14. Las boquillas de refrigeración del pistón están dañadas o no están correctamente instaladas
15. El sensor de presión de aceite no es preciso o está bloqueado
16. La simulación de fallas está habilitada o el umbral está ajustado en un valor demasiado alto

**Verificación y reparación (manual):**
- *El novel de aceite de lubricación está bajo*: Revise el nivel del aceite. Agregar o vaciar el aceite, si es necesario.
- *Fuga externa*: Inspeccionar el motor y el área circundante para ver si hay fugas externas de aceite. → Apretar tornillos, tapones de tuberías y adaptadores. → Reemplazar empaquetaduras, si es necesario.
- *El aceite de lubricación no cumple con las especificaciones*: Verificar que el aceite de lubricación cumpla con las especificaciones exigidas en el manual del motor. → Verificar que no se agregó aceite alternativo ni aditivos durante la vida útil del aceite. → Verificar la antigüedad del aceite de lubricación. → Si es necesario, tomar una muestra de aceite. Consultar los boletines de técnicas de análisis de aceite para obtener instrucciones acerca de cómo tomar una muestra de aceite.
- *El aceite de lubricación está contaminado con refrigerante o combustible*: Consultar el árbol de síntomas de aceite de lubricación contaminado para obtener la localización de averías correcta.
- *La oblicuidad del motor durante la operación excede la especificación*: Verificar si el contenedor del equipo de arriendo está a nivel o cerca del nivel. → Consultar la especificación del sistema para determinar el valor de oblicuidad adecuado.
- *La temperatura del refrigerante está sobre la especificación*: Leer la temperatura del refrigerante del motor en la pantalla o mediante la herramienta de servicio InPower. → Comparar la temperatura del refrigerante contra la temperatura esperada del refrigerante para dicho modelo de motor. Estos datos se pueden encontrar en el manual del motor. → Si la temperatura del refrigerante está fuera del rango esperado, consultar la localización de averías FC146 para obtener la solución de problemas de temperatura del refrigerante sobre lo normal.
- *La tubería del filtro de aceite de lubricación no está correctamente enrutada*: Inspeccionar las tuberías del filtro de aceite de lubricación. → Si el enrutamiento es un problema, consultar el procedimiento para la tubería del aceite de lubricación en el manual del motor.
- *El regulador principal de presión de aceite está defectuoso*: Inspeccionar el émbolo y el diámetro del émbolo para ver si está mellado o rayado. → Verificar que el émbolo se mueva libremente en el diámetro. → Medir el resorte regulador de presión a las siguientes alturas: → A 41,25 mm (1,624 pulgadas) la presión debe ser 127 N (29 lb) por lo menos.
- *La tubería de succión o transferencia del aceite de lubricación está suelta o rota*: Inspeccionar la tubería de succión o de transferencia de aceite de lubricación para ver si hay fugas. Inspeccionar visualmente si hay roturas, abolladuras o desgaste. → Inspeccionar los tornillos para buscar signos de fugas. → Inspeccionar la empaquetaduras y anillos "O" para buscar signos de daños, desgaste excesivo o compresión.
- *La bomba de aceite de lubricación está defectuosa*: Revisar si hay juego en la bomba de aceite. → Se debe reemplazar la bomba si el juego no está dentro de 0,170 mm (0,007 pulgadas) mínimo y 0,300 mm (0,012 pulgadas) máximo. → Inspeccionar los engranajes de la bomba de aceite para ver si hay picaduras, roturas o desgaste excesivo. → Si se sospecha que pasaron desechos por la bomba, se puede retirar la placa de la cubierta posterior para inspeccionar el daño interno.
- *Se instaló el refrigerante del aceite de lubricación incorrecto*: Revisar si está instalado el refrigerante del aceite de lubricación con el número de pieza correcto. Verificar según el manual de piezas correcto.
- *El refrigerante del aceite de lubricación está conectado*: Inspeccionar visualmente la limpieza del refrigerante de aceite. → Consultar el manual del motor para obtener instrucciones acerca de cómo limpiar la carcasa del refrigerante de aceite.
- *La temperatura del aceite de lubricación está sobre la especificación*: Leer la temperatura del aceite del motor en la pantalla o mediante la herramienta de servicio InPower. → Comparar la temperatura del aceite contra la temperatura esperada del aceite. Consultar el manual del motor para obtener las temperaturas de funcionamiento del aceite. Consultar la especificación del refrigerante o del calefactor del bloque para un motor que no está en funcionamiento. → Si la temperatura del aceite está fuera del rango esperado, consultar la localización de averías FC421 para obtener la solución de problemas de temperatura del refrigerante sobre lo normal.
- *Las boquillas de refrigeración del pistón están dañadas o no están correctamente instaladas*: Inspeccionar el tornillo y la boquilla de refrigeración del pistón para ver si hay daños. → Revisar si hay fugas no está correctamente asentado.
- *El sensor de presión de aceite no es preciso o está bloqueado*: Conectar un manómetro de aceite mecánico de calidad y precisión reconocida al motor en uno de los enchufes situados en la parte superior de la cabeza del filtro de aceite. → Conectar InPower. → Con el motor parado, comparar la lectura de presión del aceite de la herramienta de servicio con la lectura del manómetro de presión mecánico. → Solo se debe continuar una vez finalizado el procedimiento de localización de averías y reparaciones. No se debe intentar arrancar el motor si hay una duda respecto de la presión de aceite.
- *La simulación de fallas está habilitada o el umbral está ajustado en un valor demasiado alto*: Conectar al control con InPower y asegurarse de que la simulación de fallas para presión baja del aceite no está habilitada. → A través de la herramienta de servicio electrónica, comprobar que el umbral de la falla NO se encuentra dentro del rango de funcionamiento normal para el sensor de presión de aceite. Consultar el manual del motor básico para obtener información sobre el rango de funcionamiento normal.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.oil_pressure` en el detalle de la alarma antes de despachar.

### 144 · Temperatura de refrigerante del motor FDR alto — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 182 del PDF* · sistema: Refrigeración

**Qué detecta:** El voltaje de la señal de temperatura del refrigerante del motor está fuera de gama (cortocircuito en alta tensión).

**Causas probables:**
1. La función de simulación de fallas está habilitada
2. Conexiones del sensor de temperatura del refrigerante defectuosas
3. Sensor de temperatura del refrigerante defectuoso
4. Arnés del motor defectuoso
5. Arnés de extensión defectuoso
6. Verificar las calibraciones del controlador

**Verificación y reparación (manual):**
- *La función de simulación de fallas está habilitada*: Conectar InPower. → Comprobar que la simulación de fallas NO está habilitada para el sensor de temperatura del múltiple de admisión conectándolo al PCC a través de InPower. Si la simulación de fallas está habilitada, no hay ningún problema.
- *Conexiones del sensor de temperatura del refrigerante defectuosas*: Inspeccionar el sensor de temperatura del refrigerante y los pasadores del conector del arnés. → Desconectar el conector del arnés del motor del sensor de temperatura del refrigerante. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de temperatura del refrigerante defectuoso*: Comprobar la resistencia del sensor. → Desconectar el conector del arnés del motor del sensor de temperatura del refrigerante. → Medir la resistencia entre el pasador de señal de temperatura del refrigerante y el pasador de retorno de temperatura del refrigerante. → Consultar el manual de localización de averías y reparaciones de la plataforma del motor específica para obtener información sobre los rangos de temperatura del refrigerante.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el conector del arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar los pasadores del conector del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector. → Comprobar si faltan sellos del conector o si estos están dañados.
- *Verificar las calibraciones del controlador*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web InCal, la calibración es correcta. En caso contrario, actualice la calibración al valor más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.coolant_temp` en el detalle de la alarma antes de despachar.

### 146 · Temperatura del refrigerante del motor superior a la normal — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 185 del PDF* · sistema: Refrigeración

**Qué detecta:** La temperatura del refrigerante del motor excedió 225° F (107,2° C) durante más de 5 segundos.

**Causas probables:**
1. Alta temperatura ambiental
2. Radiador bloqueado
3. Persianas cerradas o dañadas
4. Las aletas del enfriador de carga de aire o las aletas del radiador están dañadas u obstruidas.
5. El nivel de refrigerante es inferior a la especificación
6. La mezcla de agua y anticongelante no es correcta
7. El carenado del ventilador está dañado o los deflectores de recirculación de aire están dañados
8. La correa del ventilador está rota o suelta
9. El mando de ventilador o los controles del ventilador tienen fallas
10. La tapa del radiador no está defectuosa
11. El termostato está defectuoso
12. La manguera del sistema de refrigeración está colapsada, obstruida o con fugas
13. La temperatura del aire del múltiple de entrada está sobre la especificación
14. El sistema de refrigeración está contaminado con suciedad, sarro o sedimentos
15. La bomba de agua no está funcionando bien
16. Está ingresando aire o gases de combustión al sistema de refrigeración
17. Sensor de temperatura del refrigerante impreciso
18. La función de simulación de fallas está habilitada
19. Configuración incorrecta del umbral

**Verificación y reparación (manual):**
- *Alta temperatura ambiental*: Verificar con un termopar la temperatura del aire que ingresa a la persiana de entrada del generador. → Reducir las cargas o la recirculación del aire de descarga en el generador en ambientes con temperaturas elevadas.
- *Radiador bloqueado*: Inspeccionar si hay suciedad, desechos u obstrucciones. → Retirar el bloqueo o la cubierta contra el frío según corresponda.
- *Persianas cerradas o dañadas*: Inspeccionar el correcto funcionamiento de las persianas. → Repararlas o reemplazarlas si están dañadas. → Revisar el correcto funcionamiento del motor de la persiana. → Si el motor de la persiana está funcionando, verificar que la válvula termostática de la persiana esté funcionando.
- *Las aletas del enfriador de carga de aire o las aletas del radiador están dañadas u obstruidas.*: Inspeccionar si hay suciedad, desechos u obstrucciones. → Limpie si es necesario.
- *El nivel de refrigerante es inferior a la especificación*: Inspeccionar el motor, el sistema de refrigeración y el área circundante para ver si hay fugas externas de refrigerante. → Reparar según sea necesario. → Inspeccionar mediante la mirilla que el nivel de refrigerante esté correcto. → Agregar refrigerante según sea necesario.
- *La mezcla de agua y anticongelante no es correcta*: Verifique la concentración de anticongelante en el refrigerante.     Agregar refrigerante según sea necesario.
- *El carenado del ventilador está dañado o los deflectores de recirculación de aire están dañados*: Inspeccionar el carenado y los deflectores para ver si hay daños y holguras. → Repararlas o reemplazarlas si están dañadas.
- *La correa del ventilador está rota o suelta*: Inspeccionar las correas para ver si hay daños, desgaste y que tengan la tensión correcta. → Repararlas o reemplazarlas si están dañadas o gastadas.
- *El mando de ventilador o los controles del ventilador tienen fallas*: Inspeccionar las poleas y el tensor de la correa para ver si hay daños o desgaste. → Repararlas o reemplazarlas si están dañadas.
- *La tapa del radiador no está defectuosa*: Inspeccionar la tapa y empaquetadura del radiador para ver si hay daños y revisar el funcionamiento a la presión correcta. → Reemplazarlas si están dañadas o gastadas.
- *El termostato está defectuoso*: Retirar el termostato e inspeccionar/revisar el funcionamiento correcto. → Reemplazar si está dañado o funcionando en forma incorrecta.
- *La manguera del sistema de refrigeración está colapsada, obstruida o con fugas*: Inspeccionar las mangueras superiores e inferiores del radiador para ver si colapsos, deformaciones o fugas del fluido. → Reemplazarlas si están dañadas o gastadas.
- *La temperatura del aire del múltiple de entrada está sobre la especificación*: Verificar la temperatura del aire del múltiple con un termopar. → Reparar o reemplazar los componentes defectuosos del posenfriador.
- *El sistema de refrigeración está contaminado con suciedad, sarro o sedimentos*: Inspeccionar los componentes del sistema de refrigeración para ver si hay contaminantes externos y limpiar según sea necesario. → Abrir la tapa del radiador e inspeccionar si hay refrigerante contaminado y sarro. → Enjuagar el sistema de refrigeración de acuerdo al manual de servicio del motor.
- *La bomba de agua no está funcionando bien*: Inspeccionar el correcto funcionamiento de la bomba de agua. → Reemplazarla si están dañada o gastada.
- *Está ingresando aire o gases de combustión al sistema de refrigeración*: Inspeccionar el motor para ver si hay fugas en la empaquetadura de culata. → Reparar o reemplazar los componentes defectuosos.
- *Sensor de temperatura del refrigerante impreciso*: Mediante un termopar o un dispositivo similar, medir la temperatura del refrigerante cerca del emisor y compararla con la temperatura del refrigerante que se muestra. → Verificar la resistencia del emisor de temperatura y compararla con las especificaciones detalladas en el manual del motor. → Verificar la continuidad desde el pasador con cable del emisor hasta el pasador del ECM del motor. La resistencia del arnés debe ser inferior a 5 ohmios. → Reparar o reemplazar los componentes o alambrados defectuosos.
- *La función de simulación de fallas está habilitada*: Usar la herramienta de servicio para conectarse al ECM del motor y verificar que la anulación de fallas esté desactivada. → Volver a configurar el generador y desactivar las anulaciones de fallas.
- *Configuración incorrecta del umbral*: Usar la herramienta de servicio para conectarse al ECM del motor y verificar el ajuste del umbral de fallas y compararlo con las especificaciones detalladas en el manual del motor. → Verificar que el número de calibración y revisión del ECM y PCC esté correcto. → Recalibrar el ECM del motor para reposicionar los ajustes del umbral.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.coolant_temp` en el detalle de la alarma antes de despachar.

### 151 · Temperatura del refrigerante del motor alta — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 188 del PDF* · sistema: Refrigeración

**Qué detecta:** La temperatura del refrigerante del motor ha excedido el umbral de (parada) alarma de la temperatura del refrigerante.

**Causas probables:**
1. Alta temperatura ambiental
2. Radiador bloqueado
3. Persianas cerradas o dañadas
4. Las aletas del enfriador de carga de aire o las aletas del radiador están dañadas u obstruidas.
5. El nivel de refrigerante es inferior a la especificación
6. La mezcla de agua y anticongelante no es correcta
7. El carenado del ventilador está dañado o los deflectores de recirculación de aire están dañados
8. La correa del ventilador está rota o suelta
9. El mando de ventilador o los controles del ventilador tienen fallas
10. La tapa del radiador no está defectuosa
11. El termostato está defectuoso
12. La manguera del sistema de refrigeración está colapsada, obstruida o con fugas
13. La temperatura del aire del múltiple de entrada está sobre la especificación
14. El sistema de refrigeración está contaminado con suciedad, sarro o sedimentos
15. La bomba de agua no está funcionando bien
16. Está ingresando aire o gases de combustión al sistema de refrigeración
17. Sensor de temperatura del refrigerante impreciso
18. La función de simulación de fallas está habilitada
19. Configuración incorrecta del umbral

**Verificación y reparación (manual):**
- *Alta temperatura ambiental*: Verificar con un termopar la temperatura del aire que ingresa a la persiana de entrada del generador. → Reducir las cargas o la recirculación del aire de descarga en el generador en ambientes con temperaturas elevadas.
- *Radiador bloqueado*: Inspeccionar si hay suciedad, desechos u obstrucciones. → Retirar el bloqueo o la cubierta contra el frío según corresponda.
- *Persianas cerradas o dañadas*: Inspeccionar el correcto funcionamiento de las persianas. → Repararlas o reemplazarlas si están dañadas. → Revisar el correcto funcionamiento del motor de la persiana. → Si el motor de la persiana está funcionando, verificar que la válvula termostática de la persiana esté funcionando.
- *Las aletas del enfriador de carga de aire o las aletas del radiador están dañadas u obstruidas.*: Inspeccionar si hay suciedad, desechos u obstrucciones. → Limpiar si es necesario.
- *El nivel de refrigerante es inferior a la especificación*: Inspeccionar el motor, el sistema de refrigeración y el área circundante para ver si hay fugas externas de refrigerante. → Reparar según se requiera. → Inspeccionar mediante la mirilla que el nivel de refrigerante esté correcto. → Agregar refrigerante según sea necesario.
- *La mezcla de agua y anticongelante no es correcta*: Verifique la concentración de anticongelante en el refrigerante.     Agregar refrigerante según sea necesario.
- *El carenado del ventilador está dañado o los deflectores de recirculación de aire están dañados*: Inspeccionar el carenado y los deflectores para ver si hay daños y holguras. → Repararlas o reemplazarlas si están dañadas.
- *La correa del ventilador está rota o suelta*: Inspeccionar las correas para ver si hay daños, desgaste y que tengan la tensión correcta → Repararlas o reemplazarlas si están dañadas.
- *El mando de ventilador o los controles del ventilador tienen fallas*: Inspeccionar las poleas y el tensor de la correa para ver si hay daños o desgaste. → Repararlas o reemplazarlas si están dañadas o gastadas.
- *La tapa del radiador no está defectuosa*: Inspeccionar la tapa y empaquetadura del radiador para ver si hay daños y revisar el funcionamiento a la presión correcta. → Reemplazarla si están dañada o gastada.
- *El termostato está defectuoso*: Retirar el termostato e inspeccionar/revisar el funcionamiento correcto. → Reemplazar si está dañado o funcionando en forma incorrecta.
- *La manguera del sistema de refrigeración está colapsada, obstruida o con fugas*: Inspeccionar las mangueras superiores e inferiores del radiador para ver si hay colapsos, deformaciones o fugas del fluido. → Reemplazarlas si están dañadas o gastadas.
- *La temperatura del aire del múltiple de entrada está sobre la especificación*: Verificar la temperatura del aire del múltiple con un termopar. → Reparar o reemplazar los componentes defectuosos del posenfriador.
- *El sistema de refrigeración está contaminado con suciedad, sarro o sedimentos*: Inspeccionar los componentes del sistema de refrigeración para ver si hay contaminantes externos y limpiar según sea necesario. → Abrir la tapa del radiador e inspeccionar si hay refrigerante contaminado y sarro. → Enjuagar el sistema de refrigeración de acuerdo al manual de servicio del motor.
- *La bomba de agua no está funcionando bien*: Inspeccionar el correcto funcionamiento de la bomba de agua. → Reemplazarla si está dañada o gastada.
- *Está ingresando aire o gases de combustión al sistema de refrigeración*: Inspeccionar el motor para ver si hay fugas en la empaquetadura de culata. → Reparar o reemplazar los componentes defectuosos.
- *Sensor de temperatura del refrigerante impreciso*: Mediante un termopar o un dispositivo similar, medir la temperatura del refrigerante cerca del emisor y compararla con la temperatura del refrigerante que se muestra. → Verificar la resistencia del emisor de temperatura y compararla con las especificaciones detalladas en el manual del motor. → Verificar la continuidad desde el pasador con cable del emisor hasta el pasador del ECM del motor. La resistencia del arnés debe ser inferior a 5 ohmios. → Reparar o reemplazar los componentes o alambrados defectuosos
- *La función de simulación de fallas está habilitada*: Usar la herramienta de servicio para conectarse al ECM del motor y verificar que la anulación de fallas esté desactivada. → Volver a configurar el generador y desactivar las anulaciones de fallas.
- *Configuración incorrecta del umbral*: Usar la herramienta de servicio para conectarse al ECM del motor y verificar el ajuste del umbral de fallas y compararlo con las especificaciones detalladas en el manual del motor. → Verificar que el número de calibración y revisión del ECM y PCC esté correcto. → Recalibrar el ECM del motor para reposicionar los ajustes del umbral.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.coolant_temp` en el detalle de la alarma antes de despachar.

### 153 · Temperatura del múltiple de admisión FDR alta — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 191 del PDF* · sistema: Refrigeración

**Qué detecta:** La señal del sensor de temperatura del múltiple de admisión está fuera de rango (cortocircuito en alta tensión).

**Causas probables:**
1. Conexiones del sensor de temperatura del múltiple de admisión defectuosas
2. Sensor de temperatura del múltiple de admisión defectuoso
3. Arnés del motor defectuoso
4. Arnés de extensión defectuoso NOTA:       Número de pieza 3822758: cable de prueba Deutsch/AMP/Metri-Pack macho Número de pieza 3822917: cable de prueba Deutsch/AMP/Metri-Pack hembra

**Verificación y reparación (manual):**
- *Conexiones del sensor de temperatura del múltiple de admisión defectuosas*: Inspeccionar el sensor de temperatura del múltiple de admisión y los pasadores del conector del arnés. → Desconectar el conector del arnés del motor del sensor de temperatura del múltiple de admisión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de temperatura del múltiple de admisión defectuoso*: Revisar la resistencia del sensor → Desconectar el conector del arnés del motor del sensor de temperatura del múltiple de admisión. → Medir la resistencia entre el pasador de señal de temperatura del múltiple de admisión y el pasador de retorno de temperatura del múltiple de admisión. → Consultar el manual de localización de averías y reparaciones para obtener información sobre la plataforma del motor específica y los rangos de temperatura del múltiple de admisión correspondientes.
- *Arnés del motor defectuoso*: Inspeccionar los pasadores del conector del arnés del motor y del arnés de extensión. → Desconectar el arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar el arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector. → Comprobar si faltan sellos del conector o si estos están dañados.

### 154 · Temperatura del múltiple de admisión FDR baja — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 193 del PDF* · sistema: Refrigeración

**Qué detecta:** La señal del sensor de temperatura del múltiple de admisión del motor está fuera de rango (cortocircuito en baja tensión).

**Causas probables:**
1. Conexiones del sensor de temperatura del múltiple de admisión defectuosas
2. Sensor de temperatura del múltiple de admisión defectuoso
3. Arnés del motor defectuoso
4. Arnés de extensión defectuoso NOTA:       Número de pieza 3822758: cable de prueba Deutsch/AMP/Metri-Pack macho Número de pieza 3822917: cable de prueba Deutsch/AMP/Metri-Pack hembra

**Verificación y reparación (manual):**
- *Conexiones del sensor de temperatura del múltiple de admisión defectuosas*: Inspeccionar el sensor de temperatura del múltiple de admisión y los pasadores del conector del arnés. → Desconectar el conector del arnés del motor del sensor de temperatura del múltiple de admisión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de temperatura del múltiple de admisión defectuoso*: Comprobar la resistencia del sensor → Desconectar el conector del arnés del motor del sensor de temperatura del múltiple de admisión. → Medir la resistencia entre el pasador de señal de temperatura del múltiple de admisión y el pasador de retorno de temperatura del múltiple de admisión. → Consultar el manual de localización de averías y reparaciones para obtener información sobre la plataforma del motor específica y los rangos de temperatura del múltiple de admisión correspondientes.
- *Arnés del motor defectuoso*: Inspeccionar los pasadores del conector del arnés del motor y del arnés de extensión. → Desconectar el arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar el arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector. → Comprobar si faltan sellos del conector o si estos están dañados.

### 155 · Temperatura del múltiple de admisión alta — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 196 del PDF* · sistema: Refrigeración

**Qué detecta:** La temperatura del múltiple de entrada del motor excedió 203° F (95° C) durante más de 10 segundos.

**Causas probables:**
1. Alta temperatura ambiental
2. Radiador bloqueado
3. Persianas cerradas o dañadas
4. Las aletas del enfriador de carga de aire o las aletas del radiador están dañadas u obstruidas.
5. La correa del ventilador está rota o suelta
6. El mando de ventilador o los controles del ventilador tienen fallas
7. Sensor de temperatura del refrigerante impreciso
8. La función de simulación de fallas está habilitada
9. Configuración incorrecta del umbral

**Verificación y reparación (manual):**
- *Alta temperatura ambiental*: Verificar con un termopar la temperatura del aire que ingresa a la persiana de entrada del generador. → Reducir las cargas o la recirculación del aire de descarga en el generador en ambientes con temperaturas elevadas.
- *Radiador bloqueado*: Inspeccionar el radiador para ver si hay desechos u obstrucciones. → Retirar el bloqueo o la cubierta contra el frío según corresponda.
- *Persianas cerradas o dañadas*: Inspeccionar el correcto funcionamiento de las persianas. → Repararlas o reemplazarlas si están dañadas. → Revisar el correcto funcionamiento del motor de la persiana. → Si el motor de la persiana está funcionando, verificar que la válvula termostato de la persiana esté funcionando.
- *Las aletas del enfriador de carga de aire o las aletas del radiador están dañadas u obstruidas.*: Inspeccionar si hay suciedad, desechos u obstrucciones. → Limpiar si es necesario.
- *La correa del ventilador está rota o suelta*: Inspeccionar si hay suciedad, desechos u obstrucciones. → Limpiar si es necesario.
- *El mando de ventilador o los controles del ventilador tienen fallas*: Inspeccionar si hay suciedad, desechos u obstrucciones → Limpiar si es necesario.
- *Sensor de temperatura del refrigerante impreciso*: Mediante un termopar o un dispositivo similar medir la temperatura del refrigerante cerca del emisor y compararla con la temperatura del refrigerante que se muestra. → Verificar la resistencia del emisor de temperatura y compararla con las especificaciones detalladas en el manual del motor. → Verificar la continuidad desde el cable del emisor hasta el ECM del motor. La resistencia del arnés debe ser inferior a 5 ohmios. → Reparar o reemplazar los componentes o alambrados defectuosos.
- *La función de simulación de fallas está habilitada*: Usar la herramienta de servicio para conectarse al ECM del motor y verificar que la anulación de fallas esté desactivada. → Volver a configurar el generador y desactivar las anulaciones de fallas.
- *Configuración incorrecta del umbral*: Usar la herramienta de servicio para conectarse al ECM del motor y verificar el ajuste del umbral de fallas y compararlo con las especificaciones detalladas en el manual del motor. → Verificar que el número de calibración y revisión del ECM y PCC esté correcto. → Recalibrar el ECM del motor para reposicionar los ajustes del umbral.

### 195 · Sensor de nivel del refrigerante FDR alto — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 197 del PDF* · sistema: Refrigeración

**Qué detecta:** La señal del sensor de nivel del refrigerante está fuera de rango (cortocircuito en alta tensión).

**Causas probables:**
1. Conexiones del sensor de nivel del refrigerante defectuosas
2. Sensor de nivel del refrigerante defectuoso
3. Arnés del motor defectuoso
4. Arnés de extensión defectuoso NOTA:        Número de pieza 3822758: cable de prueba Deutsch/AMP/Metri-Pack macho Número de pieza 3822917: cable de prueba Deutsch/AMP/Metri-Pack hembra

**Verificación y reparación (manual):**
- *Conexiones del sensor de nivel del refrigerante defectuosas*: Inspeccionar el sensor de nivel del refrigerante y los pasadores del conector del arnés. → Desconectar el conector del arnés del motor del sensor de nivel del refrigerante. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de nivel del refrigerante defectuoso*: Comprobar la resistencia del sensor → Desconectar el conector del arnés del motor del sensor de nivel del refrigerante. → Medir la resistencia entre el pasador de señal del sensor de nivel del refrigerante y el pasador de retorno del sensor de nivel del refrigerante.
- *Arnés del motor defectuoso*: Inspeccionar los pasadores del conector del arnés del motor y del arnés de extensión. → Desconectar el arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar los pasadores del arnés de extensión. → Desconectar el arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.coolant_temp` en el detalle de la alarma antes de despachar.

### 196 · Sensor de nivel del refrigerante FDR bajo — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 199 del PDF* · sistema: Refrigeración

**Qué detecta:** La señal del sensor de nivel del refrigerante está fuera de rango (cortocircuito en alta tensión).

**Causas probables:**
1. Conexiones del sensor de nivel del refrigerante defectuosas
2. Sensor de nivel del refrigerante defectuoso
3. Arnés del motor defectuoso
4. Arnés de extensión defectuoso NOTA:        Número de pieza 3822758: cable de prueba Deutsch/AMP/Metri-Pack macho Número de pieza 3822917: cable de prueba Deutsch/AMP/Metri-Pack hembra

**Verificación y reparación (manual):**
- *Conexiones del sensor de nivel del refrigerante defectuosas*: Inspeccionar el sensor de nivel del refrigerante y los pasadores del conector del arnés. → Desconectar el conector del arnés del motor del sensor de nivel del refrigerante. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de nivel del refrigerante defectuoso*: Comprobar la resistencia del sensor → Desconectar el conector del arnés del motor del sensor de nivel del refrigerante. → Medir la resistencia entre el pasador de señal del sensor de nivel del refrigerante y el pasador de retorno del sensor de nivel del refrigerante. → Revisar si hay cortocircuito con el borne a tierra del bloque del motor.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar los pasadores del arnés de extensión. → Desconectar el arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.coolant_temp` en el detalle de la alarma antes de despachar.

### 197 · Bajo nivel del refrigerante — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 202 del PDF* · sistema: Refrigeración

**Qué detecta:** La señal del sensor de nivel del refrigerante muestra un bajo nivel del refrigerante durante más de 10 segundos.

**Causas probables:**
1. Bajo nivel del refrigerante
2. Sensor de nivel del refrigerante defectuoso

**Verificación y reparación (manual):**
- *Bajo nivel del refrigerante*: Inspeccionar visualmente que el refrigerante esté en un nivel adecuado. → Sacar la tapa del radiador y comprobar que el refrigerante esté en el nivel requerido. → Si el refrigerante está a más de 1 pulgada (2,54 cm) de la parte superior del radiador agregar el refrigerante indicado por el fabricante.
- *Sensor de nivel del refrigerante defectuoso*: Desconectar el conector del arnés del motor de → Reconectar el medir el voltaje entre el pasador de señal del sensor de nivel del refrigerante y el pasador de retorno de nivel del refrigerante. El voltaje debe ser inferior a 2,00 VCC. → Si el voltaje es superior a la especificación anterior, reemplazar el sensor.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.coolant_temp` en el detalle de la alarma antes de despachar.

### 234 · Alta velocidad del motor — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 202 del PDF* · sistema: Velocidad y regulación

**Qué detecta:** Las señales de velocidad del motor indican que funciona a una velocidad superior al umbral de parada.

**Causas probables:**
1. La función de simulación de fallas está habilitada
2. Configuración incorrecta del umbral
3. Configuración incorrecta del tipo de combustible
4. Conexiones del sensor de velocidad del motor defectuosas
5. Arnés del motor defectuoso
6. Arnés de extensión defectuoso
7. Sensor de posición/velocidad del motor defectuoso

**Verificación y reparación (manual):**
- *La función de simulación de fallas está habilitada*: Conectar InPower → Comprobar que la simulación de fallas NO está habilitada para el sensor de velocidad del motor conectándolo al PCC a través de InPower. Si la simulación de fallas está habilitada, no hay ningún problema.
- *Configuración incorrecta del umbral*: Conectar InPower → Verificar que el umbral de la falla se encuentre dentro del rango de funcionamiento normal del sensor de sobrevelocidad del motor. Consultar el manual del motor para obtener información sobre los valores del umbral correctos y realizar los cambios necesarios a través de InPower.
- *Configuración incorrecta del tipo de combustible*: Conectar InPower → Verificar que la fuente de combustible ajustada con InPower coincida con el combustible utilizado por el grupo electrógeno.
- *Conexiones del sensor de velocidad del motor defectuosas*: Inspeccionar el sensor de velocidad del motor y los pasadores del arnés del motor. → Desconectar el conector del arnés del motor del sensor de velocidad del motor. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el conector del arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de posición/velocidad del motor defectuoso*: Inspeccionar el sensor de velocidad del motor. → Desconectar el sensor de posición/velocidad del motor del motor y del arnés del motor. → Revisar si los pasadores del sensor están doblados, corroídos o sueltos. → Inspeccionar si hay daños en la estructura del sensor.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.rpm` en el detalle de la alarma antes de despachar.

### 415 · Presión de aceite del motor baja — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 204 del PDF* · sistema: Aceite

**Qué detecta:** La presión de aceite del motor es menor a 26 psig (180 kpa) durante más de 10 segundos.

**Causas probables:**
1. El novel de aceite de lubricación está bajo
2. Fuga externa
3. El aceite de lubricación no cumple con las especificaciones
4. El aceite de lubricación está contaminado con refrigerante o combustible
5. La oblicuidad del motor durante la operación excede la especificación
6. La temperatura del refrigerante está sobre la especificación
7. La tubería del filtro de aceite de lubricación no está correctamente enrutada
8. El regulador principal de presión de aceite está defectuoso
9. La tubería de succión o transferencia del aceite de lubricación está suelta o rota
10. La bomba de aceite de lubricación está defectuosa
11. Se instaló el refrigerante del aceite de lubricación incorrecto
12. El refrigerante del aceite de lubricación está conectado
13. La temperatura del aceite de lubricación está sobre la especificación
14. Las boquillas de refrigeración del pistón están dañadas o no están correctamente instaladas
15. El sensor de presión de aceite no es preciso o está bloqueado
16. La simulación de fallas está habilitada o el umbral está ajustado en un valor demasiado alto

**Verificación y reparación (manual):**
- *El novel de aceite de lubricación está bajo*: Revise el nivel del aceite. Agregar o vaciar el aceite según sea necesario.
- *Fuga externa*: Inspeccionar el motor y el área circundante para ver si hay fugas externas de aceite. → Apretar tornillos, tapones de tuberías y adaptadores. → Reemplazar las empaquetaduras, si es necesario.
- *El aceite de lubricación no cumple con las especificaciones*: Verificar que el aceite de lubricación cumpla con las especificaciones exigidas en el manual del motor. → Verificar que no se agregó aceite alternativo ni aditivos durante la vida útil del aceite. → Verificar la antigüedad del aceite de lubricación. → Si es necesario, tomar una muestra de aceite. Consultar los boletines de técnicas de análisis de aceite para obtener instrucciones acerca de cómo tomar una muestra de aceite.
- *El aceite de lubricación está contaminado con refrigerante o combustible*: Consultar el árbol de síntomas de aceite de lubricación contaminado para obtener la localización de averías correcta.
- *La oblicuidad del motor durante la operación excede la especificación*: Verificar si el contenedor del equipo de arriendo está a nivel o cerca del nivel. → Consultar la especificación del motor para determinar el valor de oblicuidad adecuado.
- *La temperatura del refrigerante está sobre la especificación*: Leer la temperatura del refrigerante del motor en la pantalla o mediante la herramienta de servicio InPower. → Comparar la temperatura del refrigerante contra la temperatura esperada del refrigerante para dicho modelo de motor. Estos datos se pueden encontrar en el manual del motor. → Si la temperatura del refrigerante está fuera del rango esperado, consultar la localización de averías FC 146 para obtener la solución de problemas de temperatura del refrigerante sobre lo normal.
- *La tubería del filtro de aceite de lubricación no está correctamente enrutada*: Inspeccionar las tuberías del filtro de aceite de lubricación. → Si el enrutamiento es un problema, consultar el procedimiento para la tubería del aceite de lubricación en el manual del motor.
- *El regulador principal de presión de aceite está defectuoso*: Inspeccionar el émbolo y el diámetro del émbolo para ver si está mellado o rayado. → Verificar que el émbolo se mueva libremente en el diámetro. → Medir el resorte regulador de presión a las siguientes alturas: → A 41,25 mm (1,624 pulgadas) la presión debe ser 127 N (29 lb) por lo menos.
- *La tubería de succión o transferencia del aceite de lubricación está suelta o rota*: Inspeccionar la tubería de succión o de transferencia de aceite de lubricación para ver si hay fugas. Inspeccionar visualmente si hay roturas, abolladuras o desgaste. → Inspeccionar los tornillos para buscar signos de fugas. → Inspeccionar la empaquetaduras y anillos "O" para buscar signos de daños, desgaste excesivo o compresión.
- *La bomba de aceite de lubricación está defectuosa*: Revisar si hay juego en la bomba de aceite. → Se debe reemplazar la bomba si el juego no está dentro de 0,170 mm (0,007 pulgadas) mínimo y 0,300 mm (0,012 pulgadas) máximo. → Inspeccionar los engranajes de la bomba de aceite para ver si hay picaduras, roturas o desgaste excesivo. → Si se sospecha que pasaron desechos por la bomba, se puede retirar la placa de la cubierta posterior para inspeccionar el daño interno.
- *Se instaló el refrigerante del aceite de lubricación incorrecto*: Revisar si está instalado el refrigerante del aceite de lubricación con el número de pieza correcto. Verificar según el manual de piezas correcto.
- *El refrigerante del aceite de lubricación está conectado*: Inspeccionar visualmente la limpieza del refrigerante de aceite. → Consultar el manual del motor para obtener instrucciones acerca de cómo limpiar la carcasa del refrigerante de aceite.
- *La temperatura del aceite de lubricación está sobre la especificación*: Leer la temperatura del aceite del motor en la pantalla o mediante la herramienta de servicio InPower. → Comparar la temperatura del aceite contra la temperatura esperada del aceite. Consultar la especificación del refrigerante o del calefactor del bloque para un motor que no está en funcionamiento. → Si la temperatura del aceite está fuera del rango esperado, consultar la localización de averías FC 421 para obtener la solución de problemas de temperatura del refrigerante sobre lo normal.
- *Las boquillas de refrigeración del pistón están dañadas o no están correctamente instaladas*: Inspeccionar el tornillo y la boquilla de refrigeración del pistón para ver si hay daños. → Revisar si hay fugas no está correctamente asentado.
- *El sensor de presión de aceite no es preciso o está bloqueado*: Conectar un manómetro de aceite mecánico de calidad y precisión reconocida al motor en uno de los enchufes situados en la parte superior de la cabeza del filtro de aceite. → Conectar InPower. → Con el motor parado, comparar la lectura de presión del aceite de la herramienta de servicio con la lectura del manómetro de presión mecánico. → Solo se debe continuar una vez finalizado el procedimiento de localización de averías y reparaciones. No se debe intentar arrancar el motor si hay una duda respecto de la presión de aceite.
- *La simulación de fallas está habilitada o el umbral está ajustado en un valor demasiado alto*: Conectar al control con InPower y asegurarse de que la simulación de fallas para presión baja del aceite no está habilitada. → A través de la herramienta de servicio electrónica, comprobar que el umbral de la falla no se encuentra dentro del rango de funcionamiento normal para el sensor de presión de aceite. Consultar el manual del motor básico para obtener información sobre el rango de funcionamiento normal.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.oil_pressure` en el detalle de la alarma antes de despachar.

### 418 · Agua en el combustible — no indicado en el manual (inferido: warning)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Combustible

**Qué detecta:** Código de evento para salidas del cliente (sensor de agua en el separador).

**Desde Wanomi:** ver la tendencia de `cummins-pcc.fuel_rate / fuel_level` en el detalle de la alarma antes de despachar.

### 421 · Alta temperatura del aceite del motor — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 207 del PDF* · sistema: Aceite

**Qué detecta:** El control detectó que la temperatura del aceite del motor excedió el umbral de advertencia.

**Causas probables:**
1. Alta temperatura ambiental
2. Radiador bloqueado
3. Persianas cerradas o dañadas
4. Las aletas del enfriador de carga de aire o las aletas del radiador están dañadas u obstruidas.
5. El nivel de refrigerante es inferior a la especificación
6. El carenado del ventilador está dañado o los deflectores de recirculación de aire están dañados
7. La correa del ventilador está rota o suelta
8. El mando de ventilador o los controles del ventilador tienen fallas
9. El termostato está defectuoso
10. La manguera del sistema de refrigeración está colapsada, obstruida o con fugas
11. La temperatura del aire del múltiple de entrada está sobre la especificación
12. La bomba de agua no está funcionando bien
13. Sensor de temperatura del aceite del motor impreciso o defectuoso
14. La simulación de fallas está habilitada
15. El umbral ajustado es demasiado alto

**Verificación y reparación (manual):**
- *Alta temperatura ambiental*: Verificar con un termopar la temperatura del aire que ingresa a la persiana de entrada del generador. → Reducir las cargas o la recirculación del aire de descarga en el generador en ambientes con temperaturas elevadas.
- *Radiador bloqueado*: Inspeccionar el radiador para ver si hay desechos u obstrucciones. → Retirar el bloqueo o la cubierta contra el frío según corresponda.
- *Persianas cerradas o dañadas*: Inspeccionar el correcto funcionamiento de las persianas. → Repararlas o reemplazarlas si están dañadas. → Revisar el correcto funcionamiento del motor de la persiana. → Si el motor de la persiana está funcionando, verificar que la válvula termostato de la persiana esté funcionando.
- *Las aletas del enfriador de carga de aire o las aletas del radiador están dañadas u obstruidas.*: Inspeccionar si hay suciedad, desechos u obstrucciones. → Limpiar si es necesario.
- *El nivel de refrigerante es inferior a la especificación*: Inspeccionar el motor, el sistema de refrigeración y el área circundante para ver si hay fugas externas de refrigerante. → Reparar según se requiera. → Inspeccionar mediante la mirilla que el nivel de refrigerante esté correcto. → Agregar refrigerante según sea necesario.
- *El carenado del ventilador está dañado o los deflectores de recirculación de aire están dañados*: Inspeccionar el carenado y los deflectores para ver si hay daños y holguras. → Repararlas o reemplazarlas si están dañadas.
- *La correa del ventilador está rota o suelta*: Inspeccionar las correas para ver si hay daños, desgaste y que tengan la tensión correcta. → Repararlas o reemplazarlas si están dañadas.
- *El mando de ventilador o los controles del ventilador tienen fallas*: Inspeccionar las poleas y el tensor de la correa para ver si hay daños o desgaste. → Repararlas o reemplazarlas si están dañadas.
- *El termostato está defectuoso*: Retirar el termostato e inspeccionar/revisar el funcionamiento correcto. → Reemplazar si está dañado o funcionando en forma incorrecta.
- *La manguera del sistema de refrigeración está colapsada, obstruida o con fugas*: Inspeccionar las mangueras superiores e inferiores del radiador para ver si hay colapsos, deformaciones o fugas del fluido. → Reemplazarla si está dañada o gastada.
- *La temperatura del aire del múltiple de entrada está sobre la especificación*: Verificar la temperatura del aire del múltiple con el termopar. → Reparar o reemplazar los componentes defectuosos del posenfriador.
- *La bomba de agua no está funcionando bien*: Inspeccionar el correcto funcionamiento de la bomba de agua. → Reemplazarla si está dañada o gastada.
- *Sensor de temperatura del aceite del motor impreciso o defectuoso*: Usar un termopar o un dispositivo similar para medir la temperatura del aceite cerca del emisor y compararla con la temperatura que se muestra del aceite. → Verificar la resistencia del emisor de temperatura y compararla con las especificaciones detalladas en el manual del motor. → Verificar la continuidad desde el pasador con cable del emisor hasta el pasador del ECM del motor. La resistencia del arnés debe ser inferior a 5 ohmios. → Reparar o reemplazar los componentes o alambrados defectuosos.
- *La simulación de fallas está habilitada*: Usar la herramienta de servicio para conectarse al ECM del motor y verificar que la anulación de fallas esté desactivada. → Volver a configurar el generador y desactivar las anulaciones de fallas.
- *El umbral ajustado es demasiado alto*: Usar la herramienta de servicio para conectarse al ECM del motor y verificar el ajuste del umbral de fallas y compararlo con las especificaciones detalladas en el manual del motor. → Verificar que el número de calibración y revisión del ECM y PCC esté correcto. → Recalibrar el ECM del motor para reposicionar los ajustes del umbral.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.oil_pressure` en el detalle de la alarma antes de despachar.

### 426 · El enlace de datos J1939 no puede transmitir — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 210 del PDF* · sistema: Comunicación con el motor (ECM / CAN)

**Qué detecta:** Se perdió la comunicación entre el ECM y otro dispositivo en el enlace de datos SAE J1939.

**Causas probables:**
1. Error de comunicación
2. Arnés del motor defectuoso

**Verificación y reparación (manual):**
- *Error de comunicación*: Comprobar la comunicación del ECM con InSite. → Conectar ek adaptador del enlace de datos EN LÍNEA al conector de diagnóstico del enlace de datos SAE J1939. → Intentar comunicarse con el ECM mediante InSite.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el conector del arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.

### 427 · Enlace de datos CAN degradado — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 210 del PDF* · sistema: Comunicación con el motor (ECM / CAN)

**Qué detecta:** La comunicación entre el módulo de control del motor (ECM) y el control del grupo electrógeno está cortada.

**Causas probables:**
1. El ECM del motor perdió la energía o falló
2. El enlace de datos de CAN falló

**Verificación y reparación (manual):**
- *El ECM del motor perdió la energía o falló*: El botón de parada de emergencia es un relé cerrado cuando no está presionado (no activo) y un relé abierto cuando está presionado (activo). El botón de parada de emergencia en el tablero del operador deshabilita la energía al ECM del motor cuando está presionado (activo); la comunicación del enlace de CAN cesa cuando se pierde la energía al ECM. Asegurarse de que el botón de parada de emergencia no esté activado en el control. Seguir el procedimiento que se indica a continuación: Reposicionar el botón de parada de emergencia local/remota → Liberar el botón de parada de emergencia local/remota (no activo). → Presionar el botón de apagado en el tablero del operador. → Presionar el botón de reposición.
- *El enlace de datos de CAN falló*: Hay una conexión del arnés del enlace de datos defectuosa o un circuito abierto; revisar el arnés del enlace de datos y los pasadores del conector desde J11-20 hasta J1939+ y desde J11-19 hasta J1039-; revisar también la conexión a tierra del blindaje en J11-17. → Revisar las resistencias de terminación. Con el conector J11 desconectado de la tarjeta de circuitos básicos y la conexión de enlace de datos del motor desconectada del control del ECM, medir la resistencia entre los pasadores J11-19 y J11-20 (60 ohmios es satisfactoria). Si la resistencia no es de 60 ohmios, revisar las resistencias de terminación. Cada una de las dos resistencias de terminación debe ser de 120 ohmios; si no es así, sustituir.

### 436 · Temperatura del múltiple de admisión FDR AUX 101 — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 211 del PDF* · sistema: Refrigeración

**Qué detecta:** El voltaje del sensor de temperatura del múltiple de admisión está fuera de rango.

**Causas probables:**
1. Conexiones del sensor de temperatura del múltiple de admisión defectuosas
2. Sensor de temperatura del múltiple de admisión defectuoso
3. Arnés del motor defectuoso
4. Arnés de extensión defectuoso
5. Verificar las calibraciones del controlador

**Verificación y reparación (manual):**
- *Conexiones del sensor de temperatura del múltiple de admisión defectuosas*: Inspeccionar el sensor de temperatura del múltiple de admisión y los pasadores del conector del arnés del motor. → Desconectar el conector del arnés del motor del sensor de temperatura del múltiple de admisión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de temperatura del múltiple de admisión defectuoso*: Comprobar la resistencia del sensor. → Desconectar el conector del arnés del motor del sensor de temperatura del múltiple de admisión. → Medir la resistencia entre el pasador de señal del sensor de temperatura del múltiple de admisión y el pasador de retorno del sensor de temperatura del múltiple de admisión.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el conector del arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar los pasadores del conector del arnés de extensión. → Desconectar el conector del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Verificar las calibraciones del controlador*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web InCal, la calibración es correcta. En caso contrario, actualice la calibración al valor más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

### 441 · Bajo voltaje de la batería — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 214 del PDF* · sistema: Batería y carga

**Qué detecta:** Bajo voltaje de la batería.

**Causas probables:**
1. Conexiones dañadas de los cables de la batería
2. Bajo voltaje de la batería
3. Mala conexión a tierra de la batería
4. Cableado de los accesorios dañado en B+
5. Arnés de la batería del OEM dañado
6. Arnés del motor dañado
7. Batería descargada o defectuosa
8. El alternador no funciona correctamente
9. Configuración incorrecta de la batería NOTA:       Número de pieza 3822758: cable de prueba Deutsch/AMP/Metri-Pack macho Número de pieza 3822917: cable de prueba Deutsch/AMP/Metri-Pack hembra

**Verificación y reparación (manual):**
- *Conexiones dañadas de los cables de la batería*: Inspeccionar las conexiones de los cables de la batería. → Inspeccionar si las conexiones están corroídas. → Inspeccionar si alguna conexión no está bien instalada.
- *Bajo voltaje de la batería*: Medir el voltaje de la batería. → Medir el voltaje de la batería desde el terminal positivo (+) al terminal negativo (- ). Si el voltaje se encuentra entre 11,0 y 14,2 V en un sistema de 12 VCC y 17,3 y 34,7 V en un sistema de 24 VCC, el voltaje se encuentra dentro del rango normal.
- *Mala conexión a tierra de la batería*: Inspeccionar la conexión a tierra de la batería. → Desconectar el arnés del motor. → Medir la resistencia del terminal negativo (-) de la batería al borne del bloque del motor. Si la resistencia es inferior a 10 ohmios, la conexión a tierra es correcta. Si la resistencia es superior a 10 ohmios, es necesario reparara la conexión a tierra de la batería.
- *Cableado de los accesorios dañado en B+*: Comprobar cableado de los complementos o accesorios del terminal positivo (+) de la batería. → Arrancar en el terminar positivo (+), seguir el cableado de los complementos o accesorios y comprobar si existen daños en el aislamiento o algún error de instalación que puedan provocar un cortocircuito del cable de alimentación con el bloque del motor.
- *Arnés de la batería del OEM dañado*: Inspeccionar el arnés de la batería del OEM y los pasadores del conector E en línea. → Desconectar el arnés de la batería del OEM del conector E en línea. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés del motor dañado*: Inspeccionar la conexión de los fusibles del arnés del motor. Inspeccionar si la instalación es correcta. → Comprobar el fusible del arnés del motor. → Desconectar el fusible de 20 amperios del arnés del OEM. → Inspeccionar el fusible de 20 amperios para comprobar que no está fundido.
- *Batería descargada o defectuosa*: Medir el voltaje de la batería con un voltímetro. El voltaje de la batería debe ser de 12 VCC o superior en un sistema de 12 V o de 24 VCC o superior en un sistema de 24 V. Si el voltaje de la batería es bajo, revisar el nivel de electrólitos. Restituir el nivel del electrólito si está bajo y recargar la batería; la gravedad específica de una batería de plomo cargada completamente es de aproximadamente 1,260 a 80 °F (27 °C). → Si la batería no puede retener el voltaje adecuado, sustituir la batería.
- *El alternador no funciona correctamente*: Revisar el alternador de CC del motor. Si el voltaje de carga no está entre 12 y 14 VCC en un sistema de 12 V o de 24 a 26 VCC en un sistema de 24 V, sustituir el alternador de CC.
- *Configuración incorrecta de la batería*: Verificar que el voltaje de la batería (12 V o 24 V) coincide con la calibración.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.battery_voltage` en el detalle de la alarma antes de despachar.

### 442 · Alto voltaje de la batería — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 217 del PDF* · sistema: Batería y carga

**Qué detecta:** Alto voltaje de la batería.

**Causas probables:**
1. Configuración incorrecta del voltaje de la batería.
2. El voltaje de la batería está por encima del umbral de voltaje alto de la batería
3. El cargador de baterías está sobrecargando la batería
4. Alternador de CC del motor defectuoso NOTA:       Número de pieza 3822758: cable de prueba Deutsch/AMP/Metri-Pack macho Número de pieza 3822917: cable de prueba Deutsch/AMP/Metri-Pack hembra

**Verificación y reparación (manual):**
- *Configuración incorrecta del voltaje de la batería.*: Medir el voltaje de la batería con un voltímetro. El voltaje de las baterías de plomo deben estar entre 12 y 14 VCC en un sistema de 12 VCC o entre 24 y 28 VCC en un sistema de 24 VCC. Verificar que el voltaje de la batería coincida con el voltaje para el que está calibrado el control. Si el grupo electrógeno tiene una batería de 24 V pero el control está calibrado en 12 V, se activará la alarma de alto voltaje de batería. En estos casos, cambiar el voltaje en el control a 24 V mediante InPower.
- *El voltaje de la batería está por encima del umbral de voltaje alto de la batería*: El voltaje de la batería está por encima del umbral de voltaje de batería alto para el tiempo establecido en el parámetro “High Battery Set Time” (Tiempo de ajuste de alto voltaje de batería). Cambiar según corresponda la configuración del voltaje de la batería con InPower.
- *El cargador de baterías está sobrecargando la batería*: Asegurarse de que el cargador de la batería esté cargando la batería a un nivel aceptable y no esté sobrecargándola. Ajustar el nivel de carga del cargador de baterías si éste es superior al recomendado por el fabricante. → Consultar el manual OEM del cargador de la batería.
- *Alternador de CC del motor defectuoso*: Revisar el alternador de CC del motor en busca de sobrecargas. Si el voltaje de carga no es de 12 a 14 VCC en sistemas de 12 VCC o de 24 a 28 VCC en un sistema de 24 VCC, sustituir el alternador de CC.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.battery_voltage` en el detalle de la alarma antes de despachar.

### 488 · Alta temperatura del múltiple de admisión — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 218 del PDF* · sistema: Refrigeración

**Qué detecta:** La temperatura del múltiple de admisión superó los 185° F (85° C) durante más de 90 segundos.

**Causas probables:**
1. Alta temperatura ambiental
2. Radiador bloqueado
3. Persianas cerradas o dañadas
4. Las aletas del enfriador de carga de aire o las aletas del radiador están dañadas u obstruidas.
5. La correa del ventilador está rota o suelta
6. El mando de ventilador o los controles del ventilador tienen fallas
7. Sensor de temperatura del refrigerante impreciso
8. La función de simulación de fallas está habilitada
9. Configuración incorrecta del umbral

**Verificación y reparación (manual):**
- *Alta temperatura ambiental*: Verificar con un termopar la temperatura del aire que ingresa a la persiana de entrada del generador. → Reducir las cargas o la recirculación del aire de descarga en el generador en ambientes con temperaturas elevadas.
- *Radiador bloqueado*: Inspeccionar el radiador para ver si hay desechos u obstrucciones. → Retirar el bloqueo o la cubierta contra el frío según corresponda.
- *Persianas cerradas o dañadas*: Inspeccionar el correcto funcionamiento de las persianas. → Repararlas o reemplazarlas si están dañadas. → Revisar el correcto funcionamiento del motor de la persiana. → Si el motor de la persiana está funcionando, verificar que la válvula termostato de la persiana esté funcionando.
- *Las aletas del enfriador de carga de aire o las aletas del radiador están dañadas u obstruidas.*: Inspeccionar si hay suciedad, desechos u obstrucciones. → Limpiar si es necesario.
- *La correa del ventilador está rota o suelta*: Inspeccionar las correas para ver si hay daños, desgaste y que tengan la tensión correcta. → Repararlas o reemplazarlas si están dañadas.
- *El mando de ventilador o los controles del ventilador tienen fallas*: Inspeccionar las poleas y el tensor de la correa para ver si hay daños o desgaste. → Repararlas o reemplazarlas si están dañadas.
- *Sensor de temperatura del refrigerante impreciso*: Usar un termopar o un dispositivo similar para medir la temperatura del refrigerante cerca del emisor y compararla con la temperatura que se muestra del refrigerante. → Verificar la resistencia del emisor de temperatura y compararla con las especificaciones detalladas en el manual del motor. → Verificar la continuidad desde cable del emisor de temperatura hasta el ECM del motor. La resistencia del arnés debe ser inferior a 5 ohmios. → Reparar o reemplazar los componentes o alambrados defectuosos.
- *La función de simulación de fallas está habilitada*: Usar la herramienta de servicio para conectarse al ECM del motor y verificar que la anulación de fallas esté desactivada. → Volver a configurar el generador y desactivar las anulaciones de fallas.
- *Configuración incorrecta del umbral*: Usar la herramienta de servicio para conectarse al ECM del motor y verificar el ajuste del umbral de fallas y compararlo con las especificaciones detalladas en el manual del motor. → Verificar que el número de calibración y revisión del ECM y PCC esté correcto. → Recalibrar el ECM del motor para reposicionar los ajustes del umbral.

### 781 · Falló el enlace de datos de CAN del ECM — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 220 del PDF* · sistema: Comunicación con el motor (ECM / CAN)

**Qué detecta:** La comunicación entre el módulo de control del motor (ECM) y el control del grupo electrógeno está cortada.

**Causas probables:**
1. El ECM del motor perdió la energía o falló
2. El enlace de datos de CAN falló

**Verificación y reparación (manual):**
- *El ECM del motor perdió la energía o falló*: Revisar el alambrado de la tarjeta de circuitos básicos. → El relé de control del interruptor con llave es un relé normalmente abierto. Asegurarse de que B+ esté disponible en la entrada del relé y, a continuación, medir la salida de voltaje. Si hay B+ en la entrada y en la salida del relé de control del interruptor con llave, el relé no está averiado. Si hay B+ en la entrada pero no en la salida del relé del interruptor con llave, sustituir el relé. → Conectar al ECM del motor con InPower y/o Insite para verificar que el ECM esté funcionando correctamente y se esté comunicando con la red de enlace de datos de CAN. Consultar el manual de servicio del motor para obtener los procedimientos de localización de averías del ECM; si el ECM está defectuoso, reemplazarlo.
- *El enlace de datos de CAN falló*: Hay una conexión defectuosa del arnés de enlace de datos o un circuito abierto; inspeccionar el arnés de enlace de datos o los pasadores del conector. Comprobar además la conexión a tierra del blindaje. → Revisar las resistencias de terminación. Con el conector desconectado de la tarjeta de circuitos básicos y la conexión de enlace de datos del motor desconectada del control del ECM, medir la resistencia entre los pasadores (60 ohmios es satisfactoria). Si la resistencia no es de 60 ohmios, revisar las resistencias de terminación. Cada una de las dos resistencias de terminación debe ser de 120 ohmios; si no es así, sustituir.

### 1117 · Pérdida de energía del ECM — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 220 del PDF* · sistema: Comunicación con el motor (ECM / CAN)

**Qué detecta:** Indica que NO se apagó el ‘Interruptor con llave’ del ECM 30 segundos antes de quitarle la alimentación de batería al ECM (es decir, antes de quitar los conectores o el cable de la batería).

**Verificación y reparación (manual):**
- *Para restablecer, presionar el botón Off (Apagar), presionar E-Stop (Para de emergencia), esperar 30 segundos; luego eliminar la E-Stop y seleccionar el modo de funcionamiento que desea (manual o remoto).*

### 1123 · Parada después de derivación — no indicado en el manual (inferido: shutdown)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Arranque y parada

**Qué detecta:** Se desactivó el modo en derivación después de una parada anulada.

### 1131 · Modo en derivación (battle short) activo — no indicado en el manual (inferido: warning)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Modo de operación

**Qué detecta:** Las paradas por falla están anuladas salvo sobrevelocidad, pérdida de velocidad, falla de excitación y paradas de emergencia. Supervisar el grupo.

### 1244 · Parada normal del motor — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 221 del PDF* · sistema: Arranque y parada

**Qué detecta:** El motor recibió una solicitud de parada normal y no hay ninguna parada activa con falla de enfriamiento en el PCC (LBNG).

**Verificación y reparación (manual):**
- *El grupo electrógeno realiza una parada normal.*: El grupo electrógeno realiza una parada normal y no hay paradas por falla activas en el ECM durante al menos 2 segundos.

### 1245 · Falla de parada de motor — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 221 del PDF* · sistema: Arranque y parada

**Qué detecta:** Se produjo una falla de parada de motor en el ECM del motor y no hay otras fallas de parada activas en el PCC.

**Causas probables:**
1. Falla de parada de motor

**Verificación y reparación (manual):**
- *Falla de parada de motor*: Otra parada por falla activa del ECM activó el código de evento/falla 1245. Conectar al ECM del motor con InPower o Insite para determinar la parada por falla actual que genera el código de evento/falla 1245; luego, localizar las averías de la parada por falla (consultar el Manual de servicio del motor).

### 1248 · Advertencia de motor — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 221 del PDF* · sistema: Comunicación con el motor (ECM / CAN)

**Qué detecta:** Se produjo una falla de advertencia del motor en el ECM del motor y no hay fallas de advertencia activas en el PCC.

**Causas probables:**
1. Se activó una falla de advertencia del motor.

**Verificación y reparación (manual):**
- *Se activó una falla de advertencia del motor.*: Otra falla de advertencia activa en el ECM activó el código de evento/falla 1248. Conectar al ECM del motor con InPower o Insite para determinar la falla de advertencia actual que genera el código de evento/falla 1248; luego, localizar las fallas de advertencia (consultar el Manual de servicio del motor).

### 1311 · Bandeja de rupturas — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 222 del PDF* · sistema: Arranque y parada

**Qué detecta:** Esta falla se usa cuando se instala un conmutador opcional de bandeja de rupturas. La naturaleza del fallo es una selección opcional del cliente. La función de falla se puede programar (usando la herramienta de servicio InPower) de la siguiente manera: · Habilitar o inhabilitar entrada (predeterminado: habilitar) · Estado, advertencia o parada (predeterminado: #1-ninguna, #2 y #3-advertencia) · Activo cerrado o abierto (predeterminado: cerrado [a tierra]) · Cambiar el nombre indicado en pantalla empleando hasta 19 caracteres (predeterminado: #1- Customer Fault 1 [Falla de entrada del cliente 1], #2-Ground Fault [Falla a tierra], #3- Low Fuel [combustible bajo]) La naturaleza del fallo es una selección opcional del cliente. Entradas de ejemplo: Low Fuel Day Tank (Bajo nivel de combustible en tanque de uso diario), Water In Fuel (Agua en combustible), Ground Fault (Pérdida a tierra), Low Starting Hydraulic Pressure (Baja presión hidráulica de inico), Low Starting Air Pressure (Baja presión de aire de inicio), etc. Cada una de las funciones de falla se puede programar (con la herramienta de servicio InPower) de la siguiente manera: · Habilitar o inhabilitar entrada (predeterminado: habilitar) · Estado, advertencia o parada (predeterminado: #1-ninguna, #2 y #3-advertencia) · Activo cerrado o abierto (predeterminado: cerrado [a tierra]) · Cambiar el nombre indicado en pantalla empleando hasta 19 caracteres (predeterminado: #1- Customer Fault 1 [Falla de entrada del cliente 1], #2-Ground Fault [Falla a tierra], #3- Low Fuel [combustible bajo])

**Verificación y reparación (manual):**
- *Desconecte el conductor de señal de TB1 y reposicione el control.*: CONFIG INPUT 1 (Entrada configurable 1) - TB1-12
- *Si ese es el mensaje que aparece, el alambrado externo tiene un cortocircuito. La conexión a tierra de una de las entradas activa la falla. 9.8.31 Códigos 1311 y 1312: entradas #1 y #2 del cliente (Advertencia o parada)*
- *Desconecte el conductor de señal de TB1 y reposicione el control.*: ENTRADA CONFIGURABLE 1 - TB1-12 → ENTRADA CONFIGURABLE 2 - TB1-14
- *Si ese es el mensaje que aparece, el alambrado externo tiene un cortocircuito. La conexión a tierra de una de las entradas activa la falla.*

### 1312 · Entrada #2 del cliente — no indicado en el manual (inferido: configurable)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Combustible

**Qué detecta:** Entrada de falla configurable por el cliente (ej. agua en combustible, tanque diario bajo, falla a tierra).

### 1317 · Nivel de refrigerante bajo — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 223 del PDF* · sistema: Refrigeración

**Qué detecta:** Esta falla se usa cuando está instalado un sensor opcional de nivel de refrigerante. La naturaleza del fallo es una selección opcional del cliente. La función de falla se puede programar (usando la herramienta de servicio InPower) de la manera siguiente: · Habilitar o inhabilitar entrada (predeterminado: habilitar) · Estado, advertencia o parada (predeterminado: #1-ninguna, #2 y #3-advertencia) · Activo cerrado o abierto (predeterminado: cerrado [a tierra]) · Cambiar el nombre indicado en pantalla empleando hasta 19 caracteres (predeterminado: #1- Customer Fault 1 [Falla de entrada del cliente 1], #2-Ground Fault [Falla a tierra], #3- Low Fuel [combustible bajo])

**Causas probables:**
1. LOW COOLANT
2. No es una falla real, problema del alambrado externo

**Verificación y reparación (manual):**
- *LOW COOLANT*: Si el grupo electrógeno está alimentando cargas críticas y no puede pararse, esperar hasta el próximo período de parada y luego realizar los siguientes pasos. → Permita que el motor se enfríe completamente. → Revise el nivel de refrigerante y llene si está bajo.
- *No es una falla real, problema del alambrado externo*: Desconecte el conductor de señal de TB1 y reposicione el control. → CONFIG INPUT 1 (Entrada configurable 1) - TB1-13 → Si ese es el mensaje que aparece, el alambrado externo tiene un cortocircuito. La conexión a tierra de una de las entradas activa la falla.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.coolant_temp` en el detalle de la alarma antes de despachar.

### 1318 · Combustible bajo — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 223 del PDF* · sistema: Combustible

**Qué detecta:** Esta falla se usa cuando está instalado un sensor opcional de nivel de combustible bajo. La naturaleza del fallo es una selección opcional del cliente. La función de falla puede se programar (usando la herramienta de servicio InPower) de la manera siguiente: · Habilitar o inhabilitar entrada (predeterminado: habilitar) · Estado, advertencia o parada (predeterminado: #1-ninguna, #2 y #3-advertencia) · Activo cerrado o abierto (predeterminado: cerrado [a tierra]) · Cambiar el nombre indicado en pantalla empleando hasta 19 caracteres (predeterminado: #1- Customer Fault 1 [Falla de entrada del cliente 1], #2-Ground Fault [Falla a tierra], #3- Low Fuel [combustible bajo])

**Causas probables:**
1. Nivel de combustible bajo
2. No es una falla real, problema del alambrado externo

**Verificación y reparación (manual):**
- *Bajo nivel de combustible.*: Añada combustible.
- *No es una falla real, problema del alambrado externo.*: Desconecte el conductor de señal de TB1 y reposicione el control. → CONFIG INPUT 1 (Entrada configurable 1) - TB1-14 → Si ese es el mensaje que aparece, el alambrado externo tiene un cortocircuito. La conexión a tierra de una de las entradas activa la falla.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.fuel_rate / fuel_level` en el detalle de la alarma antes de despachar.

### 1416 · Falla de parada anulada por derivación — no indicado en el manual (inferido: warning)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Arranque y parada

**Qué detecta:** Ocurrió una falla de parada pero el grupo sigue en marcha porque el modo en derivación está activo.

### 1417 · Falla de apagado — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 224 del PDF* · sistema: Arranque y parada

**Qué detecta:** El PCC no pudo ingresar al modo inactivo.

**Causas probables:**
1. Tarjeta de circuitos básicos averiada

**Verificación y reparación (manual):**
- *Tarjeta de circuitos básicos averiada*: Desconectar la alimentación (B+) del PCC durante 5 a 10 segundos y volver a conectar B+ al PCC. Si el PCC no ingresa al modo inactivo después de que la alimentación se desconecta y se vuelve a conectar, y muestra el código de evento/falla 1417 nuevamente, reemplazar la tarjeta de circuitos básicos.

### 1433 · Parada de emergencia local — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 224 del PDF* · sistema: Arranque y parada

**Qué detecta:** Se ha activado la parada de emergencia local.

**Causas probables:**
1. Se activó el botón de parada de emergencia local.
2. Conexión o interruptor de parada de emergencia defectuosos.

**Verificación y reparación (manual):**
- *Se activó el botón de parada de emergencia local.*: Para reposicionar la parada de emergencia local: → Tirar del botón de parada de emergencia local. → Presionar el botón de apagado. → Presionar el botón de reposición.
- *Conexión o interruptor de parada de emergencia defectuosos.*: Verifique que el botón de parada de emergencia funcione correctamente. El botón de parada de emergencia es un relé cerrado cuando no está presionado (no activo) y un relé abierto cuando está oprimido (activo). → Verificar que la conexión/alambrado desde el interruptor de parada de emergencia local hacia el PCC no presente un circuito abierto. Una conexión a tierra de la entrada de control de parada de emergencia local (J25 – Entrada 2; J25 – Conexión a tierra 6) inhabilita la alarma de parada de emergencia. Un circuito abierto debe activar la alarma de parada de emergencia. J25 – Entrada 2 J25 - Conexión a tierra 6

### 1434 · Parada de emergencia remota — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 225 del PDF* · sistema: Arranque y parada

**Qué detecta:** Se ha activado una parada de emergencia remota.

**Causas probables:**
1. Se activó el botón de parada de emergencia remota.
2. Conexión o interruptor de parada de emergencia defectuosos.

**Verificación y reparación (manual):**
- *Se activó el botón de parada de emergencia remota.*: Restablecer la parada de emergencia remota: → Tirar del botón de parada de emergencia remota. → Presionar el botón de apagado. → Presionar el botón de reposición.
- *Conexión o interruptor de parada de emergencia defectuosos.*: Verifique que el botón de parada de emergencia funcione correctamente. El botón de parada de emergencia es un relé cerrado cuando no está presionado (no activo) y un relé abierto cuando está oprimido (activo). → Verificar que la conexión/alambrado desde el interruptor de parada de emergencia remota hacia el PCC no presente un circuito abierto. Una conexión a tierra de la entrada de control de parada de emergencia remota (TB1 – Entrada 16; TB1 – Conexión a tierra 15) inhabilita la alarma de parada de emergencia. Un circuito abierto debe activar la alarma de parada de emergencia. TB1 – Entrada 16 TB1 – Conexión a tierra 15

### 1435 · Baja temperatura del refrigerante — no indicado en el manual (inferido: warning)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Refrigeración

**Qué detecta:** Refrigerante bajo el umbral LCT (ajustable −17,8…37,8 °C) durante 1 minuto: el grupo arrancaría frío (calefactor de bloque).

**Desde Wanomi:** ver la tendencia de `cummins-pcc.coolant_temp` en el detalle de la alarma antes de despachar.

### 1438 · Falla de arranque — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 226 del PDF* · sistema: Arranque y parada

**Qué detecta:** El motor no arranca después de que el control del generador recibe una señal de partida.

**Causas probables:**
1. Batería descargada o débil
2. Fusible de alimentación de 20 Amp quemado
3. Partidor defectuoso
4. Solenoide del partidor defectuoso
5. Relé del partidor defectuoso
6. El motor o el rotor están bloqueados o atascados
7. Conmutador o alambrado de parada de emergencia defectuoso

**Verificación y reparación (manual):**
- *Batería descargada o débil*: Verificar que el voltaje de la batería sea de 12 VCC por lo menos (24 VCC donde corresponda). → Cargar o reemplazar la batería, según sea necesario.
- *Fusible de alimentación de 20 Amp quemado*: Verificar que el fusible de alimentación conmutado B+ esté en su lugar y operativo. → Reemplazar el fusible según sea necesario.
- *Partidor defectuoso*: Presionar el botón Reposicionar/Reconocimiento de falla en la pantalla. → Intentar poner en marcha el generador y probar B+ en el borne de alimentación del partidor. → Si hay B+ en el borne de suministro del partidor, el partidor puede estar defectuoso.
- *Solenoide del partidor defectuoso*: Presionar el botón Reposicionar/Reconocimiento de falla en la pantalla. → Revisar la continuidad del alambrado entre el terminal 87 en el relé del partidor y el terminal SW del solenoide de arranque. La resistencia debe ser inferior a 5 ohmios. → Intentar poner en marcha el generador y probar B+ en el terminal SW del solenoide del partidor. → Revisar la continuidad del alambrado entre el terminal COM del solenoide y el borne B+ del solenoide del partidor. La resistencia debe ser inferior a 5 ohmios.
- *Relé del partidor defectuoso*: Revisar la continuidad del alambrado entre el terminal 86 en el relé del partidor y el terminal J20-13 del panel de control. La resistencia debe ser inferior a 5 ohmios. → Revisar la continuidad del alambrado entre el terminal 85 en el relé del partidor y el terminal J20-15 del panel de control. La resistencia debe ser inferior a 5 ohmios. → Revisar si hay B+ en el terminal 30 en el relé del partidor. Si no hay voltaje, verificar que el fusible de 20 Amp esté en su lugar y que esté operativo. → Intentar poner en marcha el generador y probar B+ en el terminal 86 del relé del partidor.
- *El motor o el rotor están bloqueados o atascados*: Verificar que el generador pueda girar libremente al mover el motor con la mano. Si no se puede hacer girar el generador, identificar el origen del atasco y reparar según sea necesario.
- *Conmutador o alambrado de parada de emergencia defectuoso*: Presionar el botón de parada de emergencia, retirar los conductores configurables de TB1–15 y TB1–16 y revisar la continuidad entre estos dos conductores. → Si el circuito está abierto, aislar el conmutador y el alambrado de la parada de emergencia. → Presionar el botón de parada de emergencia y retirar P25 de la tarjeta de circuitos básicos. Revisar la continuidad entre J25–2 y J25–6. → Reparar o reemplazar el conmutador o el alambrado de la parada de emergencia según sea necesario.

### 1442 · Batería débil — no indicado en el manual (inferido: warning)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Batería y carga

**Qué detecta:** Tensión de batería bajo el umbral de batería débil durante el arranque (6–10 V en 12 V · 12–16 V en 24 V; retardo 1–5 s).

**Desde Wanomi:** ver la tendencia de `cummins-pcc.battery_voltage` en el detalle de la alarma antes de despachar.

### 1446 · Alto voltaje de CA — no indicado en el manual (inferido: shutdown)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Salida eléctrica (alternador / AVR)

**Qué detecta:** Tensión del alternador sobre el umbral (105–125 % del nominal) durante el retardo (1–10 s).

**Desde Wanomi:** ver la tendencia de `ATS.gen_voltage` en el detalle de la alarma antes de despachar.

### 1447 · Voltaje de CA bajo — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 227 del PDF* · sistema: Salida eléctrica (alternador / AVR)

**Qué detecta:** El voltaje de una o más de las fases cayó a menos del 85% del valor nominal durante más de 10 segundos.

**Causas probables:**
1. La función de simulación de fallas está habilitada
2. Configuración del umbral o de AVR incorrectas.
3. Sobrecarga
4. Conexiones incorrectas en los terminales de salida del generador
5. El sensor de voltaje o la configuración del alambrado de conexión pueden ser incorrectos.
6. Regulador de voltaje dañado
7. Conjunto del rectificador rotatorio (diodos CR1 a CR6) defectuoso

**Verificación y reparación (manual):**
- *La función de simulación de fallas está habilitada*: Conectar InPower. → Comprobar que la simulación de fallas NO está habilitada para el sensor de velocidad del motor conectándolo al PCC a través de InPower. Si la simulación de fallas está habilitada, no hay ningún problema.
- *Configuración del umbral o de AVR incorrectas.*: Comprobar la configuración del umbral. → Conectar InPower. → Comprobar que el umbral de falla se encuentre dentro del rango de funcionamiento normal para voltaje de CA bajo. → Verificar los ajustes de AVR. Comparar los factores de ganancia, ajuste y calibración contra las calibraciones predeterminadas.
- *Sobrecarga*: Revisar si hay sobrecarga. → Revisar si la carga está dentro del rango de funcionamiento correcto. → Revisar la corriente de entrada. → Revisar si hay puntas de corriente.
- *Conexiones incorrectas en los terminales de salida del generador*: Comprobar las conexiones. → Comparar las conexiones del generador de acuerdo al esquema de alambrado. → Corregir de acuerdo al esquema correcto según sea necesario.
- *El sensor de voltaje o la configuración del alambrado de conexión pueden ser incorrectos.*: Verificar que las entradas de detección de voltaje J22-1, J22-2, J22-3 y J22-4 estén conectadas a L1, L2, L3 y L4 respectivamente. → Verificar que las entradas de excitación J18–1 y J18–2 estén conectadas a los terminales PMG correctos del generador.
- *Regulador de voltaje dañado*: Poner el generador en ralentí. → Conectar InPower. → Con InPower, verificar que la salida de voltaje de CA sea mayor que el valor residual. → Si la salida de voltaje de CA es residual, el regulador está funcionando correctamente.
- *Conjunto del rectificador rotatorio (diodos CR1 a CR6) defectuoso*: Revisar cada diodo. Consultar el manual de servicio del alternador.

**Desde Wanomi:** ver la tendencia de `ATS.gen_voltage` en el detalle de la alarma antes de despachar.

### 1448 · Subfrecuencia — no indicado en el manual (inferido: shutdown)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Velocidad y regulación

**Qué detecta:** Frecuencia bajo el nominal menos el umbral (2–10 Hz) durante el retardo.

**Desde Wanomi:** ver la tendencia de `ATS.gen_freq` en el detalle de la alarma antes de despachar.

### 1449 · Sobrefrecuencia — no indicado en el manual (inferido: shutdown)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Velocidad y regulación

**Qué detecta:** Frecuencia sobre el nominal más el umbral (2–10 Hz) durante el retardo.

**Desde Wanomi:** ver la tendencia de `ATS.gen_freq` en el detalle de la alarma antes de despachar.

### 1463 · No en automático — no indicado en el manual (inferido: warning)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Modo de operación

**Qué detecta:** El control no está en modo Auto: el grupo NO arrancará con la señal remota (corte de red).

### 1468 · Listo para cargar — no indicado en el manual (inferido: event)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Velocidad y regulación

**Qué detecta:** El grupo alcanzó el 90 % de la velocidad y tensión nominales.

### 1469 · No coinciden velocidad y frecuencia — no indicado en el manual (inferido: shutdown)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Velocidad y regulación

**Qué detecta:** Diferencia entre velocidad y frecuencia sobre el umbral (0,1–20 Hz) durante 0,2–10 s.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.rpm` en el detalle de la alarma antes de despachar.

### 1471 · Corriente CA alta — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 229 del PDF* · sistema: Salida eléctrica (alternador / AVR)

**Qué detecta:** La salida de corriente del generador excedió por lo menos el 110% del valor nominal durante más de 60 segundos.

**Causas probables:**
1. Cortocircuito o sobrecarga
2. Transformadores de corriente (CT) incorrectos, conexiones de CT o configuración de CT incorrecta.
3. Conexiones del arnés de CT
4. Configuración de capacidad nominal incorrecta

**Verificación y reparación (manual):**
- *Cortocircuito o sobrecarga*: Inspeccionar los cables de carga y las conexiones del arnés de CA. → Desconectar el arnés de CA de los cables de carga. → Inspeccionar el arnés de CA y los pasadores del conector del tablero. → Inspeccionar visualmente si hay pasadores corroídos, doblados o rotos, y pasadores plegados o expandidos.
- *Transformadores de corriente (CT) incorrectos, conexiones de CT o configuración de CT incorrecta.*: Revisar los CT. → Revisar que se instalaron los CT correctos. → Revisar que las conexiones del CT estén aseguradas con bridas a los alambres correspondientes. → Revisar que los CT estén instalados en el orden correcto.
- *Conexiones del arnés de CT*: Medir la resistencia del arnés del CT en cada pasador. → Desconectar el conector P12 del arnés de la tarjeta de control y del CT. → Verificar la resistencia desde el conector de la tarjeta a las conexiones de CT. La resistencia debe ser 5 ohmios o menos. → Medir la resistencia en cada pasador del conector del arnés de CT a la conexión a tierra del bloque del motor. La resistencia debe ser abierta o infinita.
- *Configuración de capacidad nominal incorrecta*: Conectar InPower. → Verificar que la capacidad nominal del generador en el control esté correctamente ajustada. → Verificar que la capacidad nominal del CT en el control esté correctamente ajustada. → Ajustar los parámetros según sea necesario.

### 1472 · Corriente CA alta — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 230 del PDF* · sistema: Salida eléctrica (alternador / AVR)

**Qué detecta:** La corriente de salida del generador excedió por lo menos el 150% de la corriente nominal.

**Causas probables:**
1. Cortocircuito o sobrecarga
2. Transformadores de corriente (CT) incorrectos, conexiones de CT o configuración de CT incorrecta.
3. Conexiones del arnés de CT
4. Configuración de capacidad nominal incorrecta

**Verificación y reparación (manual):**
- *Cortocircuito o sobrecarga*: Inspeccionar los cables de carga y las conexiones del arnés de CA. → Desconectar el arnés de CA de los cables de carga. → Inspeccionar el arnés de CA y los pasadores del conector de la tarjeta. → Inspeccionar visualmente si hay pasadores corroídos, doblados o rotos, y pasadores plegados o expandidos.
- *Transformadores de corriente (CT) incorrectos, conexiones de CT o configuración de CT incorrecta.*: Revisar los CT. → Revisar que se instalaron los CT correctos. → Revisar que las conexiones del CT estén aseguradas con bridas a los alambres correspondientes. → Revisar que los CT estén instalados en el orden correcto.
- *Conexiones del arnés de CT*: Medir la resistencia del arnés del CT en cada pasador. → Desconectar el conector P12 del arnés de la tarjeta de control y del CT. → Verificar la resistencia desde el conector de la tarjeta a las conexiones de CT. La resistencia debe ser 5 ohmios o menos. → Medir la resistencia en cada pasador del conector del arnés de CT a la conexión a tierra del bloque del motor. La resistencia debe ser abierta o infinita.
- *Configuración de capacidad nominal incorrecta*: Conectar InPower. → Verificar que la capacidad nominal del generador en el control esté correctamente ajustada. → Verificar que la capacidad nominal del CT en el control esté correctamente ajustada. → Ajustar los parámetros según sea necesario.

### 1483 · Alarma común — no indicado en el manual (inferido: event)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Otros / entradas del cliente

**Qué detecta:** Hay al menos una alarma activa.

### 1540 · Advertencia común — no indicado en el manual (inferido: event)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Otros / entradas del cliente

**Qué detecta:** Hay al menos una advertencia activa.

### 1541 · Parada común — no indicado en el manual (inferido: event)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Arranque y parada

**Qué detecta:** Hay al menos una parada activa.

### 1667 · Temperatura de escape del AUX 101 FDR — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 232 del PDF* · sistema: Salida eléctrica (alternador / AVR)

**Qué detecta:** La señal del sensor de temperatura de gases de escape está fuera de rango (cortocircuito en alta tensión).

**Causas probables:**
1. Conexiones del sensor de temperatura de gases de escape defectuosas.
2. Sensor de temperatura de gases de escape defectuoso
3. Arnés del motor defectuoso
4. Arnés de extensión defectuoso
5. Verificar las calibraciones en el ECM y en el control PCC

**Verificación y reparación (manual):**
- *Conexiones del sensor de temperatura de gases de escape defectuosas.*: Inspeccionar el sensor de temperatura de gases de escape y los pasadores del conector del arnés del motor. → Desconectar el conector del arnés del motor del sensor de temperatura de gases de escape. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de temperatura de gases de escape defectuoso*: Sensor activo. → Revisar el voltaje de alimentación del sensor de temperatura de gases de escape. → Desconectar el conector del arnés del motor del sensor de temperatura de gases de escape. → Instalar el cable multiconector del sensor de presión de aceite entre el sensor y el conector del arnés del sensor.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el conector del arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés de extensión defectuoso*: Inspeccionar el arnés de extensión y los pasadores del conector de control. → Desconectar el conector del arnés de extensión del control. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Verificar las calibraciones en el ECM y en el control PCC*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el control de PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web           InCal, la calibración es correcta. En caso contrario, actualice la calibración al valor más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

### 1847 · Alta temperatura del refrigerante del motor — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 234 del PDF* · sistema: Refrigeración

**Qué detecta:** La señal del sensor de temperatura de gases de escape está fuera de rango (cortocircuito en alta tensión).

**Causas probables:**
1. Sensor de temperatura del motor impreciso
2. La función de simulación de fallas está habilitada
3. La configuración del umbral es demasiado baja

**Verificación y reparación (manual):**
- *Sensor de temperatura del motor impreciso*: Comprobar la precisión del sensor empleando un termopar o sonda de temperatura similar. → Conectar la sonda de temperatura al motor junto al sensor de temperatura del refrigerante. → Conectar InPower. → Comparar la lectura de la temperatura del refrigerante de la pantalla de la herramienta de servicio con la de la sonda de temperatura. Si las dos lecturas son aproximadamente similares, el sensor está realizando las lecturas correctamente.
- *La función de simulación de fallas está habilitada*: Comprobar que la función de simulación de fallas no está habilitada para el sensor. → Conectar InPower. → Comprobar que la simulación de fallas NO está habilitada para el sensor de temperatura del refrigerante conectándolo al PCC a través de InPower. Si la simulación de fallas está habilitada, no hay ningún problema.
- *La configuración del umbral es demasiado baja*: Comprobar la configuración del umbral. → Conectar InPower. → Comprobar que el umbral de falla se encuentra dentro del rango de funcionamiento normal del sensor de temperatura del refrigerante. Consultar el manual del motor para obtener información sobre los valores del umbral correctos y realizar los cambios necesarios a través de InPower.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.coolant_temp` en el detalle de la alarma antes de despachar.

### 1853 · Falla 1 del anunciador — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 235 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** Falla #1 del anunciador del cliente.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada #1 del anunciador" está activa
2. Configuración incorrecta o problema de alambrado
3. Anunciador defectuoso

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada #1 del anunciador" está activa*: Revisar el problema para el cual se configuró la entrada del anunciador N.° 1; por ejemplo, si se configuró para que se active cuando el nivel de combustible es bajo, revisar el nivel de combustible y agregar si es necesario. Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *Configuración incorrecta o problema de alambrado*: Con InPower, verificar que la falla #1 esté correctamente configurada. → Verificar el alambrado en TB1-1 y asegurarse de que la entrada de cliente 1 está alambrada correctamente. Según la configuración del anunciador, asegurarse de que no haya un circuito abierto o un cortocircuito en la conexión TB1-2. → Verificar el emisor, relé o dispositivo que activa la entrada 1 del anunciador universal; sustituir si están averiados.
- *Anunciador defectuoso*: Si el alambrado y la configuración son satisfactorios, sustituir el anunciador universal.

### 1854 · Falla 2 del anunciador — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 236 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** Falla #2 del anunciador del cliente.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada #2 del anunciador" está activa
2. Configuración incorrecta o problema de alambrado
3. Anunciador defectuoso

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada #2 del anunciador" está activa*: Revisar el problema para el cual se configuró la entrada del anunciador N.° 2; por ejemplo, si se configuró para que se active cuando el nivel de combustible es bajo, revisar el nivel de combustible y agregar si es necesario. Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *Configuración incorrecta o problema de alambrado*: Con InPower, verificar que la falla #2 esté correctamente configurada. → Verificar el alambrado en TB1-2 y asegurarse de que la entrada de cliente 2 esta alambrada correctamente. Según la configuración del anunciador, asegurarse de que no haya un circuito abierto o un cortocircuito en la conexión TB1-2. → Verificar el emisor, relé o dispositivo que activa la entrada 2 del anunciador universal; sustituir si están averiados.
- *Anunciador defectuoso*: Si el alambrado y la configuración son satisfactorios, sustituir el anunciador universal.

### 1855 · Falla 3 del anunciador — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 237 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** Falla #3 del anunciador del cliente.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada #3 del anunciador" está activa
2. Configuración incorrecta o problema de alambrado
3. Anunciador defectuoso

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada #3 del anunciador" está activa*: Revisar el problema para el cual se configuró la entrada del anunciador N.° 3; por ejemplo, si se configuró para que se active cuando el nivel de combustible es bajo, revisar el nivel de combustible y agregar si es necesario. Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *Configuración incorrecta o problema de alambrado*: Con InPower, verificar que la falla #3 esté correctamente configurada. → Verificar el alambrado en TB1-3 y asegurarse de que la entrada de cliente 3 está alambrada correctamente. Según la configuración del anunciador, asegurarse de que no haya un circuito abierto o un cortocircuito en la conexión TB1-3. → Verificar el emisor, el relé o el dispositivo que activa la entrada 3 del anunciador universal; sustituir si están averiados.
- *Anunciador defectuoso*: Si el alambrado y la configuración son satisfactorios, sustituir el anunciador universal.

### 1944 · Error de configuración de la salida del anunciador — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 239 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** Más de una fuente está activando los relés de salida del anunciador.

**Causas probables:**
1. Más de una fuente está activando al mismo tiempo los relés de salida del anunciador
2. Anunciador defectuoso

**Verificación y reparación (manual):**
- *Más de una fuente activa al mismo tiempo los relés de salida del anunciador*: Asegurarse de que los anunciadores estén conectados a un solo control del grupo electrógeno.
- *Anunciador defectuoso*: Reemplazar el anunciador.

### 1992 · La velocidad del cigüeñal del motor está sobre la velocidad nominal — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 237 del PDF* · sistema: Velocidad y regulación

**Qué detecta:** La señal de velocidad del motor indica una velocidad del motor un 15% mayor al valor nominal.

**Causas probables:**
1. La función de simulación de fallas está habilitada
2. Configuración incorrecta del umbral
3. Configuración incorrecta del tipo de combustible
4. Conexiones del sensor de velocidad del motor defectuosas
5. Arnés del motor defectuoso
6. Sensor de posición/velocidad del motor defectuoso

**Verificación y reparación (manual):**
- *La función de simulación de fallas está habilitada*: Comprobar que la función de simulación de fallas no está habilitada para el sensor. → Conectar InPower. → Comprobar que la simulación de fallas NO está habilitada para el sensor de velocidad del motor conectándolo al PCC a través de InPower. Si la simulación de fallas está habilitada, no hay ningún problema.
- *Configuración incorrecta del umbral*: Conectar InPower. → Verificar que el umbral de la falla se encuentre dentro del rango de funcionamiento normal del sensor de sobrevelocidad del motor. Consultar el manual del motor para obtener información sobre los valores del umbral correctos y realizar los cambios necesarios a través de InPower.
- *Configuración incorrecta del tipo de combustible*: Conectar InPower. → Verificar que la fuente de combustible ajustada con InPower coincida con el combustible utilizado por el grupo electrógeno.
- *Conexiones del sensor de velocidad del motor defectuosas*: Inspeccionar el sensor de velocidad del motor y los pasadores del arnés del motor. → Desconectar el conector del arnés del motor del sensor de velocidad del motor. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Arnés del motor defectuoso*: Inspeccionar el arnés del motor y los pasadores del conector. → Desconectar el conector del arnés del motor del arnés de extensión. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de posición/velocidad del motor defectuoso*: Inspeccionar el sensor de velocidad del motor. → Desconectar el sensor de posición/velocidad del motor del motor y del arnés del motor. → Revisar si los pasadores del sensor están doblados, corroídos o sueltos. → Inspeccionar si hay daños en la estructura del sensor.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.rpm` en el detalle de la alarma antes de despachar.

### 2112 · Temperatura de entrada del refrigerante AUX 101 FDR — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 239 del PDF* · sistema: Refrigeración

**Qué detecta:** El voltaje del sensor de temperatura del refrigerante está fuera de rango.

**Causas probables:**
1. Conexiones del sensor de temperatura del refrigerante defectuosas
2. Sensor de temperatura del refrigerante defectuoso
3. Alambrado incorrecto
4. Verificar las calibraciones del controlador

**Verificación y reparación (manual):**
- *Conexiones del sensor de temperatura del refrigerante defectuosas*: Inspeccionar el sensor de temperatura del refrigerante y los pasadores del conector del arnés del motor. → Desconectar el conector del arnés del motor del sensor de temperatura del refrigerante. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de temperatura del refrigerante defectuoso*: Comprobar la resistencia del sensor → Desconectar el conector del arnés del motor del sensor de temperatura del refrigerante. → Medir la resistencia entre el pasador de señal del sensor de temperatura del refrigerante y el pasador de retorno del sensor de temperatura del refrigerante.
- *Alambrado incorrecto*: Revisar el alambrado. Asegurarse de que el alambrado del sensor de temperatura del refrigerante esté conectado a la entrada Aux 101 correcta. → Comprobar si los alambres tienen roturas o abrasiones. → Comprobar el alambrado para ver si hay humedad o desechos en los puntos de conexión.
- *Verificar las calibraciones del controlador*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el control de PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web InCal, la calibración es correcta. En caso contrario, actualice la calibración al valor más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.coolant_temp` en el detalle de la alarma antes de despachar.

### 2224 · Nivel de combustible AUX 101 FDR — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 241 del PDF* · sistema: Combustible

**Qué detecta:** El voltaje del sensor de combustible está fuera de rango.

**Causas probables:**
1. Conexiones del sensor de nivel del combustible defectuosas
2. Sensor de nivel del combustible defectuoso
3. Alambrado incorrecto
4. Verificar las calibraciones del controlador

**Verificación y reparación (manual):**
- *Conexiones del sensor de nivel del combustible defectuosas*: Inspeccionar el sensor de nivel del combustible y los pasadores del conector del arnés del motor. → Desconectar el conector del arnés del motor del sensor de nivel del combustible. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de nivel del combustible defectuoso*: Comprobar la resistencia del sensor → Desconectar el conector del arnés del motor del sensor de nivel del combustible. → Medir la resistencia entre el pasador de señal del sensor de nivel de combustible y el pasador de retorno del sensor de nivel de combustible.
- *Alambrado incorrecto*: Revisar el alambrado. Asegurarse de que el alambrado del sensor de temperatura del refrigerante esté conectado a la entrada Aux 101 correcta. → Comprobar si los alambres tienen roturas o abrasiones. → Comprobar el alambrado para ver si hay humedad o desechos en los puntos de conexión.
- *Verificar las calibraciones del controlador*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el control de PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web InCal, la calibración es correcta. En caso contrario, actualice la calibración al valor más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.fuel_rate / fuel_level` en el detalle de la alarma antes de despachar.

### 2398 · Temperatura ambiental AUX 101 FDR — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 242 del PDF* · sistema: Salida eléctrica (alternador / AVR)

**Qué detecta:** El voltaje del sensor de temperatura ambiental está fuera de rango.

**Causas probables:**
1. Conexiones del sensor de temperatura ambiental defectuosas
2. Sensor de temperatura ambiental defectuoso
3. Alambrado incorrecto
4. Verificar las calibraciones del controlador

**Verificación y reparación (manual):**
- *Conexiones del sensor de temperatura ambiental defectuosas*: Inspeccionar el sensor de temperatura ambiental y los pasadores del conector del arnés del motor. → Desconectar el conector del arnés del motor del sensor de temperatura ambiental. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de temperatura ambiental defectuoso*: Comprobar la resistencia del sensor. → Desconectar el conector del arnés del motor del sensor de temperatura ambiental. → Medir la resistencia entre el pasador de señal del sensor de temperatura ambiental y el pasador de retorno del sensor de temperatura ambiental.
- *Alambrado incorrecto*: Revisar el alambrado. Asegurarse de que el alambrado del sensor de temperatura del refrigerante esté conectado a la entrada Aux 101 correcta. → Comprobar si los alambres tienen roturas o abrasiones. → Comprobar el alambrado para ver si hay humedad o desechos en los puntos de conexión.
- *Verificar las calibraciones del controlador*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el control de PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web InCal, la calibración es correcta. En caso contrario, actualice la calibración al valor más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

### 2542 · Compensación de voltaje AUX 101 FDR — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 243 del PDF* · sistema: Salida eléctrica (alternador / AVR)

**Qué detecta:** El voltaje del sensor de combustible está fuera de rango.

**Causas probables:**
1. Conexiones del sensor de nivel del combustible defectuosas
2. Sensor de nivel del combustible defectuoso
3. Alambrado incorrecto
4. Verificar las calibraciones del controlador

**Verificación y reparación (manual):**
- *Conexiones del sensor de nivel del combustible defectuosas*: Inspeccionar el sensor de nivel del combustible y los pasadores del conector del arnés del motor. → Desconectar el conector del arnés del motor del sensor de nivel del combustible. → Comprobar si hay pasadores corroídos, pasadores doblados o rotos, y pasadores plegados o expandidos. → Inspeccionar si hay signos de humedad en el conector.
- *Sensor de nivel del combustible defectuoso*: Comprobar la resistencia del sensor. → Desconectar el conector del arnés del motor del sensor de nivel del combustible. → Medir la resistencia entre el pasador de señal del sensor de nivel de combustible y el pasador de retorno del sensor de nivel de combustible.
- *Alambrado incorrecto*: Revisar el alambrado. Asegurarse de que el alambrado del sensor de temperatura del refrigerante esté conectado a la entrada Aux 101 correcta. → Comprobar si los alambres tienen roturas o abrasiones. → Comprobar el alambrado para ver si hay humedad o desechos en los puntos de conexión.
- *Verificar las calibraciones del controlador*: Mediante la pantalla o la herramienta de servicio InPower, comprobar la calibración en el control de PCC. → Si la calibración que aparece en el PCC coincide con la calibración más reciente que aparece en el sitio Web InCal, la calibración es correcta. En caso contrario, actualice el PCC con la calibración más reciente. → Mediante la herramienta de servicio InSite, comprobar la calibración en el ECM. → Si la calibración que aparece en el ECM coincide con la calibración más reciente que aparece en QSOL, la calibración es correcta. En caso contrario, actualice el ECM con la calibración más reciente.

**Desde Wanomi:** ver la tendencia de `ATS.gen_voltage` en el detalle de la alarma antes de despachar.

### 2545 · Se requiere reposición del interruptor con llave — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 244 del PDF* · sistema: Comunicación con el motor (ECM / CAN)

**Qué detecta:** Se perdió la comunicación del enlace de datos de CAN entre el control del grupo electrógeno y el ECM; por lo tanto, el código de evento/falla 2545 se activa si el código de evento/falla 781 "Falla de enlace de datos de CAN" también está activo en el ECM.

**Causas probables:**
1. Falla de enlace de datos de CAN
2. ECM defectuoso

**Verificación y reparación (manual):**
- *Falla de enlace de datos de CAN*: Reposicionar el interruptor con llave manualmente. → Colocar el control del grupo electrógeno en la posición de apagado y presionar el botón de reposición en el tablero del operador. Esta acción borrará las paradas por falla y reposicionará el interruptor con llave. → Habilitar el interruptor con llave a través del tablero del operador. Ir a Test (Prueba) > Output (Salida) > Engine (Motor) > Keyswitch Driver Override Enable (Habilitar anulación de interruptor con llave), ajustar en Enable (Habilitar). → Reposicionar el ECM y los controles del PCC.
- *ECM defectuoso*: Después de asegurarse de que el ECM tiene una alimentación adecuada B+, conectar al ECM con InPower o Insite para determinar si funciona bien y puede comunicarse con el controlador del PCC. Reemplazar el controlador si no es posible la comunicación con él mediante InPower.

### 2619 · Entrada #1 de falla AUX 101 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 245 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada analógica #1 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada analógica #1" está activa
2. El parámetro "Analog Input #1 Active State Selection" (Selección de estado de la entrada analógica #1) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada analógica #1" está activa*: Comprobar la condición para la cual se configuró la "Entrada analógica #1". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Analog Input #1 Active State Selection" (Selección de estado de la entrada analógica #1) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada analógica #1. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Analog Input #1 Sensor Type" (Tipo de sensor de la entrada analógica #1) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J11-1 (entrada 1 de referencia) y J11-2 (entrada del interruptor) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2621 · Entrada #2 de falla AUX 101 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 245 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada analógica #2 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada analógica #2" está activa
2. El parámetro "Analog Input #2 Active State Selection" (Selección de estado de la entrada analógica #1) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada analógica #2" está activa*: Comprobar la condición para la cual se configuró la "Entrada analógica #2". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Analog Input #2 Active State Selection" (Selección de estado de la entrada analógica #2) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada analógica #2. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Analog Input #2 Sensor Type" (Tipo de sensor de la entrada analógica #2) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J11-3 (entrada 1 de referencia) y J11-4 (entrada del interruptor) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2622 · Entrada #3 de falla AUX 101 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 246 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada analógica #3 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada analógica #3" está activa
2. El parámetro "Analog Input #3 Active State Selection" (Selección de estado de la entrada analógica #3) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada analógica #3" está activa*: Comprobar la condición para la cual se configuró la "Entrada analógica #3". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Analog Input #3 Active State Selection" (Selección de estado de la entrada analógica #3) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada analógica #3. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Analog Input #3 Sensor Type" (Tipo de sensor de la entrada analógica #3) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J11-5 (entrada 1 de referencia) y J11-6 (entrada del interruptor) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2623 · Entrada #4 de falla AUX 101 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 247 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada analógica #4 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada analógica #4" está activa
2. El parámetro "Analog Input #4 Active State Selection" (Selección de estado de la entrada analógica #4) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada analógica #4" está activa*: Comprobar la condición para la cual se configuró la "Entrada analógica #4". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Analog Input #4 Active State Selection" (Selección de estado de la entrada analógica #4) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada analógica #4. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Analog Input #4 Sensor Type" (Tipo de sensor de la entrada analógica #4) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J11-7 (entrada 1 de referencia) y J11-8 (entrada del interruptor) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2624 · Entrada #5 de falla AUX 101 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 247 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada analógica #5 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada analógica #5" está activa
2. El parámetro "Analog Input #5 Active State Selection" (Selección de estado de la entrada analógica #5) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada analógica #5" está activa*: Comprobar la condición para la cual se configuró la "Entrada analógica #5". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Analog Input #5 Active State Selection" (Selección de estado de la entrada analógica #5) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada analógica #5. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Analog Input #5 Sensor Type" (Tipo de sensor de la entrada analógica #5) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J11-9 (entrada 1 de referencia) y J11-10 (entrada del interruptor) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2625 · Entrada #6 de falla AUX 101 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 248 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada analógica #6 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada analógica #6" está activa
2. El parámetro "Analog Input #6 Active State Selection" (Selección de estado de la entrada analógica #6) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada analógica #6" está activa*: Comprobar la condición para la cual se configuró la "Entrada analógica #6". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Analog Input #6 Active State Selection" (Selección de estado de la entrada analógica #6) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada analógica #6. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Analog Input #6 Sensor Type" (Tipo de sensor de la entrada analógica #6) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J11-11 (entrada 1 de referencia) y J11-12 (entrada del interruptor) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2626 · Entrada #7 de falla AUX 101 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 249 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada analógica #7 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada analógica #7" está activa
2. El parámetro "Analog Input #7 Active State Selection" (Selección de estado de la entrada analógica #7) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada analógica #7" está activa*: Comprobar la condición para la cual se configuró la "Entrada analógica #7". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Analog Input #7 Active State Selection" (Selección de estado de la entrada analógica #7) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada analógica #7. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Analog Input #7 Sensor Type" (Tipo de sensor de la entrada analógica #7) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J11-13 (entrada 1 de referencia) y J11-14 (entrada del interruptor) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2627 · Entrada #8 de falla AUX 101 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 249 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada analógica #8 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada analógica #8" está activa
2. El parámetro "Analog Input #8 Active State Selection" (Selección de estado de la entrada analógica #8) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada analógica #8" está activa*: Comprobar la condición para la cual se configuró la "Entrada analógica #8". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Analog Input #8 Active State Selection" (Selección de estado de la entrada analógica #8) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada analógica #8. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Analog Input #8 Sensor Type" (Tipo de sensor de la entrada analógica #8) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J11-15 (entrada 1 de referencia) y J11-16 (entrada del interruptor) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2628 · Entrada #1 de falla AUX 102 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 250 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada discreta #1 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada discreta #1" está activa
2. El parámetro "Discrete Input #1 Active State Selection" (Selección de estado de la entrada discreta #1) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada discreta #1" está activa*: Comprobar la condición para la cual se configuró la "Entrada discreta #1". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Discrete Input #1 Active State Selection" (Selección de estado de la entrada discreta #1) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada discreta #1. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Discrete Input #1 Sensor Type" (Tipo de sensor de la entrada discreta #1) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J4-1 (entrada 1 del interruptor) y J4-2 (entrada de referencia) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2629 · Entrada #2 de falla AUX 102 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 250 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada discreta #2 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada discreta #2" está activa
2. El parámetro "Discrete Input #2 Active State Selection" (Selección de estado de la entrada discreta #2) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada discreta #2" está activa*: Comprobar la condición para la cual se configuró la "Entrada discreta #2". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Discrete Input #2 Active State Selection" (Selección de estado de la entrada discreta #2) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada discreta #2. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Discrete Input #2 Sensor Type" (Tipo de sensor de la entrada discreta #2) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J4-2 (entrada 1 del interruptor) y J4-3 (entrada de referencia) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2631 · Entrada #3 de falla AUX 102 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 251 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada discreta #3 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada discreta #3" está activa
2. El parámetro "Discrete Input #3 Active State Selection" (Selección de estado de la entrada discreta #3) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada discreta #3" está activa*: Comprobar la condición para la cual se configuró la "Entrada discreta #3". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Discrete Input #3 Active State Selection" (Selección de estado de la entrada discreta #3) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada discreta #3. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Discrete Input #3 Sensor Type" (Tipo de sensor de la entrada discreta #3) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J4-5 (entrada 1 del interruptor) y J4-6 (entrada de referencia) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2632 · Entrada #4 de falla AUX 102 — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 252 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** La entrada discreta #4 de falla está activa.

**Causas probables:**
1. La condición para la cual se configuró la "Entrada discreta #4" está activa
2. El parámetro "Discrete Input #4 Active State Selection" (Selección de estado de la entrada discreta #4) no está correctamente configurado
3. No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado

**Verificación y reparación (manual):**
- *La condición para la cual se configuró la "Entrada discreta #4" está activa*: Comprobar la condición para la cual se configuró la "Entrada discreta #4". Una vez resuelto el problema, presionar el botón de reposición en el tablero del operador para borrar la falla. Si la falla no se borra, proceder al siguiente paso.
- *El parámetro "Discrete Input #4 Active State Selection" (Selección de estado de la entrada discreta #4) no está correctamente configurado*: Con InPower o utilizando el tablero del operador, revisar el ajuste de entrada del interruptor (activo abierto o activo cerrado) para la Entrada discreta #4. Asegurarse de que el ajuste de entrada del interruptor sea el correcto. Si el parámetro “Discrete Input #4 Sensor Type" (Tipo de sensor de la entrada discreta #4) está ajustado en activo bajo, un valor activo alto revertirá la lógica, haciendo que el código de falla quede activo.
- *No está alambrado correctamente o hay un circuito abierto o cortocircuito en el alambrado*: Comprobar el alambrado en J4-7 (entrada 1 del interruptor) y J4-8 (entrada de referencia) en busca de un circuito abierto, cortocircuito o conexiones incorrectas.

### 2678 · Falla del cargador (alternador de carga) — no indicado en el manual (inferido: warning)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Batería y carga

**Qué detecta:** Tensión del alternador de carga fuera de los umbrales alto/bajo durante el retardo (2–300 s).

### 2693 · Compensación de velocidad FDR — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 252 del PDF* · sistema: Velocidad y regulación

**Qué detecta:** Indica que la salida del circuito de compensación de velocidad está fuera de rango, alto o bajo.

**Causas probables:**
1. El sensor/alambrado está defectuoso

**Verificación y reparación (manual):**
- *El sensor/alambrado está defectuoso*: Revisar el alambrado. Asegurarse de que el alambrado de compensación de velocidad FDR esté conectado a la entrada Aux 101 correcta → Comprobar si los alambres tienen roturas o abrasiones. → Comprobar el alambrado para ver si hay humedad o desechos en los puntos de conexión.

**Desde Wanomi:** ver la tendencia de `cummins-pcc.rpm` en el detalle de la alarma antes de despachar.

### 2694 · RTD del alternador FDR — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 253 del PDF* · sistema: Salida eléctrica (alternador / AVR)

**Qué detecta:** Indica que la salida del circuito de RTD está fuera de rango, alto o bajo.

**Causas probables:**
1. El sensor/alambrado está defectuoso

**Verificación y reparación (manual):**
- *El sensor/alambrado está defectuoso*: Revisar el alambrado. Asegurarse de que el alambrado de RTD FDR esté conectado a la entrada Aux 101 correcta → Comprobar si los alambres tienen roturas o abrasiones. → Comprobar el alambrado para ver si hay humedad o desechos en los puntos de conexión.

### 2696 · Alta temperatura del RTD del alternador — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 253 del PDF* · sistema: Salida eléctrica (alternador / AVR)

**Qué detecta:** Indica que la temperatura del alternador está sobre lo normal y alcanzó el punto de activación de parada.

**Causas probables:**
1. El sensor/alambrado está defectuoso

**Verificación y reparación (manual):**
- *El sensor/alambrado está defectuoso*: Revisar el alambrado. Asegurarse de que el alambrado de temperatura del RDT del alternador esté conectado a la entrada Aux 101 correcta. → Comprobar si los alambres tienen roturas o abrasiones. → Comprobar el alambrado para ver si hay humedad o desechos en los puntos de conexión.

### 2729 · Pérdida de módulo de E/S — Advertencia
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 253 del PDF* · sistema: Arranque y parada

**Qué detecta:** Indica un enlace de datos intermitente entre el módulo de E/S y el control de PCC (opción del módulo de E/S Aux 101) y no se ajustaron niveles de entrada de falla para la parada.

**Causas probables:**
1. Alambrado incorrecto
2. Ajustes de E/S mal configurados

**Verificación y reparación (manual):**
- *Alambrado incorrecto*: La conexión entre AUX 101 y PCC 1302 es incorrecta. Asegurarse de que el alambrado esté bien. → PCC 1302 TB1-1: red A de PCC (+) a AUX 101 J1-3 → PCC 1302 TB1-2: red B de PCC (-) a AUX 101 J1-4 → PCC 1302 TB1-3: retorno de B+ a AUX 101 J14-2
- *Ajustes de E/S mal configurados*: Si AUX 101 no está conectado a PCC 1302, conectar a InPower. En Adjustments (Ajustes) > System I/O Adjustment (Ajuste de E/S de sistema) > Output Relays (Relés de salida) asegurarse de que System IO Board Enable (Habilitación del tablero de E/S de sistema) esté desactivado. → Si AUX 101 no está conectado a PCC 1302, conectar a InPower. En Adjustments (Ajustes) > System I/O Adjustment (Ajuste de E/S de sistema) asegurarse de que no haya entradas ni salidas configuradas como activadas.

### 2731 · Pérdida de módulo de E/S — Parada
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 254 del PDF* · sistema: Arranque y parada

**Qué detecta:** Indica un enlace de datos intermitente entre el módulo de E/S y el control de PCC (opción del módulo de E/S Aux 101) y a lo menos se ajustó un nivel de entrada de falla para la parada.

**Causas probables:**
1. Alambrado incorrecto
2. Ajustes de E/S mal configurados

**Verificación y reparación (manual):**
- *Alambrado incorrecto*: La conexión entre AUX 101 y PCC 1302 es incorrecta. Asegurarse de que el alambrado esté bien. → PCC 1302 TB1-1: red A de PCC (+) a AUX 101 J1-3 → PCC 1302 TB1-2: red B de PCC (-) a AUX 101 J1-4 → PCC 1302 TB1-3: retorno de B+ a AUX 101 J14-2
- *Ajustes de E/S mal configurados*: Si AUX 101 no está conectado a PCC 1302, conectar a InPower. En Adjustments (Ajustes) > System I/O Adjustment (Ajuste de E/S de sistema) > Output Relays (Relés de salida) asegurarse de que System IO Board Enable (Habilitación del tablero de E/S de sistema) esté desactivado. → Si AUX 101 no está conectado a PCC 1302, conectar a InPower. En Adjustments (Ajustes) > System I/O Adjustment (Ajuste de E/S de sistema) asegurarse de que no haya entradas ni salidas configuradas como activadas.

### 2897 · Bloque de memoria de fábrica dañado — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 255 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** El control detectó un bloque de memoria dañado. Control has detected a corrupted memory block. Possible Cause: Defective memory block

### 2898 · Bloque de memoria periódico o de fallas dañado — no indicado en el manual (inferido: warning)
*A040D969 (Ed. 1, 1-2011), fuera de §9.8 (menús / funciones): sin procedimiento de diagnóstico* · sistema: Otros / entradas del cliente

**Qué detecta:** El control detectó un bloque de memoria dañado.

**Causas probables:**
1. Bloque de memoria defectuoso

### 2899 · Bloque de memoria del usuario dañado — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 255 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** El control detectó un bloque de memoria dañado.

### 2911 · Bloque de memoria de ajuste fino dañado — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 255 del PDF* · sistema: Otros / entradas del cliente

**Qué detecta:** El control detectó un bloque de memoria dañado.

### 2972 · Sobrecarga de campo — no indicado en el manual
*A040D969 (Ed. 1, 1-2011) §9.8, pág. 255 del PDF* · sistema: Salida eléctrica (alternador / AVR)

**Qué detecta:** Si el tiempo en el que el ciclo de trabajo del AVR de campo está funcionando en salida máxima es superior al tiempo del parámetro “Max Field Time” (Tiempo máximo de campo), se activa el código de evento/falla 2972.

**Causas probables:**
1. El retardo del tiempo máximo de campo está ajustado demasiado bajo
2. El voltaje detectado en la tarjeta de circuitos básicos es demasiado bajo o hay un circuito abierto o cortocircuito
3. Problema de la aplicación

**Verificación y reparación (manual):**
- *El retardo del tiempo máximo de campo está ajustado demasiado bajo*: A través del tablero del operador, revisar la configuración del parámetro “Max Field Time” (Tiempo máximo de campo). Verificar que “Max Field Time” no esté ajustado en cero. Este parámetro puede necesitar un ajuste a un valor más adecuado para la aplicación. Para acceder al menú de configuración del tiempo máximo de campo en el tablero del operador, ir a Setup > OEM Setup > OEM Alt Setup > Max Field Time (Configuración > Configuración del OEM > Configuración del alternador de OEM > Tiempo máximo de campo) y ajustar el parámetro “Max Field Time” (Tiempo máximo de campo), según corresponda para la aplicación. Consultar la lista de parámetros para ver el valor predeterminado para “Max Field Time” (Tiempo máximo de campo).
- *El voltaje detectado en la tarjeta de circuitos básicos es demasiado bajo o hay un circuito abierto o cortocircuito*: Medir el voltaje que entra a la tarjeta de circuitos básicos en L1 = J22-1, L2 = J22-2, L3 = J22-3 y LN = J22-4 (para aplicaciones monofásicas, usar L1, L2 y LN). Si el control del grupo electrógeno no detecta voltaje, intentará sobrecompensarlo maximizando la salida de AVR. Si el voltaje que entra a la tarjeta de circuitos básicos es cero o menos que el voltaje para el cual fue calibrado el control (Voltaje nominal), revisar el alambrado desde el alternador a la tarjeta de circuitos básicos en busca de un circuito abierto o cortocircuito. → Si el grupo electrógeno tiene más de 600 VCA, revisar las conexiones desde el alternador al PT y desde el PT a la tarjeta de circuitos básicos. Si el voltaje ingresa al PT pero no sale de éste, reemplazar el PT. → Medir la salida del AVR en J17-1 y J17-2 mientras se enciende el grupo electrógeno. La salida debe ser de al menos 300 VCC durante el arranque del grupo electrógeno, pero debe disminuir de manera significativa cuando éste acumula voltaje. Si la salida de J17-1 y J17-2 es constantemente alta o está bloqueada, la parte del AVR del PCC está averiada. Sustituir la tarjeta de circuitos básicos si el AVR está averiado.
- *Problema de la aplicación*: Si el grupo electrógeno funciona correctamente sin carga o algo de carga pero en cuanto se aplica carga adicional éste se apaga indicando “Field Overload” (Sobrecarga de campo), puede ser un problema de la aplicación (problema de carga, grupo electrógeno con capacidad insuficiente, etc.).

