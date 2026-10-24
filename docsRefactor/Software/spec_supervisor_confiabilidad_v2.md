# SPEC — Supervisor de calidad v2: confiabilidad y calidad de alarmas · 2026-10-24 · DEFINICIONES FIRMADAS (D1–D4, Franco "ok, avanza") · Qs1–Qs6 FIRMADAS ("aprobado, avanza" 24/10) · R1 CERRADO (validado con datos reales 24/10) · R2 IMPLEMENTADO

**Origen:** Franco 2026-10-24 — el supervisor de calidad tiene bugs de renderizado de gráficos y lo que informa no alcanza para interpretar errores ni decidir cambios. Pide rediseño con información "fehaciente y respaldada por funciones matemáticas e indicadores de confiabilidad (Ao, Ai/técnica, MTBF, λ, MTTR, R, M)".
**Maqueta aprobada:** `docsRefactor/Software/mockup_supervisor_confiabilidad_v2.html` (datos de ejemplo).
**Reemplaza:** la UI de `pages/admin/calidad/` (spec_qa_b7_ui) y los veredictos de Capa A/B que se listan en §5. **Se mantiene** el principio cardinal de `diseno_supervisor_calidad.md` §0: los controles de integridad (Capa B/C) no comparten código con el motor; el backtest (Capa A) sí puede usar el motor real.

## 0 · CANDADO
- Ningún indicador sin su **n**, su **intervalo de confianza** y su **nivel de confianza** (D4). Con confianza baja el número se muestra con intervalo y no se usa para comparar equipos.
- Ninguna recomendación sin el **cálculo** que la respalda y sin el **resultado de reproducirla** sobre la ventana.
- Gráficos: un valor no finito no se dibuja nunca; sin datos válidos → estado vacío "Sin datos suficientes" (nunca ±Infinity / NaN).
- Metas (Ao, SLA) son **PROVISORIAS** hasta que Claro confirme sus SLA. Configurables, no hardcodeadas (DEC-PROC-3).

## 1 · Definiciones FIRMADAS
| # | Definición |
|---|---|
| D1 | **Falla** = episodio de una regla de severidad crítica del equipo, desde el aviso hasta el cierre. Combinadas (cross): se imputa al equipo dueño del episodio (`inst.dId`, fijo desde el fix del 22/10). |
| D2 | **MTTR** = reconocimiento → cierre (reparación activa). **Respuesta (MRT)** = aviso → reconocimiento. **Fuera de servicio (MDT)** = aviso → cierre. |
| D3 | **SLA de reparación 4 h** y **meta Ao ≥ 99,5 %** — PROVISORIOS, en configuración. |
| D4 | **Confianza:** alta = n ≥ 5 y completitud ≥ 95 %; media = n ≥ 2 y completitud ≥ 95 %; baja = el resto. |

## 2 · Indicadores (ventana T = 720 h, configurable)
```
TO   = T − Σ MDT                       λ = n / TO          MTBF = TO / n
IC 90 % (ensayo truncado por tiempo):  MTBF_inf = 2·TO / χ²(0,95; 2n+2)   MTBF_sup = 2·TO / χ²(0,05; 2n)
n = 0  →  solo cota: MTBF ≥ 2·TO / χ²(0,95; 2)   (nunca "100 %" ni "∞")
R(t) = e^(−λt)   banda con λ en los extremos del IC     M(t) = 1 − e^(−t/MTTR)
Ai = MTBF/(MTBF+MTTR)   Aa = MTBM/(MTBM+M̄) (correctivo+preventivo)   Ao = TO/T
```
- Agregado de parque: suma de n y de TO de los equipos (no promedio de porcentajes).
- **Ao del sitio** (distinto del de equipos): tiempo con el sitio sin energía en la carga (LVD abierto / sin datos de todos los equipos DC) ÷ T.
- Con ≥ 10 fallas en un equipo: ajuste Weibull informativo; aviso si β fuera de [0,8 ; 1,2].
- **Carga de alarmas ISA-18.2 / EEMUA 191 (7 días):** avisos/h (meta ≤ 6), % de ventanas de 10 min con > 10 avisos (meta < 1 %), parpadeo (≥ 3 avisos del mismo par en 60 s), permanentes (> 24 h abiertas), % top-10.
- `χ²` se calcula en el worker (función de cuantil propia, sin dependencia nueva); prueba contra tabla para n = 0…20.

## 3 · Calidad de las reglas (Capa A rehecha)
- El **backtest reproduce la ventana con el motor completo** (`ruleEngine` + `ruleFsm`: espera, histéresis, cierre, cascada de límites `deviceLimits`) y **cuenta episodios**, no lecturas que cumplen.
- Veredictos y su criterio:

