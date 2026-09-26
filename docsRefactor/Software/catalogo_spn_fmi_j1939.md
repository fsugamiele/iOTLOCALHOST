# Catálogo J1939 SPN/FMI — diccionario código → acción correctiva

**Fuente:** `docsRefactor/_biblioteca_campo/manual grupo monte ralo.pdf` (motor John Deere,
sección "Localización de averías", pág. 182-184 · ref. OURGP12,00001E2). Códigos DTC
estándar **J1939** — los expone la ECU del motor y los lee el controlador de grupo
(ComAp InteliLite/InteliGen en texto plano vía J1939, DSE, etc.).

> **Uso en Wanomi.** Cuando el controlador reporta un **SPN/FMI activo**, Wanomi lo busca
> en esta tabla y muestra la **acción correctiva de fábrica** como recomendación de la
> alarma — en vez de un texto genérico. El código aparece **antes** de que la protección
> pare el motor → es señal temprana. Ver `diseno_packs_alarmas.md` §1 (mecanismos de
> anticipación) y §5 (recomendación por lookup).
>
> **Honestidad (DEC-PRED-1):** estos son códigos de un motor John Deere. Otros motores
> (Cummins, Perkins, Volvo) usan el **mismo estándar SPN/FMI** pero su lista puede diferir
> en descripciones; validar contra el manual del motor real de cada sitio. No todos los
> códigos se usan en todas las aplicaciones OEM (nota del propio manual).

## Leyenda
- **SPN** = Suspect Parameter Number (qué parámetro). **FMI** = Failure Mode Identifier (cómo falla).
- **Relevancia NOC:** ⚡ = accionable/telemetría (mantenimiento o intervención remota/despacho) · 🔧 = servicio de taller (cableado/inyector → concesionario, se reporta pero no es acción NOC).

---

## 1 · Combustible · aceite · refrigerante · aire (⚡ el núcleo accionable)

| SPN | FMI | Descripción | Acción correctiva | NOC |
|---|---|---|---|---|
| 000094 | 03/04 | Señal de combustible baja presión fuera de rango | Revisar el sensor y el cableado | 🔧 |
| 000094 | 10 | Índice de cambio anormal de presión de combustible | Acudir al concesionario | 🔧 |
| 000094 | 17 | Sistema de alta presión — presión levemente baja | Acudir al concesionario | ⚡ |
| 000097 | 00 | Agua en el combustible continuamente detectada | Acudir al concesionario | ⚡ |
| 000097 | 16 | Se detecta presencia de agua en el combustible | **Parar y vaciar el separador de agua** | ⚡ |
| 000100 | 01 | Presión de aceite del motor **extremadamente baja** | **Comprobar el nivel de aceite** | ⚡ |
| 000100 | 18 | Presión de aceite **moderadamente baja** (pre-aviso) | **Comprobar el nivel de aceite** | ⚡ |
| 000105 | 00 | Temp aire de admisión extremadamente alta | Revisar filtro de aire, postenfriador o temp ambiente | ⚡ |
| 000105 | 16 | Temp aire de admisión moderadamente alta (pre-aviso) | Revisar filtro de aire, postenfriador o temp ambiente | ⚡ |
| 000107 | 00 | Diferencial de presión de filtro de aire extremadamente alto | **Comprobar si hay filtro de aire obstruido** | ⚡ |
| 000110 | 00 | Temp de refrigerante **extremadamente alta** | Revisar sistema de refrigeración, reducir potencia | ⚡ |
| 000110 | 15/16 | Temp de refrigerante ligera/moderadamente alta (pre-aviso) | Revisar sistema de refrigeración, reducir potencia | ⚡ |
| 000111 | 01 | **Nivel bajo del refrigerante del motor** | Verificar "Adición de refrigerante" del manual | ⚡ |
| 000174 | 00 | Temp de combustible extremadamente alta | Añadir combustible o cambiar depósitos | ⚡ |
| 000174 | 16 | Temp de combustible moderadamente alta (pre-aviso) | Añadir combustible o cambiar depósitos | ⚡ |
| 000189 | 00 | Condición de desaceleración del régimen del motor | Verificar códigos de falla / concesionario | ⚡ |
| 000190 | 00 | Régimen del motor **extremadamente alto** (sobrevelocidad) | **Reducir el régimen del motor** | ⚡ |
| 000190 | 16 | Régimen del motor moderadamente alto (pre-aviso) | Reducir el régimen del motor | ⚡ |
| 001080 | 03/04 | Voltaje de alim. del sensor de presión de riel fuera de rango | Revisar el cableado | 🔧 |
| 001109 | 31 | **Advertencia de apagado para protección del motor** | **Apagar el motor, verificar los códigos de falla** | ⚡ |
| 001110 | 31 | **Parada del motor para salvaguardarlo** | **Apagar el motor, verificar los códigos de falla** | ⚡ |
| 001347 | 05 | Solenoide 1 de bomba de alta presión — resistencia alta | Comprobar el cableado de la bomba | 🔧 |
| 001347 | 07 | Bomba de alta presión no alcanza la presión de riel | **Comprobar el filtro y las líneas de combustible** | ⚡ |
| 001569 | 31 | Condición de reducción del régimen de rpm del motor | Verificar los códigos de fallas | ⚡ |

