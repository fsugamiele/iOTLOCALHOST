# SPEC — Bloque 7 (QA): UI `/admin/calidad` (mockup 1:1) · 2026-10-06

**Dirección firmada por Franco:** camino A, Wave 3 — la pantalla del administrador, **1:1 con
`supervisor_calidad_mockup.html`**. Solo superadmin. Consume la API de lectura (DEC-REF-140) + los
endpoints existentes de acción (toggle DEC-REF-121, revert DEC-REF-137, backtest proxy DEC-REF-140).

## 0 · CANDADO
**preguntas_abiertas: 0.**
Decisiones cerradas:
- Página nueva `app/pages/admin/calidad.vue` con `middleware: ['authenticated','superadmin']` (patrón
  DEC-REF-62.b) + **re-chequeo fresco `GET /me` en la página** (Capa 2, como `admin.vue`): si el usuario
  no es superadmin server-side, no renderiza datos. NO se mezcla en el dashboard del operador.
- Llamadas API con `this.$axios` + `headers: { token: this.$store.state.auth.token }` (patrón del repo).
- Visual **fiel al mockup** (semáforo de tiles, inventario con badges + interruptor, ficha de hallazgo con
  gráfico, backtest inline, digest), reproducido con la librería/tema existentes de la app (element-ui +
  tema Wanomi teal). **Charts = SVG a mano** desde datos reales (sin dependencia nueva), como el mockup.
- **Mostrar el dato, no solo el veredicto**: cada hallazgo con su evidencia inspeccionable.
- Acciones a un clic cableadas a endpoints REALES (ver §4). NO se evalúa ni calcula nada en el front.

## 1 · Presupuesto de bloque
- Tipo: **PESADO** (la pantalla entera), pero archivos acotados.
- Archivos (LISTA CERRADA):
  1. `app/pages/admin/calidad.vue` — página: guard, fetch, layout, semáforo+digest, orquesta componentes.
  2. `app/components/qa/Semaforo.vue` — tiles del semáforo (score + sparkline SVG).
  3. `app/components/qa/InventarioReglas.vue` — tabla con badges + interruptor on/off por regla/pack.
  4. `app/components/qa/FichaHallazgo.vue` — detalle del hallazgo: evidencia + histograma SVG + línea de
     tiempo SVG + botones de acción.
  5. `app/components/qa/BacktestInline.vue` — "probar contra historial" (POST /api/qa/backtest) con veredicto + histograma.
  - **Total: 5 · Límite: 6.** NO toca `app/api/` (es de 140) ni el worker qa. Reusa el interruptor por
    endpoint (NO edita `RuleCard.vue`).

## 2 · Recon que lo funda
- `app/pages/admin.vue`: patrón de página superadmin (middleware array + el-tabs + re-chequeo `/me` + tablas element-ui).
- `app/middleware/superadmin.js`: guard de rol (store grants).
- `app/pages/rulepacks/_packId.vue`: patrón de `$axios` + header `token`; y el toggle on/off (PATCH
  `/rulepacks/:packId/rules/:ruleId/enabled` y `/rulepacks/:packId/enabled`, DEC-REF-121) a reusar.
- `supervisor_calidad_mockup.html`: LAYOUT y semántica de cada panel (tiles, badges 🟢🟡🔴🟣🔁, ficha con
  histograma + timeline, backtest con veredicto, digest). Es el objetivo visual 1:1.
- `spec_qa_b6_api.md` (DEC-REF-140): contrato de datos de `/api/qa/*`.

## 3 · Paneles (del mockup) y su fuente de datos (API 140)
| Panel | Endpoint |
|---|---|
| Semáforo (tiles: cross-close%, alarmas/día, flapping, muertas) | `GET /api/qa/overview` |
| Inventario de reglas (badge + disparos30d + último + interruptor) | `GET /api/qa/inventory` |
| Ficha de hallazgo (evidencia + histograma + timeline + acciones) | `GET /api/qa/findings` + `GET /api/qa/rule/:ruleId/timeline` + `POST /api/qa/backtest` (histograma) |
| Backtest inline | `POST /api/qa/backtest` |
| Digest semanal | `overview.digest` |

## 4 · Acciones (a endpoints reales)
| Botón (mockup) | Llamada |
|---|---|
| Interruptor on/off (regla / pack) | `PATCH /rulepacks/:packId/rules/:ruleId/enabled` · `/rulepacks/:packId/enabled` (DEC-REF-121) |
| "Sacar de circulación" (ficha) | el mismo PATCH de interruptor sobre la regla del hallazgo |
| "Silenciar hallazgo" | `PATCH /api/qa/findings/:id/status` → `muted` |
| "Abrir editor con los datos" | link a `/rulepacks/:packId` (editor existente) |
| "Revertir a la definición original" | `POST /rulepacks/:packId/rules/:ruleId/revert` (DEC-REF-137) |
| "Probar contra historial" | `POST /api/qa/backtest` |

## 5 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | usuario no superadmin | el middleware redirige; el re-chequeo `/me` evita render de datos |
| 2 | API aún sin findings | la pantalla muestra "sin hallazgos / motor sano", no rompe |
| 3 | worker qa caído (backtest/timeline) | el panel muestra error amable, el resto de la página funciona |
| 4 | regla cross/M sin serie simple | el histograma/timeline muestran "sin serie", no rompen |
| 5 | acción falla (403/500) | toast de error, no deja la UI en estado inconsistente |

## 6 · Path real (DEC-PROC-5)
Página servida por Nuxt (SPA). Las acciones pegan a los endpoints productivos reales (el toggle y el
revert YA están vivos; los de `/api/qa/*` los sirve 140). Verificación: build Nuxt (`docker_nuxt_build.yml`)
+ node con 140 vivo → cargar `/admin/calidad` con un superadmin.

## 7 · IDs reservados
- **DEC-REF-141** — UI `/admin/calidad` del Supervisor de Calidad (mockup 1:1), solo superadmin.

## 8 · Cómo se prueba (el AGENTE no corre el build; lo hace el supervisor)
El agente: valida sintaxis Vue/template, calce 1:1 con el mockup, y que cada fetch/acción apunte al
endpoint correcto con el header `token`. El SUPERVISOR: con 140 vivo + `npm run build` (docker_nuxt_build.yml),
carga la página con un JWT superadmin y recorre semáforo/inventario/ficha/backtest/acciones.

## 9 · Reversión
Borrar `app/pages/admin/calidad.vue` + `app/components/qa/*`. No hay link entrante hardcodeado fuera de
estos archivos (se agrega el acceso desde el menú admin en un paso aparte si se decide). Cero efecto sobre el motor.
