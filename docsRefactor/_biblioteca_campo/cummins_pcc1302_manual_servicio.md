# Cummins PowerCommand 1.1 / 1.1R / 1.2 (PCC 1302) — extracto útil para Wanomi · 2026-10-20

**Fuente:** *Manual de servicio Controlador PowerCommand 1.1 / 1.1R / 1.2*, A040D969 (Edición 1), 1-2011 (268 pp., aportado por Franco). Secciones usadas: 7.3 (funciones y modos), 7.8–7.12 (datos del operador), 8.3.11–8.3.14 (umbrales configurables), 8.4 (TB1), 9.8 (74 códigos de falla).
**Importante:** es la familia **PCC 1302** (grupos chicos/medianos), no la PC2100 citada en `auditoria_umbrales_fabricante_2026-10-20.md`. Los umbrales del controlador **cambian por modelo y por configuración**: el manual da **rangos ajustables**, no un valor de fábrica único (las pantallas muestran `##`). Los únicos valores fijos son los de la lógica de algunos códigos (§3).

## 1 · Mediciones disponibles (ficha de equipo)
| Medición | Rango del controlador | Nota para la ficha / el driver |
|---|---|---|
| Presión de aceite | 0–145 psi (0–999,7 kPa) | "no está disponible en todos los modelos" |
| Temperatura de refrigerante | valor del sensor | |
| Temperatura de aceite | −40…63 °C (sic) | |
| Temperatura del múltiple de admisión | valor del sensor | nueva, no está en la ficha |
| Presión de suministro de combustible | 0–145 psi | nueva (la ficha GEN Sense ya tiene `fuel_supply_pressure` en bar) |
| Consumo de combustible | **galones por hora** | convertir a L/h (× 3,785) en el driver |
| Tensión de batería | 0–35 VCC | sistema 12 **o** 24 V (menú de batería) |
| Velocidad del motor | rpm | relación 20 / 30 / 60 rpm/Hz → 1500 rpm a 50 Hz = 30 rpm/Hz |
| Horas de motor | décimos de hora; tope 6553,5 h | **ojo con el desborde** en la regla de vida de aceite |
| Alternador | V L-L 0–750, V L-N 0–450, A 0–1000, kVA 0–2000, Hz L1-L2, % salida AVR | corriente y kVA requieren CT |
| Falla activa | código, controlador que la detectó (SA), tipo (parada / advertencia) | historial de 10 fallas con horas de motor |

## 2 · Protecciones configurables (rango · retardo · código)
| Protección | Rango del umbral | Retardo | Código |
|---|---|---|---|
| Baja presión de aceite — advertencia | 75,8–689,5 kPa (11–100 psi) | 2–15 s | 143 |
| Baja presión de aceite — parada | 62,0–689,5 kPa (9–100 psi) | 2–10 s | 415 |
| Alta temp. refrigerante — advertencia | 65,5–143,3 °C | 2–10 s | 146 |
| Alta temp. refrigerante — parada | 65,5–143,3 °C | 2–10 s | 151 |
| Baja temp. refrigerante | −17,8…37,8 °C | 1 min fijo | 1435 |
| Sobrevelocidad (parada) | 0–1875 rpm a 30 rpm/Hz, paso 25 | — | 1992 (234 con ECM) |
| Conflicto velocidad/frecuencia | 0,1–20 Hz | 0,2–10 s | 1469 |
| Batería baja (12 V / 24 V) | 11,0–13,0 / 22,0–28,0 V | 2–60 s | 441 |
| Batería alta | 14,0–17,0 / 28,0–34,0 V | 2–60 s | 442 |
| Batería débil (durante el arranque) | 6,0–10,0 / 12,0–16,0 V | 1–5 s | 1442 |
| Falla del cargador (alternador de carga) alto | 13,0–20,0 / 25,0–40,0 V | 2–300 s | 2678 |
| Falla del cargador bajo | 2,0–13,0 / 2,0–25,0 V | 2–300 s | 2678 |
| Alta tensión CA del grupo | 105–125 % | 1–10 s | 1446 |
| Baja tensión CA del grupo | 50–95 % | 2–20 s | 1447 |
| Sobrefrecuencia | +2…+10 Hz | 100–2000 semiciclos (1–20 s a 50 Hz) | 1449 |
| Subfrecuencia | −2…−10 Hz | 500–2000 semiciclos (5–20 s) | 1448 |
| Corriente CA alta (parada) | — | 2–60 s | 1472 |
| Arranque en ciclo | arranque 3–30 s · descanso 0–60 s · **1–7 intentos** | | 1438 |
| Retardo de arranque / parada (enfriamiento) | 0–300 s / 0–600 s | | |

Batería normal según el manual: 12–14 V (sistema 12 V) o 24–28 V (sistema 24 V).

