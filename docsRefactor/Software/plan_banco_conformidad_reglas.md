# PLAN — Banco de conformidad del ciclo de vida, por tipo de regla · 2026-10-16

**Pedido de Franco:** se observan alarmas que no se cierran, tiempos incoherentes, umbrales
dudosos, alarmas que no se pueden editar desde la UI, y un ciclo de vida que no se ve como en
el mockup. Las alarmas de un día no cubren todos los tipos de regla. Hay que **estructurar la
prueba por tipo de regla y probar cada una en un escenario controlado**.

**Regla de este plan:** mientras el banco no esté en verde, no se agregan funcionalidades.
Cada rojo es un hallazgo con evidencia, y se corrige en su capa: motor, UI o configuración.

## 1 · Qué se prueba: el ciclo de vida del mockup ("Ciclo de vida de una regla")
Cada tipo de regla se verifica contra estos controles comunes. El banco verifica cada uno con la
bitácora real (`ruletransitions`), el estado del motor (`rulefsm`) y lo que guarda la consola
(`notifications`).

| # | Control | Qué se espera |
|---|---|---|
| C1 | **Umbral exacto** | Justo antes del umbral no dispara; justo después, sí. El valor y el umbral guardados en la alarma son los reales. |
| C2 | **Espera antes de avisar** (`graceSec`) | E1 → E2 → E3. Si la condición se va antes de que termine la espera, vuelve a E1 sin avisar. |
| C3 | **Un aviso por episodio** | Mientras sigue en alarma no hay avisos repetidos. |
| C4 | **Histéresis** (banda) | Dentro de la banda la alarma se mantiene (E3); recién al cruzarla pasa a cierre. |
| C5 | **Cierre** (`resolveGraceSec`) | E3 → E4 → E1 después del tiempo de cierre, con un solo aviso de cierre. |
| C6 | **Recaída durante el cierre** | E4 → E3 sin aviso nuevo (misma alarma). |
| C7 | **Sin datos** | Se corta el dato → E5. La alarma sigue abierta (Q1) y al volver el dato se reevalúa. |
| C8 | **Cierre manual** (si la regla es manual) | Normalizada → E6. Cierra solo con "Reconocer" o "Registrar service". |
| C9 | **Edición con la alarma abierta** | Al editar la regla desde la UI: se cierra por edición (`resolve-by-edit`) y la regla nueva rige desde ese momento. |
| C10 | **Reinicio del edge** | Con la alarma abierta: sin duplicado y sin cierre falso; retoma la misma etapa. |
| C11 | **Coherencia de tiempos** | Los tiempos de disparo, duración y cierre que muestra la consola coinciden con la bitácora (± 1 tick de 5 s). |
| C12 | **UI** | El detalle de la alarma muestra lo que promete el mockup: etapa, tiempos, umbral aplicado, bitácora y acciones. |

## 2 · Matriz: tipos de regla × controles
`●` aplica · `—` no aplica (y por qué) · el umbral/escenario concreto se define en la spec de cada caso.

