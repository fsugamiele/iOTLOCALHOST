// Wanomi · FASE 1 rediseño alarmas — fuente única de verdad de los
// vocabularios de alarma. Extraídos de NocAlarmsFeed.vue (textos exactos,
// diseño cerrado). Los consumidores nuevos (AlarmCard, drawer, consola,
// detalle, widget) importan de acá; prohibido duplicar los mapas.

// (DEC-REF-82 ii) · vocabulario del tipo de regla, mapa FIJO. Único origen:
// el campo `type` que llega del backend (F1.a). Prohibido default a "D";
// type null o desconocido ⇒ NO renderizar el subtítulo.
export const TYPE_LABELS = {
  D:     'Umbral fijo · el valor cruzó un límite declarado',
  C:     'Calibrada al equipo · el límite lo pone el propio equipo',
  S:     'Sostenida en el tiempo · la condición se mantuvo durante una ventana',
  cross: 'Cruzada · combina varias señales o equipos',
};

// R5 · G8 · 3 — REASON_LABELS: los `reason` emitidos por el edge-engine son
// slugs técnicos; en la UI operador se muestran en castellano. Si aparece un
// reason nuevo sin traducción, cae al slug crudo (no rompe).
export const REASON_LABELS = {
  // ruleEngine — threshold (D)
  'threshold':                       'Umbral superado',
  'threshold-cleared':               'Umbral normalizado',
  // ruleEngine — calibrated / fallback (C)
  'threshold-calibrated':            'Umbral superado (calibrado)',
  'threshold-fallback':              'Umbral de respaldo',
  // ruleEngine — setpoint lifecycle
  'setpoint-unavailable':            'Setpoint no disponible',
  'setpoint-unavailable-escalated':  'Setpoint no disponible (escalada)',
  'setpoint-recovered':              'Setpoint recuperado',
  // ruleEngine — window
  'window':                          'Ventana temporal superada',
  'window-cleared':                  'Ventana temporal normalizada',
  // ruleEngine — cross-tree (S)
  'cross-tree-fired':                'Condición compuesta activada',
  'cross-tree-cleared':              'Condición compuesta normalizada',
  // index.js — hot-reload de pack cierra episodios abiertos
  'rule-edited-or-removed':          'Regla editada o eliminada',
};

// F1.b · severidad en el badge (texto exacto por diseño cerrado):
// "Crítica" / "Advertencia" / "Informativa".
export const SEVERITY_LABELS = {
  critical: 'Crítica',
  warning:  'Advertencia',
  info:     'Informativa',
};

// Mapeo del `mode` técnico del modelo de notificaciones a la clave de
// TYPE_LABELS. Mismo criterio que `type`: mode sin mapeo ⇒ sin subtítulo.
export const MODE_TYPE_KEYS = {
  direct:     'D',
  calibrated: 'C',
  fallback:   'C',
  'no-ref':   'C',
  window:     'S',
  cross:      'cross',
};

export function severityLabel(severity) { return SEVERITY_LABELS[severity] || severity; }
export function typeLabel(type)         { return TYPE_LABELS[type] || null; }
export function reasonLabel(reason)     { return REASON_LABELS[reason] || reason; }
export function typeLabelForMode(mode) {
  const key = MODE_TYPE_KEYS[mode];
  return key ? TYPE_LABELS[key] : null;
}
