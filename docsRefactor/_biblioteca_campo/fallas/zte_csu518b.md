# Biblioteca de fallas · ZTE ZXDU CSU518B / CSU513B / CSU501B (unidad de supervisión de planta DC, −48 V)

## 1 · Fuentes
| Documento | Qué aporta | Páginas |
|---|---|---|
| *Guía de usuario ZXDU CSU518B & 513B — Configuración de baterías y comunicación*, ZTE, 2016-03-20 (1.0), español, 36 pp. | indicadores, comunicación (SNMP, TCP/IP), **valores predeterminados de batería, prueba, LVD y desconexión por temperatura** | 4–5, 15–17, 21–35 |
| Hoja de configuración CSU501B (operador ENTEL, Bolivia; 2 pp.) | predeterminados vs. valores de una puesta en marcha | 1 |
| *Manual de instaladores BB litio* (AMX Argentina / Claro), §7.5 | ajustes de Claro de la CSU501B con baterías de litio | 64–65 |

**No se copian:** contraseñas y claves SNMP/GPRS de fábrica que figuran en la guía y en la hoja CSU501B.
**Falta:** **lista de alarmas** de la CSU (la guía es solo de configuración). Buscar el *ZXDU68 / CSU User Manual* (capítulo de alarmas) en support.zte.com.cn o pedirlo a ZTE / Claro.
**Wanomi:** no hay ficha `ZTE`.

## 2 · Indicadores (p. 4)
| Encendido | Funcionamiento | Alarma | Estado |
|---|---|---|---|
| encendido | intermitente | apagado | normal |
| encendido | intermitente | **intermitente** | **alarma** |
| encendido | fijo encendido / apagado | — | **CSU defectuosa** |
| apagado | apagado | apagado | no funciona |

Acceso remoto: SNMP (agente 161, trampas 163), TCP/IP (protocolo NE/1104), HTTP, Telnet, FTP (p. 4, 16).

## 3 · Umbrales predeterminados (guía CSU518B)
| Parámetro | De fábrica | Página | Nota |
|---|---|---|---|
| Flote | **53,5 V** | 25 | igual que Vertiv |
| Ecualización | habilitada · cada **90 días**; también tras prueba de batería, retorno de red o descarga ≥ 15 % | 21–22 | ecualización 56,4 V (hoja CSU501B) |
| Corriente de carga | **0,150 C10** | 22 | Claro litio: 0,100 C10 |
| Prueba de batería: fin por tensión / capacidad / duración | **46,0 V** / 0,65 C10 / 8 h | 29 | prueba periódica desactivada (0 días) |
| Detección de batería (2 min sobre batería) | cada **30 días** | 30–31 | sirve para ver si la batería está en línea |
| **LLVD1** (cargas secundarias) | habilitado · **45,0 V** · 300 min · 0,6 C10 | 33 | modo por tensión |
| **LLVD2** (cargas primarias) | **deshabilitado** · 44,0 V · 600 min | 33 | |
| **BLVD** (batería) | habilitado · **44,0 V** · 600 min | 33 | |
| Desconexión de carga por baja temperatura ambiente (LLTD) | deshabilitada · −15 °C | 34 | |
| Desconexión de batería por alta temperatura (BHTD) | deshabilitada · **50 °C** | 35 | temperatura **de batería**, no ambiente |
| Desconexión de batería por baja temperatura (BLTD) | deshabilitada · −15 °C | 35 | |
| Baterías de litio (LiFe) | carga 54 V · arranca carga con SOC < 80 % · 0,320 C10 · máx. 900 min | 27 | LiFe no admite flote ni ecualización |

**Orden de desconexión (p. 31):** LLVD1 → LLVD2 → BLVD. Modo por **tensión**, por **capacidad restante** o por **tiempo sin red**. Reconexión automática al volver la red con rectificadores sanos.
**Advertencia del fabricante (p. 33):** si la planta no tiene una de esas desconexiones físicas, el parámetro debe quedar **deshabilitado**, si no genera **falsas alarmas**.

## 4 · Qué vigilar desde Wanomi (PROVISORIO, sin lista de alarmas)
| Situación | Señal | Qué hacer |
|---|---|---|
| Descarga con red ausente | bus cae hacia 45 V (LLVD1) | Restituir energía antes de que corte cargas secundarias |
| LLVD1 / BLVD abiertos | caída de carga / pérdida del sitio | Reconexión automática con red; si no, revisar contactor |
| Prueba de batería que terminó por 46 V antes de 8 h | capacidad baja | Programar reemplazo |
| Falsa alarma de LVD | parámetro habilitado sin contactor físico | Deshabilitar el LVD inexistente |
| Alta temperatura de batería | `temperature` | Revisar climatización; BHTD a 50 °C si está habilitada |

## 5 · Propuestas (a firmar)
- **Z1** · Conseguir la lista de alarmas de la CSU (manual de usuario completo).
- **Z2** · Ficha `ZTE` con los predeterminados de §3 como referencia, y lectura por SNMP de los valores reales del sitio.