| Tipo | Qué calcula | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | C11 | C12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **D** umbral fijo | valor vs número | ● | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **D-ficha** umbral de la ficha (`limitRef`) | valor vs ficha | ● (+ cambiar la ficha) | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **S** N veces en T | conteo en ventana | ● | ● | ● | — (ventana) | ● | ● | ● | — | ● | ● | ● | ● |
| **C** vs valor del equipo | valor vs setpoint (+ respaldo D) | ● (+ sin setpoint) | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **cross** plana | Y/O de condiciones | ● | ● | ● | ● | ● | ● | ● (hoja faltante) | — | ● | ● | ● | ● |
| **cross** anidada / suma | grupos + suma | ● | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **M slope** tendencia | pendiente en ventana | ● | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **M projection** | horas hasta el objetivo | ● | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **M spread** desbalance | dispersión entre equipos | ● | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **M ratio / divergence** | relación / diferencia de 2 datos | ● | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **M dutyCycle** | % de uso en ventana | ● | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **M cumulativeSince** | caída acumulada desde la recarga | ● | ● | ● | — | ● (con la recarga) | ● | ● | — | ● | ● | ● | ● |
| **M stepJump** salto abrupto | salto en un paso | ● | ● | ● | — | — | — | ● | ● | ● | ● | ● | ● |
| **M flatline** sensor clavado | rango ≈ 0 en ventana | ● | ● | ● | — | ● | ● | ● | — | ● | ● | ● | ● |
| **M staleness** deja de reportar | silencio > N min (por tick) | ● | ● | ● | — | ● | ● | — (es la propia falta de datos) | — | ● | ● | ● | ● |
| **M variance** inestable | σ en ventana | ● | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **M baseline** fuera de lo normal | z-score auto-calibrado | ● (tras aprender) | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **M acceleration** | Δ de la pendiente | ● | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| **M accumulator** vida de aceite | horas ponderadas | ● | ● | ● | — | — | — | ● | ● (service) | ● | ● (acumulado persistido) | ● | ● |

**19 tipos.** Cada celda `●` es un caso con resultado VERDE/ROJO y evidencia.

## 3 · Cómo se arma cada caso (camino productivo, DEC-PROC-5)
- **Pack de banco propio** (`banco-conformidad`), una regla por tipo, sobre los equipos simulados de un sitio de banco. Las reglas productivas no se tocan. Las reglas se crean por la API real (`PUT /api/rulepacks`) y se recargan en el edge por el canal normal.
- **Estímulo:** un **guion del simulador** por caso (la funcionalidad `simscripts` ya existe: hasta 50 pasos y 30 min, con el reloj en el servidor y el mismo camino que el botón Aplicar). Para C7 se usa la pausa del equipo simulado; para C9, el `PUT` de la regla; para C10, `docker restart wanomi-edge`.
- **Oráculo del caso:** la secuencia esperada de transiciones y avisos, por ejemplo `E1→E2 (t0) · E2→E3 notify (t0+graceSec) · E3→E4 (t1) · E4→E1 resolve (t1+resolveGraceSec)`, con tolerancia de 1 tick (5 s).
- **Corredor** `tools/banco/run.js`: lanza el guion, espera y compara contra la bitácora y la consola. Produce un informe por tipo × control. Es de solo lectura sobre el motor: no evalúa nada por su cuenta, solo observa.
- **C12 (UI):** no puedo ver tu pantalla, así que por cada tipo el corredor imprime la URL del detalle de la alarma y una **lista de verificación contra el mockup**. Vos la marcás y adjuntás la captura.

## 4 · Orden de trabajo
| Etapa | Contenido | Entregable |
|---|---|---|
| **B0** | Pack de banco + corredor + **un tipo completo (D)** con los 12 controles | Primer informe real: ¿el ciclo base funciona como el mockup? |
| **B1** | D-ficha, S, C, cross plana y anidada | Informe del núcleo de alarmas |
| **B2** | M en 3 grupos (tendencia y proyección · relación y desbalance · el resto) | Informe M |
| **B3** | Consolidado: cada síntoma que reportaste, explicado con un caso del banco | Lista de correcciones por capa (motor / UI / config) → specs |

Las correcciones **no** se hacen dentro del banco. Cada una va con su propia spec firmada (DEC-PROC-6) y, una vez hecha, el caso se vuelve a correr.

## 5 · Decisiones a firmar
| # | Pregunta | Recomendada | Alternativa |
|---|---|---|---|
| Qc1 | Sobre qué reglas | **Pack de banco propio**, una regla por tipo con umbrales conocidos | Las reglas productivas actuales |
| Qc2 | Tiempos | **Espera y cierre de 30 s** en el banco (corre rápido), más **un caso con los tiempos reales** de una regla productiva | Siempre con los tiempos reales (horas de prueba) |
| Qc3 | Dónde corre | **En tu PC primero**. Después, el mismo banco en la Orange Pi 4 Pro como parte de H6. | Solo en el Hub |
| Qc4 | Prueba de UI (C12) | **Lista de verificación + captura tuya por tipo** | Automatizada con navegador (no llego a tu localhost) |
| Qc5 | Alcance de B0 | **Solo D, completo**, para validar el método antes de escalar | Todos los tipos de una vez |

