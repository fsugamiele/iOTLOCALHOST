# Catálogo de detección — reglas desde datos ComAp InteliATS NT

**Sesión #14 · Bloque 3 (B2 ampliado) · Área 2 + Confiabilidad**
Premisa: el sistema ya tiene motor de reglas/alarmas (a robustecer). Este catálogo lo **alimenta** con el controlador ComAp ya mapeado.
Honestidad arquitectónica (DEC-INTEL-1 / DEC-PRED-1): **detección = día 1 (reglas, sin baseline)**; lo que necesita historia se marca como *stateful* o *madurando*.

## Clave de tipo
- **D** = stateless, día 1 (umbral directo, sin historia)
- **C** = auto-calibrada (compara contra setpoint leíble del propio ComAp)
- **S** = stateful (necesita ventana corta de historia/estado)
- **M** = madurando (soft sensor, valor crece con el piloto)
- **X** = requiere decodificar config del sitio (qué bit = qué)

---

## 1 · Energía / cascada (red → grupo → ATS) — el núcleo

| # | Regla | Registros | Tipo |
|---|---|---|---|
| R1 | Pérdida de red | Mains V 8195-97 (calib. Mains<V 8307) | D/C |
| R2 | Retorno de red | Mains V 8195-97 | D |
| R3 | Transferencia a grupo | Breaker State 8455 | D |
| R4 | Retransferencia a red | Breaker State 8455 | D |
| R5 | **Falla de transferencia** (red cae + grupo corre, pero ATS no transfiere en Transfer Delay) | 8455 + 8303 + Gen V + Mains V | S/C |
| R6 | Retorno fallido (red presente pero sigue en grupo) | Mains V + Gen V + 8455 | D |

## 2 · Calidad eléctrica trifásica (la habilitan los registros por fase)

| # | Regla | Registros | Tipo |
|---|---|---|---|
| R7 | Desbalance de tensión del grupo (max−min L-N) | Gen V 8192-94 | D |
| R8 | Pérdida de fase del grupo (una fase ≈0) | Gen V 8192-94 | D |
| R9 | Desbalance de corriente del grupo | Gen A 8198-200 | D |
| R10 | Sobre/subtensión del grupo (vs Nominal Volts) | 8192-94 + 8277 | C |
| R11 | Desviación de frecuencia del grupo (vs Nominal Freq) | 8210 + 8278 | C |
| R12 | Desbalance de tensión de red | Mains V 8195-97 | D |
| R13 | Sub/sobretensión de red (vs trips configurados) | 8195-97 + 8305/8307 | C |
| R14 | Desviación de frecuencia de red (vs trips) | 8211 + 8310/8312 | C |

## 3 · Arranque y batería

| # | Regla | Registros | Tipo |
|---|---|---|---|
| R15 | **Caída de batería en el crank** (Battery Volts colapsa al arrancar) | 8213 | S |
| R16 | Batería baja en reposo (vs Batt Undervolt) | 8213 + 8387 | C |
| R17 | Sobretensión de batería (vs Batt Overvolt) | 8213 + 9587 | C |
| R18 | Arranque fallido (Num BadStarts incrementa) | 11195 | S |
| R19 | Degradación de batería (regresión de voltaje) | 8213 (serie) | M |

## 4 · Carga y consumo

| # | Regla | Registros | Tipo |
|---|---|---|---|
| R20 | Sobrecarga del grupo (vs Nominal Power) | Gen kW 8202 + 8276 | C |
| R21 | Sobrecorriente (vs Nominal Current) | Gen A 8198-200 + 8275 | C |
| R22 | Factor de potencia anómalo | Gen PF 8204 | D |
| R23 | **Grupo corriendo sin tomar carga** (Gen V ok pero kW≈0 → breaker no cerró) | 8192-94 + 8202 | D |
| R24 | Carga reactiva anómala | Gen kVAr 8203 | D |

