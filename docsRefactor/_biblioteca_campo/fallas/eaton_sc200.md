# Biblioteca de fallas · Eaton SC200 (controlador de planta DC Powerware serie 3G, −48 V)

## 1 · Fuentes
| Documento | Qué aporta | Páginas |
|---|---|---|
| *Manual de la operación — Controlador de sistemas SC200*, Eaton **IPN 997-00012-61A**, ago-2007 (español, 95 pp.) | LVD (modos y parámetros), configuración de alarmas, sobrecarga, arranque de grupo por batería, **tabla de resolución de problemas**, **glosario de alarmas** | 33–46 y 66–76 del manual (págs. 39–46 y 72–82 del PDF) |

**Sin valores de fábrica:** el SC200 se entrega con un *archivo de configuración* (predeterminado o hecho para la aplicación, p. 2). Los umbrales (flote alta/baja, carga alta/baja, LVD, temperatura de batería, sobrecarga) **se leen de cada equipo** (DCTools / web / SNMP).
**Wanomi:** no hay ficha `EATON` todavía.

## 2 · Cómo alarma (pp. 14, 36–39)
- Gravedad por alarma: **crítica, importante, poco importante, aviso** o desactivada; LED rojo = urgente/crítica, amarillo = no urgente.
- Cada alarma puede activar hasta **2 relés** (6 relés; RY6 = «Monitor OK») y lleva una **nota** de texto libre que sale en pantalla y en la trampa SNMP.
- **Período de reconocimiento**: la condición debe durar ese tiempo para alarmar (uno general y otro propio para falla de CA).
- **Seguimiento de flote**: los límites de flote suben o bajan solos cuando una función de control (ecualización, carga rápida, prueba de batería) cambia la tensión — evita falsas alarmas.
- **LVD (pp. 33–36):** dos canales. Modo normal (desconecta por tensión), espejo (LVD2 copia a LVD1) o **temporizador de CA** (desconecta al vencer el tiempo tras el corte o por tensión, lo que pase primero). Parámetros: tensión de desconexión y reconexión, período de reconocimiento, período de bloqueo. La reconexión debe quedar **por encima de la tensión de circuito abierto de una batería descargada**.
- **Arranque del grupo por batería (p. 40):** arranca el grupo cuando los Ah descargados superan un umbral o el bus cae bajo una tensión (no ante cualquier corte breve) y lo mantiene hasta recargar.

## 3 · Umbrales
| Magnitud | Documento | Valor |
|---|---|---|
| Flote alta / baja · carga alta / baja · temperatura de batería alta / baja · LVD · sobrecarga | pp. 37–40 | **configurables, sin valor de fábrica en el manual** |
| Falla parcial de CA | glosario p. 76 | **> 20 %** de los rectificadores sin CA o con pérdida de una fase |
| Sin carga | glosario p. 76 | corriente total **< 2 %** de la máxima o **< 2 A** |
| Zona muerta del sensor de corriente | p. 67 | ≈ **2 %** del fondo de escala (lectura cero normal) |
| Sobrecarga del sistema | p. 40 | % de la capacidad total, o por redundancia (capacidad menos el rectificador mayor); reconocimiento de **varias horas** para no saltar en una recarga normal |
| Sensores | p. 74 | temperatura −20 a +70 °C (±1 °C); bus −60 a +60 V (±0,5 %) |

## 4 · Alarmas (glosario, pp. 75–76) y qué hacer
| Alarma | Qué significa (manual) | Qué hacer | Wanomi |
|---|---|---|---|
| **AC Fail** | Todos los rectificadores sin CA | Restituir energía; verificar arranque del grupo | cascada (M1, C1) |
| **Partial AC Fail** | > 20 % de rectificadores sin CA o una fase perdida | Revisar fases y térmicas de entrada | — |
| **Rectifier Fail** / **Multiple Rect Fail** | Rectificador(es) defectuoso(s) o sin CA | Revisar el módulo; reemplazar | DC-06 |
| **Rect(s) Comms Lost** | Rectificador retirado o bus de comunicación caído | Si fue mantenimiento, reconfigurar; si no, revisar el bus | — |
| **Rect Current Limit** | Rectificadores limitando corriente | Normal en recarga; si persiste, falta capacidad | B1/B2 |
| **Rect Over-Temp** | Rectificadores con potencia reducida por temperatura ambiente alta o CA baja | Revisar climatización y tensión de CA | — |
| **System Overload** | La planta trabaja al límite: hay que instalar más rectificadores | Ampliar capacidad | B1/B2 |
| **High Float** / **Low Float** | Flote fuera del rango normal | Revisar tensión de flote configurada / rectificadores | DC-05 / DC-09 |
| **High Load** / **Low Load** | Bus fuera del rango seguro para carga y batería | Alta: revisar regulación. Baja: descarga en curso, ver autonomía | DC-05 / DC-03 |
| **In Discharge** | Las baterías se están descargando | Seguir la autonomía; verificar la red / el grupo | DC-03 |
| **LVD1/LVD2 Disconnected** | El LVD desconectó batería o carga | Ver «sistema sin salida de CC» abajo | — |
| **LVD1/LVD2 Fail** | Contactor defectuoso o cable de control desconectado | Revisar contactor, contacto auxiliar y cableado | — |
| **LVD Manual** | LVD forzado a mano | Volver a AUTO | — |
| **Batt Fuse Fail** / **Load Fuse Fail** | Fusible o microdisyuntor abierto | Buscar la causa y reponer | — |
| **High Batt Temp** | Batería sobre el punto de ajuste: inestabilidad térmica o vida acortada | Revisar climatización | `temperature` |
| **Low Batt Temp** | Batería bajo el punto de ajuste: menos capacidad de respaldo | Revisar calefacción / recinto | — |
| **Batt Test Fail** | La batería no tiene la capacidad necesaria o no estaba cargada | Programar reemplazo / repetir con carga completa | — |
| **MOV Fail** · **ACD Fan Fail** · **Cabinet Fan Fail** | Descargador, ventilador de distribución de CA o del gabinete | Reemplazar | — |
| **Sensor Fail** · **Missing / New / Unknown Hardware** · **Config Error** | Sensor, placa de E/S o configuración | Ver resolución de problemas | staleness |
| **Generator Start** | Pedido de arranque del grupo por descarga | — (estado) | cascada |

**Resolución de problemas (pp. 66–71), casos que importan en campo:**
- **Sistema sin salida de CC con rectificadores encendidos** → fusible de carga abierto, o LVD de carga desconectado (verificar habilitación y valores en DCTools, LED de LVD en la placa de E/S, cables de control y del bus).
- **Sin entrada de batería** → fusible de batería abierto, o LVD de batería desconectado (mismos controles).
- **LED de LVD parpadeando** → el contactor no está en el estado que el SC200 espera: revisar el contactor y su contacto auxiliar.
- **Lectura de batería o carga incorrecta** → polaridad del sensor de bus, configuración de derivación (shunt), o corriente bajo la zona muerta (normal).
- **Pantalla `???` o N/A** → sensor averiado, desconectado o sin configurar.
- **Config Error** → archivo de configuración faltante o incorrecto, rectificadores de distinta tensión, o celdas por banco que no coinciden con la tensión.

## 5 · Propuestas (a firmar)
- **E1** · Crear la ficha `EATON` sin umbrales propios: leer los del equipo (SNMP) y marcar PROVISORIO hasta tener el archivo de configuración del sitio.
- **E2** · Pedir a Claro el archivo de configuración (DCTools) de un sitio con SC200.
