# Biblioteca de fallas · Vertiv NetSure NCU (controladora de planta DC −48 V, M830B/D)

## 1 · Fuentes
| Documento | Qué aporta | Páginas |
|---|---|---|
| *NetSure™ Unidad de Control (NCU) — Manual del usuario* **11 YG 5020 NR Rev. D** (2017, español, 208 pp.) — `CONTROLADORA VERTIV.pdf` | niveles de alarma, gestión de batería y LVD, **Tabla 5 «Alarmas de resolución»** (alarma · descripción · acción correctiva), **Tabla 6 parámetros predeterminados de batería** | 8, 13–16, 61–100, 117–125 |

**Falta:** el *Esquema de configuración de la NCU (esquema C)* que viene con cada sistema: según el manual (pp. 7, 61) ahí están los **valores de fábrica** de nivel de gravedad, relé de alarma, LVD y umbrales de red. Pedirlo a Claro / Vertiv por sitio, o leerlo de la interfaz web de la NCU.
**Wanomi:** no hay ficha `VERTIV` todavía (las fichas DC existentes son `ELTEK`).

## 2 · Cómo alarma (p. 8)
| Nivel | LED | Sonido | Informe |
|---|---|---|---|
| **Crítica** | rojo | sí | sí |
| **Urgente** (grave) | rojo | sí | sí |
| **Observación** | amarillo | no | no |
| Sin alarma | — | — | — |

El nivel y el relé de cada alarma son configurables; además hay alarmas resumen (`Resumen CR`, `Resumen MJ`, `Resumen MN`). Acceso remoto por **SNMP v2/v3**, web (HTTP/HTTPS) y Modbus (p. 7).

## 3 · Umbrales
**Batería — Tabla 6, p. 100 (los 10 tipos de batería predeterminados traen los mismos valores):**

| Parámetro | De fábrica | Comparación |
|---|---|---|
| Flote | **53,5 V** | Eltek/Narada recomienda 54,0 V |
| Ecualización | **56,4 V** | igual que Narada |
| Alta tensión (aviso) | **55,7 V** | — |
| Sobretensión | **58,5 V** | Wanomi (Eltek) usa 57 V |
| Baja tensión | **45 V** | — |
| Subtensión | **42 V** | debajo del LVD de Narada (43,2 V) |
| Punto de sobrecorriente / límite de corriente | 0,3 C / 0,1 C | — |
| Eficiencia de carga | 96 % | — |
| Tiempo de descarga (h) a 0,1 C … 0,8 C | 10 · 4,9 · 3 · 2 · 1,4 · 1,2 · 1,1 · 0,9 (tipos 1–5) | sirve para estimar autonomía |

**Configurables sin valor de fábrica en el manual** (están en el esquema C, pp. 121–122):
- **LVD1 / LVD2** (desconexión de cargas normales / prioritarias): por **tensión** o por **tiempo**, con tensión de reconexión. LVD1 desconecta cargas normales; LVD2, prioritarias (p. 21).
- **HTD** (desconexión por alta temperatura de batería) y **BTRM** (baja la tensión para cortar la carga si la batería se calienta, p. 14).
- **Falla de red**: Alarma 1 y Alarma 2 como **% sobre / bajo la tensión nominal**.
- Subtensión 1 / 2 y sobretensión 1 / 2 del bus; temperaturas alta / muy alta / baja.
- **Modo ECO:** no entra (o sale) si hay falla de red, LVD abierto, fallo de rectificador, subtensión, batería en carga/descarga, etc.; límite de carga ECO **45 %** de fábrica (p. 15).

## 4 · Alarmas y localización de averías (Tabla 5, pp. 61–99)
Esta tabla **sí trae acción correctiva del fabricante**. Selección de las que importan a Wanomi (la tabla completa tiene ~400 filas: sensores, convertidores, solar, módulos SM opcionales).

