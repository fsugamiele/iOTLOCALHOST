# Biblioteca de fallas · Bancos de baterías de litio (LiFePO4 48 V / 150 Ah) — estándar Claro

## 1 · Fuente
*Manual de montaje, configuración y puesta en marcha de bancos de baterías de litio* — manual para instaladores, **AMX Argentina S.A. (Claro)**, versión 1 (2024), 72 pp. — `MANUAL INSTALADORES_BB LITIO_V1_240502_114710.pdf`.
Cubre tres módulos y la configuración de **seis plantas de energía** con litio. (La copia «V1 (5) (1)-1» recibida el 27/10 tiene el mismo texto: es otra exportación del mismo documento.)

**Complemento ZTE ZXDC48 FB150C1:** *Product Description* V1.0 (2020-05, inglés, 14 pp., ZTE confidencial) y *Data sheet* (2019, 2 diapositivas) — §2b. Es documento **del operador**: dice cómo Claro configura sus sitios (vale más que el valor de fábrica para Wanomi).
**No se copian:** contraseñas y direcciones de acceso de las plantas que figuran en el §7.

| Módulo | Páginas | Comunicación | Contactos secos |
|---|---|---|---|
| **Huawei CloudLi ESM-48150B1** (con concentrador SCC800) | 10–25 | RS485 (Modbus) + CAN entre módulos; TCP/IP vía SCC800 | DO1 = cualquier falla/protección · DO2 = SOC bajo |
| **Shoto SDA10-48150** | 26–39 | RS232, RS485, TCP/IP (SNMP) | DO1 = SOC bajo · DO2 = cualquier falla/protección |
| **ZTE ZXDC48 FB150C1** (Coslight) | 40–51 | RS232, RS485 | DO = solo SOC bajo (las demás alarmas se inhiben a propósito) |

Contactos **normal cerrado**: se abren con alarma (en Shoto hay que cablearlos en serie; en Huawei se replican entre módulos).

## 2 · Valores que Claro programa en la planta con litio (pp. 25, 39, 51)
| Parámetro | Huawei | Shoto / ZTE | Nota |
|---|---|---|---|
| Flote | **54 V** | **52,5 V** | ecualización y compensación por temperatura **deshabilitadas** |
| Límite de corriente de recarga | 10 % de la capacidad | 10 % | |
| **Alarma de baja tensión de batería** | **50 V** | **50 V** | «en algunas plantas define batería en descarga» |
| **Alarma de muy baja tensión** | **46,5 V** | **46,5 V** | |
| LVLD (cargas no esenciales) | 41 V, reconecta 43 V | 41 V / 43 V | en el §7 por planta: **40 V** |
| LVBD (batería) | 40 V, reconecta 42 V | 40 V / 42 V | |
| Corte de cargas no esenciales por **SOC ≤ 20 %** | por contacto seco del BMS a una entrada digital de la planta; si la planta no puede, **por tiempo** (tabla del anexo 8.2) | | alarma SOC al 20 %, se libera al 35 % (Shoto) |

**Ajuste por planta (§7, pp. 52–66):** Delta Orion, Eltek Smartpack S, Eaton SC200, DPC SC501, ZTE CSU501B, Vertiv M830B — flote 52,5 V, LVBD 40 V, LVLD 40 V. Reconexión LVD: DPC 44 V; Vertiv LVD2 46 V y LVD1 49,5 V. ZTE CSU501B y Vertiv M830B **no pueden** cortar por entrada externa → LVLD **por tiempo**.
**Riesgo anotado por Claro (p. 66):** en Vertiv, el LVD1 por tiempo sigue dependiendo de la tensión; puede dar problemas con baterías Huawei en modo de tensión de salida regulada.

## 2b · Protecciones de fábrica del BMS · ZTE ZXDC48 FB150C1 (Product Description, Tabla 3-3, pp. 8–9; data sheet)
| Protección / dato | De fábrica |
|---|---|
| Tensión de carga estándar | **52,5 V** (coincide con Claro) |
| Protección por **alta tensión** del módulo | **55,5 V** |
| Protección por **baja tensión** del módulo (corta la batería) | **42 V** |
| Protección por celda alta / baja | 3,85 V / 2,55 V |
| Protección por sobrecorriente | **110 A** (carga y descarga 0–100 A) |
| Limitador de corriente de carga | 10 A (se activa solo según temperatura, tensión y corriente de celdas) |
| Temperatura de carga / descarga | **0 a 55 °C** / −20 a 55 °C |
| Capacidad / energía | 150 Ah (C5, 25 °C, corte 42 V) / 7,2 kWh |
| Vida | 15 años a 25 °C · 3500 ciclos al 80 % de descarga a 35 °C |
| Autodescarga | < 3 % por mes |
| Paralelo | hasta 15 (data sheet) o 16 (product description) módulos |
| Comunicación | RS485 ×2 (protocolo YD/T 1363.3-2014, hacia la CSU de ZTE) · RS232 solo para actualizar software · 1 contacto seco |

