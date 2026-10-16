# SPEC — G1c · El motor cumple el protocolo del mockup (edición y "Sin datos") · 2026-10-16

**Origen:** banco B0, tipo D (`plan_banco_conformidad_reglas.md` §6): 11 verdes, C9 rojo, C7 observado.
**Dirección de Franco (2026-10-16):** *"el mismo protocolo GRAFCET indica lo que la alarma o el motor debe
realizar. Al modificarse un dato debe volver al estado de vigilancia y repetir el proceso."* El protocolo es
el del mockup "Ciclo de vida de una regla":
- **Sin datos:** se entra desde cualquier estado. *"El equipo dejó de mandar datos. No inventa: no abre ni
  cierra alarmas hasta que vuelvan"*. Cuando los datos vuelven, pasa a Observando y repite el proceso.
- **Apagada:** *"si tenía una alarma abierta, la cierra prolijamente"*.

## 0 · CANDADO
preguntas_abiertas: 1 (Qe1). Hasta que se firme, no se implementa.

| # | Pregunta | Recomendada | Alternativa |
|---|---|---|---|
| Qe1 | Cuánto silencio de un equipo cuenta como "dejó de mandar datos". El mockup no fija el número. | **2 latidos del equipo = 10 min** (el latido del simulador y del firmware es de 300 s). Configurable por sitio con `FSM_SILENCE_SEC`. | 1 latido (5 min): más rápido, pero un solo latido perdido por la red ya lo dispara. |

## 1 · Qué cambia en el motor
### 1.a · Editar una regla → vuelve a Vigilando y repite el proceso (corrige C9)
**Hoy:** solo los cambios de la "huella de estado" (variable, tipo, cálculo, ventana…) cierran la alarma por
edición. Un cambio de umbral, banda, espera o cierre **no** la toca, y el umbral nuevo recién rige con el
próximo mensaje del equipo, que puede tardar un latido (5 min).
**Con G1c**, para **cualquier** edición de una regla (umbral, banda, tiempos, severidad, textos, huella):
1. Si la instancia tenía una alarma abierta → **se cierra por edición** (`resolve-by-edit`, "Regla editada").
2. La instancia vuelve a **E1 Vigilando**.
3. **Repite el proceso al instante con el último valor conocido** del equipo: si la condición nueva se cumple
   → E2 Observando → espera → E3 Alarma (aviso nuevo con el umbral nuevo); si no, queda en Vigilando.
   - Aplica a **D, C y cross**, que se evalúan con el valor actual.
   - **S y M** no se reevalúan con un valor repetido, porque reinyectarlo contaría dos veces en su ventana. Repiten el proceso con el próximo dato.
4. **Se conserva** lo acumulado (vida de aceite, consumo desde la recarga, buffers M) cuando la edición no
   cambia la huella de estado (DEC-REF-128 sigue vigente: editar el umbral no borra las horas acumuladas).

**Apagada:** apagar la regla con el interruptor ya la quita del motor y cierra la alarma abierta por edición.
Se verifica en el banco (C9c); no hay cambio de código.

### 1.b · "Sin datos" por silencio del equipo (corrige C7)
**Hoy:** E5 solo se alcanza con un dato inválido. Si el equipo deja de publicar, el tipo D queda congelado en
la etapa que tenía, sin plazo.
**Con G1c:** en cada tick (5 s), toda instancia de una regla que depende de mensajes, cuyo equipo lleva más de
`FSM_SILENCE_SEC` sin mensajes (`deviceState._lastSeen`), pasa a **E5 Sin datos** con receptividad nula.
- Abarca D, S, C, M (salvo `staleness`, que ya mide justamente el silencio) y cross (si alguna hoja requerida
  calla).
- Lo que ya define el protocolo (Q1): **no abre ni cierra alarmas**. Una alarma abierta sigue abierta, y en
  E5 no se dispara nada nuevo.
