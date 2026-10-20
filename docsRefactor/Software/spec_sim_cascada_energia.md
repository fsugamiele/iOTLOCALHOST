# SPEC — Simulador: cascada de energía acoplada · 2026-10-20 · BORRADOR (sin firmar)

**Origen:** auditoría del simulador 2026-10-20, puntos M1–M3 (`auditoria_simulador_2026-10-20.md`). Franco: "avanza con la cascada".
**Problema:** el pilar del pitch (DEC-GTM-2) es leer la cascada **corte de red → ATS → grupo → rectificador** como UN evento de sitio. En el simulador cada equipo va por su lado: el corte de red solo existe en el ATS, los rectificadores no se enteran, el GEN tiene su propia "red", y un escenario apaga todas las demás mediciones del equipo mientras dura. La regla "Sitio en riesgo de caída (cascada completa)" solo se puede demostrar componiendo escenarios a mano.

## 0 · CANDADO
- No se implementa hasta firmar Qk1–Qk4 (DEC-PROC-6).
- Antes de implementar: salida de `tools/diagnostico_simulador.js` (la cascada se apoya en el agrupamiento por sitio, M6).
- El motor de reglas (edge) no cambia: solo el simulador.

## 1 · Modelo propuesto (física del sitio en el estado compartido)
Tres hechos del sitio, que cada equipo LEE en cada lectura (no los fija un escenario equipo por equipo):

| Hecho del sitio | Quién lo cambia | Quién lo lee |
|---|---|---|
| `red_presente` (sí/no) | escenarios de red | ATS (tensión/frecuencia de red), GEN (tensión de red), rectificadores |
| `grupo_en_marcha` (ya existe: `gen_running`) | el ATS al transferir (STARTING → RUNNING) | Cummins (rpm, aceite, refrigerante, consumo, batería), GEN según Qk1 |
| `grupo_no_arranca` (sí/no) | escenario de falla | el ATS: intenta arrancar y queda en STARTING → falla; el grupo registra intentos fallidos |

Reglas de la física:
1. **Corte de red:** ATS red = 0 V / 0 Hz → tras 2 s pide arranque (STARTING). Si el grupo arranca, a los 8 s RUNNING y transfiere; si no, 3 intentos fallidos y queda en falla.
2. **Rectificadores:** con red **o** grupo en marcha → flote (−54 V) y vuelven a cargar; sin ninguna de las dos → descarga hacia el LVD (−43,2 V) a la velocidad de Qk2.
3. **Vuelve la red:** ATS red 220 V → retransfiere → STOPPED a los 5 s → el grupo se detiene; rectificadores recuperan.
4. Un escenario ya **no apaga** las demás mediciones del equipo: congela solo las que toca (M1).
5. Reset del sitio (todos sus equipos) vuelve todo al reposo (red presente, grupo detenido).

## 2 · Escenarios (mismos nombres, efecto completo)
- `mains_failure_ats_transfer` → corte de red con arranque correcto (sitio sostenido por el grupo).
- `mains_failure_gen_no_start` → corte de red y el grupo no arranca → rectificadores en descarga → cascada completa.
- `mains_restore` → vuelve la red.
- Los demás (sifoneo, aceite, setpoints, fallas Cummins, ELTEK) quedan igual.

## 3 · Preguntas a firmar
| # | Pregunta | Recomendación |
|---|---|---|
| Qk1 | El **GEN** del sitio demo, ¿es el mismo grupo que el Cummins? | **Sí: el GEN pasa a ser el equipo Wanomi *Sense* montado sobre el mismo grupo** (marcha y tanque del mismo grupo, con su propio sensor). Encaja con Connect (leer la controladora Cummins) + Sense (medir con sensor propio). Alternativa: sacarlo del sitio demo. |
| Qk2 | Velocidad de descarga de las baterías sin red ni grupo | **Comprimida y declarada** (como fuel_drawdown): de flote al LVD en ~20 min, parametrizable (`SIM_DC_DISCHARGE_MIN`). Real serían horas. |
| Qk3 | Escenarios | **Conservar los nombres** y ampliar su efecto (la UI, los guiones y el banco siguen funcionando). |
| Qk4 | Arreglar M1 (el escenario apaga las demás mediciones) en este mismo bloque | **Sí:** con la cascada los escenarios duran minutos y hoy dejarían al equipo sin reportar. |

## 4 · Verificación
Prueba de comportamiento con broker falso (como la auditoría) para las tres secuencias, y en vivo con `probar_en_vivo` / el panel: la regla "Sitio en riesgo de caída (cascada completa)" tiene que pasar a Alarma solo en `mains_failure_gen_no_start`.