**Consecuencia:** el BMS de ZTE **corta solo a 42 V**, antes que el LVBD de la planta (40 V, ajuste de Claro). En un sitio con baterías ZTE el corte real del respaldo es **42 V**: es el valor que tiene que usar el «tiempo hasta corte» (DC-03), no 40 V. Además el BMS **no carga por debajo de 0 °C**.

## 3 · Autonomía (anexo 8.2, p. 70)
Módulo 150 Ah, descarga hasta 42 V, curva casi lineal (el SOC se puede estimar por consumo):

| Corriente por módulo | 15 A (0,1 C) | 30 A | 45 A | 60 A | 75 A | 90 A | 100,5 A (0,67 C, máx.) |
|---|---|---|---|---|---|---|---|
| Reserva total (min) | 618 | 306 | 200 | 148 | 117 | 97 | 82 |
| Tiempo hasta SOC 20 % (min) | 494 | 245 | 160 | 119 | 94 | 78 | 65 |

## 4 · Estados del BMS (indicadores, pp. 11, 33, 47)
| Estado | Qué significa | Qué hacer |
|---|---|---|
| ALM fijo (Huawei) | alarma mayor o falla | Leer el BMS (software del fabricante / SCC800) |
| RUN intermitente corto (Huawei) | **comunicación interrumpida** con el controlador | Revisar bus RS485/CAN y terminación |
| Protección por sobretensión / sobrecorriente / cortocircuito / polaridad (Shoto, ZTE) | el BMS abrió el módulo | Corregir la causa; el módulo no entrega |
| **Protección por baja tensión / baja capacidad** | el módulo **corta la salida** a los equipos | Restituir energía; el sitio cae si todos los módulos cortan |
| Alarma de temperatura (carga o descarga) | fuera de rango térmico | Revisar climatización |
| Falla de sistema (ZTE: todo intermitente + sonido) | fuera de servicio | Reemplazar módulo |
| Modo mantenimiento (Huawei: SOC apagado, resto intermitente) | — | — |

**Ojo (p. 20):** si el concentrador SCC800 se alimenta de la misma planta, al abrir los LVD o cortar los módulos **se pierde la gestión remota** — exactamente cuando más se la necesita.

## 5 · Hallazgo para Wanomi
Los umbrales de bus DC de la ficha `ELTEK` (aviso **−52 V**, crítico **−48 V**, LVD **−43,2 V**) están pensados para **plomo-ácido VRLA**. En un sitio de Claro con **litio**:
- el flote es 52,5 V, así que el aviso de −52 V queda a 0,5 V del flote y salta con cualquier descarga mínima;
- Claro usa **50 V** como baja tensión (batería en descarga) y **46,5 V** como muy baja;
- el LVD está en **40 V**, no en 43,2 V, y con baterías ZTE el propio BMS corta a **42 V**: el «tiempo hasta corte» (DC-03) tiene que usar el primero que actúe.

## 6 · Propuestas (a firmar)
- **L1** · Agregar a la ficha del sitio la **tecnología de batería** (VRLA / LiFePO4) y que los límites del bus DC se tomen según esa tecnología: VRLA = valores actuales; litio = 50 / 46,5 V y corte en el mayor entre el LVBD de la planta (40 V) y la protección del BMS (42 V en ZTE) (fuente: este manual y la Product Description ZTE).
- **L2** · Leer el **SOC** y las alarmas del BMS cuando haya acceso (Shoto por SNMP; Huawei por SCC800; ZTE por RS485) y usar SOC ≤ 20 % como aviso de corte inminente de cargas no esenciales.
- **L3** · Regla: «concentrador del BMS alimentado desde la misma planta» como riesgo de pérdida de gestión (dato de instalación).
