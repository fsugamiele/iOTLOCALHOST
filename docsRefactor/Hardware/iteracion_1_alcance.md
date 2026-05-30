# Hardware — Alcance Iteración 1

**Área:** 3 · Hardware
**Definido en:** sesión #14 · 2026-05-30

---

## Entregable comprometido

1 Hub funcional (Modbus RTU/TCP contra driver Software) + enclosure provisorio 3D + draft spec enclosure.

## Responsables

Ing. industrial + Diseñador industrial.

## Fecha objetivo

T0+3 semanas.

## Dependencias

- **Entrada de Software:** especificación de la interfaz del driver (puertos, protocolo, pinout RS485). No bloquea el inicio — se trabaja con spec preliminar.
- **Track paralelo:** WN-SITE-CORE Rev B sigue su propio ciclo de fab (no está en la ruta crítica del MVP per DEC-REF-6).

## Desglose de entregables

1. **Hub funcional:**
   - Orange Pi Zero 3 + módulo RS485 (Modbus RTU) + switch para TCP.
   - Docker + Mongo local corriendo.
   - Conectividad validada contra driver Software (simulador o equipo real).

2. **Enclosure provisorio:**
   - Impresión 3D o caja plástica estándar modificada.
   - Montaje en riel DIN (provisorio, no requiere certificación para iter 1).
   - Ventilación pasiva suficiente para ambiente shelter (T ≤ 50°C).

3. **Draft spec enclosure:**
   - Dimensiones, materiales, puntos de montaje, gestión de cables (entradas, pasacables).
   - Input para diseñador industrial (iter 2 = enclosure definitivo).

## Nota

WN-SITE-CORE Rev B (Gerbers → fab → prototipo) sigue en track paralelo independiente. No bloquea ni es bloqueado por el MVP.

---

## Roadmap del área (post-iter 1)

- **Add-ons modulares:**
  - SURGE: AS3935 (detector de rayos) + acelerómetro (vibración estructural).
  - ENV+: SDP810 (diferencial de presión, ya integrado en CORE) + sensores adicionales separables.
- **Sub-nodos opcionales:**
  - WN-FENCE: ADXL345 (vibración cerco perimetral), ESP-NOW al WN-SITE-SEC.
  - WN-COPPER: QMC5883L magnetómetro (detección de robo de cables de tierra/cobre).
  - WN-DOOR: reed switch (apertura de puertas del shelter).
  - WN-BLE-TRACK: escaneo iBeacons BLE 5.0 pasivos (tracking de baterías VRLA).
- **Variantes de instalación por tipo de sitio:** urbano (rack DIN interior) / rural (caja IP65 exterior) / SURGE (con add-on de rayos).
- Especificación definitiva del enclosure (iter 2, post-piloto).
