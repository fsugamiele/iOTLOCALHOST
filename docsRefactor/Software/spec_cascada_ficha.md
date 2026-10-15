# SPEC — Cascada Ficha → Template → Device → Regla · 2026-10-14

**Dirección firmada por Franco (2026-10-14):** *"Todas estas unidades y variables se deberían poder
cambiar y actualizar desde ficha de equipos y que el resto del sistema actualice el dato
correctamente. Por eso la decisión de configurar un sitio por pasos y que cada paso tome el dato del
anterior (Ficha de equipo → Template → Device → Regla de Monitoreo) es muy importante."*

Origen: auditoría 2026-10-14 (`claude/auditoria_motor_y_fichas_2026-10-14.md`) — **F-01**: los
`limits` de la ficha no los lee nadie; el mismo umbral vive copiado a mano en ficha, widget y regla,
y ya divergían (aceite psi↔Bar, autonomía 4/2↔6/3↔48/12, combustible 10↔15). Hoy la herencia es
**copia al crear** (`templates.vue:638 applySheetVariableTo`): editar la ficha no llega a nada.
`tools/sync_auditoria_p0/sync.js` hizo la cascada **una vez, a mano**. Esta spec la vuelve permanente.

## 0 · CANDADO
**preguntas_abiertas: 0** — Q1–Q4 **firmadas por Franco el 2026-10-14** con la opción recomendada.
C1 implementado (commit "feat(cascada): C1 Ficha → Template"). C2 implementado (commit "feat(cascada): C2 Ficha → Regla"): `condition.limitRef` + `op` (el op elige el límite por sentido; no hizo falta `limitOp`), `limits[].when` aplicado por el motor. C3 implementado (commit "feat(cascada): C3 parámetros de instalación"): `device.refParams` + `PUT /device/refparams`, `limits[].relativeTo {param, base}` escalado por equipo, `condition.ref` en hojas cross. **Desvío firmado de §6 #8 (Franco 2026-10-14):** sin el parámetro cargado en el equipo se usa `base` de la ficha (batería 12 V), no regla neutra — la neutra apagaba las alarmas de batería de todo el parque.

### 0.1 · Decisiones a firmar (con recomendación)
| # | Pregunta | Opción recomendada | Alternativa |
|---|---|---|---|
| Q1 | ¿Cómo llega un cambio de ficha al template? | **Propagar al escribir**: el PUT de ficha actualiza los widgets que heredan. Ningún lector cambia (dashboard, firmware, `getdevicecredentials` siguen leyendo el template). | Resolver al leer (referencia viva): obliga a tocar cada lector del template (≥8 widgets + webhooks). |
| Q2 | ¿Cómo toma la regla el umbral? | **Referencia**: `condition.limitRef: 'warning'\|'trip'` — el edge resuelve el valor desde la ficha al cargar packs. Cambiar la ficha = cambia la regla (reload ya existe). | Copiar el valor al guardar la ficha (reescribir packs): dos escritores sobre el mismo pack. |
| Q3 | ¿Se puede pisar un valor heredado más abajo? | **Sí, explícito**: `widget.overrides:['thresholds']` en template; `device.refParams` en device (instalación: Vn batería, tanque, P_nom). Lo pisado deja de heredar y se ve marcado en la UI. | No permitir overrides (rígido: un sitio con tanque de 1000 L no podría). |
| Q4 | ¿Qué pasa si cambia la UNIDAD en la ficha? | **Bloquear con detalle** salvo `confirmUnitChange:true`. Con confirmación: widgets y reglas con `limitRef` siguen solos; reglas con valor **literal** se convierten si el par es conocido (psi/kPa/bar, °C/°F, mV/V, L/gal) o se listan para corregir. El equipo físico/driver tiene que publicar en la unidad nueva — la plataforma no puede convertir lo que manda el device. | Convertir siempre sin preguntar (riesgo: el driver sigue en la unidad vieja → alarmas falsas). |

Decisiones ya cerradas (no se reabren): ficha = fuente única; tipos de variable de la ficha gobiernan
la normalización del edge (P0, commit 59fafad); `device.refParams` (spec_umbral_por_referencia.md).

