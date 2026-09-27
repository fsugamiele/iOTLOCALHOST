// Dimensionado de widgets para las grillas vue-grid-layout (Sitios y Panel).
// Extraído de pages/sites/_siteCode.vue (DEC-REF-107 Paso 4) para reusarlo
// al pinear widgets al Panel sin duplicar lógica.

// col-N → ancho de grilla (3..12); default 4.
export function colToW(column) {
  const m = /col-(\d+)/.exec(column || '');
  const n = m ? parseInt(m[1], 10) : 4;
  return Math.max(2, Math.min(12, n));
}

// Alto default por tipo/representación (unidades de fila de 30px).
export function hFor(widget) {
  const t = widget.widget;
  if (t === 'numeric') {
    const r = widget.render;
    if (r === 'gauge' || r === 'tank') return 8;
    if (r === 'sparkline') return 6;
    if (r === 'counter') return 5;
    return 4; // valueStatus / icon
  }
  const H = {
    powerCascade: 6, dcPlant: 7, equipmentAlarms: 8, activeRecommendation: 5,
    numberchart: 8, tankLevel: 8, projectedAutonomy: 8, siteMap: 9,
    valueStatus: 4, multiState: 4, dataFreshness: 4, booleanDwell: 4,
    indicator: 4, switch: 4, button: 4,
  };
  return H[t] || 5;
}
