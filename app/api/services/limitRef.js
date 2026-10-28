// spec_cascada_ficha.md · C2 (firmada por Franco 2026-10-14) — Ficha → Regla.
//
// Una condición puede REFERENCIAR un límite de la ficha en vez de llevar el número:
//   condition: { limitRef: 'warning' | 'trip', op: 'lt', deadband?: 2 }
// `op` elige el límite cuando la variable tiene límites en los dos sentidos
// (batería: lt y gt). El valor (y su `when`, si lo tiene) se resuelve desde
// equipmentsheets al cargar packs → cambiar la ficha cambia la regla (reload).
// Puro (sin DB). Lo usan: edge-engine/siteState.js (resolución), routes/rulepacks.js
// (validación al guardar) y routes/equipmentsheets.js (guarda de borrado de límite).

const SAME_DIR = { lt: ['lt', 'lte'], lte: ['lt', 'lte'], gt: ['gt', 'gte'], gte: ['gt', 'gte'], eq: ['eq'], neq: ['neq'] };
const LIMIT_KINDS = ['warning', 'trip'];
// Sentido de un límite (lt/lte → 'lt', gt/gte → 'gt'): clave del mapa de límites por equipo.
const limitDir = (op) => (op === 'lt' || op === 'lte' ? 'lt' : op === 'gt' || op === 'gte' ? 'gt' : op);
const limitKey = (variable, kind, dir) => `${variable}|${kind}|${dir}`;

const plain = (x) => (x && typeof x.toObject === 'function' ? x.toObject() : x);

// sheetsByType: Map<deviceType, sheet> | objeto
function getSheet(sheetsByType, deviceType) {
  return sheetsByType instanceof Map ? sheetsByType.get(deviceType) : (sheetsByType || {})[deviceType];
}

// findLimit → el límite { kind, op, value, when? } o null
function findLimit(sheetsByType, deviceType, variable, kind, op) {
  const sheet = getSheet(sheetsByType, deviceType);
  if (!sheet) return null;
  const v = (sheet.variables || []).map(plain).find((x) => x.name === variable);
  if (!v) return null;
  const cands = (v.limits || []).map(plain).filter((l) => l.kind === kind && typeof l.value === 'number');
  if (!cands.length) return null;
  if (op) {
    const dir = SAME_DIR[op] || [op];
    const m = cands.filter((l) => dir.includes(l.op));
    return m.length === 1 ? m[0] : null;
  }
  return cands.length === 1 ? cands[0] : null;
}

// Recorre TODAS las condiciones con limitRef de una regla (top-level D y hojas cross).
function forEachRef(rule, fn) {
  if (!rule) return;
  if (rule.condition && rule.condition.limitRef) fn({ where: 'condition', deviceType: rule.deviceType, variable: rule.variable, cond: rule.condition });
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n.children)) { n.children.forEach(walk); return; }
    if (n.condition && n.condition.limitRef && n.deviceType && n.variable) fn({ where: 'leaf', deviceType: n.deviceType, variable: n.variable, cond: n.condition, node: n });
  };
  if (rule.type === 'cross') walk(rule.crossExpr);
}

// spec_textos_alarma_ficha (Qt1/Qt3, firmado 2026-10-27) — textos heredados de la ficha.
// Límite PRINCIPAL de la regla: el de su condición D, o en una combinada la hoja con limitRef
// sobre la medición propia de la regla (si no, la primera hoja con limitRef). Debe calcularse
// ANTES de resolver (resolveRule borra limitRef de la copia).
function mainLimitRef(rule) {
  if (!rule) return null;
  if (rule.condition && rule.condition.limitRef) {
    return { deviceType: rule.deviceType, variable: rule.variable, kind: rule.condition.limitRef, op: rule.condition.op };
  }
  if (rule.type === 'cross' && rule.crossExpr) {
    const refs = [];
    forEachRef(rule, (r) => { if (r.where === 'leaf') refs.push(r); });
    const own = refs.find((r) => r.variable === rule.variable) || refs[0];
    if (own) return { deviceType: own.deviceType, variable: own.variable, kind: own.cond.limitRef, op: own.cond.op };
  }
  return null;
}