## 1 · Presupuesto — se parte en 3 bloques (límite 6 archivos c/u)
| Bloque | Concern | Archivos (lista cerrada) |
|---|---|---|
| **C1 · Ficha → Template** | Propagación al escribir + overrides | `routes/equipmentsheets.js` (propagar en PUT), `services/sheetCascade.js` (nuevo: derivar unit/factoryRange/deadband/thresholds de la variable — misma lógica que `sync.js thresholdsFrom`), `models/template.js` (`overrides:[String]`), `pages/templates.vue` (marcar heredado/pisado; dejar de copiar al crear), `pages/fichas.vue` (preview "afecta a N templates") |
| **C2 · Ficha → Regla** | `condition.limitRef` | `models/rule_definition.js` (`limitRef`, value no requerido si hay ref), `services/ruleValidation.js` (exactamente uno de value\|limitRef; el límite debe existir), `edge-engine/siteState.js` (resolver limitRef al cargar packs; sin límite ⇒ regla neutra + warn), `routes/equipmentsheets.js` (409 si se borra un límite referenciado), `components/rules/ruleSentence.js` + editor (opción "usar umbral de la ficha") |
| **C3 · Device (instalación)** | `device.refParams` + relativos | Implementa `spec_umbral_por_referencia.md` (6 archivos ya listados allí) + `limits[].relativeTo:'battery_nominal_v'` para batería 12/24 V |

## 2 · Recon que lo funda
`templates.vue:638-669` (copia al crear) · `routes/templates.js:106-200` (PUT con guardas de variables) ·
`routes/webhooks.js:62-81` (firmware lee `deadband` del widget) · widgets `Gauge/IconValue/ProjectedAutonomy/TankLevel/DcPlant.vue` (leen `config.thresholds`) ·
`edge-engine/siteState.js:21` `loadPacks` · `edge-engine/autonomy.js loadAutonomyConfigs` (ya lee la ficha) ·
`edge-engine/valueNormalizer.js` (ya lee `variables[].type`) · `tools/sync_auditoria_p0/sync.js` (cascada manual verificada).

## 3 · Consumidores (grep exhaustivo)
| Consumidor | archivo | Qué le cambia |
|---|---|---|
| Firmware/driver | `routes/webhooks.js:62-81` | Nada (sigue leyendo el template; C1 lo mantiene al día) |
| Widgets del dashboard | `components/Widgets/*.vue` | Nada (leen `thresholds`/`factoryRange` del template) |
| Editor de templates | `pages/templates.vue` | Muestra heredado vs pisado; ya no copia |
| Motor | `edge-engine/siteState.js` | Resuelve `limitRef` al cargar (C2) |
| Validación de packs | `services/ruleValidation.js`, `routes/rulepacks.js` | Acepta/valida `limitRef` |
| Ficha | `routes/equipmentsheets.js`, `pages/fichas.vue` | Propaga, bloquea borrados referenciados y cambios de unidad |

## 4 · Campos
| Campo | Dónde | Entra/Muta |
|---|---|---|
| `widgets[].overrides: [String]` | template | Entra (C1). Vacío = hereda todo |
| `condition.limitRef: 'warning'\|'trip'` (+ `limitOp` si la variable tiene límites en ambos sentidos) | regla | Entra (C2) |
| `device.refParams` | device | Entra (C3, spec existente) |
| `limits[].relativeTo` | ficha | Entra (C3) |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Comportamiento |
|---|---|---|
| 1 | Se edita un límite de la ficha | Widgets que heredan se actualizan; reglas con `limitRef` cambian en el próximo reload (inmediato) |
| 2 | Se borra un límite referenciado por una regla | 409 con la lista de reglas |
| 3 | Se borra una variable usada por template/regla | 409 (mismo criterio que hoy en PUT de template) |
| 4 | Cambio de unidad sin `confirmUnitChange` | 409 con el detalle de dependientes |
| 5 | Widget con `overrides:['thresholds']` | No se toca su `thresholds`; sí unit/factoryRange/deadband |
| 6 | Template sin `deviceType` | Fuera de la cascada (compat) |
| 7 | Regla con valor literal | Sigue igual (compat); la UI sugiere pasarla a `limitRef` |
| 8 | Límite con `relativeTo` y device sin `refParams` | Regla neutra (no dispara) + warning en validación |
| 9 | Variable con dos límites del mismo kind (lt y gt, ej. batería) | `limitRef` exige `limitOp` |

## 7 · Path real
Todo por API con `.save()`/`findOneAndUpdate({runValidators})` (DEC-PROC-5). La propagación de C1 usa `Template.save()`.

## 10 · Cómo se prueba
Harness de integración (rutas reales + modelos reales, store en memoria — el usado en la auditoría):
editar ficha → verificar template y regla resuelta en el edge; casos §6 uno por uno.

## 12 · Reversión
C1/C2 son aditivos: sin `overrides`/`limitRef` el comportamiento es idéntico al actual. Revertir = revert del commit.
