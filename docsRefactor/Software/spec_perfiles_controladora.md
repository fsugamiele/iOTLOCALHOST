# SPEC — Perfiles de controladora: reglas genéricas, umbrales por equipo · 2026-10-20 · FIRMADA (Qp1–Qp6 aprobadas por Franco: "aprobado, avanza")

**Origen:** Franco 2026-10-20: "cómo haremos dinámicas las reglas cuando tengamos el hardware funcionando para que el firmware del core detecte cada controladora diferente de cada sitio y podamos aplicarles las reglas correspondientes". Dato de campo (Franco): **los grupos Cummins de Claro tienen en su mayoría PowerCommand HMI211 + PCC 1302** → el primer perfil real es el del manual A040D969 (`_biblioteca_campo/cummins_pcc1302_manual_servicio.md`).
**Encadena con:** BACKLOG-ONBOARD-1 (autodescubrimiento), DEC-INTEGRATION-1 (Connect multi-driver), spec_cascada_ficha (límites de ficha, `relativeTo`/`refParams`).

## 0 · CANDADO
- Esta spec cubre **solo la parte de software**, que se puede construir y probar hoy. La detección en el CORE (firmware) queda para cuando haya fierro instalado: probarla contra nuestro simulador no prueba nada (nota anti-demo de BACKLOG-ONBOARD-1).
- Read-only estricto con las controladoras (decisión de seguridad del MVP): se leen setpoints, nunca se escriben.
- Umbrales: solo valores citados del manual o leídos del equipo. Lo que el manual da como **rango ajustable** no se convierte en un número inventado.

- **IMPLEMENTADO (2026-10-20):**
  - Modelo `controller_profile.js` (colección `controllerprofiles`) + `device.profileId` / `device.limitOverrides`.
  - API `routes/controllerprofiles.js`: GET/PUT/DELETE `/controllerprofiles[/:id]` (límites con fuente obligatoria, variables validadas contra la ficha, borrado bloqueado si hay equipos asignados) y PUT `/device/profile`. Cada cambio publica reload al edge.
  - Motor: `siteState.applyDeviceProfile` arma por equipo `_limits` (equipo > perfil) y `_unavailable`; `effectiveCondition` (typeD) toma el límite propio del equipo para toda condición resuelta desde la ficha (D, hojas cross y combinadas); sin perfil = ficha, con su escala 12/24 V. Medición no disponible: la regla no evalúa en ese equipo (D/M) y la hoja cross queda no evaluable.
  - `limitRef.resolveRule` deja `resolvedFrom.dir` para la búsqueda por equipo.
  - Tarjetas de reglas: "no aplica en N equipos (su controladora no mide X)" (`/rulepacks/:id/summary` → `noAplica`).
  - Detalle de alarma v2: código de falla con nombre, tipo, condición del fabricante y causas posibles.
  - Equipos → "Parámetros de instalación": selector **Controladora**, umbrales propios del equipo y requisitos de instalación del perfil.
  - Perfil `cummins-pcc1302` (`tools/seed_perfiles/seed_pcc1302.js` + `app/api/data/controller_profiles/cummins-pcc1302_fault_codes.json`, 90 códigos): aceite parada 180 kPa (código 415, ECM) y aviso 198 kPa (Qp3); asigna el perfil a los Cummins sin perfil; A0/A1 con espera 10 s.
  - Simulador: al arrancar el grupo la presión de aceite entra en 250 kPa (antes 40 kPa hasta el próximo tick: con espera 10 s daba crítica falsa en cada arranque).
  - Pruebas: cascada de umbrales 11/11 (ficha, perfil, equipo pisa perfil, escala 24 V intacta, hoja cross con perfil / sin perfil / no aplicable); seed contra API falsa (simulación, aplicación, re-ejecución idempotente); simulador 13/13 + 22/22.
  - **Límite declarado:** la simulación de reglas del QA (`/simulate`) sigue usando el umbral de la ficha (no conoce el perfil del equipo).

- **Segunda tanda (Franco 2026-10-20):**
  - Pantalla **Fichas → Controladoras** (`components/fichas/ControllerProfiles.vue`): lista de modelos por ficha con umbrales, mediciones que no tiene, códigos de falla y equipos que la usan; alta / edición / borrado solo superadmin (la API también lo exige); importación de códigos de falla desde JSON.
  - Editor de reglas — decisión de Franco **"Permitir y avisar"**: el campo muestra el valor de la ficha (no un texto gris) con la marca "● de la ficha" y, debajo, el valor por controladora y por equipo. Escribir otro número muestra el aviso "Estás reemplazando un valor predefinido" con botón **Volver a la ficha**; al guardar pide confirmación explícita. Escribir el mismo número de la ficha no desata la regla.
  - Perfiles del ATS (ComAp InteliATS NT PWR) y del rectificador (Eltek Smartpack S) — `tools/seed_perfiles/seed_energia.js`: **sin umbrales** (los manuales no traen valores por defecto; no se inventan), con requisitos de instalación y notas del driver.