## 3 · Umbrales FIJOS de la lógica de los códigos
| Código | Condición |
|---|---|
| 146 | refrigerante > **107,2 °C** durante 5 s (advertencia previa) |
| 415 | aceite < **180 kPa (26 psig)** durante 10 s → **parada** (motores con ECM) |
| 155 | múltiple de admisión > 95 °C durante 10 s |
| **488** | múltiple de admisión > **85 °C durante 90 s** (es temperatura, **no** filtro de aire) |
| 197 | bajo nivel de refrigerante > 10 s |
| 1447 | tensión de una fase < 85 % del nominal > 10 s → parada |
| 1471 | corriente > **110 %** del nominal > 60 s → advertencia |
| 1472 | corriente > **150 %** del nominal → parada |
| 1992 | velocidad **15 %** sobre el nominal → parada |
| Listo para cargar (1468) | 90 % de velocidad y tensión nominal |

Otros códigos útiles: 781 / 427 / 2545 (enlace CAN con el ECM perdido), 1245 / 1248 (parada / advertencia del ECM), 1433 / 1434 (parada de emergencia local / remota), 1318 (combustible bajo, entrada opcional), 1317 (nivel de refrigerante, opcional), 418 (agua en combustible), **1463 (no en automático)**, 1483 / 1540 / 1541 (alarma / advertencia / parada común), **1131 (modo en derivación "battle short" activo: protecciones anuladas)**, 1416 (parada anulada por derivación), 2696 (temperatura del alternador RTD), 2972 (sobrecarga de campo AVR). Cada código trae su lista de causas posibles (útil para "Pasos a seguir" del detalle de alarma).

## 4 · Hallazgos contra lo configurado en Wanomi
| # | Hallazgo | Propuesta |
|---|---|---|
| H1 | **cat-GE-12 «Filtro de aire obstruido» = `fault_code eq 488`**. En el PCC 1302, 488 es **alta temperatura del múltiple de admisión** (85 °C / 90 s). | Renombrar la regla a "Temperatura de admisión alta" y su texto. |
| H2 | **Parada por aceite depende del modelo:** PC2100 100 kPa · PCC 1302 con ECM **180 kPa**. Nuestro crítico < 100 kPa saltaría **después** de que un PCC 1302 ya paró. | El límite de aceite tiene que ser **por equipo** (como `battery_nominal_v`): parámetro del modelo de controlador, o leer el setpoint. |
| H3 | Nuestras reglas de aceite esperan 60 s; el controlador para en 10 s. La regla crítica llega tarde y solo repite la parada. | Espera ≤ 10 s en A0/A1, o tomar el código 143/415 como fuente. |
| H4 | Refrigerante: el PCC 1302 avisa fijo a 107,2 °C; el PC2100 a 100 °C. Nuestro 100 / 105 °C anticipa en los dos. | Sin cambio. |
| H5 | **Modo inactivo (sleep):** el PCC 1302 se duerme a los **5 min en Apagado o Auto** si no se configuró "Wake-in-Auto" o el puente TB15-1/TB15-5. Dormido, el Modbus (TB15) no responde. | Requisito de instalación del driver Connect (checklist de comisionado); si no, "Equipo que deja de reportar" salta en falso con el grupo en reposo. |
| H6 | No hay regla "**grupo no en automático**" (1463 / LED Not in Auto). En telco es la causa típica de "cortó la red y el grupo no arrancó". | Regla nueva crítica sobre el código 1463 (o el estado de modo). |
| H7 | No hay regla "**modo en derivación activo**" (1131): el grupo sigue en marcha con las protecciones anuladas. | Regla nueva crítica sobre el código 1131. |
| H8 | Batería: los umbrales del controlador se eligen por sistema 12 / 24 V. Confirma P1/P2 de la auditoría (escalar alternador y batería con `battery_nominal_v`). AR-04 (9,6 V en arranque) cae dentro de "batería débil" 6–10 V y espera 0 s ✓. | Ya en la auditoría. |
| H9 | Sobrecorriente 110 % / 60 s (advertencia) y 150 % (parada). | Regla nueva si el driver lee corriente y la ficha tiene la potencia nominal. |
| H10 | Consumo en gal/h y horas con tope 6553,5 h. | Driver: convertir a L/h; regla de vida de aceite: manejar el desborde del horómetro. |
| H11 | Cada código trae su lista de causas. | Catálogo `fault_code → nombre, tipo, causas` para que el detalle de alarma de "Cualquier código de falla activo" (GE-17) diga qué significa y qué revisar. |

## 5 · Simulador
- Publicar `fault_code` coherente con la física: 146 al pasar 107,2 °C 5 s, 143 / 415 con el aceite, 1992 en sobrevelocidad, 441 / 442 con la batería, 1438 tras los intentos de arranque (arranque 3–30 s, descanso, 3 intentos por defecto en Wanomi), 1463 si el modo no es Auto.
- Parada con enfriamiento: hoy el grupo pasa a STOPPED 5 s después de volver la red; el controlador admite 0–600 s de marcha de enfriamiento. Parametrizar.
- Consumo publicado en L/h (ya convertido, como haría el driver).
- Escenario "grupo no en automático" + corte de red → cascada sin arranque, con 1463 como causa.

## 6 · Lo que el manual NO trae
Mapa de registros Modbus (solo dirección, 2400–19200 bps, paridad par por defecto). Sigue pendiente el *PowerCommand Modbus register table* (`mapeo_modbus_drivers.md`).
