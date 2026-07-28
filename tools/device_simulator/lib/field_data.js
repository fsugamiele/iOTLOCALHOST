'use strict';

// ════════════════════════════════════════════════════════════════════
// field_data.js — overrides del estado inicial con EVIDENCIA DE RELEVAMIENTO
//
// Contiene valores REALES tomados en relevamientos de campo, NO estimaciones.
// La procedencia (sesión, sitio, fecha) queda registrada por comentario junto
// a cada dato, y en el corpus (DEC-REF-79 vi para el Cummins de CR00061).
//
// Uso: sensor-engine.js `initialCumminsState(siteCode)` (y análogos) hacen
// lookup por (siteCode, role) y mergean sobre el estado inicial genérico.
//
// Formato: FIELD_DATA[siteCode][role] = { variable: valor, ... }
//
// Como el simulador no persiste estado entre corridas, estos valores se
// SIEMBRAN de forma DETERMINÍSTICA en cada reinicio — conveniente para la
// demo (Franco, #53/Fase 3).
// ════════════════════════════════════════════════════════════════════

const FIELD_DATA = {
  // CR00061 · Cummins PowerCommand · relevamiento sesión #15
  // Motor frío 64 °F, aceite 0 PSI (standby), 2969,1 h acumuladas
  // (~2-3 h/día promedio sobre 3-4 años). 11,88 ciclos de servicio de
  // 250 h — próximo servicio a 31 h de motor. DEC-REF-79 (vi).
  CR00061: {
    CUMMINS: {
      run_hours: 2969.1,
    },
  },
};

module.exports = { FIELD_DATA };
