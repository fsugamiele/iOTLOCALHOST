# Biblioteca de fallas · Grupo SDMO (Kohler) · cajas de control NEXYS / TELYS (sitio Monte Ralo)

## 1 · Fuente
*Manual de uso y mantenimiento* de grupos electrógenos SDMO **33501732001NE_2_1** (español, 266 pp.) — `manual grupo monte ralo.pdf`. Grupo móvil / de alquiler (cuadros M126 / M127), motores **John Deere, Volvo o Perkins**.
Secciones usadas: NEXYS fallos y alarmas (pp. 43–45 del manual), TELYS (pp. 46–62), batería (p. 67), **anexo D: códigos de anomalías J1939 de motores John Deere, Volvo y Perkins** (pp. 251–266). Anexos A y B = manuales del motor y del alternador.
**No trae** valores de protección ajustables (se ven en el menú del TELYS por grupo). **Wanomi:** no hay ficha `SDMO`.

## 2 · Cómo alarma
| | Alarma | Fallo |
|---|---|---|
| **NEXYS** | pictograma | pictograma o código + mensaje **SOS**; solo se ve el **primer** fallo (el que paró el grupo) hasta resetearlo |
| **TELYS** | LED **amarillo** «Alarma general» parpadeando + pictograma + mensaje; se **reinicia sola** al irse la causa | LED **rojo** «Fallo general»; **para el grupo** (inmediato, o diferido en temperatura de agua y sobrecarga/cortocircuito); reinicio con **Esc** solo si la causa desapareció |

TELYS muestra **ayuda** por anomalía (tecla OK) y los **códigos de motor** como SPN + FMI (p. ej. «MOTOR CÓDIGO 110 18»).

## 3 · Fallos y alarmas (NEXYS, pp. 43–45)
| Anomalía | Tipo | Qué significa (manual) | Qué hacer | Wanomi |
|---|---|---|---|---|
| Presión de aceite | **Fallo** (para) | presión incorrecta | Nivel de aceite; código de motor | presión de aceite |
| Temperatura del motor | **Fallo** | temperatura demasiado alta | Nivel de refrigerante, radiador | temperatura |
| **Fallo de arranque** | **Fallo** | **3 intentos seguidos** sin éxito | Combustible, batería de arranque | AR-02 |
| Sobrevelocidad | **Fallo** | velocidad excesiva | Regulación | rpm |
| Subvelocidad | **Fallo** | velocidad **< 1.000 rpm** | Sobrecarga, combustible | rpm |
| Bajo nivel de carburante | **Fallo** y **alarma** | necesidad de combustible | Cargar combustible | combustible (G2, gen-fuel-*) |
| Bajo nivel de refrigerante | **Fallo** | nivel bajo en el radiador (2 s) | Completar; buscar fuga | — |
| Sobrecarga o cortocircuito | **Fallo** | disparo del disyuntor (contacto SD): para instantáneamente | Revisar la carga | — |
| Diferencial / aislamiento | **Fallo** | relé diferencial o controlador de aislamiento | Revisar instalación | — |
| Parada de emergencia (local o exterior) | **Fallo** | pulsador activado | Verificar posición del pulsador y conexiones | — |
| «STOP» en automático | **Fallo** | se pulsó STOP con el grupo en AUTO | Volver a AUTO | modo |
| Fallo del alternador de carga | **Alarma** | problema en la carga de la batería | Correa, alternador de carga | batería del grupo |

**Parada normal (p. 43):** dejar girar en vacío **1–2 min** para enfriar antes de STOP.
**Batería (p. 67):** tabla de fallos — arranque difícil (batería vacía, gastada o sulfatada), bornes fundidos (mala conexión), descarga rápida (cortocircuito, autodescarga), consumo de agua alto (tensión de carga excesiva: revisar el cargador).

## 4 · Diccionario J1939 (anexo D, pp. 251–266)
Tabla de **SPN** con su equivalente CID (Perkins), SID/PID/PPID (Volvo) y SPN (John Deere), y cada **FMI** con su descripción. SPN útiles para Wanomi: **97** agua en combustible · **98** nivel de aceite · **100** presión de aceite · **102** presión de aire del colector · **105** temperatura del aire de admisión · **158 / 168** tensión de batería / sistema · **174** temperatura de combustible · **175** temperatura de aceite · **190** velocidad del motor · **1136** temperatura de la ECU · **2017** bus J1939.

**FMI (pp. 264–266):**
| FMI | Significado |
|---|---|
| 0 / 1 | dato válido **por encima / por debajo** del rango normal — nivel **más grave** |
| 2 | dato irregular, intermitente o incorrecto |
| 3 / 4 | tensión alta (corto a fuente alta) / baja (corto a fuente baja) |
| 5 / 6 | corriente baja o circuito abierto / corriente alta o a masa |
| 7 | sistema mecánico no responde o desajustado |
| 8 / 9 / 10 | frecuencia o PWM irregular / velocidad de actualización irregular / velocidad de cambio irregular |
| 11 | causa raíz desconocida |
| 12 | dispositivo inteligente defectuoso (reemplazar ECU) |
| 13 | fuera de calibración |
| 14 | instrucciones especiales |
| 15 / 16 | por encima del rango — nivel menos grave / moderadamente grave |
| 17 / 18 | por debajo del rango — nivel menos grave / moderadamente grave |
| 19 | datos de red recibidos con error |
| 20–30 | reservados SAE |
| 31 | la condición existe |

**Uso:** los FMI son estándar SAE J1939: sirven para **cualquier motor con ECM** (también Cummins ISX y FG Wilson/Perkins). Permiten armar el texto de una alarma de código de motor como «SPN + FMI → qué parte y qué tipo de falla», con la gravedad implícita en el FMI (0/1 más grave, 15–18 menos).

## 5 · Propuestas (a firmar)
- **S1** · Ficha `SDMO` (sitio Monte Ralo) con las anomalías de §3 como textos; umbrales a leer del TELYS del sitio.
- **S2** · Diccionario **J1939 SPN/FMI** común (este anexo + códigos Cummins ISX) para decodificar códigos de motor de cualquier marca en el detalle de la alarma, como ya se hace con los códigos del PCC 1302.
