# Biblioteca de fallas · Eltek Smartpack S (planta DC Flatpack S, −48 V)

## 1 · Fuentes
| Documento | Qué aporta | Páginas |
|---|---|---|
| *User Guide — Smartpack S Controller*, Eltek **350030.013**, 1v0-2012-06 (36 pp.) | modelo de alarmas del controlador (monitores, 4 niveles, histéresis, retardo, reinicio), grupos de salida, LVD, registro de eventos, LEDs | 20–35 |
| *Parametrización de sistemas de energía ELTEK para bancos de baterías VRLA*, Eltek Argentina (Córdoba) | valores recomendados para el banco **Narada 12NDF155** (flote, ecualización, descarga mínima / LVD, corriente de recarga) y procedimiento en PowerSuite / WinPower | 1–8 |
| *Informe técnico final — Adecuación sistemas retrofit MBBU*, Eltek Argentina (OC 4500179028) | composición de gabinete retrofit | — |

**Falta:** *Functionality Description* **350020.073** (valores **por defecto** de cada monitor de alarma). Sin él, los niveles de alarma de la guía son **ejemplos**, no valores de fábrica. La guía tampoco trae una sección de localización de averías.

## 2 · Cómo alarma el controlador (guía 350030.013, pp. 27–33)
- Cada medición tiene un **monitor de alarma** con hasta **4 niveles**: Major High, Minor High, Minor Low, Major Low. Tipos: lógico (L1: contacto abierto/cerrado), numérico (N1, N2 %: cantidad de rectificadores, % de capacidad), analógico (A2, A4: tensión, corriente) y especial (LVD).
- Cada monitor tiene **histéresis**, **retardo** y **reinicio** automático (por defecto) o manual.
- **Major = alarma crítica** (LED rojo); **Minor = aviso** (LED ámbar).
- Cada nivel activa un **grupo de salida**: Major Alarm, Minor Alarm, Mains Alarm, Fuse Alarm, High Battery, Low Battery, Rectifier Alarm, Gen-Set, LVBD (desconexión de batería), LVLD (desconexión de carga).
- Eventos típicos del registro: `RectifierError` (Minor), `SymmVolt` (asimetría entre bloques de batería, Major), `LVD close`, `Door alarm`, `BatteryTemp`, `OutdoorTemp`.
- **LVD:** desconecta al llegar a la tensión de desconexión tras un corte de red; reconecta al volver la red y llegar a la tensión de reconexión. Puede depender de la red («Mains dependent») y de la temperatura de batería.

## 3 · Umbrales
Convención Wanomi: **bus DC negativo** (−54 V = 54 V de flote). «Más bajo» = menos negativo.

| Magnitud | Documento | Valor | Wanomi (ficha `ELTEK`) | Veredicto |
|---|---|---|---|---|
| Tensión de flote | VRLA Narada 12NDF155, p. 1 | **54,0 V** (2,25 V/celda a 25 °C) | referencia −54 V | ✅ coincide |
| Tensión de ecualización | VRLA, p. 1 | **56,4 V** (2,35 V/celda) | — | referencia para no confundir carga a fondo con sobretensión |
| Sobretensión mayor | Guía p. 28 (**ejemplo**) | 57,00 V · hist. 0,10 V · 5 s | trip `lt −57` (DC-05) | ✅ coherente; **la regla DC-05 usa −57 fijo: atarla a la ficha** |
| Descarga mínima / LVD | VRLA p. 1 · Guía p. 31 (**ejemplo**) | **43,2 V** (1,80 V/celda) · ejemplo LVD 43,00 / reconexión 48,00 V | LVD −43,2 | ✅ coincide con el banco Narada |
| Tensión baja (aviso) | — (no documentado) | — | warning `gt −52` | PROVISORIO (criterio Wanomi: anticipar) |
| Tensión crítica | — (no documentado) | — | trip `gt −48` | PROVISORIO (anticipa el LVD; 48 V = reconexión del ejemplo) |
| Corriente de recarga | VRLA, p. 1 y 5 | 33,75 A por string (Narada 155 Ah); de fábrica suele venir 15 A/string | — | candidato a medición nueva (corriente de batería) |
| Temperatura de batería | VRLA, p. 2 | operación recomendada 25 °C / 35 °C; capacidad −16 % bajo 20 °C | warning `gt 35` · trip `gt 45` | ✅ aviso coincide; crítico PROVISORIO |
| Corriente de carga DC | Guía p. 30 (**ejemplo** A2: 4000/5000 A) | no aplicable | B1 80 A · B2 95 A fijos | **sin fuente**: pasar a % de la capacidad instalada (ver supervisor) |

## 4 · Fallas y localización de averías
La guía no trae procedimiento; lo que sigue combina el significado de cada alarma (guía) con la verificación que Wanomi puede hacer a distancia. **PROVISORIO** hasta tener 350020.073.

| Alarma del controlador | Qué significa | Desde Wanomi | En el sitio |
|---|---|---|---|
| **Mains Alarm** (red fuera de límites) | Tensión de red AC fuera de los niveles del monitor de red | ATS `mains_voltage`; ¿el grupo arrancó? | Verificar acometida y térmicas de entrada de los rectificadores |
| **Low Battery / LVD próximo** | La tensión de batería baja durante una descarga (sin red) | `dc_bus_voltage` y su tendencia; tiempo hasta LVD (regla DC-03) | Restituir energía (grupo / grupo móvil); verificar que el LVD esté habilitado |
| **LVBD / LVLD abierto** | El controlador desconectó batería o carga para proteger el banco | El sitio deja de reportar carga; caída de `dc_bus_voltage` | Reconexión automática al volver la red (≥ tensión de reconexión); si no reconecta, revisar contactor |
| **High Battery** (sobretensión) | Tensión del bus sobre el nivel mayor (p. ej. 57 V) | `dc_bus_voltage` | Verificar que no esté en carga a fondo / ecualización (56,4 V es normal en ese modo); revisar tensión de flote configurada |
| **Rectifier Alarm / RectifierError** | Un módulo rectificador falla o no entrega | Reparto de corriente desparejo (regla DC-06), menos corriente total | Revisar LED del módulo; reasentar o reemplazar |
| **SymmVolt** (asimetría) | Un bloque de batería del string se aparta del resto | — (no se mide por bloque) | Medir tensión por bloque; reemplazar el bloque defectuoso |
| **BatteryTemp alta** | Batería sobre la temperatura del monitor | `temperature` | Revisar climatización del shelter; la vida de VRLA cae a la mitad cada +10 °C |
| **Fuse Alarm** | Fusible / interruptor de batería o de carga abierto | Pérdida de una rama de carga | Revisar y reponer el fusible; buscar el cortocircuito antes |
| **Door alarm** | Contacto de puerta del gabinete abierto | SEC (puertas) | Verificar ingreso autorizado |
