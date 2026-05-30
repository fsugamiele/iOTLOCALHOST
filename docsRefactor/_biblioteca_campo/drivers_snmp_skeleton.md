# Esqueleto de drivers SNMP — familia rectificación

**Sesión #14 · Camino A3 · Área 2 + Integración OSS/BSS**
Cierra la familia SNMP del parque, en paralelo a la familia Modbus.
Datos de acceso confirmados en manual oficial. OIDs específicos de fabricante = pendientes (viven en las MIB, ver acción final).

---

## Modelo de acceso por equipo (confirmado)

### Vertiv NCU (NetSure Control Unit) — manual `CONTROLADORA VERTIV.pdf`
- Doc: 11 YG 5020 NR Rev D · SW 1.30
- **SNMP v1 / v2c / v3**, IPv4 e IPv6.
- **v1/v2c:** comunidad pública + comunidad privada; lista blanca de IP de NMS (solo IPs listadas acceden al agente); traps habilitables.
- **v3:** usuario, contraseña priv. **DES**, contraseña auth. **MD5**, IP de trap, nivel de seguridad (`SinAutSinPriv` / `ConAutSinPriv` / `ConAutConPriv` = noAuthNoPriv / authNoPriv / authPriv).
- MIB: soporta **MIB-II** estándar + **MIB propia Vertiv** (sección "Instalación de la MIB", p.197 del manual — el archivo .mib lo provee Vertiv).

### ZTE ZXDU CSU501B — manual `sj-...operation-guide` (V2.01.00.00)
- **SNMP v1 / v2c / v3** + Telnet / HTTP / FTP sobre TCP/IP (RJ45).
- **Agent port `161`** (estándar) · **Trap port `163`** ⚠ (no estándar — el habitual es 162; hay que configurar el receptor en consecuencia).
- Trap IP 1/2/3 (si queda en `000.000.000.000` no envía traps).
- Defaults de fábrica documentados: Read Comm. `public`, Set Comm. `private`, v3 user `zteuser`, nivel `Auth,NoPriv`.

### Delta PSC3 — manual `CONTROLADORA DELTA.pdf`
- **SNMP** activable por **licencia** (`Configuration > System > Remote Monitoring > SNMP`).
- Config: Access (community) + Traps (trap destination). TCP/IP en Interface Setup.
- Requiere verificar versión de SNMP y MIB Delta (no detallado en el manual presente).

---

## ⚠ Flag de seguridad — defaults de fábrica

Los manuales documentan credenciales **por defecto** que en campo suelen seguir vivas:
- Comunidades `public` / `private` (Vertiv, ZTE).
- v3 ZTE: usuario `zteuser`, auth/priv pass `12345678`.

Estos son **defaults de fábrica publicados en el manual** (no secretos del cliente), pero son un riesgo real si nunca se cambiaron. **Para Wanomi:** el driver no debe asumir defaults; el comisionado debe (a) rotar comunidades/credenciales, (b) restringir por lista blanca de IP del Hub, (c) preferir v3 `authPriv` donde el equipo lo soporte. Va al backlog de seguridad.

---

## Baseline MIB-II — OIDs universales (disponibles sin MIB de fabricante)

Los tres equipos soportan **MIB-II (RFC 1213)**. Esto permite al Hub hacer descubrimiento, identidad y chequeo de alcanzabilidad de **cualquier** rectificador SNMP **antes** de tener la MIB específica del fabricante:

| Variable | OID | Uso en Wanomi |
|---|---|---|
| sysDescr | `1.3.6.1.2.1.1.1.0` | Identificación de equipo/firmware |
| sysObjectID | `1.3.6.1.2.1.1.2.0` | Identifica fabricante/modelo (raíz de su MIB privada) |
| sysUpTime | `1.3.6.1.2.1.1.3.0` | Detección de reinicio del controlador |
| sysName | `1.3.6.1.2.1.1.5.0` | Nombre del sitio/equipo |
| sysLocation | `1.3.6.1.2.1.1.6.0` | Ubicación |
| ifOperStatus | `1.3.6.1.2.1.2.2.1.8` | Estado de interfaz de red del controlador |

> Estos 6 OIDs dan, hoy mismo, un **health-check Connect-SNMP genérico** (¿el rectificador responde?, ¿se reinició?, ¿quién es?) sin depender de ninguna MIB privada. Es el mínimo común denominador de la familia SNMP.

---

## Lo que falta (no resoluble con esta biblioteca)

Las variables de valor — **tensión DC, corriente DC, estado de rectificadores, alarmas de planta** — viven en la **rama privada** de cada fabricante (`1.3.6.1.4.1.<enterprise>`). Para mapearlas hay que obtener los archivos MIB:

| Fabricante | MIB a conseguir | Dónde |
|---|---|---|
| Vertiv | NetSure / NCU MIB | Sección p.197 del manual / soporte Vertiv |
| ZTE | ZXDU CSU MIB | Soporte ZTE |
| Delta | Delta PSC3 MIB | Tras activar licencia SNMP / soporte Delta |

Una vez con la MIB se compila el OID de cada variable y se completa la tabla, igual que hicimos con los registros Modbus.

---

## Cierre: estado de las dos familias de driver Connect

| Familia | Motor requerido | Targets caracterizados | Listo a nivel protocolo |
|---|---|---|---|
| **Modbus** | Cliente TCP + maestro RTU | Eltek SmartPack S, Vertiv SC200, ComAp InteliATS NT, MCX/Westric | ✓ (registros parciales) |
| **SNMP** | GET/GETNEXT + receptor de TRAP | Vertiv NCU, ZTE ZXDU CSU, Delta PSC3 | ✓ acceso + baseline MIB-II (OIDs privados pendientes de MIB) |

**Conclusión para Bloque 3:** el framework Connect queda definido como **dual-engine (Modbus + SNMP)** con baseline funcional en ambas familias hoy. El MVP puede arrancar sobre los targets Modbus (que ya tienen registros) + un health-check SNMP genérico vía MIB-II, dejando el mapeo de OIDs privados para cuando lleguen las MIB y el equipo de lab.
