# Matriz consolidada de drivers Connect — Parque Claro

**Sesión #14 · Camino A (profundización) · Área 2 + Área 1**
Todos los protocolos de esta matriz están **confirmados en manual oficial**, no inferidos. Fuente: biblioteca de campo Cinetik.

---

## Hallazgo principal: el parque se parte en dos familias de protocolo

| Familia | Equipos | Implicación para el framework Connect |
|---|---|---|
| **Modbus** (TCP o RTU) | Eltek SmartPack S/II, Vertiv SC200, ComAp InteliATS NT, MCX/Westric | Motor Modbus (cliente TCP + maestro RTU) |
| **SNMP-primario** | Vertiv NCU, ZTE ZXDU CSU, Delta PSC3 | Motor SNMP (GET/TRAP) |

> **Esto es input duro para DEC-INTEGRATION-1 y para el rol de Integración OSS/BSS.** El framework multi-driver no alcanza con Modbus: para cubrir el parque real de Claro necesita **un motor Modbus Y un motor SNMP**. Candidato a DEC-REF nueva en Bloque 5.

---

## Matriz de drivers — rectificación / power plant

| Equipo | Manual | Transporte | Puerto/Bus | Estado driver |
|---|---|---|---|---|
| **Eltek Smartpack S** ★ | controladora eltek flatpack.pdf | Modbus TCP + SNMP v3 | Eth 10/100; IP def. 192.168.10.20; :502 | Protocolo ✓ · registros pendientes (doc 350020.073) |
| **Eltek Smartpack II** | SMART PACK 2.pdf | Modbus TCP + SNMP v3 | idem familia | Protocolo ✓ |
| **Vertiv SC200** ★ | sc200.pdf | **Modbus-TCP** + SNMP + RS232 | **TCP :502** (1 conexión a la vez); Modbus Address=1 | Protocolo ✓ · config de habilitación documentada |
| **Vertiv NCU** | CONTROLADORA VERTIV.pdf | **SNMP v2/v3** + HTTP/TCP | Ethernet | SNMP ✓ · sin Modbus declarado |
| **ZTE ZXDU CSU501B** | sj-...operation-guide / csu501b-config | **SNMP** + Telnet/HTTP/FTP, TCP/IP | RJ45; serie 9600 bps; TCP Server/Client | SNMP ✓ |
| **Delta PSC3** | CONTROLADORA DELTA.pdf | **SNMP** (licencia) + TCP/IP | Ethernet | SNMP ✓ (requiere activar licencia) |

## Matriz de drivers — GEF / ATS / clima

| Equipo | Manual | Transporte | Detalle | Estado driver |
|---|---|---|---|---|
| **ComAp InteliATS NT PWR** ★ | GE- ComAp ATS.pdf | **Modbus RTU** register-oriented | RS232/RS485 (IL-NT-RS232-485); 9600–57600; addr 1–32 | Protocolo ✓ · setpoints mapeados · mediciones vivas vía export LiteEdit |
| **Cummins PowerCommand ATS** | 25225695-...cummins.pdf | — (manual de transferencia, 119 pp.) | Utility↔Genset; sensado 12/24 VDC L-L o L-N | **Sin mapa de registros.** Falta tabla Modbus PCC del genset |
| **MCX (línea Westric)** | controladora mcx.pdf | **RS-485 Modbus esclavo** + CAN | 24 VCA; 7 AI / 6 DO / 3 AO / 8 DI; web server TCP/IP | Modbus ✓ · controlador de clima (válvula expansión, temp, humedad) |
| **Westric SW-302 secuenciador** | Westric SW302 / 76-1023-05 | Display + teclado (config local) | Conecta a línea Westric (CAN) → expone vía MCX | Sin Modbus propio; Connect indirecto vía MCX, o Sense |

---

## Detalles de configuración confirmados (para el parser)

### Vertiv SC200 — Modbus-TCP
- Puerto reservado **502**; acepta **una sola** conexión Modbus-TCP simultánea.
- Habilitación: `Configuración > Modbus` → Access = Activado, Address = 1.
- Coexiste con SNMP, web server y trampas SNMP/email para alarmas.

### MCX (Westric) — RS-485 Modbus esclavo
- Borne "I: Comunicación RS-485 Modbus esclavo" + CAN a maestros/esclavos Westric.
- Es controlador de **clima** (válvula de expansión, temperatura, humedad) → relevante a la pata AA.

> **Refinamiento a DEC-INTEGRATION-1 (AA):** la decisión dice "AA = Westric Modbus o termostato manual → Sense puro". El MCX **sí es Modbus esclavo**, así que en sitios con MCX la pata AA puede ser **Connect (Modbus), no Sense**. No contradice la decisión — la precisa: Sense puro queda solo para AA sin controlador con bus.

---

## Estado de cobertura del parque

| Driver | Protocolo | Registros/OIDs | Listo para MVP |
|---|---|---|---|
| Eltek SmartPack S | ✓ Modbus TCP | parcial | sí (con equipo lab) |
| Vertiv SC200 | ✓ Modbus TCP | config ✓ | sí (con equipo lab) |
| ComAp InteliATS NT | ✓ Modbus RTU | setpoints ✓ | sí (con equipo lab) |
| MCX/Westric | ✓ Modbus RTU esclavo | pendiente | sí |
| Vertiv NCU / ZTE / Delta | ✓ SNMP | OIDs pendientes | requiere motor SNMP |
| Cummins PCC | pendiente | sin mapa | falta doc registros PCC |

## Pendientes reales (no resolubles con esta biblioteca)
1. **Tabla de registros Modbus de Cummins PowerCommand** (genset, no transferencia).
2. **OIDs SNMP** de Vertiv NCU / ZTE ZXDU / Delta PSC3 (MIBs del fabricante).
3. **Equipo físico en lab** para validar lecturas vivas de cualquiera de los anteriores.

## Conclusión para Bloque 3
El framework Connect tiene hoy **4 targets Modbus caracterizados a nivel protocolo** (Eltek S, SC200, ComAp, MCX) y una familia SNMP identificada. El MVP de Connect (pata energía, DEC-SCOPE-1) es construible contra Eltek SmartPack S + ComAp InteliATS NT como par mínimo. La novedad arquitectónica es que **el motor SNMP deja de ser opcional** si el piloto Tier 1 incluye sitios con Vertiv NCU, ZTE o Delta.
