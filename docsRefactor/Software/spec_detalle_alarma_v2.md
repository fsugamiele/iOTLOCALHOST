# SPEC — Detalle de alarma v2 (qué pasa · por qué · cómo se soluciona · contexto) · 2026-10-19

**Origen:** Franco descartó el mockup "Detalle de la alarma · foto del disparo" (2026-10-19): la pantalla tiene que servir para que el operador sepa **qué está pasando, por qué, cómo solucionarlo y el contexto** que provoca la alarma. El v1 era técnico (L1/E3, tabla).
**Mockup aprobado por Franco (2026-10-19, "bien, buena propuesta"):** lienzo "Wanomi · Regla combinada", artboard `DetalleV2.dc.html`.
**Firmado (2026-10-19, "si aprobado"):** Qj1–Qj4. Detalle de color: modo oscuro con la paleta de la plataforma (Qj5).

## 0 · CANDADO
- Una sola pantalla para **todas** las alarmas de **todos** los equipos; se arma con datos de la regla, la ficha y el sitio. Sin términos del backend en pantalla (L1, E3, deviceType, ruleId).
- La traducción a palabras es **solo de UI**: lo guardado y lo que lee el motor no cambia.
- Pendiente de implementar. Pregunta que esta spec no contesta ⇒ se frena y vuelve a diseño (DEC-PROC-6).

## 1 · Decisiones
| # | Decisión |
|---|---|
| Qj1 | Estructura en 4 bloques, en este orden: **1 Qué está pasando · 2 Por qué saltó · 3 Cómo solucionarlo · 4 Contexto**. Encabezado: gravedad, abierta hace X, quién la tomó, "Tomar la alarma" (= reconocer, ack existente), "Ver el sitio", "Ver la regla". |
| Qj2 | Campo nuevo de la regla **"Qué significa esta alarma"** (`meaning`, texto corto) → frase del bloque 1. Sin cargar: nombre + primera oración de la recomendación. Se edita en el editor v2 (paso 4). |
| Qj3 | Campo nuevo de la regla **"Pasos a seguir"** (`steps`, lista, uno por renglón) → checklist del bloque 3; lo tildado queda registrado en la alarma (quién, cuándo). Sin cargar: la recomendación como texto. |
| Qj4 | Campo nuevo en la ficha de cada tipo de equipo: **medición principal** (`primaryVariable`) → tarjeta del equipo en "Equipos del sitio ahora". Sin cargar: solo "reporta / no reporta". |
| Qj5 | Colores: los de la plataforma (black-dashboard). Oscuro: fondo `#1e1e2f`, tarjetas `#27293d`, bordes `#3b3d55`; claro: `#f5f6fa` / `#fff`. Gravedad: informativa `#3b82c4`, advertencia `#e8b730`, crítica `#d93a46`. Aplicado también al editor v2 y las tarjetas de reglas (commit ac6fb64). |

## 2 · Bloques y de dónde sale cada dato
| Bloque | Contenido | Fuente |
|---|---|---|
| 1 Qué está pasando | Frase (Qj2) · 1–4 valores en vivo = las mediciones de las condiciones de la regla · dato destacado: "llega en X" si la regla proyecta, autonomía en energía, si no tiempo en alarma | regla · `data` / estado del sitio · `autonomy_hours` (edge) |
| 2 Por qué saltó | Cada condición en palabras con **al avisar** (foto del disparo `leaves`) y **ahora** · gráfico de 2 h con umbral, inicio, aviso y proyección; selector de medición | `notifications.leaves` · `data` · `thresholdUsed` / ficha |
| 3 Cómo solucionarlo | Checklist (Qj3) · "Cuándo se cierra" generado de la regla (`resolveGraceSec`, `reset_behavior`) | regla · alarma |
| 4 Contexto | **Cómo empezó**: alarmas y cambios de etapa de todo el sitio en la hora previa al aviso · **Equipos del sitio ahora** (Qj4) · **Antecedentes**: veces en 30 días en el sitio, duración y cierre de la última · **Otras alarmas abiertas del sitio** | `notifications` + `ruletransitions` por `siteId` · ficha · `data` |

## 3 · Variantes por tipo de regla
- Valor (D): una condición, umbral fijo. Contra el límite del equipo (C): la línea del umbral sigue al límite informado.
- Métricas (M): el gráfico muestra la evolución que se mide (tendencia, salto, fuera de lo habitual…).
- "N veces en T" (S): eventos marcados en el gráfico + conteo ("3 cortes en 1 h"). Deja de reportar: "último dato hace X".
- Combinada (cross): todas sus condiciones; regla de sitio sin equipo propio → "<sitio> · sitio".
- Alarma anterior a la foto del disparo: solo "ahora". **Alarma cerrada**: se lee como informe (duró, cómo se cerró, quién la tomó, pasos hechos), sin valores en vivo.

## 4 · Piezas nuevas a construir
- Esquema: `rule.meaning`, `rule.steps[]` (rule_definition), `sheet.primaryVariable` (equipment_sheet), `notification.stepsDone[] {i, by, at}`.
- API: `GET /api/alarms/:id/detail` (alarma + regla + foto + valores actuales + serie 2 h + contexto del sitio), `POST /api/alarms/:id/steps` (tildar/destildar).
- Front: página de detalle nueva (reemplaza la actual) + campos Qj2/Qj3 en el editor v2 + Qj4 en fichas.
- Banco: un caso por variante de §3.
