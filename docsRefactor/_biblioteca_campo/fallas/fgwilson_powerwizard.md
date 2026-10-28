# Biblioteca de fallas · Grupo FG Wilson serie P · controladores PowerWizard / DeepSea / FG100

## 1 · Fuente
*Manual de operación y mantenimiento* FG Wilson **356-5902 v15** (02/22, español, 81 pp.) — `manual grupo wilson.pdf`. Es manual **del operador**: describe alarmas y una guía corta de averías; los valores de protección no están (se configuran por grupo; nivel 3 de contraseña reservado al distribuidor).
Cubre cuatro controladores: **PowerWizard 1.1 / 1.1+ / 2.1** (pp. 38–45), **PowerWizard 2.1+ / 4.1** (pp. 46–52), **DeepSea** (pp. 53–55), **FG100** (pp. 57–63).
**Wanomi:** no hay ficha `FGWILSON`.

## 2 · Cómo alarma
| Controlador | Advertencia | Parada | Reinicio |
|---|---|---|---|
| PowerWizard | luz **amarilla** (parpadea = no reconocida; fija = reconocida) | luz **roja**; la causa debe resetearse a mano | en STOP, desde el registro de eventos; los eventos «presentes» no se pueden borrar |
| DeepSea | solo ícono; **se autorresetean** al irse la causa (salvo «advertencias con enclavamiento») | ícono + LED de STOP parpadeando. **Desconexión eléctrica**: saca la carga, enfría y para (enclavada) | botón Parada/Reset |
| FG100 | ADVERTENCIA | **Punto de carga**: suelta el contactor y para tras el enfriamiento · **Parada**: suelta y para de inmediato | botones de modo |

- El registro de eventos del PowerWizard da **SPN y FMI** (J1939), hora y horas de motor de la primera y última vez.
- FG100: la primera alarma bloquea las de igual o menor nivel (una parada no deja entrar otras).
- **Fallo crítico (p. 35):** advertencia de **categoría 3** del sistema de supervisión en refrigeración, lubricación, motor (ECM) o combustible → **detener el motor**.

## 3 · Valores que sí da el manual
| Dato | Valor | Página |
|---|---|---|
| Bomba de trasvase de combustible automática | arranca al **25 %**, para al **75 %** | 44, 51 |
| Enfriamiento antes de la parada | «suele tardar unos **3 minutos**» | 52 |
| **Ejercicio de grupo de emergencia** | cada **2 semanas**: 5 min sin carga · cada **mes**: ≥ **50 % de carga durante 1–2 h** · no funcionar con carga baja por períodos largos | 76 |
| Revisión anual / 500 h | probar todos los dispositivos de seguridad simulando fallas | 76 |

## 4 · Alarmas y localización de averías (guía PowerWizard, pp. 45 y 52)
| Avería | Qué muestra | Qué hacer (fabricante) | Wanomi |
|---|---|---|---|
| **No arranca** (manual, tecla o remoto) | — | Verificar paradas de emergencia sin activar, luz de STOP apagada, sin eventos de parada activos; resetear tras corregir | AR-02 (falla de arranque) |
| **Parada por baja presión de aceite** | «BAJA PRESIÓN DE ACEITE», LED rojo | Verificar nivel de aceite; distribuidor | presión de aceite |
| **Parada por alta temperatura de refrigerante** | «HIGH COOLANT TEMP», LED rojo | Nivel de refrigerante (con precaución al abrir); distribuidor | temperatura |
| **Parada por sobrevelocidad** | «OVERSPEED», LED rojo | Verificar velocidad real; distribuidor | rpm |
| **Parada por baja / alta tensión** | «UNDER-VOLTAGE» / «Over-voltage» | Distribuidor | SG-02 / SG-03 |
| **No toma carga** | funciona pero la carga no se energiza | Distribuidor | cascada (transferencia) |
| **No para en manual** | sigue después de STOP | Verificar si está enfriando (~3 min); si no, distribuidor | — |
| **No para en automático** | sigue sin señal de arranque | Revisar señales remotas: entrada digital, reloj, **Modbus**, PLC, multi-grupo | — |
| **«Not In Auto Mode»** | LED ámbar | Poner en AUTO; verificar paradas de emergencia | AR-07 / modo |
| **Fail to stop** (DeepSea / FG100) | el motor no se detiene en el tiempo de parada | Revisar solenoide / combustible | — |
| **Petición de servicio** (FG100) | LED rojo parpadeando por horas o tiempo | Hacer el servicio; reiniciar contador | — |

**DeepSea (p. 55):** «localización de averías» remite al distribuidor; no trae tabla.

## 5 · Uso para Wanomi
- **H3 del spec de textos (cat-AR-08, «sin ejercicio semanal»):** la cadencia del fabricante es **quincenal sin carga y mensual con ≥ 50 % de carga 1–2 h** (p. 76). Sirve de fuente para el texto y para revisar el período de la regla (hoy semanal).
- Los códigos de motor llegan como **SPN/FMI**: ver `grupo_sdmo_telys_nexys.md` §4 (diccionario J1939 del anexo D).

## 6 · Propuestas (a firmar)
- **W1** · Fuente para AR-08: ejercicio según FG Wilson (quincenal en vacío, mensual con carga) — decidir si la regla pasa a quincenal/mensual o queda semanal como criterio Claro.
- **W2** · Ficha `FGWILSON` sin umbrales propios; los textos de §4 como «Pasos a seguir».