## 6 · Resultados
### B0 · tipo D — primera corrida (2026-10-16, `Yf86psyC` · `battery_voltage`)
**VERDE 11 · ROJO 1 · OBSERVADO 3.** El ciclo base funciona como el mockup: umbral exacto, espera (33 s medidos), un aviso por episodio, banda, recaída, cierre (33 s), episodio nuevo dentro del cooldown, reinicio del edge y tiempos de la consola = bitácora.
- **C9 ROJO → partido en C9a/C9b.** Cambiar el umbral con la alarma abierta no la cierra por edición; eso es lo diseñado (DEC-REF-128: el umbral no es parte de la huella de estado). Pero **el umbral nuevo no rige hasta que llega otro dato del equipo**: con report-by-exception, ese dato puede tardar el latido completo (300 s en el simulador). Es candidato a causa del síntoma "no clarean". El corredor ahora separa C9a (umbral: tiene que regir al instante) y C9b (variable: cierre por edición).
- **C7 OBSERVADO (decisión de diseño):** el tipo D se evalúa solo cuando llega un mensaje. Si el equipo deja de publicar, la alarma queda congelada en "Alarma" y nunca pasa a "Sin datos". El mockup promete E5.
- **C12:** pendiente la lista de verificación de Franco sobre `/alarmas/6ad1aa9184ffc500084f30ff`.

### B0 · tipo D — segunda corrida, con G1c (2026-10-16 14:00, `0720079`)
**VERDE 17 · ROJO 0 · OBSERVADO 2** (C8 no aplica a D; C12 es la UI y queda para G3).
- **C7 y C7b:** "Sin datos" a los 576 s de silencio (se cuenta desde el último mensaje real, anterior al corte). La alarma sigue abierta, sin avisos, y con el dato vuelve a la misma alarma.
- **C9a1, C9a2, C9b y C9c:** toda edición cierra por edición y repite el proceso al instante. Con el umbral bajado, vuelve a disparar con el umbral nuevo (99) tras la espera.
- **El motor del tipo D cumple el protocolo del mockup.** Lo pendiente del tipo D es solo la UI (C12, anexo de `spec_grafcet_g1c.md`).

### B1 · núcleo (2026-10-16, corridas 14:33 y 14:47 · `327cf92`)
**VERDE 14 · ROJO 2 · DISEÑO 1.**
- **DF (umbral de ficha), 3/3:** dispara con el límite de la ficha. Al cambiar la ficha con la alarma abierta, la cierra por edición y repite el proceso con el límite nuevo (cascada + G1c).
- **cross, 6/6:** combinada plana (Y) y anidada ((Y) O), incluido el pase de una rama a la otra sin cerrar.
- **C, 3/4:**
  - **C2 ROJO:** si cambia el setpoint con la alarma abierta, no se reevalúa hasta que llega la variable medida.
  - C1, C3 y C4 en verde.
- **S, 2/4:**
  - **S4 ROJO:** sin datos nuevos, la ventana se vacía y la alarma no se cierra (S se evalúa solo con mensajes).
  - **S3, decisión de diseño:** hoy cierra con el primer valor normal, aunque la ventana todavía tenga N coincidencias.
  - S1 y S2 en verde.

### B1 con G1d (2026-10-16, `b19d44d`) — **B1 CERRADO EN VERDE**
- **S, 5/5:**
  - S1 y S2 en verde.
  - S3a/S3b: un valor normal no cierra mientras haya N coincidencias en la ventana; cuando quedan menos de N, cierra (opción A).
  - S4: la ventana se vacía sin mensajes y la alarma cierra sola.