## 2 · Sensores / acelerador / posición-sincronización (🔧 mayormente taller)

| SPN | FMI | Descripción | Acción correctiva | NOC |
|---|---|---|---|---|
| 000028 | 03/04 | Señal del acelerador Nº3 fuera de rango | Revisar el sensor y el cableado | 🔧 |
| 000029 | 03/04 | Señal del acelerador Nº2 fuera de rango | Revisar el sensor y el cableado | 🔧 |
| 000091 | 03/04/09 | Señal del acelerador Nº1 fuera de rango / errática | Revisar el interruptor/sensor y el cableado | 🔧 |
| 000097 | 03/04 | Señal de agua en combustible fuera de rango | Revisar el sensor y el cableado | 🔧 |
| 000100 | 03/04 | Señal de presión de aceite fuera de rango | Revisar el sensor y el cableado | 🔧 |
| 000105 | 03/04 | Señal de temp de aire de admisión fuera de rango | Revisar el sensor y el cableado | 🔧 |
| 000110 | 03/04 | Señal de temp de refrigerante fuera de rango | Revisar el sensor y el cableado | 🔧 |
| 000174 | 03/04 | Señal de temp de combustible fuera de rango | Revisar el sensor y el cableado | 🔧 |
| 000084 | 31 | Señal de velocidad del vehículo no fiable | Acudir al concesionario | 🔧 |
| 000158 | 17 | Error en apagado de la ECU (problema interno) | Acudir al concesionario | 🔧 |
| 000160 | 02 | Señal de velocidad del eje no fiable | Acudir al concesionario | 🔧 |
| 000620 | 03/04 | Voltaje de alim. del sensor 2 alto/bajo | Revisar el cableado | 🔧 |
| 000636 | 02/08/10 | Señal del sensor de posición del motor | Revisar el sensor y el cableado | 🔧 |
| 000637 | 02/07/08/10 | Señal del sensor de sincronización del motor | Revisar el sensor y el cableado | 🔧 |
| 001079 | 03/04 | Tensión alim. Nº1 del sensor alta/baja | Revisar el cableado | 🔧 |
| 001568 | 02 | Señal de la curva de par solicitada no fiable | Acudir al concesionario | 🔧 |

## 3 · Inyección / ECU / CAN (🔧 taller)

| SPN | FMI | Descripción | Acción correctiva | NOC |
|---|---|---|---|---|
| 000611 | 03/04 | Inyector derivado a alimentación / a tierra | Revisar el cableado | 🔧 |
| 000627 | 01 | Todas las corrientes de los inyectores son bajas | Comprobar la tensión de la batería y el cableado | ⚡ |
| 000629 | 13 | Error de programación de la ECU | Acudir al concesionario | 🔧 |
| 000639 | 13 | Error de CAN Bus (red de comunicación) | Acudir al concesionario | 🔧 |
| 000651-656 | 05/06 | Circuito del inyector Nº1-6 resistencia alta/baja | Comprobar cableado del inyector o la electroválvula | 🔧 |
| 000651-656 | 07 | Inyector Nº1-6 no responde | Falla del inyector o limitador de caudal cerrado | 🔧 |
| 000629 | 13 | Error de programación de la ECU | Acudir al concesionario | 🔧 |

## 4 · Órdenes externas (no son avería del motor)

| SPN | FMI | Descripción | Acción correctiva | NOC |
|---|---|---|---|---|
| 000970 | 31 | Detención externa ordenada | No hay avería del motor. Verificar dispositivos de apagado | ⚡ |
| 000971 | 31 | Interruptor externo de reducción de combustible activo | No hay avería del motor. Verificar dispositivos de apagado | ⚡ |
| 002000 | 13 | Violación de seguridad | Acudir al concesionario | ⚡ |

---

> **FMI de referencia (patrón que se repite):** 00 = extremadamente alto · 01 = extremadamente
> bajo · 03 = fuera de rango alto (sensor/cableado) · 04 = fuera de rango bajo (sensor/cableado) ·
> 15/16 = moderadamente alto (**pre-aviso**) · 17/18 = levemente/moderadamente bajo (**pre-aviso**) ·
> 31 = condición existe (protección). Los FMI **15/16/17/18** son los de mayor valor para
> **anticipación**: el motor avisa "moderado" antes del "extremo".
