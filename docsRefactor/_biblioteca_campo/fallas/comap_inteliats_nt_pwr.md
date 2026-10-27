# Biblioteca de fallas · ComAp InteliATS NT PWR (IA-NT PWR)

## 1 · Fuentes
| Documento | Qué aporta | Páginas |
|---|---|---|
| *InteliATS NT — Guía de Referencia*, IA-NT PWR, SW 2.2, nov-2010 (español, 91 pp.) — `ia-nt-pwr-2-0r2-reference-guide_es.pdf` | parámetros con rango, **lista de eventos (alarmas)**, lógica AMF, falla de interruptores, **tabla de valores de fábrica y registros Modbus** | 49–66, 74–82 |
| *Guía del operador* InteliATS (feb-2009, 8 pp.) | uso del panel | — |

**Valores de fábrica:** salen de la tabla «Lista de objetos de comunicación (exportada de la configuración de fábrica de un IA-NT-PWR)», pp. 80–81 (archivo IA-NT-PWR-1.2.AIL). El texto de cada parámetro (pp. 49–66) da solo el rango.

**Ojo:** la ficha Wanomi dice modelo «InteliATS²». La guía es del **IA-NT PWR**. Confirmar en el sitio qué modelo está instalado (placa o pantalla «IA Info»).

**No trae:** sección de localización de averías ni códigos numéricos; las alarmas se identifican por nombre.

## 2 · Cómo alarma (pp. 74, 77)
- **WRN (advertencia):** cierra la salida de la alarma y la de advertencia común. El grupo sigue.
- **TRP (disparo):** abre GCB, apaga el grupo de inmediato y **bloquea el arranque** hasta reiniciar (Fault Reset).
- **MF (falla de red):** se detecta con los umbrales y retardos de red; abre el MCB. **No queda en la lista de alarmas** (sí en el histórico, 117 registros).
- Todas las protecciones eléctricas del generador son **disparo** (p. 60).

## 3 · Umbrales de fábrica (pp. 80–81)
Base: tensión nominal **231 V** (L-N), frecuencia nominal **50 Hz**.

| Protección | De fábrica | Equivale a | Retardo | Registro Modbus | Wanomi hoy |
|---|---|---|---|---|---|
| Red baja tensión (`Mains <V`) | 60 % | **138,6 V** | 2,0 s | 8307 | aviso `lt 198` (F1a, −10 % de 220 V) |
| Red alta tensión (`Mains >V`) | 110 % | **254,1 V** | 2,0 s | 8305 | aviso `gt 242` (F1b) |
| Red desbalance (`Mains V Unbal`) | 10 % | — | 2,0 s | 8446 | — |
| Red baja frecuencia (`Mains <Freq`) | 98 % | **49,0 Hz** | 0,5 s | 8312 | aviso `lt 49,5` (F2a) |
| Red alta frecuencia (`Mains >Freq`) | 102 % | **51,0 Hz** | 0,5 s | 8310 | aviso `gt 50,5` (F2b) |
| Grupo baja tensión (`Gen <V Trp`) | 70 % | **161,7 V** | 3,0 s | 8293 | sin límite en ficha (SG-02 usa 198 fijo) |
| Grupo alta tensión (`Gen >V Trp`) | 110 % | **254,1 V** | 3,0 s | 8291 | sin límite en ficha (SG-03 usa 242 fijo) |
| Grupo desbalance tensión | 10 % | — | 3,0 s | 8288 | — |
| Grupo baja frecuencia (`Gen <Freq Trp`) | 85 % | **42,5 Hz** | 3,0 s | 8298 | sin límite (SG-04 usa 48,5 fijo) |
| Grupo alta frecuencia (`Gen >Freq Trp`) | 110 % | **55,0 Hz** | 3,0 s | 8296 | sin límite (SG-04 usa 51,5 fijo) |
| Desbalance de corriente | 50 % de 350 A | — | 5,0 s | 8284 | — |
| Cortocircuito | 250 % | — | 0,00 s | 8282 | — |
| Sobrecorriente IDMT | 4,0 s a 200 % | — | inversa (máx. 900 s) | 8283 | — |
| Batería del controlador baja / alta | 18,0 V / 36,0 V | — | 5 s | 8387 / 9587 | — |

**Tiempos de la transferencia (AMF), de fábrica:** arranque tras falla de red 5 s · retorno a red 20 s · pausa entre interruptores 1,0 s · cierre MCB 1,0 s · arranque máximo 20 s (si no, `Trp Start Fail`) · estabilización mínima 3 s · tiempo de parada 60 s · aviso de interruptor sin confirmación 5 s (p. 76).

