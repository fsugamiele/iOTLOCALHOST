# Propuesta visual — Alarmas y Detalle de la alarma (2026-11)

> Auditoría página por página previa a la instalación en el hub. Maqueta aprobada por Franco
> (2026-11-14 y 2026-11-15): tablero «Wanomi · Alarmas (propuesta)», páginas «Lista de alarmas» y
> «Detalle de la alarma». Este archivo registra lo decidido, lo aplicado y lo que quedó para el backlog.

## Decisiones firmadas

| ID | Decisión |
|---|---|
| PA-1 | **Lista:** una frase arriba dice cómo está todo; tres bandejas (Sin tomar · En curso · Resueltas hoy); agrupado por sitio; cada alarma dice qué pasa y qué hacer sin desplegar; las relacionadas se pliegan bajo la principal; un solo verbo: «Tomar». |
| PA-2 | **Color solo para la gravedad**, siempre con ícono y palabra. |
| PA-3 | **Detalle:** encabezado con un solo botón; primera fila «Qué está pasando» + «Qué hacer» (pasos para tildar); después gráfico, «Por qué saltó» en tabla y contexto (sitio · equipos · 30 días). |
| PA-4 | **Gráfico:** ejes con escala pareja y horas; límites de la ficha con su nombre; medido (línea llena) y estimado (punteada); lectura punto por punto; debajo, en la misma línea de tiempo, las otras mediciones de la regla y las alarmas del sitio; lecturas clave, tabla y descarga; período «esta alarma» o «24 horas». |
| PA-5 | **Planta DC con el eje invertido** (descargar se ve como bajar). Criterio aplicado: toda la medición es negativa. |
| PA-6 | **Tenancy:** la misma pantalla sirve en el hub (un sitio) y en el NOC (los sitios de los grants del usuario). El servidor ya acota por grants (`buildReadFilter`). |

## Aplicado

- `app/api/routes/alarms.js`
  - `GET /alarms`: cada ítem suma `meaning`, `recommendation` (regla o heredado de la ficha, igual que el detalle), `stepsTotal`, `stepsDoneCount`, `umbral`, `varMeta`, `deviceType`, `perSite`. Solo lectura; si falla, la lista responde igual.
  - `GET /alarms/:id/detail?win=24h`: período del gráfico. El paso crece en períodos largos (tope ~600 puntos por medición, 7 días).
  - Cada serie del gráfico suma `limits` (atención / crítico de la ficha con la cascada del motor: equipo > perfil > batería > ficha) y `atFire`.
- `app/pages/alarmas/index.vue` — lista nueva (PA-1, PA-2).
- `app/components/alarms/AlarmDetailV2.vue` — estructura nueva (PA-3).
- `app/components/alarms/AlarmTrendChart.vue` — gráfico nuevo (PA-4, PA-5).
- `app/utils/alarmWords.js` — palabras compartidas (valores, horas, nombre de uso del equipo).

## Hallazgos (DEC-PROC-3)

- **Nombre de uso del equipo hardcodeado** (`alarmWords.js`: ELTEK → «Planta DC», CUMMINS → «Grupo electrógeno», ATS/TTA → «Tablero de transferencia»). Debería salir de la ficha (campo nuevo o `domain`).
- **Se quitó el «Reconocer» en lote** de la lista (la maqueta aprobada no lo tiene).

## Backlog que deja esta propuesta

| # | Pendiente | Por qué |
|---|---|---|
| 1 | Situación del sitio en una línea («sin red y sin grupo · corte en 1 h 40 min») | Hoy la lista solo sabe cuántas alarmas abiertas hay por gravedad. |
| 2 | Cifra principal para alarmas de sitio (tiempo hasta el corte de baterías) y su línea de «corte» en el gráfico | El estimado solo existe para alarmas de una medición. |
| 3 | Grupos de sitio plegados cuando hay muchos (NOC) y filtro por zona | La lista no recibe la zona. |
| 4 | Subida de alarmas del hub al NOC y estado «tomada / pasos» en los dos sentidos | Diseñado (DEC-ARCH-2, DEC-REF-30), sin construir. |
| 5 | Nombre de uso del equipo desde la ficha | Ver hallazgos. |
| 6 | Título del gráfico con la conclusión para todas las reglas | Hoy solo cuando hay estimado. |
