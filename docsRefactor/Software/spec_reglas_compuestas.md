# SPEC — Reglas combinadas (condiciones + métricas M) · 2026-10-17

**Origen:** pedido de Franco (2026-10-16): "poder hacer combinaciones de reglas cross, C o D con M incluso por UI — una o varias condiciones y a esa regla agregarle tendencia, proyección, aceleración, relación, diferencia, uso %, caída acumulada, sensor clavado, deja de reportar, lecturas inestables y vida útil". Orden firmado: G1e → **diseño (esta spec + mockup)** → implementación por bloques + banco B4.
**Mockup:** canvas "Wanomi · Regla combinada" (artifact X199Uz71diVcXvjbnpEpYP): editor + detalle de la alarma con la foto del disparo.

## 0 · CANDADO
preguntas_abiertas: **8 (Qh1–Qh8, §3)**. No se implementa nada hasta la firma (DEC-PROC-6). DEC-REF-151 (propuesto).

## 1 · Qué se quiere, en una frase
Una **regla combinada** es un árbol Y/O de **condiciones** (hojas). Cada hoja mide una variable de un equipo de una de tres formas:

| Forma de medir | Hoy existe como | Ejemplo de hoja |
|---|---|---|
| **Valor** | tipo D / hoja cross | `fuel_level < 20 %` |
| **Respecto del setpoint del equipo** | tipo C | `coolant_temp > setpoint de alarma del controlador` |
| **Métrica** (11 de las M) | tipo M | `tendencia de battery_voltage < −0,5 V/h en 30 min` |

El árbol entero tiene **un solo ciclo de vida GRAFCET** (E1…E6): una espera, un cierre, una severidad, una recomendación, cierre automático o manual.

## 2 · Cómo funciona (propuesta)

### 2.1 Modelo: se extiende `cross`, no hay tipo nuevo
- `crossExpr` ya es un árbol AND/OR con hojas `{deviceType, variable, condition}` y hojas suma. Se agregan a la hoja tres campos **opcionales**: `measure` (`value` | `setpoint` | `metric`), los parámetros de la forma de medir (`metric`, `mWindow`, `mParams`, `inputs`, `setpointSource`) y `leafId` (estable, lo pone la UI).
- Una hoja sin `measure` es `value`: **las reglas cross de hoy siguen igual, sin migración**.
- Las reglas simples (D, C, M) no cambian. En la UI, "Agregar condición" sobre una regla simple la convierte en combinada (y "Quitar" la última condición la vuelve simple).

### 2.2 A qué equipo mira cada hoja (resuelve el problema X0 "primer equipo del tipo")
- La regla tiene un **ancla** opcional: `scope: { deviceType }`.
  - **Con ancla:** una instancia **por equipo del tipo ancla** (`ruleId:dId`, como D/C/M). Las hojas de ese tipo miran **ese mismo equipo**.
  - **Sin ancla:** una instancia **por sitio** (`ruleId:siteCode`, como cross hoy).
- Hojas de **otro** tipo de equipo eligen cuál: `pick: 'any' | 'all' | dId`.
  - `any` (alguno): la hoja se cumple si se cumple en al menos un equipo de ese tipo.
  - `all` (todos): se cumple en todos los que reportan.
  - `dId`: un equipo puntual.
  - Hoy el motor toma "el primero que encuentra"; eso desaparece.

### 2.3 Resultado de una hoja: cuatro estados
| Estado | Cuándo | Efecto en el árbol |
|---|---|---|
| **sí** | se cumple | — |
| **no** | no se cumple | **Y:** un "no" decide "no" · **O:** necesita todos "no" |
| **juntando** | métrica con pocas muestras (G1e · Qf1) | si nada decide, el árbol **no decide**: la instancia queda en su etapa |
| **sin dato** | la entrada no llega (frescura vencida, G1e · Qf3) | si nada decide, el árbol entrega **nulo → E5 "Sin datos"** (alarma abierta sigue abierta) |

Precedencia:
- **Y:** no > sin dato > juntando > sí.
- **O:** sí > sin dato > juntando > no.

Un "no" en un Y alcanza para cerrar aunque otra hoja esté sin dato. Es el principio GRAFCET: decide lo que se sabe, y sin datos no se cierra a ciegas.

### 2.4 Estado por hoja
- Cada hoja métrica tiene su propio buffer: `mState` con clave `ruleId#leafId:dId`. El evaluador M actual se reusa tal cual (`evaluateM` con una regla sintética por hoja).
- Las hojas acumuladoras (vida útil, caída acumulada) persisten en `msoftstate` con la misma clave. "Registrar service" pone en 0 **todas** las hojas acumuladoras de esa regla y equipo.
- **Cuándo se alimenta cada hoja:**
  - Se alimenta solo cuando llega **su** variable de **su** equipo.
  - El resto de los mensajes usa el último resultado de la hoja, guardado con su hora. Si esa hora vence la frescura, el resultado pasa a **sin dato**.
- Editar una hoja: con G1c, la instancia vuelve a E1 y los buffers de esa regla se borran (como cualquier edición).

### 2.5 Tiempos
- Espera (`graceSec`) y cierre (`resolveGraceSec`) son **de la regla**, no de la hoja.
- Las hojas **evento** (salto abrupto, fuera de lo normal) se cumplen en una sola muestra. Dentro de un árbol duran `mParams.holdSec` ("hubo un salto en los últimos N s"; por defecto 120 s) → **Qh4**.
- Las hojas de **reloj** ("deja de reportar") se reevalúan en el tick de 5 s, igual que hoy la staleness.
- Si el árbol tiene alguna, la regla entera se reevalúa en el tick.

