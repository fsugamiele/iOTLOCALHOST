# Biblioteca de fallas Wanomi · índice · 2026-10-27

**Para qué:** juntar, por modelo de equipo, lo que dicen los **documentos oficiales** sobre **tipos de falla, umbrales y localización de averías**, y vincularlo con lo que Wanomi mide y vigila. Es la fuente de los textos de las alarmas («Qué significa», «Qué hacer», «Pasos a seguir»), de los límites de la ficha y de los perfiles de controladora (`spec_textos_alarma_ficha.md`).

**Regla de oro:** todo dato lleva su fuente (documento, edición y página). Lo que no está en un documento oficial se marca **PROVISORIO** o **inferido** y no fija una severidad ni un umbral sin firma.

## Estructura de cada documento de equipo
1. **Fuentes** — documento, edición, páginas usadas; qué falta.
2. **Umbrales** — valor de fábrica, rango ajustable, retardo, página; valor que usa Wanomi y porqué.
3. **Fallas por sistema** — código, nombre, tipo (aviso / parada / evento), medición Wanomi que la ve, regla Wanomi que la vigila.
4. **Localización de averías** — qué detecta, causas probables en el orden del fabricante, verificación y reparación (resumen del manual), qué se puede verificar a distancia desde Wanomi.
5. **Datos estructurados** — `<equipo>.json` con el mismo contenido, para cargar ficha y perfil sin retipear.

## Estado por equipo
| Equipo (ficha / perfil) | Documento | Estado |
|---|---|---|
| **Cummins PowerCommand 1.1/1.2 · PCC 1302** (`cummins-pcc`, perfil `cummins-pcc1302`) | Manual de servicio A040D969 Ed. 1 (268 pp.) · hoja de datos HMI211 | ✅ **Hecho** — `cummins_pcc1302.md` / `.json`: 90 códigos, 72 con localización de averías completa (§9.8), 12 vigilados por una regla Wanomi |
| **Eltek Smartpack S** (`ELTEK`) | User Guide **350030.013** (36 pp.; los archivos «controladora eltek flatpack» y «SMART PACK 2» son el mismo) · *Parametrización ELTEK para VRLA* (Narada 12NDF155) · informe retrofit MBBU | ✅ **Hecho (parcial)** — `eltek_smartpack_s.md`: modelo de alarmas, umbrales contra el banco Narada 12NDF155 (flote 54,0 · LVD 43,2 · sobretensión 57 V coinciden con la ficha), alarmas y verificación. Localización de averías PROVISORIO. **Falta:** 350020.073 (valores por defecto) |
| **ComAp InteliATS NT PWR / STD** (`ATS`) | **Guía de Referencia IA-NT PWR SW 2.2** (nov-2010, español, 91 pp.) · guía del operador | ✅ **Hecho** — `comap_inteliats_nt_pwr.md`: valores de fábrica de todas las protecciones con registro Modbus, 18 alarmas con tipo, tiempos de transferencia; localización de averías PROVISORIO. Propuestas P1–P3 a firmar. Ojo: la ficha dice «InteliATS²», confirmar modelo |
| **ComAp InteliGen / InteliSys NT** | *Communication Guide* IGS-NT 04-2015 (comunicación, no alarmas) · hoja de datos InteliLite NT MRS16 | ○ referencia de driver. **Falta:** *Reference Guide* IL-NT / IG-NT (alarmas) si aparecen en el parque |
| **Vertiv NetSure NCU M830B/D** | Manual del usuario 11 YG 5020 NR Rev. D (208 pp.) | ⏳ a procesar — niveles de alarma configurables |
| **Eaton SC200** | Manual de la operación IPN 997-00012-61A (95 pp.) | ⏳ a procesar |
| **ZTE ZXDU CSU518B / 513B · CSU501B** | Guía de configuración de baterías y comunicación · hoja de parámetros CSU501B | ⏳ a procesar (parámetros de batería). **Falta:** lista de alarmas de la CSU |
| **Bancos de baterías de litio (ZTE / Huawei)** | Manual de instaladores BB litio V1 (71 pp.) | ⏳ a procesar — tabla de alarmas y protecciones del BMS |
| **Grupo SDMO / Kohler R44 · controlador TELYS / NEXYS** (sitio Monte Ralo; motores John Deere / Perkins) | Manual de uso y mantenimiento 33501732001NE_2_1 (268 pp.) | ⏳ a procesar — alarmas y fallos por pictograma |
| **Grupo FG Wilson serie P · PowerWizard** | Manual de operación y mantenimiento 356-5902 v15 (81 pp.) | ⏳ a procesar — lista de alarmas PowerWizard |
| Cummins grupo marino MDDC (0981-0172) | Manual del operador | ○ referencia (no es el parque telco) |
| Westric SW-302 (secuenciador de aire acondicionado) | 76-1023-05 | ○ fase 2 (Sense AA) |
| Fuera de alcance | Doble LVD (configuración de red de una PC), Nokia FPFH, Wavence, telurímetro | — |

**Excluido sin abrir (seguridad):** `Usuario_y_Contraseña_ZTE.pdf`.

## Manuales que faltan (a conseguir de fuentes oficiales)
| Equipo | Documento | Para qué |
|---|---|---|
| Eltek Smartpack S | 350020.073 *Functionality Description* | valores por defecto de alarmas y LVD (hoy PROVISORIOS) |
| Cummins PCC 1302 | mapa de registros Modbus | driver (sigue faltando) |
| Delta (power plant) · DSE (grupos) | manuales de controlador | están en el informe de marcas de Claro; no hay documentos |
| John Deere / Perkins | códigos de falla del motor (SPN/FMI) | si el driver lee el ECM de esos motores |