- Cuando vuelve un mensaje → E5 → E3 (si había alarma) o E1, y la regla se reevalúa con ese dato (ya
  implementado en G1a: T53 / T51).

## 2 · Presupuesto — 1 bloque (lista cerrada)
`edge-engine/index.js` (recarga: todas las reglas editadas pasan por el cierre por edición + reevaluación;
tick de silencio) · `edge-engine/ruleEngine.js` (función de reevaluación con el último valor; tick de
silencio) · `edge-engine/reloadState.js` (separar "editada" de "huella cambiada") · `tools/banco/run.js`
(C9a esperado = cierre por edición + reevaluación inmediata; C7 esperado = E5 tras el silencio; C9c
interruptor). **4 archivos.**

## 3 · Casos raros
| # | Caso | Comportamiento |
|---|---|---|
| 1 | Edición sin cambios reales (se guarda igual) | El hash de la regla no cambia → no hay recarga para esa regla (como hoy). |
| 2 | Edición mientras la instancia está en E6 (cierre manual) | Se cierra por edición (la edición es una acción humana explícita). |
| 3 | Edición de una regla de vida de aceite (cambio de umbral) | Se cierra por edición y se conservan las horas acumuladas; si siguen sobre el umbral nuevo, se dispara una alarma nueva. |
| 4 | Equipo que nunca mandó datos | No hay instancia → nada que pasar a E5. |
| 5 | Equipo callado y regla editada | Se cierra por edición, vuelve a E1 y, sin último valor vigente, pasa a E5 en el próximo tick. |
| 6 | Latido cada 300 s y `FSM_SILENCE_SEC` de 600 s | Un latido perdido no alcanza para entrar en E5; dos, sí. |
| 7 | Reinicio del edge | `_lastSeen` arranca vacío → no se entra a E5 hasta pasar `FSM_SILENCE_SEC` desde el arranque sin mensajes (no hay "sin datos" falsos al arrancar). |

## 4 · Cómo se prueba
1. Unidad: recarga con un cambio de umbral → resolve-by-edit + E1 + reevaluación con el último valor (D, C y cross); S y M no se reevalúan; acc conservado.
2. Unidad: tick de silencio → E5 sin aviso; vuelve el dato → T53/T51.
3. **Banco B0 de nuevo, con `FSM_SILENCE_SEC=60` en el banco:** C9a VERDE (cierre por edición + vuelve a disparar o no según el umbral nuevo, sin esperar un dato), C9b VERDE, C9c VERDE (interruptor) y C7 VERDE (E5 a los 60 s, alarma abierta y sin avisos).

## 5 · IDs reservados: DEC-REF-148 (G1c). Modifica DEC-REF-128 solo en lo que hace a la **alarma** (la edición la cierra). Lo acumulado se sigue conservando.

---

# Anexo — Lo que encontró C12 (UI del detalle de alarma) · para la spec de G3
Captura de Franco sobre `/alarmas/6ad1aa9184ffc500084f30ff` (alarma del banco):
- **Ninguno de los 7 puntos del mockup está en la pantalla**: no hay etapa, línea de tiempo del episodio, banda, espera ni tiempo de cierre, bitácora de transiciones ni acceso para editar la regla.
- **Bug de la pantalla: mezcla episodios.** El enlace era la alarma del **primer** episodio (disparo 01:39:45, cierre 01:42:26 según la bitácora), pero la pantalla muestra el **último** episodio de esa regla y equipo (disparo 01:43:14, cierre 01:48:14, "duró 5 min 1 s"). El detalle arma el estado con el último evento de la pareja regla+equipo, no con el episodio de la notificación pedida.
- **Valor mostrado "14,18 V vs umbral 100 V":** es el valor **actual** del equipo (después del reset del simulador), no el que disparó (103 V). Para una alarma resuelta, eso confunde.
- **El gráfico pega el disparo y el cierre** en el mismo punto, y no muestra la banda ni los cambios de etapa.
- **Ruido:** la tarjeta de autonomía (combustible) aparece en una alarma de tensión de batería.