| Alarma (LCD) | Qué significa | Acción del fabricante | Wanomi |
|---|---|---|---|
| **Fallo de red** (`Fallo Red`) · **Fallo grave de red** (`FalloGraveRed`) | Sin CA comercial / tensión demasiado baja | Comprobar por qué no hay CA comercial; causa de la baja tensión | cascada de energía (M1, C1) |
| Alta / baja tensión de fase o línea (1 y 2) | Fase o línea fuera del umbral | Comprobar la causa de la alta / baja tensión | `mains_voltage` |
| **Fallo de entrada de CA** (`Fallo CA`) | No llega CA a un rectificador | Comprobar por qué no hay alimentación de entrada | — |
| **Subtensión 1 / 2** | Bus DC bajo el umbral | Si hay falla de red, apagar cargas no críticas para estirar la autonomía; si la carga supera la capacidad de los rectificadores, instalar más; si la batería se está recargando, se borra sola | `dc_bus_voltage` (DC-03, DC-09) |
| **Sobretensión 1 / 2** | Bus DC sobre el umbral | Comprobar la causa y el valor configurado de la alarma | DC-05 |
| **LVD1 / LVD2 desconectado** | Contactor LVD abierto | — (estado) | caída de carga |
| **Fallo de LVD1 / LVD2** | El contactor LVD falló | Comprobar el contactor; reemplazarlo | — |
| **Rectificador defectuoso** (`Rect defect`) · **Sobretensión (HVSD)** · **Rectificador protegido** | Rectificador en falla, en sobretensión o protegido | Ver el manual del rectificador | DC-06 (reparto) |
| **Fallo de diversos rectificadores** (`Fallo Div Rect`) | Falló más de uno | Comprobar tensión de entrada; reemplazar rectificadores | — |
| **Fallo de ventilador** | Ventilador del rectificador | Reemplazar el ventilador | — |
| **Límite de corriente** (`Lím Corriente`) | Rectificador limitando corriente | Si se recargan baterías, se borra solo; si la carga supera la capacidad, las baterías se descargan: agregar rectificadores o reemplazar los defectuosos | B1/B2 (carga) |
| **Alta temperatura de rectificador** | — | Comprobar la causa de la alta temperatura | — |
| **Fallo Com Rect** / **FalloComTodRect** | Rectificador(es) sin comunicación con la NCU | Revisar cables y bus CAN; restablecer; reemplazar controlador | — |
| **Rect No Det** / **Gr Rect no Det** | La NCU no detecta rectificador(es) | Revisar cables de comunicación | — |
| **Temp Comp Alta / MAlta / Baja** · **Temp BTRM** | Temperatura de batería fuera de umbral | Comprobar la causa de la alta o baja temperatura | `temperature` |
| **Alta / baja temperatura ambiente** | — | Comprobar la causa | — |
| Sensor de temperatura defectuoso | Sonda en falla | Reemplazar el sensor | staleness |
| **Alarma de fusible N** (batería o salida CC) | Fusible abierto | Buscar y eliminar la causa (sobrecarga o cortocircuito) antes de reponerlo; si alguien lo sacó a mano, consultarle antes de reinsertarlo | — |
| **Sobrecarga** / **Alto nivel de carga** | Carga sobre la capacidad / umbral | Comprobar la carga | B1/B2 |
| **SPD** / **Disparo de SPD** | Protección contra sobretensiones requiere atención / disparada | Revisar el descargador | — |
| **Parada / apagado de emergencia** | Sistema en parada de emergencia | Verificar por qué se puso en ese modo | — |
| **Baja capacidad** (batería) | Capacidad estimada baja | Comprobar las baterías | — |
| **Fallo de DG** · **Sobretemp DG** · **Baja presión de aceite** · **Alta temp. agua** · **Bajo nivel de combustible** | Alarmas del grupo vistas por la NCU (si gestiona el grupo) | Comprobar el generador | reglas del grupo |
| **Alarma de mantenimiento** | Venció el temporizador | Hacer el mantenimiento y reiniciar el temporizador | — |
| **Fallo interno** (`Fallo AutoDetect`) | Falla la autoprueba de la NCU | Reemplazar la controladora | — |

## 5 · Propuestas (a firmar)
- **V1** · Crear la ficha `VERTIV` (bus DC) con los valores de la Tabla 6 como referencia de fábrica (flote 53,5 · alta 55,7 · sobretensión 58,5 · baja 45 · subtensión 42 V) y los LVD **PROVISORIO** hasta tener el esquema C del sitio.
- **V2** · Leer por SNMP los umbrales configurados de cada NCU (dependen del sitio).
- **V3** · Usar la acción correctiva del fabricante (§4) como texto de «Pasos a seguir» de las reglas DC cuando el equipo sea Vertiv.
