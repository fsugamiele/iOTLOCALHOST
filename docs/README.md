# Documentación del proyecto Wanomi

Esta carpeta contiene la documentación de referencia del piloto Claro
(Fase 4 — Soporte Telco). Claude Code debe consultarla cuando necesite
contexto sobre decisiones de arquitectura, pinout de PCBs, o topología
de instalación en site.

## Archivos

| Archivo | Contenido |
|---|---|
| `wanomi.md` | Bitácora maestra: 20 decisiones de arquitectura, log de sesiones, estado actual de cada dispositivo |
| `informe_instalacion.md` | Topología completa de instalación en site (informe de 5 especialistas) |
| `arquitectura_site.png` | Diagrama visual de instalación (consulta humana) |
| `wanomi_informe_instalacion_site.docx` | Original con formato del informe (respaldo visual) |
| `pcb/SEC.md` | Specs de fabricación PCB para WN-SITE-SEC con netlist completo |
| `pcb/GEN.md` | Specs de fabricación PCB para WN-SITE-GEN con tabla MODBUS DSE7320 |
| `pcb/H1.md` | Specs de fabricación PCB para WN-H1-TELCO con UPS + LTE-M |
| `pcb/FENCE.md` | Specs de fabricación PCB para WN-FENCE sub-nodo solar |
| `pcb/*.docx` | Originales con formato (respaldo visual para compartir con EJ Devices) |

## Cómo usar

- Antes de cualquier cambio en el firmware, consultar el archivo `pcb/*.md`
  correspondiente para confirmar pinout exacto (GPIO, conectores, terminal blocks).
- Antes de cualquier cambio que afecte la arquitectura del sistema, leer
  `wanomi.md` y `informe_instalacion.md` para no contradecir decisiones tomadas.
- Si una decisión nueva contradice algo previo, actualizar `wanomi.md` y dejar
  registro de la decisión.