| Veredicto | Criterio |
|---|---|
| Avisa de más | parpadeo > 0, o > 1 aviso/día, o ≥ 30 % de episodios < espera de cierre |
| No puede evaluar | requisito de la regla (ventana, historia, medición) imposible con los datos/reinicios observados |
| Umbral a revisar | alcanzable pero a > 10 σ de lo observado, o número fijo donde la ficha tiene capacidad/escala |
| Protección sin disparos | 0 avisos y umbral dentro del rango físico de la ficha (reemplaza "muerta") |
| Inalcanzable | umbral fuera del rango físico de la ficha |
| Sana | el resto |

- **Recomendación con cálculo:** histéresis ≥ 2·σ_ruido (σ de diferencias consecutivas / √2); espera ≥ p95 de la duración de las excursiones cortas. Se reproduce la regla con el cambio y se informa "avisos antes → después" y "fallas reales perdidas" (episodios > 10 min que desaparecen).
- Botón **Aplicar cambio** = abre el editor con el cambio precargado; guarda el usuario (no escribe solo).

## 4 · Integridad del motor (Capa B/C corregida)
- I1 cierre en otro equipo · I4 cierre sin aviso: **busca el último evento del par antes de la ventana** antes de declarar huérfano.
- I6 valor del aviso ≠ medición: compara contra **cualquier lectura entre inicio de espera y aviso** (±2 %), no la más cercana.
- I15 encendida con medición normal: > 30 min sin cumplir + espera de cierre.
- Cada control muestra "antes de <fecha de fix>" / "últimas 48 h" y su criterio en texto.
- **Cierre automático de hallazgos:** ausente en 2 corridas consecutivas → `status: 'resuelto-auto'` (un `muted`/`ack` del admin se respeta).
- **Deriva (I13):** acción "Aceptar versión actual como referencia" → nuevo `rule_snapshot` con `acceptedBy`/`acceptedAt`.

## 5 · Qué se quita
"Muerta" (→ Protección sin disparos / Inalcanzable), conteo por mensaje en combinadas, ruidosa/permanente sin FSM, los charts actuales de `components/qa/*Chart.vue` (se reemplazan por SVG propio con las guardas de §0).

## 6 · Preguntas a firmar (implementación)
| # | Pregunta | Recomendación |
|---|---|---|
| Qs1 | No hay registro de mantenimiento preventivo → Aa no se puede calcular. | Preventivo = ventanas de **modo servicio** (ya existen, `resolve-by-service`). Sin ventanas: Aa = "—", no se inventa. |
| Qs2 | Episodios cerrados por condición sin reconocimiento: no tienen MTTR/MRT. | Cuentan en n, MDT y Ao; **no** en MTTR/MRT. Se muestra "MTTR sobre k de n episodios reconocidos". |
| Qs3 | Fallas antes del fix del 22/10 (cierre en otro equipo). | Ventana reconstruida con el **par corregido** (aviso + primer cierre de la misma regla en el sitio); las 25 conocidas se marcan "reconstruida". |
| Qs4 | Cálculo: ¿en vivo o precalculado? | Precalculado por el worker `wanomi-qa` cada 1 h (colección nueva `reliability_snapshots`); la UI solo lee. |
| Qs5 | Metas/SLA/T/umbral de confianza: ¿dónde se configuran? | Documento `qa_config` editable por superadmin; valores de D3/D4 como iniciales. |
| Qs6 | Orden de bloques | **R1** cálculo + API (tests contra tabla χ²) → **R2** backtest con motor completo + veredictos → **R3** correcciones de integridad + cierre automático + aceptar deriva → **R4** UI nueva. |

## 7 · Pruebas de aceptación
- χ² e IC contra tabla publicada (n = 0…20, error < 0,1 %).
- Datos sintéticos con λ conocido (simulador, 30 días acelerados): λ estimado dentro del IC en ≥ 90 % de 50 corridas.
- Backtest: F2a/A1 del sitio reproducen el conteo real de episodios de `notifications` ± 1.
- UI: ninguna serie con NaN/Infinity (prueba Playwright en todas las pestañas, también con equipo n = 0 y sin datos).

## 7b · Definiciones FIRMADAS tras validar con datos reales (Franco 2026-10-24)
| # | Definición |
|---|---|
| Qs7 | Cada regla declara su **clase** (`eventClass`): *equipo* (falla: MTBF/MTTR), *red* (red/energía: disponibilidad del sitio), *seguridad*, *combustible*, *operacion* (eventos, no fallas). Las combinadas de *equipo* declaran **qué equipo falla** (`failDeviceType`). Regla crítica sin clase = no cuenta (se informa). |
| Qs8 | **Rebote:** un nuevo aviso de la misma regla en el mismo equipo antes de 30 min (`qa_config.mergeGapMin`) del cierre anterior es la misma falla. |
| Qs9 | **Completitud** sobre el tiempo con la plataforma viva (algún equipo del sitio publicando). El tiempo con la plataforma apagada se informa aparte. |

Consecuencia aplicada de Qs9: la **exposición T** y el **tiempo fuera de servicio** de cada equipo también se cuentan solo con la plataforma viva (una falla no se puede observar con la plataforma apagada). MTTR y respuesta siguen en tiempo de reloj (la gente actúa igual).

