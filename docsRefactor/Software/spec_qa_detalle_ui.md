# SPEC — UI: detalle de regla + pronóstico + navegación (DEC-REF-144) · 2026-10-08

**Dirección:** `diseno_calidad_confiable.md` (DEC-REF-142) + `mockup_calidad_inventario_detalle.html`.
El inventario pasa a ser el índice; cada regla linkea a su página de detalle con 4 secciones.

## 0 · CANDADO
**preguntas_abiertas: 0.**
- **Ruteo Nuxt 2 — CUIDADO (lección DEC-REF-141):** para que `/admin/calidad/:ruleId` NO quede anidada
  bajo `calidad.vue` (que renderizaría el padre sin `<nuxt-child/>`), hay que **mover
  `pages/admin/calidad.vue` → `pages/admin/calidad/index.vue`** y crear `pages/admin/calidad/_ruleId.vue`
  como HERMANA. (Mismo patrón que `admin.vue`→`admin/index.vue`.)
- Reusa SIN modificar: `QaHistChart`, `QaTimelineChart`, `FichaHallazgo`, `BacktestInline` (el detalle los
  compone). Charts nuevos: `QaForecastChart` (ECharts, mixin `echartsBase`).
- Llamadas `this.$axios` + `headers:{token:...}`, rutas sin prefijo `/api` (baseURL ya lo pone).

## 1 · Presupuesto
- Archivos (LISTA CERRADA):
  1. `app/pages/admin/calidad.vue` → **MOVER** a `app/pages/admin/calidad/index.vue` + editar (índice).
  2. `app/pages/admin/calidad/_ruleId.vue` (NUEVO — página de detalle, 4 secciones).
  3. `app/components/qa/QaForecastChart.vue` (NUEVO — ECharts).
  4. `app/components/qa/InventarioReglas.vue` (EDITAR — filas linkean al detalle).
  - **Total: 4 · Límite: 6.**

## 2 · `calidad/index.vue` (el índice)
Queda **centrado en el inventario**: métricas de confianza del motor (meta pills) + `<InventarioReglas>` +
digest. **Saca** de la vista principal la ficha de un solo hallazgo y el backtest inline (ahora viven en el
detalle). Mantiene `middleware:['authenticated','superadmin']` + re-chequeo `/me`, y los handlers de toggle.

## 3 · `_ruleId.vue` (la página de detalle) — 4 secciones (orden del mockup)
`middleware:['authenticated','superadmin']` + re-chequeo `/me`. `ruleId` de `this.$route.params`.
Fetch: `/qa/rule/:id/detail`, `/qa/rule/:id/forecast`, y para los charts `/qa/backtest` + `/qa/rule/:id/timeline`.
1. **Estado de calidad:** si `detail.findings` tiene alguno, renderiza `<FichaHallazgo :finding :badge>` con el
   de mayor prioridad (reusa el componente tal cual). Si no hay findings → "🟢 Sin hallazgos: esta regla se comporta bien".
2. **Comportamiento:** `<QaHistChart>` (del backtest de la regla) + `<QaTimelineChart>` (del timeline). Reuso directo.
3. **Pronóstico:** `<QaForecastChart>` con `forecast`; debajo, la `note` en llano + la acción anticipada.
   Si `applicable:false` → mostrar la `reason` ("sin pronóstico aplicable" / "datos insuficientes"), sin romper.
4. **Configuración y procedencia:** de `detail`: condición (`op value`), umbral vs `fichaNominal.limits`
   ("ficha sugiere X · este sitio usa Y"), tipo, `factoryRange`; botones "Abrir en el editor"
   (`/rulepacks/:packId`) y "Revertir a la de fábrica" (`POST /rulepacks/:packId/rules/:ruleId/revert`).
Breadcrumb "Inventario › {label}" que vuelve a `/admin/calidad`.

## 4 · `QaForecastChart.vue` (ECharts, mixin echartsBase)
Props: `historical` ([{time,value}]), `projection` ([{time,value,lo,hi}]), `threshold`, `variable`, `note`.
chartOption: `xAxis type:'time'`; `yAxis value scale`; series: (a) línea LLENA teal del `historical`;
(b) línea PUNTEADA info del `projection` (value); (c) **banda de incertidumbre** = dos series de área
(lo/hi) o `series.lineStyle` con `areaStyle` tenue entre lo y hi; (d) `markLine` horizontal en `threshold`
(rojo) si viene; (e) `markLine` vertical "ahora" separando histórico de proyección. Tooltip fecha+valor.
Sin dato / `applicable:false` → el padre no lo renderiza (muestra la reason).

## 5 · `InventarioReglas.vue` (editar)
Cada fila de regla pasa a ser navegable a `/admin/calidad/{ruleId}` (router-link o `@click` →
`$router.push`). Mantener el interruptor `<base-switch>` y los eventos `toggle-rule`/`toggle-pack` (que
NO deben disparar la navegación — `@click.stop` en la celda del switch). Agregar una columna/indicador de flecha "→".

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | ruleId inexistente en el detalle | la página muestra "regla no encontrada", no rompe |
| 2 | regla sin findings | sección 1 = "sin hallazgos, se comporta bien" |
| 3 | forecast no aplicable | sección 3 muestra la reason, el resto de la página vive |
| 4 | clic en el interruptor | togglea, NO navega al detalle |
| 5 | regla cross (sin histograma/umbral) | hist sin zona roja; forecast "sin pronóstico aplicable" |

## 7 · Cómo se prueba (el agente NO buildea)
Compilar los .vue con `vue-template-compiler` + `@babel/parser` (0 errores). El supervisor hace el build
Nuxt + restart de node + carga `/admin/calidad` (inventario con links) y `/admin/calidad/cat-CB-03` (detalle
con las 4 secciones + pronóstico).

## 8 · Reversión
Revertir el move + borrar `_ruleId.vue` y `QaForecastChart.vue` + revertir `InventarioReglas.vue`.
