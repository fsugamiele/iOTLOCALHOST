// Catálogo de widgets del Panel NOC — fuente única compartida por
// pages/dashboard.vue (render + catálogo "Agregar tarjeta") y
// pages/sites/_siteCode.vue (siembra del layout default al pinear).
//
// Panel personalizable: cada indicador es un widget ATÓMICO (antes las 4
// tarjetas agrupaban varios adentro). `slice` indica qué sección del
// payload /dashboard/noc alimenta al widget. Los ids nuevos reemplazan a
// los legacy 'kpis' | 'sites' | 'alarms' (migración en loadLayout).

export const NOC_WIDGETS = [
  { i: 'kpi-sites',    title: 'Sitios en línea',      group: 'Indicadores', slice: 'kpis'   },
  { i: 'kpi-diesel',   title: 'Combustible · red',    group: 'Indicadores', slice: 'kpis'   },
  { i: 'kpi-alerts',   title: 'Alertas activas',      group: 'Indicadores', slice: 'kpis'   },
  { i: 'kpi-uptime',   title: 'Uptime',               group: 'Indicadores', slice: 'kpis'   },
  { i: 'map',          title: 'Mapa de sitios',       group: 'Sitios',      slice: 'sites'  },
  { i: 'sites-table',  title: 'Estado de sitios',     group: 'Sitios',      slice: 'sites'  },
  { i: 'trend',        title: 'Tendencia de variables', group: 'Tendencia', slice: 'trend'  },
  { i: 'alarms-feed',  title: 'Alertas recientes',    group: 'Alarmas',     slice: 'alarms' },
  { i: 'alarms-hist',  title: 'Alertas · 7 días',     group: 'Alarmas',     slice: 'alarms' },
];

// KPI key del contrato /dashboard/noc que alimenta cada widget kpi-*.
export const KPI_KEY_BY_WIDGET = {
  'kpi-sites':  'sitesOnline',
  'kpi-diesel': 'dieselDelta24h',
  'kpi-alerts': 'activeAlerts',
  'kpi-uptime': 'uptime',
};

// Geometría default (grilla 12 col × filas de 30px, vertical-compact).
export const NOC_DEFAULT_LAYOUT = [
  { i: 'kpi-sites',   x: 0, y: 0,  w: 3,  h: 5  },
  { i: 'kpi-diesel',  x: 3, y: 0,  w: 3,  h: 5  },
  { i: 'kpi-alerts',  x: 6, y: 0,  w: 3,  h: 5  },
  { i: 'kpi-uptime',  x: 9, y: 0,  w: 3,  h: 5  },
  { i: 'map',         x: 0, y: 5,  w: 7,  h: 14 },
  { i: 'sites-table', x: 7, y: 5,  w: 5,  h: 14 },
  { i: 'trend',       x: 0, y: 19, w: 7,  h: 10 },
  { i: 'alarms-feed', x: 7, y: 19, w: 5,  h: 10 },
  { i: 'alarms-hist', x: 0, y: 29, w: 12, h: 10 },
];

// Ids legacy (tarjetas agrupadas pre-desagregación): si un layout guardado
// los contiene, se migran (loadLayout los reemplaza por el set atómico).
export const NOC_LEGACY_IDS = ['kpis', 'sites', 'alarms'];
