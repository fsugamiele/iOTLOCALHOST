# SPEC — Backend: detalle de regla + pronóstico (DEC-REF-143) · 2026-10-08

**Dirección:** `diseno_calidad_confiable.md` (DEC-REF-142). Dos endpoints de lectura que alimentan la
página de detalle de regla (§2 de la dirección). READ-ONLY, en node, gateados superadmin.

## 0 · CANDADO
**preguntas_abiertas: 0.**
- Ambos en `app/api/routes/qa.js` (dueño de `/api/qa/*`), `checkAuth` + `isSuperadmin` (patrón existente).
- node tiene babel → importa modelos `RulePack`, `EquipmentSheet` (export default → `.default`), `QualityFinding`, `Data`, `Notification`.
- El **pronóstico se computa en node** (regresión lineal sobre `data`), no en el worker: es liviano y read-only. Determinista y re-derivable (§3 dirección).
- Reusar el helper de badge por prioridad que ya existe en qa.js (mismo criterio que `/inventory`).

## 1 · Presupuesto
- Archivos (LISTA CERRADA): 1. `app/api/routes/qa.js` (EDITAR: +2 endpoints). **Total: 1 · Límite: 6.**

## 2 · Endpoint A — `GET /api/qa/rule/:ruleId/detail`
Devuelve todo lo "no-gráfico" del detalle. Resuelve la regla en `rulepacks`, la ficha en `equipment_sheet`
(por `deviceType`), los findings en `quality_findings`.
```
data: {
  ruleId, packId, label, deviceType, variable, type, enabled,
  condition: { op, value, deadband } | null,
  fichaNominal: {              // de la ficha, para la variable observada (null si no hay)
    factoryRange, deadband,
    limits: [ { kind:'warning'|'trip', op, value, unit, source } ]
  } | null,
  badge: { key, emoji, label } | null,   // mismo criterio de prioridad que /inventory
  findings: [ {                // todos los quality_findings de ESE ruleId
    _id, type, severity, dId, variable, evidence, suggestedAction, status, firstSeen, lastSeen, count
  } ]
}
```
Casos: regla inexistente → 404; sin ficha para el deviceType → `fichaNominal:null`; sin findings → `findings:[]`.

## 3 · Endpoint B — `GET /api/qa/rule/:ruleId/forecast?dId=&hours=`
Proyección de tendencia de la variable observada. **En TODAS las reglas**: si no aplica, lo dice.
```
data: {
  applicable: boolean,
  reason: string|null,            // si !applicable: 'variable no numérica' | 'datos insuficientes' | 'regla sin variable simple'
  variable: string,
  n: int, spanHours: number,
  slopePerHour: number|null,
  r2: number|null,
  threshold: number|null,         // de la condición de la regla (para el cruce)
  historical: [ {time, value} ],  // recorte reciente para el chart
  projection: [ {time, value, lo, hi} ],  // puntos proyectados + banda de incertidumbre
  crossing: { etaHours: number|null, band: [loH, hiH]|null } | null,
  note: string                    // texto llano honesto (ver §4)
}
```
### Método (determinista, re-derivable — §3 dirección)
- Ventana: `hours` (default `QA_FORECAST_WINDOW_H`=24, cap `QA_FORECAST_MAX_H`=168). Serie de la variable
  de la regla para el `dId` (si se pasa; si no, el device representativo con más datos).
- **Gate de muestra** (`QA_FORECAST_MIN_N`=20, `QA_FORECAST_MIN_SPAN_H`=2): si no alcanza → `applicable:false, reason:'datos insuficientes'`.
- **Regresión lineal** por mínimos cuadrados (x=tiempo en horas, y=valor): `slopePerHour`, intercept, `r2`,
  error estándar de los residuos `se`.
- **Significancia:** si `|slopePerHour|` < `QA_FORECAST_MIN_SLOPE_SE`·(se / √n efectivo) → pendiente no
  significativa → `note:'tendencia plana, sin cruce previsto'`, `crossing:null` (pero `applicable:true`, con la banda plana).
- **Proyección:** extender la recta `QA_FORECAST_HORIZON_H`=12 h hacia adelante; banda `lo/hi = ŷ ± k·se`
  (`k`=2). `historical` = la serie observada (submuestreada a ≤300 puntos).
- **Cruce de umbral:** si hay `threshold` (de la condición) y la pendiente apunta hacia él → `etaHours` =
  resolver recta=threshold; `band` = eta con y±k·se. Si no apunta → `crossing:null`.
- **No aplicable:** variable no numérica, o regla `cross`/`M` sin variable simple → `applicable:false` con `reason`.

## 4 · `note` en lenguaje llano (ejemplos)
- "A este ritmo llega a su umbral en ~5 h (±1,5 h)." · "Tendencia plana: sin cruce previsto en 12 h." ·
  "Sin pronóstico aplicable: esta regla no sigue una medición numérica." · "Datos insuficientes para proyectar."

## 5 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | regla inexistente | 404 (ambos endpoints) |
| 2 | variable con n<MIN | forecast `applicable:false, reason:'datos insuficientes'` |
| 3 | pendiente ~0 | `applicable:true`, note "tendencia plana", crossing:null |
| 4 | cruce ya pasado / pendiente aleja del umbral | crossing:null |
| 5 | regla cross/M | forecast `applicable:false, reason:'regla sin variable simple'`; detail igual devuelve config/findings |

## 6 · Cómo se prueba (sin commitear)
El supervisor reinicia node y pega con JWT superadmin: `GET /api/qa/rule/cat-CB-03/detail` (config+ficha+findings),
`GET /api/qa/rule/cat-CB-03/forecast` (proyección con banda), y una regla cross → `applicable:false`. 401 sin token.

## 7 · Reversión
Revertir los 2 endpoints en `qa.js`. Read-only, sin efecto sobre el motor.
