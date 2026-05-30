# Mapa de controladores GEF del parque real — corrección de alcance

**Sesión #14 · Camino A5 · Área 3 + Área 1**
Objetivo original: encontrar el mapa de registros Modbus de Cummins PowerCommand PCC.
Resultado: **negativo** (no está en la biblioteca) + **hallazgo de alcance** que pesa más que el objetivo.

---

## Resultado del objetivo: Cummins PCC

El mapa de registros Modbus de Cummins PowerCommand **no existe en la biblioteca**. Verificado:
- `25225695-...cummins.pdf` es manual de **transferencia (ATS)**; solo menciona modelos PCC (1301 / 2100 / 3100 / 3200) en el contexto de cableado al switch, sin tabla de registros.
- Barrido completo de los PDFs: **el único manual con tablas de registros Modbus es el ComAp** (`GE- ComAp ATS.pdf`). Ningún otro.

**Acción:** conseguir de Cummins el documento de la red **PCCNet / Modbus** del controlador PCC (no del ATS). No resoluble con esta biblioteca.

---

## Hallazgo de alcance: el parque GEF tiene más controladores que los listados

Al revisar los manuales de grupo de **sitios reales**, los controladores no son los tres de DEC-INTEGRATION-1:

| Sitio / fuente | Controlador real | ¿En DEC-INTEGRATION-1? | Capacidad de comunicación |
|---|---|---|---|
| (varios) | **Cummins PowerCommand PCC** | ✓ Sí | Modbus vía PCCNet (registros pendientes) |
| (ATS) | **ComAp InteliATS NT** | ✓ Sí | Modbus RTU ✓ registros mapeados |
| Grupo **Wilson** | **FG Wilson PowerWizard 2.1** | ✗ **No listado** | SCADA/Modbus (PW 2.1 tiene contraseña SCADA; PW 1.1 sin comms) |
| Grupo **Wilson** | **DeepSea (DSE)** | ✓ Sí | Modbus (DSE Gencomm), registros pendientes |
| Grupo **Monte Ralo** | **SDMO NEXYS / TELYS** | ✗ **No listado** | Modbus (NEXYS/TELYS soportan), registros pendientes |

### Lo que esto significa
DEC-INTEGRATION-1 nombró 3 controladores GEF (Cummins PCC, ComAp, DSE). El parque real tiene **al menos 5 familias**: se suman **PowerWizard** (Wilson/Caterpillar) y **NEXYS/TELYS** (SDMO/Kohler). Cada familia es un **driver distinto**.

Esto **no invalida** DEC-INTEGRATION-1 — la confirma como framework multi-driver — pero **amplía su alcance** con evidencia de campo. Es exactamente el tipo de input que la regla "realidad primero" (DEC-STRAT-3) pide registrar.

---

## Implicación para survey y MVP

1. **El survey Tier 1 debe inventariar el modelo de controlador de cada genset**, no asumir Cummins. La elección de qué driver construir primero depende de qué controlador esté en los 5 sites Tier 1.
2. **El MVP de GEF no puede comprometerse a "Cummins" a ciegas**: si los 5 sites Tier 1 resultan ser, p.ej., 3 PowerWizard + 2 ComAp, el primer driver a construir cambia. El ComAp ya está listo a nivel protocolo; sería el candidato natural de arranque salvo que el survey diga otra cosa.
3. **Cobertura a nivel registro vs. protocolo:** la biblioteca da cobertura de *protocolo* amplia, pero cobertura de *registros* solo para ComAp. Para todos los demás (Cummins PCC, DSE Gencomm, PowerWizard SCADA, NEXYS/TELYS) hay que conseguir las tablas del fabricante.

---

## Entradas al backlog (de A5)

| ID propuesto | Contenido |
|---|---|
| BACKLOG-REF-5 | Ampliar alcance GEF de DEC-INTEGRATION-1: sumar **PowerWizard 2.1** y **SDMO NEXYS/TELYS** como drivers candidatos (evidencia: grupos Wilson y Monte Ralo) |
| BACKLOG-REF-6 | Survey Tier 1 debe registrar **modelo de controlador GEF por sitio** antes de fijar el primer driver a construir |
| DOC-GAP-1 | Conseguir tablas de registro: Cummins **PCCNet/Modbus**, DSE **Gencomm**, PowerWizard **SCADA Modbus**, NEXYS/TELYS Modbus |

---

## Estado consolidado de los drivers Connect tras camino A completo

| Familia | Modalidad | Targets | Protocolo | Registros/OIDs |
|---|---|---|---|---|
| Rectificación | Modbus TCP | Eltek SmartPack S/II, Vertiv SC200 | ✓ | parcial (SC200 config ✓) |
| Rectificación | SNMP | Vertiv NCU, ZTE ZXDU CSU, Delta PSC3 | ✓ | baseline MIB-II ✓, privados pendientes |
| GEF/ATS | Modbus RTU | **ComAp InteliATS NT** | ✓ | **setpoints ✓** (único completo) |
| GEF | Modbus | Cummins PCC, DSE, PowerWizard 2.1, NEXYS/TELYS | ✓ (capacidad) | **todos pendientes** |
| AA/clima | Modbus / contacto seco / Sense | MCX, TLZ11, TIC-17RGT | ✓ | — |
| Batería | Connect/Sense + soft sensor | BMS litio ZX/ZTE | esquema ✓ (CSV) | spread celdas (inferred) |

**Conclusión:** el único driver **completo a nivel registro** es ComAp InteliATS NT. Es el candidato técnico natural para el primer driver del MVP — sujeto a que el survey confirme su presencia en los sites Tier 1. Todo lo demás está caracterizado a nivel protocolo/modalidad pero necesita tablas del fabricante + equipo de lab.