**Lectura:** los avisos de Wanomi (±10 % y ±0,5 Hz) están **dentro** de la ventana del ATS: avisan antes de que el ATS transfiera. Están bien como **aviso temprano** (criterio Wanomi). Lo que el ATS considera «falla de red» de fábrica es mucho más amplio (138,6–254,1 V).
**Pero el sitio puede tener otros valores:** Claro suele reajustarlos. Los registros Modbus de la tabla permiten **leer los valores reales del equipo** (pendiente del driver).

## 4 · Alarmas y localización de averías
Tipo y significado: lista de eventos, p. 77. «Desde Wanomi» y «En el sitio» son verificación propuesta (**PROVISORIO**, la guía no trae procedimiento).

| Alarma | Tipo | Qué significa (manual) | Desde Wanomi | En el sitio |
|---|---|---|---|---|
| **Falla de red** (`Mains <V`, `>V`, `<Freq`, `>Freq`, `V Unbal`) | MF | Red fuera de los umbrales AMF por más del retardo; abre MCB | `mains_voltage`, `mains_freq`; ¿arrancó el grupo dentro de 5 s + 20 s? (cascada) | Verificar acometida, fusibles de medición de red, distribuidora |
| `Trp Start Fail` | TRP | El grupo no llegó a frecuencia nominal en `Max Start Del` (20 s) | `gen_status` sin marcha tras la falla de red; `gen_freq` ausente | Revisar el grupo: combustible, batería de arranque, alarmas en su controlador; reiniciar ATS con Fault Reset |
| `Trp BatteryFlat` | TRP | El controlador se apagó durante el arranque por batería descargada; no reintenta | Pérdida de comunicación del ATS durante el arranque | Revisar batería y cargador del ATS / grupo |
| `Wrn Batt Volt` | WRN | Batería del controlador fuera de 18–36 V | — (sin medición) | Medir batería y cargador |
| `Trp Gen Lx >,<V` | TRP | Tensión del grupo fuera de 70–110 % | `gen_voltage` | Revisar regulador (AVR) del grupo y conexiones |
| `Trp Gen V Unbal` | TRP | Tensión del grupo desbalanceada (> 10 %) | — (una fase medida) | Medir las tres fases del grupo |
| `Trp Gen >Freq` / `<Freq` | TRP | Frecuencia del grupo fuera de 85–110 % | `gen_freq` | Revisar velocidad / gobernador del motor |
| `Wrn Amps Unbal` | WRN | Corriente del grupo desbalanceada (> 50 %) | — | Revisar reparto de cargas por fase |
| `Trp Overload` | TRP | Carga sobre el % de potencia nominal configurado | `load_kw` | Verificar la carga del sitio contra la potencia del grupo |
| `EmergencyStop` | TRP | Entrada de parada de emergencia abierta (normalmente cerrada) | — | Verificar pulsador y cableado de la entrada |
| `GCB Fail` | TRP | El interruptor del grupo no confirma (inmediato o 5 s) | `transfer_state` sin cambio | Revisar contactor del grupo y su contacto de confirmación |
| `MCB Fail` | MF | El interruptor de red no confirma | `transfer_state` sin cambio | Revisar contactor de red; se borra con Fault Reset |
| `Gen CCW Rot` / `Mains CCW Rot` | — | Secuencia de fases invertida en grupo o red (p. 76) | — | Corregir el orden de fases (típico tras una instalación) |
| `Trp GenRd Fail` | TRP | Se perdió la señal «grupo listo para carga» | — | Revisar la señal desde el grupo |
| `Wrn Stop Fail` | WRN | El grupo no se detuvo en `Stop Time` (60 s) | `gen_status` en marcha tras volver la red | Revisar orden de parada y solenoide |
| `Wrn GeStateNA` | WRN | Mal configurado: ni protección del grupo ni señal «listo» | — | Configuración (LiteEdit) |
| `ParamFail` | — | Error de parámetros (tras cambio de firmware); queda en INIT | Pérdida de datos del ATS | Corregir parámetros con LiteEdit |
| `Low BackupBatt` | WRN | Pila del reloj agotada (cambiar cada 5–7 años, p. 88) | — | Reemplazar la pila |

## 5 · Propuestas (a firmar, no aplicadas)
- **P1** · Cargar en la ficha `ATS` los límites de **parada** del grupo con los valores de fábrica (`gen_voltage` 161,7 / 254,1 V; `gen_freq` 42,5 / 55 Hz) y atar SG-02/03/04 a la ficha (Qt2). Hoy esas reglas usan números fijos sin fuente.
- **P2** · Agregar a la ficha el límite de **falla de red** de fábrica (138,6 / 254,1 V; 49 / 51 Hz) como referencia de «el ATS transfiere», manteniendo los avisos ±10 % de Wanomi.
- **P3** · En el perfil de controladora, leer por Modbus los parámetros reales del sitio (8305, 8307, 8310, 8312, 8291, 8293, 8296, 8298) para que los umbrales sigan al equipo y no al valor de fábrica.
