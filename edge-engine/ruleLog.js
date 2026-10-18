// edge-engine/ruleLog.js
// spec_editor_reglas_v2 (Qi3) — log LEGIBLE del ciclo de cada regla. Reemplaza las líneas
// "[ALARM] …": una línea por cambio de etapa del GRAFCET, con el nombre de la regla, el equipo
// y el porqué; al pasar a Observando o Alarma, una línea por condición.
//   22:41:05 «Batería en riesgo» Rectificador Eltek · Sala: Vigilando → Observando · se cumple; avisa si sigue así 60 s
//              C1 sí · Tensión de batería = 47,2 V (umbral 46)
// Solo PRESENTACIÓN: no cambia qué evalúa el motor ni lo que se guarda.

const mongoose = require('mongoose');
const { STEP_NAMES } = require('./ruleFsm');

let labels = new Map();   // deviceType → Map(variable → { label, unit })

// Etiquetas de la ficha (best-effort: sin ellas, el nombre técnico sin guiones bajos).
async function loadLabels(siteId) {
  try {
    const db = mongoose.connection.db;
    const site = await db.collection('sites').findOne({ siteCode: siteId });
    const dIds = (site && site.devices) || [];
    const devices = dIds.length ? await db.collection('devices').find({ dId: { $in: dIds } }).project({ deviceType: 1 }).toArray() : [];
    const types = [...new Set(devices.map((d) => d.deviceType).filter(Boolean))];
    const sheets = types.length ? await db.collection('equipmentsheets').find({ deviceType: { $in: types } }).project({ deviceType: 1, variables: 1 }).toArray() : [];
    const out = new Map();
    for (const s of sheets) {
      const m = new Map();
      for (const v of (s.variables || [])) if (v && v.name) m.set(v.name, { label: v.label || null, unit: v.unit || '' });
      out.set(s.deviceType, m);
    }
    labels = out;
  } catch (e) { console.warn('[ruleLog] no se pudieron leer las etiquetas de las fichas:', e.message); }
}

const hhmmss = (ts) => new Date(ts).toTimeString().slice(0, 8);
const num = (v) => (typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : (v == null ? '—' : String(v)));
function varText(deviceType, variable) {
  const l = (labels.get(deviceType) || new Map()).get(variable);
  return { name: (l && l.label) || String(variable || 'valor').replace(/_/g, ' '), unit: (l && l.unit) ? ` ${l.unit}` : '' };
}
const STATE = { si: 'sí', no: 'no', jun: 'juntando lecturas', sin: 'sin dato' };

function porque(t, rule) {
  const g = Math.max(0, Number(rule && rule.graceSec) || 0), c = Math.max(0, Number(rule && rule.resolveGraceSec) || 0);
  if (t.action === 'notify') return `AVISO ${rule && rule.severity === 'critical' ? 'CRÍTICO' : rule && rule.severity === 'info' ? 'informativo' : 'de advertencia'}`;
  if (t.action === 'resolve') return t.to === 'E1' ? 'alarma cerrada' : 'alarma cerrada';
  if (t.to === 'E2') return g ? `se cumple; avisa si sigue así ${g} s` : 'se cumple';
  if (t.to === 'E4') return c ? `se normalizó; cierra si sigue así ${c} s` : 'se normalizó';
  if (t.to === 'E6') return 'se normalizó; espera la confirmación del operador';
  if (t.to === 'E5') return 'sin datos: no llega la medición';
  if (t.to === 'E1' && t.from === 'E2') return 'dejó de cumplirse antes de avisar';
  if (t.to === 'E3' && t.from === 'E4') return 'se volvió a cumplir';
  if (t.from === 'E5') return 'volvió el dato';
  return '';
}

// t = registro de transición del FSM (+ leaves/rule), siteState para el nombre del equipo.
function logTransition(t, rule, siteState) {
  try {
    const dev = (siteState && t.dId && siteState.get(t.dId)) || {};
    const equipo = dev._deviceName || t.dId || 'sitio';
    const nombre = (rule && rule.label) || t.ruleId;
    const p = porque(t, rule);
    console.log(`${hhmmss(t.ts)} «${nombre}» ${equipo}: ${STEP_NAMES[t.from] || t.from} → ${STEP_NAMES[t.to] || t.to}${p ? ' · ' + p : ''}`);
    if (!['E2', 'E3'].includes(t.to)) return;
    if (Array.isArray(t.leaves) && t.leaves.length) {
      t.leaves.forEach((l, i) => {
        const v = varText(l.deviceType, l.variable);
        const eq = l.dId && siteState && siteState.get(l.dId) ? ` (${siteState.get(l.dId)._deviceName || l.dId})` : '';
        const thr = l.threshold != null ? ` (umbral ${num(l.threshold)})` : '';
        console.log(`           C${i + 1} ${STATE[l.state] || l.state} · ${v.name}${eq} = ${num(l.value)}${l.value != null ? v.unit : ''}${thr}`);
      });
    } else if (rule && rule.variable) {
      const v = varText(rule.deviceType, rule.variable);
      console.log(`           ${v.name} = ${num(t.value)}${t.value != null ? v.unit : ''}${t.thresholdUsed != null ? ` (umbral ${num(t.thresholdUsed)})` : ''}`);
    }
  } catch (e) { /* el log nunca puede romper el motor */ }
}

module.exports = { loadLabels, logTransition };
