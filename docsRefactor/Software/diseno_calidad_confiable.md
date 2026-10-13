# Dirección de diseño — Calidad del motor CONFIABLE (inventario + detalle + pronóstico) · 2026-10-08

**Origen:** consulta a 4 especialistas (energía/NOC, ciencia de datos, UX, arquitectura/SRE) sobre cómo
hacer el motor de calidad **útil y confiable sin sumar complejidad que se desconfíe**. Coincidieron.
Mockups aprobados por Franco: `mockup_calidad_confiable.html` + `mockup_calidad_inventario_detalle.html`.

## 0 · Principio rector
El motor de calidad gana confianza siendo **más simple y más verificable que las alarmas que juzga**.
Cada capa que no se pueda re-derivar a mano es deuda de confianza, no capacidad.

## 1 · Los 6 principios (no negociables)
1. **Verificable:** cada hallazgo trae números, ventana y procedencia → re-derivable a mano.
2. **Nunca auto-acciona:** recomienda; el humano ejecuta; todo reversible y "en observación" después.
3. **Duros ≠ blandos:** invariantes (certeza, 0 falsos positivos) separados de estadística (pista con
   incertidumbre). Un falso positivo blando NO debe contaminar la confianza en los duros.
4. **Habla en consecuencias y conteos, no en scores.** Una oración que el técnico pueda defender.
5. **Freno de seguridad por consecuencia:** si la condición tiene efecto real aguas abajo (cadena de
   energía DECLARADA, no autogenerada), el hallazgo se degrada a "problema real, revisar equipo" — NUNCA
   a "ruido". Es una **línea de evidencia + freno**, determinista; nunca suprime sola, nunca se llama "causal".
6. **Honesto cuando no sabe:** "datos insuficientes" es un resultado válido. El motor mide su propia
   tasa de aceptación/descarte.

## 2 · Estructura de UI aprobada
- **Inventario de reglas = vista principal** (tabla). Cada regla: badge de calidad + disparos + último +
  interruptor + **link a su detalle**. Arriba, métricas de confianza del propio motor.
- **Detalle de regla** (`/admin/calidad/:ruleId`), 4 secciones en este orden:
  1. **Estado de calidad** — el/los hallazgo(s) de ESA regla: oración + evidencia + bloque de
     **consecuencia** (freno) + acción primaria.
  2. **Comportamiento** — distribución (ECharts) + línea de tiempo (ECharts) ya existentes.
  3. **Pronóstico** — **en TODAS las reglas**: proyección de tendencia con **banda de incertidumbre**;
     tiempo a cruzar umbral / a cero + acción anticipada. Encuadrado como PROYECCIÓN, nunca certeza.
     Reglas sin tendencia numérica (códigos de falla, cross sin variable simple) → "sin pronóstico aplicable".
  4. **Configuración y procedencia** — condición, umbral vs **nominal de ficha**, tipo, editar/revertir.

## 3 · Reglas del pronóstico (honestidad estadística, exigida por los especialistas)
- Método: regresión lineal por mínimos cuadrados sobre la ventana reciente de la variable; banda =
  error estándar de predicción (o ±k·desvío de residuos). Determinista, re-derivable.
- Gates: mínimo de muestra (n y span); si la pendiente no es significativa → "tendencia plana, sin cruce
  previsto"; si el ajuste es pobre (R² bajo) → banda ancha + aviso "proyección poco confiable".
- Prohibido: afirmar certeza, ocultar la banda, o proyectar sobre variable no numérica.

## 4 · Qué se DIFIERE (explícito, para no sumar desconfianza)
- **Gemelo digital / SCADA autogenerado:** diferido. La cadena de energía se usa como **plantilla
  vertical FIJA declarada** (red→ATS→grupo→rectificador→batería), no autogenerada de manuales.
- **Calibración automática por cuantiles:** diferida a *asistente* del humano (con n mínimo + marca de
  muestra contaminada), nunca auto-aplicada.
- **Multi-sitio / vista NOC agregada:** sano pero es ESCALA, track aparte; el diseño se mantiene
  site-agnóstico para que escale solo.
- **Golden set + harness de regresión + tasa de aceptación por tipo:** recomendado por los 4; se asienta
  acá como deuda a construir (no bloquea esta iteración de UI, pero es la red de seguridad del motor).

## 5 · IDs reservados
- **DEC-REF-142** — esta dirección de diseño (calidad confiable: inventario+detalle+pronóstico; 6 principios; diferidos).
- **DEC-REF-143** — backend: endpoints de detalle de regla + pronóstico (`/api/qa/rule/:id/detail` + `/forecast`).
- **DEC-REF-144** — UI: página de detalle de regla con las 4 secciones + navegación inventario→detalle.

## 6 · Alcance de ESTA iteración (lo que se implementa ya)
Reestructurar la UI existente a inventario→detalle + agregar el **pronóstico** (back + chart). Se REUSA
todo lo hecho (ECharts QaHistChart/QaTimelineChart, FichaHallazgo, backtest, timeline, overview). NO se
construye el gemelo, ni cuantiles-auto, ni multi-sitio, ni el golden set (quedan en §4 como lo que sigue).