- **C, 4/4:**
  - C1 en verde.
  - C2: subir el setpoint con la alarma abierta la pasa a cierre al instante.
  - C3: queda cubierto por C2 (la alarma ya está cerrada).
  - C4: respaldo con su aviso informativo.
- **Total B1:** DF 3/3 · S 5/5 · C 4/4 · cross 6/6.
- **Lección operativa:** la primera corrida de C falló porque, en paralelo, se disparó un escenario del simulador sobre el mismo equipo. **El banco necesita el equipo simulado en exclusiva** mientras corre.

### B2 · reglas M (2026-10-16, `8f3e58f`) — T 6/0/1 · R 6/1/1 · A 14/4/1
**Funcionan (avisan y cierran según la métrica):**
- slope, projection y acceleration.
- ratio y divergence.
- dutyCycle y cumulativeSince (la recarga reinicia el acumulado).
- stepJump con cierre manual (queda en E6).
- flatline (estimulado con snapshot).
- staleness y variance.
- accumulator, incluido el service que cierra y pone el acumulado en 0 (después sigue sumando desde ahí).

**Hallazgos (van a la spec G1e):**
1. **"Sin datos" por pocas muestras.** Toda regla M arranca con `E1→E5` mientras junta muestras, y una serie rala la vuelve a E5 (bM-slope-3) aunque el equipo esté reportando.
2. **Eventos de una sola muestra con espera (bM-jump-1, bM-base-1, ROJO).** El salto y el pico cumplen la condición en UNA muestra. Si llega otra muestra antes de que termine la espera (latido o publicación periódica), la métrica vuelve a 0: `E2→E1` y el evento se pierde. El caso manual pasó por azar: no llegó otra muestra durante la espera.
3. **Entradas de otro equipo (bM-div-3).** Si la entrada del propio equipo está vieja, ratio/divergence toman el mismo dato de OTRO equipo del mismo tipo y siguen calculando. Mezclan equipos sin avisar.
4. **Desbalance con 2 equipos (bM-spread-1).** No hay "culpable" (los dos están a la misma distancia de la mediana) y se le asigna al primero de la lista. El cambio de culpable no se pudo probar: hace falta un 3.er equipo simulado del mismo tipo.
5. **Sensor clavado real (bM-flat-3).** Con report-by-exception solo llegan latidos (cada 5 min). Una ventana menor a 3 latidos (15 min) nunca junta muestras.

### B2 · re-corrida tras G1e (2026-10-16/17, `0eb6075` → `72e088f`)
- **T 7/7** (incluye bM-slope-3: serie rala ya no es "Sin datos").
- **R 9/9** (`72e088f`): bM-div-3 E3→E5 con la alarma abierta · bM-spread-1/2/3 con 2 equipos (historia propia) · **bM-spread-4** con 3 equipos (mediana).
- **A 18/1** (`55da091`): bM-base-2 en verde. bM-jump-2 rojo por la misma causa del banco (el salto ya se había cerrado solo dentro de jump-1); corregido con el mismo criterio.
- **Correcciones del banco (no del motor):**
  - El simulador republica en cada ciclo los valores fijados con `set_sensor`: no hay "report-by-exception" para valores fijados. Se agregó `mute_sensor`/`unmute_sensor` (calla una variable sola) para probar frescura.
  - Los eventos de una muestra (fuera de lo normal) se cierran solos cuando el valor fijado entra al historial: el cierre se cuenta desde el aviso.
  - El sitio tiene un 3.er ELTEK simulado (`wi4brXc7`): el banco lo silencia para la prueba de 2 equipos y lo usa para spread-4.
  - `setVal` reintenta si el cliente MQTT del backend está reconectando (pasó 2 veces).
- **Corrección del motor (caso raro 5 de G1e):** en spread, el culpable con alarma abierta que deja de reportar pasa a "Sin datos" (antes quedaba en Alarma sin evaluarse).
- **Observación:** "fuera de lo normal" toma un escalón sostenido como nuevo normal en segundos (detecta picos, no escalones).