const TEXT_FIELDS = [['meaning', 'meaning'], ['recommendation', 'operatorAction'], ['steps', 'steps']];
const emptyText = (v) => v == null || (Array.isArray(v) ? !v.filter(Boolean).length : String(v).trim() === '');

// limitTexts(rule, sheets) → { texts, ref } del límite principal, o null.
function limitTexts(rule, sheetsByType) {
  const ref = mainLimitRef(rule);
  if (!ref || !sheetsByType) return null;
  const lim = findLimit(sheetsByType, ref.deviceType, ref.variable, ref.kind, ref.op);
  const t = lim && lim.texts ? plain(lim.texts) : null;
  if (!t || TEXT_FIELDS.every(([, f]) => emptyText(t[f]))) return null;
  return { texts: t, ref };
}

// inheritTexts(rule, sheets, ref?) — IN PLACE: completa meaning / recommendation / steps
// VACÍOS con los del límite principal y marca el origen en rule._textos
// ({ meaning: 'ficha'|'regla'|null, …, source }). Lo propio de la regla siempre gana.
function inheritTexts(rule, sheetsByType, lt) {
  const got = lt || limitTexts(rule, sheetsByType);
  const from = {};
  for (const [rf, tf] of TEXT_FIELDS) {
    if (!emptyText(rule[rf])) { from[rf] = 'regla'; continue; }
    const v = got && got.texts[tf];
    if (!emptyText(v)) { rule[rf] = Array.isArray(v) ? v.filter(Boolean).slice(0, 12) : v; from[rf] = 'ficha'; }
    else from[rf] = null;
  }
  if (got && got.texts.source) from.source = got.texts.source;
  if (got) from.ref = got.ref;
  rule._textos = from;
  return rule;
}

// resolveRule(rule, sheets) → { rule: copia resuelta, unresolved: [motivo] }
// D:    condition.value ← límite; condition.when ← límite.when (el motor lo evalúa).
// hoja: condition.value ← límite; si el límite tiene `when` → la hoja pasa a
//       AND(hoja-when, hoja) sobre el mismo equipo.
function resolveRule(rule0, sheetsByType) {
  const rule = JSON.parse(JSON.stringify(rule0));
  const unresolved = [];
  const lt = limitTexts(rule, sheetsByType);   // antes de resolver: después ya no hay limitRef
  const resolveCond = (deviceType, variable, cond) => {
    const lim = findLimit(sheetsByType, deviceType, variable, cond.limitRef, cond.op);
    if (!lim) { unresolved.push(`${deviceType}/${variable} ${cond.limitRef}${cond.op ? ' ' + cond.op : ''}`); return null; }
    // Valor para el placeholder {umbral} de label/recommendation: el de la variable
    // propia de la regla si está, si no el primero que se resuelva.
    if (variable === rule.variable && !rule._umbralOwn) { rule._umbral = lim.value; rule._umbralOwn = true; }
    else if (rule._umbral === undefined) rule._umbral = lim.value;
    cond.op = lim.op;
    cond.value = lim.value;
    // spec_perfiles_controladora — `dir` permite al motor buscar el límite PROPIO del equipo
    // (perfil de controladora o valor del equipo) para esta misma condición: cascada
    // equipo > perfil > ficha, por equipo, en effectiveCondition (typeD.js).
    cond.resolvedFrom = { deviceType, variable, kind: cond.limitRef, dir: limitDir(lim.op) };
    // C3 — límite relativo a un parámetro de la instalación: el motor lo escala por equipo.
    if (lim.relativeTo && lim.relativeTo.param && Number(lim.relativeTo.base) > 0) {
      cond.scaleRef = { param: lim.relativeTo.param, base: Number(lim.relativeTo.base) };
    }
    // La copia RESUELTA lleva solo el número: limitRef y value son excluyentes para
    // la validación de forma (validateCrossTree corre en loadPacks DESPUÉS de resolver).
    delete cond.limitRef;
    return lim;
  };
  if (rule.condition && rule.condition.limitRef) {
    const lim = resolveCond(rule.deviceType, rule.variable, rule.condition);
    if (lim && lim.when) rule.condition.when = lim.when;
  }
  if (rule.type === 'cross' && rule.crossExpr) {
    const walk = (n) => {
      if (!n || typeof n !== 'object') return n;
      if (Array.isArray(n.children)) { n.children = n.children.map(walk); return n; }
      if (n.condition && n.condition.limitRef && n.deviceType && n.variable) {
        const lim = resolveCond(n.deviceType, n.variable, n.condition);
        if (lim && lim.when) {
          return { op: 'AND', children: [
            { deviceType: n.deviceType, variable: lim.when.variable, condition: { op: lim.when.op, value: lim.when.value } },
            n,
          ] };
        }
      }
      return n;
    };
    rule.crossExpr = walk(rule.crossExpr);
  }
  if (!unresolved.length) inheritTexts(rule, sheetsByType, lt);
  return { rule, unresolved };
}