## 1 · Principio
**La regla no cambia por controladora; cambian los números, las mediciones disponibles y el significado de los códigos.** "Presión de aceite baja" es la misma regla para un PCC 1302 y un PC2100; cada equipo trae su propio umbral.

## 2 · Piezas
### 2.1 Perfil de controladora (colección nueva `controllerprofiles`, datos editables por API)
| Campo | Contenido | Ejemplo PCC 1302 |
|---|---|---|
| `profileId`, `deviceType`, fabricante, modelo, variantes | identidad | `cummins-pcc1302`, `cummins-pcc`, HMI211 |
| `variables` | qué mediciones tiene + conversión de unidad | consumo gal/h → L/h (× 3,785); horómetro con tope 6553,5 h |
| `limits` | umbrales del fabricante por medición (mismo formato que la ficha: warning/trip, op, valor, fuente) | aceite: parada 180 kPa (código 415, motores con ECM) |
| `faultCodes` | diccionario código → nombre, tipo (advertencia/parada), causas posibles | 74 códigos del manual (488 = temperatura de admisión) |
| `readableSetpoints` | setpoints que el driver puede leer del equipo | batería baja/alta, LOP, HCT (cuando haya mapa Modbus) |
| `install` | requisitos de comisionado | "Wake-in-Auto activado o puente TB15-1/TB15-5" (el PCC 1302 se duerme a los 5 min) |

### 2.2 Umbral en cascada — por equipo, no por tipo
Hoy la regla toma el límite de la **ficha del tipo** (`limitRef`) y el motor ya puede ajustarlo **por equipo** (`relativeTo` + `refParams`, batería 12/24 V). Se extiende ese mismo camino a tres niveles, del más específico al más general:
1. **Equipo:** setpoint leído de la controladora del sitio, o cargado por el instalador (`device.refParams`).
2. **Modelo:** límite del perfil asignado al equipo (`device.profileId`).
3. **Tipo:** límite de la ficha (lo de hoy).

Implementación prevista: al recargar, el motor arma por equipo un mapa de límites efectivos (como hoy vuelca `refParams` como pseudo-variables) y la condición con `limitRef` toma el del equipo; si el equipo no tiene ni perfil ni valor propio, queda el de la ficha → **cero cambio de comportamiento** para los equipos actuales.

### 2.3 Regla "no aplicable"
Cada regla ya declara qué mediciones usa. Si el perfil del equipo no tiene una (p. ej. "presión de aceite no disponible en todos los modelos"), la regla queda **no aplicable** para ese equipo: no evalúa, no da "sin datos", y la tarjeta lo muestra.

### 2.4 Códigos de falla con significado
"Cualquier código de falla activo" y las reglas por código toman nombre, tipo y causas del diccionario del perfil → el detalle de alarma (v2) muestra "488 · Temperatura de admisión alta · causas: …" en vez de un número.

### 2.5 Asignación del perfil
**Hoy:** a mano, en el alta o edición del equipo (selector "Controladora"). **Con fierro:** el CORE publica la huella (modelo/firmware leídos) y el Hub propone el perfil; el instalador confirma. Si la huella cambia → alarma "cambió la controladora" y vuelve a confirmación.

## 3 · Preguntas a firmar
| # | Pregunta | Recomendación |
|---|---|---|
| Qp1 | ¿Perfiles como colección propia o como variantes dentro de la ficha? | **Colección propia:** un tipo (`cummins-pcc`) tiene varios modelos; la ficha sigue siendo el genérico. |
| Qp2 | Parada por aceite del PCC 1302: el manual fija **180 kPa** solo para motores **con ECM**; en motores sin ECM es ajustable (62–689 kPa). ¿Cómo cargamos el perfil? | **Perfil con 180 kPa (variante ECM) y, para los sin ECM, el valor lo carga el instalador del menú del HMI211 en el comisionado.** Sin valor → queda el de la ficha. |
| Qp3 | Nuestro aviso de aceite debe anticipar la parada del controlador. | **Aviso = parada del equipo + 10 %** (180 → 198 kPa) en lugar de un número fijo, y espera ≤ 10 s (el controlador para a los 10 s). |
| Qp4 | Regla "no aplicable" visible en la tarjeta | **Sí.** |
| Qp5 | Diccionario de códigos en el detalle de alarma | **Sí**, cargando los 74 códigos del PCC 1302. |
| Qp6 | Asignación manual del perfil mientras no hay fierro | **Sí**, selector en el equipo; el demo asigna PCC 1302 al Cummins. |

## 4 · Fuera de esta spec (ya identificado, va aparte)
Renombrar cat-GE-12 (488 ≠ filtro de aire) · reglas nuevas 1463 "no en automático" y 1131 "modo derivación" · simulador con códigos de falla y enfriamiento · checklist de comisionado (modo inactivo). Mapa Modbus del PCC 1302: sigue faltando.