## 5 · Combustible / autonomía (inferido — enlaza DEC-GTM-2)

| # | Regla | Registros | Tipo |
|---|---|---|---|
| R25 | **Run prolongado sin retorno de red** (riesgo tanque vacío) | Gen running + Timer 8955 | S |
| R26 | Autonomía estimada baja (run time × consumo kW) | 8202 + tiempo | M |
| R27 | Consumo de energía anómalo (pendiente kWh) | Energy kWh 8205 | S |

## 6 · Confiabilidad / estadística (rol Confiabilidad — MTBF/SLA)

| # | Regla | Registros | Tipo |
|---|---|---|---|
| R28 | Tasa de arranques fallidos alta (BadStarts/Starts) | 11195 + 8207 | S |
| R29 | **Flapping de red** (N transferencias en ventana) | conteo de 8455 | S |
| R30 | MTBF degradándose | estadística temporal | M |

## 7 · Consistencia / forense (detección de fallas del propio equipo o de Wanomi)

| # | Regla | Registros | Tipo |
|---|---|---|---|
| R31 | Inconsistencia ATS vs grupo (Breaker dice grupo pero Gen V=0) | 8455 + 8192-94 | D |
| R32 | Inconsistencia red presente vs estado en grupo | Mains V + 8455 | D |
| R33 | Lectura congelada (valor sin cambio implausible) | cualquiera | S |
| R34 | **Pérdida de comunicación Modbus con el ComAp** (timeout) | nivel transporte | S |

## 8 · Estado del controlador

| # | Regla | Registros | Tipo |
|---|---|---|---|
| R35 | Cambio de estado FSM del controlador | Timer Text 8954 | D |
| R36 | Entrada/salida binaria específica (puerta, falla externa, etc.) | Bin In 8235 / Out 8239 | X |
| R37 | Cambio de modo del controlador | ControllerMode (setpoint) | D |

---

## Resumen de amplitud

**37 reglas** construibles solo del ComAp. Desglose por madurez:

| Tipo | Cantidad | Disponibilidad |
|---|---|---|
| D — día 1, sin baseline | 14 | inmediata |
| C — auto-calibrada vs setpoint | 12 | inmediata (robustez alta) |
| S — stateful (ventana corta) | 8 | días, no meses |
| M — madurando (soft sensor) | 4 | crece en el piloto |
| X — requiere decode de config | 1 | tras relevar el sitio |

**Día 1 reales (D + C): 26 reglas.** Esto es la "amplitud en detección" — honesta, sin baseline, sin ML. Las 4 *M* son la capa que madura, etiquetada como tal.

## Por qué esto es robusto (y honesto)
1. **Auto-calibración (12 reglas C):** comparan contra los setpoints que el ComAp tiene configurados (Nominal Volts/Freq/Power, trips de red, umbrales de batería). El motor se adapta al sitio sin reescribir umbrales → portable entre sitios.
2. **No promete predicción:** todo lo D/C/S es **detección** (DEC-INTEL-1, capacidad inmediata). Solo 4 reglas son predictivas y van marcadas "madurando" (DEC-PRED-1, Nivel 2).
3. **Forense incluido (R31-34):** detecta fallas del propio equipo y de la cadena de medición — refuerza la honestidad arquitectónica (¿el dato es confiable?).

## Acotación para el MVP
No hace falta implementar las 37 para el MVP. Propuesta: **las 26 de día 1 (D+C) son el objetivo del MVP** porque no dependen de historia ni de baseline y muestran amplitud real. Las S se suman si el motor de estado lo permite sin sobre-ingeniería; las M quedan como "capa que madura" visible pero honesta. R36 (X) espera al relevamiento del sitio.

## Pendiente de validación
Escalas, bitmaps de Bin In/Out, y el enum de Breaker State / Timer Text deben confirmarse contra ComAp físico en lab (igual que el resto del driver).