// refsToLimit(packs, deviceType, variable, kind) → [ruleId (packId)] que referencian ese límite
function refsToLimit(packs, deviceType, variable, kind, op) {
  const out = [];
  for (const p of packs || []) {
    for (const r of p.rules || []) {
      forEachRef(r, (ref) => {
        if (ref.deviceType !== deviceType || ref.variable !== variable || ref.cond.limitRef !== kind) return;
        if (op && ref.cond.op && !(SAME_DIR[op] || [op]).includes(ref.cond.op)) return;
        out.push(`${r.ruleId} (${p.packId})`);
      });
    }
  }
  return [...new Set(out)];
}

// fillThreshold(text, rule, thresholdUsed) — `{umbral}` en label/recommendation →
// valor vigente (thresholdUsed del disparo, o condition.value resuelto, o el del
// límite de ficha de la regla) + unidad. Fuente única: motor (fireAlarm/Resolve) y QA.
function fillThreshold(text, rule, thresholdUsed) {
  if (typeof text !== 'string' || !text.includes('{umbral}')) return text;
  const v = typeof thresholdUsed === 'number' ? thresholdUsed
    : (rule.condition && typeof rule.condition.value === 'number') ? rule.condition.value
    : rule._umbral;
  if (typeof v !== 'number') return text.replace(/\{umbral\}/g, 'el umbral configurado');
  const num = String(Math.round(v * 100) / 100).replace('.', ',');
  const u = rule.unit ? (rule.unit === '%' ? ' %' : ` ${rule.unit}`) : '';
  return text.replace(/\{umbral\}/g, `${num}${u}`);
}

// {umbral} en todos los textos que lee una persona (nombre, recomendación, significado, pasos).
function fillTexts(rule) {
  rule.label = fillThreshold(rule.label, rule);
  rule.recommendation = fillThreshold(rule.recommendation, rule);
  rule.meaning = fillThreshold(rule.meaning, rule);
  if (Array.isArray(rule.steps)) rule.steps = rule.steps.map((x) => fillThreshold(x, rule));
  return rule;
}

// resolvePacksForRead(packs, db) — para LECTORES de reglas fuera del motor (QA:
// backtest, invariantes, detalle de regla): resuelve limitRef IN PLACE contra
// equipmentsheets (driver crudo). Sin refs no consulta nada. Una regla que no
// resuelve queda como está y marcada `_limitRefUnresolved`.
async function resolvePacksForRead(packs, db) {
  if (!packs || !packs.length) return packs;
  if (!packs.some(p => JSON.stringify(p.rules || []).includes('"limitRef"'))) {
    for (const p of packs) for (const r of (p.rules || [])) {
      fillTexts(r);
    }
    return packs;
  }
  const sheets = await db.collection('equipmentsheets').find({}).project({ deviceType: 1, variables: 1 }).toArray();
  const by = new Map(sheets.map(s => [s.deviceType, s]));
  for (const p of packs) {
    p.rules = (p.rules || []).map(r => {
      const { rule, unresolved } = resolveRule(r, by);
      if (unresolved.length) return { ...r, _limitRefUnresolved: unresolved };
      fillTexts(rule);
      return rule;
    });
  }
  return packs;
}

module.exports = { limitDir, limitKey, LIMIT_KINDS, findLimit, forEachRef, resolveRule, refsToLimit, resolvePacksForRead, fillThreshold,
  mainLimitRef, limitTexts, inheritTexts, fillTexts };
