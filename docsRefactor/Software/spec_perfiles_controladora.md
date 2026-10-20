# SPEC — Perfiles de controladora: reglas genéricas, umbrales por equipo · 2026-10-20 · PARA FIRMAR

**Origen:** Franco 2026-10-20: "cómo haremos dinámicas las reglas cuando tengamos el hardware funcionando para que el firmware del core detecte cada controladora diferente de cada sitio y podamos aplicarles las reglas correspondientes". Dato de campo (Franco): **los grupos Cummins de Claro tienen en su mayoría PowerCommand HMI211 + PCC 1302** → el primer perfil real es el del manual A040D969 (`_biblioteca_campo/cummins_pcc1302_manual_servicio.md`).
**Encadena con:** BACKLOG-ONBOARD-1 (autodescubrimiento), DEC-INTEGRATION-1 (Connect multi-driver), spec_cascada_ficha (límites de ficha, `relativeTo`/`refParams`).

## 0 · CANDADO
- Esta spec cubre **solo la parte de software**, que se puede construir y probar hoy. La detección en el CORE (firmware) queda para cuando haya fierro instalado: probarla contra nuestro simulador no prueba nada (nota anti-demo de BACKLOG-ONBOARD-1).
- Read-only estricto con las controladoras (decisión de seguridad del MVP): se leen setpoints, nunca se escriben.
- Umbrales: solo valores citados del manual o leídos del equipo. Lo que el manual da como **rango ajustable** no se convierte en un número inventado.

## 1 · Principio
**La regla no cambia por controladora; cambian los números, las mediciones disponibles y el significado de los códigos.** "Presión de aceite baja" es la misma regla para un PCC 1302 y un PC2100; cada equipo trae su propio umbral.

## 2 · Piezas
### 2.1 Perfil de controladora (colección nueva `controllerprofiles`, datos editables por API)
| Campo | Contenido | Ejemplo PCC 1302 |
|---|---|---|
| `profileId`, `deviceType`, fabricante, modelo, variantes | identidad | `cummins-pcc1302`, `cummins-pcc`, HMI211 |
| `variables` | qué mediciones tiene + conversión de unidad | consumo gal/h → L/h (× 3,785); horómetro con tope 6553,5 h |
| `limits` | umbrales del fabricante por medición (mismo formato que la ficha: warning/trip, op, valor, fuente) | aceite: parada 180 kPa (código 415, motores con ECM) |
| `faultCodes` | diccionario código → nombre, tipo (advertencia/parada), causas posibles | 74 códigos del manual (488 = temperatura de admisión) |
| `readableSetpoints` | setpoints que el driver puede leer del equipo | batería baja/alta, LOP, HCT (cuando haya mapa Modbus) |
| `install` | requisitos de comisionado | "Wake-in-Auto activado o puente TB15-1/TB15-5" (el PCC 1302 se duerme a los 5 min) |

### 2.2 Umbral en cascada — por equipo, no por tipo
Hoy la regla toma el límite de la **ficha del tipo** (`limitRef`) y el motor ya puede ajustarlo **por equipo** (`relativeTo` + `refParams`, batería 12/24 V). Se extiende ese mismo camino a tres niveles, del más específico al más general:
1. **Equipo:** setpoint leído de la controladora del sitio, o cargado por el instalador (`device.refParams`).
2. **Modelo:** límite del perfil asignado al equipo (`device.profileId`).
3. **Tipo:** límite de la ficha (lo de hoy).

Implementación prevista: al recargar, el motor arma por equipo un mapa de límites efectivos (como hoy vuelca `refParams` como pseudo-variables) y la condición con `limitRef` toma el del equipo; si el equipo no tiene ni perfil ni valor propio, queda el de la ficha → **cero cambio de comportamiento** para los equipos actuales.

### 2.3 Regla "no aplicable"
Cada regla ya declara qué mediciones usa. Si el perfil del equipo no tiene una (p. ej. "presión de aceite no disponible en todos los modelos"), la regla queda **no aplicable** para ese equipo: no evalúa, no da "sin datos", y la tarjeta lo muestra.

### 2.4 Códigos de falla con significado
"Cualquier código de falla activo" y las reglas por código toman nombre, tipo y causas del diccionario del perfil → el detalle de alarma (v2) muestra "488 · Temperatura de admisión alta · causas: …" en vez de un número.

### 2.5 Asignación del perfil
**Hoy:** a mano, en el alta o edición del equipo (selector "Controladora"). **Con fierro:** el CORE publica la huella (modelo/firmware leídos) y el Hub propone el perfil; el instalador confirma. Si la huella cambia → alarma "cambió la controladora" y vuelve a confirmación.

## 3 · Preguntas a firmar
| # | Pregunta | Recomendación |
|---|---|---|
| Qp1 | ¿Perfiles como colección propia o como variantes dentro de la ficha? | **Colección propia:** un tipo (`cummins-pcc`) tiene varios modelos; la ficha sigue siendo el genérico. |
| Qp2 | Parada por aceite del PCC 1302: el manual fija **180 kPa** solo para motores **con ECM**; en motores sin ECM es ajustable (62–689 kPa). ¿Cómo cargamos el perfil? | **Perfil con 180 kPa (variante ECM) y, para los sin ECM, el valor lo carga el instalador del menú del HMI211 en el comisionado.** Sin valor → queda el de la ficha. |
| Qp3 | Nuestro aviso de aceite debe anticipar la parada del controlador. | **Aviso = parada del equipo + 10 %** (180 → 198 kPa) en lugar de un número fijo, y espera ≤ 10 s (el controlador para a los 10 s). |
| Qp4 | Regla "no aplicable" visible en la tarjeta | **Sí.** |
| Qp5 | Diccionario de códigos en el detalle de alarma | **Sí**, cargando los 74 códigos del PCC 1302. |
| Qp6 | Asignación manual del perfil mientras no hay fierro | **Sí**, selector en el equipo; el demo asigna PCC 1302 al Cummins. |

## 4 · Fuera de esta spec (ya identificado, va aparte)
Renombrar cat-GE-12 (488 ≠ filtro de aire) · reglas nuevas 1463 "no en automático" y 1131 "modo derivación" · simulador con códigos de falla y enfriamiento · checklist de comisionado (modo inactivo). Mapa Modbus del PCC 1302: sigue faltando.