## 8 · Implementación
**R1 (2026-10-24) — cálculo + API:**
- `qa/lib/reliability.js` (funciones puras): χ² por inversión de la gamma incompleta, IC del MTBF, episodios (Qs3 reconstrucción), fallas, indicadores, Crow-AMSAA, carga ISA-18.2, caídas del sitio, agregado de parque.
- `qa/checks/reliability.js` (Capa B, recalcula cada `everyMin`) → colección `reliability_snapshots` (se borran solas a los 90 días). `qa/routes/reliability.js`: recalcular ya.
- `app/api/models/qa_config.js` + API: `GET /api/qa/reliability`, `POST /api/qa/reliability/recompute`, `GET|PUT /api/qa/config` (superadmin).
- Pruebas: `qa/test/reliability.test.js` (11: tabla χ², IC, cobertura 93 % en 2000 corridas con λ conocido, episodios, superpuestas, Qs2, n = 0 sin infinitos, D4, β, ISA, caídas) y `qa/test/reliability.itest.js` (integración con base falsa).

**Reglas de cálculo tomadas en R1 (a validar por Franco):**
- Episodios críticos **superpuestos del mismo equipo = una falla** (la misma caída leída como un evento, criterio de cascada de CLAUDE.md §1); la falla lista todas las reglas que la componen.
- **Aa queda "—"**: el service registrado (`resolve-by-service`) es un evento puntual, sin duración. Para calcular Aa hace falta registrar inicio y fin del mantenimiento (pendiente, fuera de R1).
- **T por equipo** empieza en su primera lectura dentro de la ventana (un equipo instalado hace 5 días no se evalúa sobre 30).
- **Completitud** = % de ventanas de 5 min con alguna lectura; las mediciones intermitentes por diseño (consumo/autonomía) no cuentan.
- **Caída del sitio** = ventanas de 5 min sin lecturas de ningún rectificador mientras otro equipo del sitio publica (descarta caídas de la plataforma). Precisión ±5 min.
- Avisos abiertos antes de la ventana se buscan hasta 90 días atrás.
- β (Crow-AMSAA, proceso de Weibull para equipos reparables) solo con ≥ 10 fallas.

**R1b (2026-10-24) — Qs7–Qs9:** `eventClass`/`failDeviceType` en la regla (no cambian la huella del motor ni cuentan como deriva) · selector en el editor (paso 4) · `tools/clasificar_reglas.js` (propuesta por palabras clave, `--apply` con correcciones) · sitio = carga sin energía + red (cortes, horas, MTBF de la red) + plataforma sin datos + eventos que no son falla · mediciones internas `_x` excluidas.

**R2 (2026-10-24) — calidad de las reglas:** `qa/lib/ruleQuality.js` reproduce la ventana con el motor completo (todas las reglas juntas, como en vivo; lectura por horas) y cuenta episodios. Veredictos de §3; para "avisa de más" propone espera > p95 de las excursiones cortas + 30 s y, en reglas de umbral fijo, histéresis ≥ 2·σ_ruido, y **reproduce la regla con el cambio** (avisos antes → después, fallas > 10 min perdidas). Corre en la Capa C nocturna (`qa/checks/ruleQuality.js`) o a pedido (`POST /api/qa/rule-quality/recompute`, en segundo plano) → `rule_quality_snapshots`; `GET /api/qa/rule-quality`; `tools/ver_calidad_reglas.js`.
- Regla tomada: un umbral **lejano** (> 10 σ) es "umbral a revisar" solo si es un número propio; si viene de la ficha o la controladora (fabricante) es "protección sin disparos".
- Límite: "deja de reportar" no se reproduce (usa el reloj real). Reinicios del edge no se simulan.
- Prueba: `qa/test/ruleQuality.itest.js` (motor real, 3 días sintéticos): bus DC con bajones de 40 s → avisa de más, espera 90 s + histéresis 0,21 → 24 → 1 avisos sin perder el corte real de 30 min; sobrevelocidad de ficha → protección; umbral fuera del rango físico → inalcanzable; número fijo lejano con límite en la ficha → umbral a revisar; medición sin lecturas → no evalúa.
- Ajustes tras la 1ª corrida real (24/10, 2,35 M lecturas, 27,9 min): escala de la ficha leída bien ("0-1800" no es −1800); umbral fuera de la escala de la ficha = "umbral a revisar" (la escala es de fábrica, no el límite físico), "inalcanzable" solo si excede la escala en más de la mitad de su amplitud; "la mayoría de los episodios son cortos" solo con ≥ 5 episodios; histéresis solo en comparaciones de orden sobre mediciones continuas y con σ robusto (1,4826·mediana|Δ|/√2, los cortes y arranques no lo inflan); si el cambio reproducido no baja al menos 20 % los avisos, no se propone (se pide revisar la condición); avance por día en el log.