### 2.6 Qué queda guardado y qué ve el operador
- Al disparar, la notificación lleva la **foto del disparo**: `leaves[]` con `{leafId, texto, valor, umbral, estado}` de cada hoja en ese instante.
- El detalle de la alarma muestra esa foto, no el valor actual. Esto resuelve el ítem de C12 "valor de disparo" para las combinadas.
- La recomendación puede citar hojas: `{hoja:L2.valor}`.

### 2.7 Límites (Hub: Orange Pi 4 Pro, 4 GB, microSD)
- Hasta 8 hojas.
- Hasta 2 niveles de grupo, como hoy.
- Hasta 3 hojas métricas por regla.
- La API rechaza lo que se pase, con mensaje.
- Las validaciones M existentes aplican por hoja; por ejemplo, el sensor clavado necesita una ventana de al menos 15 min (Qf5).

### 2.8 Fuera de esta spec (v1)
- **Desbalance (spread) como hoja:** elige su propio equipo culpable y choca con el ancla. Sigue siendo regla simple → **Qh6**.
- **Hojas S ("N veces en T"):** Franco pidió cross/C/D + M; S queda para después.
- **Sumas con métrica:** la hoja suma sigue siendo de valor.

## 3 · Preguntas a firmar
| # | Pregunta | Opciones | Recomendación |
|---|---|---|---|
| **Qh1** | ¿Extender `cross` o crear un tipo nuevo? | A) extender `cross` (sin migración) · B) tipo `X` nuevo | **A** |
| **Qh2** | ¿A qué equipo mira cada hoja? | A) ancla opcional + `pick` any/all/equipo (§2.2) · B) siempre por sitio, como hoy | **A** |
| **Qh3** | ¿Cómo combina una hoja "juntando" o "sin dato"? | A) cuatro estados con la precedencia de §2.3 · B) "juntando" = "no" | **A** (B haría que una tendencia recién cargada cierre alarmas) |
| **Qh4** | Hojas evento dentro del árbol | A) duran `holdSec` (por defecto 120 s, configurable) · B) no se permiten en combinadas | **A** |
| **Qh5** | Tiempos | A) espera y cierre de la regla · B) espera por hoja | **A** (B duplica el ciclo de vida) |
| **Qh6** | Desbalance (spread) como hoja | A) fuera en v1 · B) adentro, solo en reglas sin ancla | **A** |
| **Qh7** | Foto del disparo por hoja en la notificación y el detalle (§2.6) | A) sí · B) solo el valor de la primera hoja | **A** |
| **Qh8** | Límites (§2.7) | A) 8 hojas · 2 niveles · 3 métricas · B) otros números | **A**, se revisan con el perfil Hub (H4–H6) |

## 4 · Bloques de implementación (después de la firma)
| Bloque | Qué | Archivos |
|---|---|---|
| **K1 · motor** | Hoja con `measure`, cuatro estados, ancla/`pick`, estado por hoja, eventos con `holdSec`, tick | `typeCross.js`, `typeM.js` (sin cambios de cálculo), `ruleEngine.js`, `index.js` |
| **K2 · API + QA** | Validación de hojas y límites; Qf5 por hoja; I14 recorre hojas; backtest con hojas | `ruleValidation.js`, `rulepacks.js`, `qa/checks/oracle.js`, `qa/lib/backtest.js` |
| **K3 · editor** | Constructor de condiciones del mockup; frase legible; "probar contra las últimas 24 h" | `SentenceEditor.vue`, `CrossExprNode.vue`, `ruleSentence.js` |
| **K4 · detalle** | Foto del disparo por hoja (se junta con G3) | detalle de alarma, `notificationRouter.js`, modelo de notificaciones |
| **B4 · banco** | Ver §5 | `tools/banco/b4.js` |

## 5 · Banco B4 (conformidad de combinadas)
| # | Escenario | Esperado |
|---|---|---|
| bK-1 | Y de valor + tendencia (ancla GEN) | avisa solo con las dos; cierra cuando cae una |
| bK-2 | O de valor + proyección | avisa con cualquiera |
| bK-3 | Tendencia juntando muestras + valor que se cumple (Y) | no decide (sin E5, sin aviso) |
| bK-4 | Entrada de una hoja silenciada (`mute_sensor`) con la alarma abierta | E5 con la alarma abierta; vuelve al volver el dato |
| bK-5 | "No" en un Y con otra hoja sin dato | cierra |
| bK-6 | Salto (evento) + valor dentro de `holdSec` / fuera | avisa / no avisa |
| bK-7 | Ancla con 2 equipos del tipo | una alarma por equipo, cada hoja mira el suyo |
| bK-8 | Hoja de otro tipo con `pick` any / all | any: alcanza uno · all: necesita todos |
| bK-9 | Respecto del setpoint (C) + uso % | el setpoint nuevo rige al instante (G1d · C2) |
| bK-10 | Vida útil dentro de un Y + "Registrar service" | cierra y pone en 0 la hoja |
| bK-11 | Foto del disparo | la notificación trae `leaves[]` con valor, umbral y estado al disparar |
| bK-12 | Límites | la API rechaza la 9.ª hoja y una 4.ª métrica |
