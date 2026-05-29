# Agenda · Reunión multi-área de arranque del refactor

**Sesión #14 · Fecha tentativa:** a confirmar
**Duración estimada:** 90-120 minutos
**Formato:** debate libre + 2 rondas (mismo formato que sesión #8)
**Documento base:** `docsRefactor/WanomiRefactor.md` v0.1

---

## Objetivo

1. Validar las bases del refactor (§1 y §2 del documento maestro).
2. Priorizar áreas de ataque para Fase 1.
3. Definir entregable mínimo por área.
4. Acordar el MVP de Wanomi 3.0.

---

## Asistentes (las 4 áreas, 15 roles)

### Área 1 · Escenarios de Aplicación
- Asesor profesional telco · validación funcional + interfaz con Claro
- Ex-técnico telco · campo, instalaciones, O&M
- Confiabilidad industrial · KPIs de disponibilidad, MTBF, SLA
- Seguridad física · perimetral, detección de intrusión

### Área 2 · Software
- Ing. software senior Vue/Node/MQTT · adaptaciones de plataforma
- Backend senior MongoDB / EMQX · escalado, forensic chain, modbus profiles
- Frontend Vue / dashboards · pages/sites + mapa + reportes
- Integración OSS/BSS · SNMP + REST + Syslog al NOC

### Área 3 · Hardware
- Ing. electrónico industrial · diseño PCB, enclosure, BOM, ensamble
- Ing. potencia DC · protecciones −48 VDC, EMC, rayos
- Vibración / mecánica fluidos · sensado GE, FFT, ultrasónico combustible
- Diseñador industrial · enclosure, ergonomía de instalación

### Área 4 · Marketing
- Arquitecto / enterprise B2B · pitch deck, posicionamiento
- Copywriter B2B · textos de pitch, brochures, web
- Diseñador gráfico · paleta, tipografía, coherencia visual

### Moderación
- Franco (PO / decisor final).

---

## Lectura previa obligatoria (≤ 30 min)

1. `docsRefactor/WanomiRefactor.md` (este es el documento base).
2. `docs/wanomi.md` sesión #8 (cont.) — "Debate libre de equipo + decisiones estratégicas".
3. Si el rol toca Hardware: `docs/wanomi.md` sesiones #9-#12 + paquete WN-SITE-CORE Rev B.
4. Si el rol toca Estrategia / Área 1: `docs/survey/README.md` + `docs/survey/WanomiRefactor.md` §3 Área 1.
5. Si el rol toca Software / Backend: `docs/wanomi.md` §sesión #8 (cont.) — sección "Decisiones técnicas" DEC-ARCH-1, DEC-ARCH-2, DEC-SENSOR-*.

---

## Estructura de la reunión

### Bloque 0 · Apertura (10 min)
- Franco recapitula el objetivo.
- Lectura rápida de los pilares §1 del documento maestro en voz alta.
- Acuerdo: en esta reunión NO se reabre el debate sobre las decisiones #8-#12, solo se valida o se objeta con evidencia. Las objeciones sin evidencia se anotan como backlog.

### Bloque 1 · Validación de bases (20 min)

**Pregunta gatillo:** "¿Hay algo en los pilares §1 o en las decisiones heredadas §2 que considere INSOSTENIBLE en el contexto actual? Si sí, ¿con qué evidencia?"

- Cada área tiene 5 min para hablar.
- Las objeciones quedan registradas en el documento (no se resuelven en este bloque, salvo que sean triviales).
- Si una decisión cae por evidencia → se documenta como DEC-REF-N con justificación.

### Bloque 2 · Estado por área (40 min, 10 min × área)

Cada área expone:
1. **Qué hereda** del estado actual del proyecto.
2. **Qué cambia** con Wanomi 3.0 (qué se reescribe, qué se descarta, qué se mantiene).
3. **Qué bloqueos tiene** para arrancar la iteración 1.
4. **Qué dependencias tiene** de otras áreas.

Orden sugerido (de la base a la superficie):
1. Hardware (Área 3) — el fierro condiciona el resto.
2. Software (Área 2) — el código consume el fierro.
3. Estrategia (Área 1) — los escenarios validan software + hardware.
4. Marketing (Área 4) — el pitch consume las 3 capas anteriores.

### Bloque 3 · Priorización + MVP (25 min)

**Pregunta gatillo:** "Si en 60 días tenemos que mostrar Wanomi 3.0 funcionando en 1 sitio del piloto Claro, ¿qué es lo MÍNIMO que tiene que funcionar end-to-end?"

- Cada área propone su MVP.
- Cruzar: ¿el MVP de cada área es consistente con los demás? ¿Las dependencias cierran?
- Acordar el MVP integrado de Wanomi 3.0.
- Acordar el orden de ataque (qué arranca primero, qué espera, qué corre en paralelo).

### Bloque 4 · Compromisos (15 min)

Cada área deja en el documento:
- Entregable de iteración 1 (1-3 documentos de 1-3 pp. cada uno en su subcarpeta de `docsRefactor/`).
- Fecha tentativa de entrega (criterio realista, no aspiracional).
- Persona responsable.
- Dependencias bloqueantes.

### Bloque 5 · Cierre (10 min)

- Franco resume:
  - Decisiones tomadas (que se sumarán como DEC-REF en `WanomiRefactor.md` §5).
  - Tareas asignadas por área.
  - Próxima sesión (fecha + objetivo).
- Cierre de la reunión.

---

## Outputs esperados (post-reunión)

1. **Actualización de `WanomiRefactor.md`**:
   - DEC-REF-6 en adelante con decisiones nuevas.
   - §3 actualizada con prioridades acordadas por área.
   - §4 actualizada con MVP definido.

2. **1 documento de alcance por área** en su subcarpeta:
   - `docsRefactor/Hardware/iteracion_1_alcance.md`
   - `docsRefactor/Software/iteracion_1_alcance.md`
   - `docsRefactor/Estrategia/iteracion_1_alcance.md`
   - `docsRefactor/Marketing/iteracion_1_alcance.md`

3. **Entrada de sesión #14 en `docs/wanomi.md`** con resumen ejecutivo.

4. **Actualización de `docs/STATUS.md`**: próximos pasos refinados.

---

## Reglas del debate (heredadas de sesión #8)

1. **Realidad primero**: ninguna decisión sin anclaje en realidad técnica o evidencia operativa.
2. **Honestidad arquitectónica**: lo que es inferred se nombra inferred; lo que es promesa futura se nombra promesa futura.
3. **No urgencia performativa**: si una decisión necesita más tiempo, se posterga. Mejor decidir bien que decidir rápido.
4. **Desacuerdos productivos**: el desacuerdo entre roles es señal de calidad, no de conflicto. Se registra explícitamente.
5. **Franco decide en empate**: en última instancia, la decisión es del PO.

---

## Pre-trabajo opcional para cada rol (24-48 hs antes de la reunión)

Para que el Bloque 2 sea productivo, cada rol puede llegar con 3 bullets escritos:
- "Lo que hereda mi área": componente / archivo / documento del estado actual que sigue siendo válido en 3.0.
- "Lo que descarta mi área": componente / archivo / documento del estado actual que NO sirve para 3.0.
- "Lo que falta crear": el principal entregable nuevo que su rol ve necesario para arrancar.

Enviar los bullets a Franco antes de la reunión (formato libre, 1 párrafo cada bullet).
