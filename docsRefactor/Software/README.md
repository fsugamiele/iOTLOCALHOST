# Software · Wanomi 3.0

Documentación del refactor del lado software (backend, frontend, firmware).

## Qué vive acá

- Backend: refactor del modelo de datos para Connect+Sense (Site, ForensicEvent, HMAC chain ya existen).
- Frontend: pages/sites/, dashboards (operador + admin), display local del Hub.
- Capa de agregación NOC: broker central + parsers por driver Connect.
- Drivers Connect: ComAp, Cummins PCC, Eltek SmartPack S.
- Firmware ESP32-S3 del WN-SITE-CORE.
- Firmware Hub Wanomi (Orange Pi + BG95-M3): Mongo local, soft sensors, sync al NOC.
- Plan de migración Vue 2 → Vue 3 (post-piloto, deuda DEC-STACK-1).

## Referencias

- Documento maestro: `../WanomiRefactor.md`
- DEC-ARCH-1 (edge distribuida) y DEC-ARCH-2 (NOC sin telemetría cruda) son intocables.
- Stack actual: `../../docs/CLAUDE.md`.
