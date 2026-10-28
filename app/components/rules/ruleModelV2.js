// spec_editor_reglas_v2 — MODELO del editor v2 (módulo puro, sin Vue).
// Traduce entre lo que arma el usuario (tarjetas de condición en palabras) y la RuleDefinition
// que consume el motor. El usuario nunca ve el tipo (D/C/M/cross): lo decide este módulo.
//   · 1 condición sobre "este equipo" con alarma por equipo → regla simple (D, C o M), igual que hoy.
//   · cualquier otro caso → regla combinada (cross con condiciones, DEC-REF-151).
// Lo que se guarda usa SIEMPRE los nombres técnicos (deviceType, variable, dId): la traducción
// a palabras es solo de pantalla.
import { genRuleId, genInferenceId } from './ruleSentence.js';

// "Qué mirar" (palabras) ↔ métrica del motor.
export const MEDIDAS = [
  { v: 'valor', t: 'su valor actual' },
  { v: 'limite', t: 'contra el límite que informa el equipo' },
  { v: 'tendencia', t: 'si sube o baja rápido', metric: 'slope', win: 10, min: 3 },
  { v: 'proyeccion', t: 'cuándo va a llegar a un valor', metric: 'projection', win: 30, min: 3 },
  { v: 'cambio', t: 'si cambia de ritmo', metric: 'acceleration', win: 10, min: 6 },
  { v: 'relacion', t: 'su relación con otra medición', metric: 'ratio' },
  { v: 'diferencia', t: 'su diferencia con otra medición', metric: 'divergence' },
  { v: 'uso', t: 'el % del tiempo en uso', metric: 'dutyCycle', win: 60, min: 2 },
  { v: 'caida', t: 'cuánto bajó desde la última recarga', metric: 'cumulativeSince' },
  { v: 'clavado', t: 'si quedó clavada (no cambia)', metric: 'flatline', win: 30, min: 3 },
  { v: 'sinreporte', t: 'si deja de reportarse', metric: 'staleness' },
  { v: 'inestable', t: 'si oscila mucho', metric: 'variance', win: 10, min: 3 },
  { v: 'vida', t: 'las horas de uso acumuladas', metric: 'accumulator' },
  { v: 'salto', t: 'si da un salto brusco', metric: 'stepJump', win: 10, min: 2 },
  { v: 'anormal', t: 'si se sale de lo habitual', metric: 'baseline', win: 60, min: 8 },
];
const BY_V = Object.fromEntries(MEDIDAS.map((m) => [m.v, m]));
const BY_METRIC = Object.fromEntries(MEDIDAS.filter((m) => m.metric).map((m) => [m.metric, m]));
export const CON_VENTANA = ['tendencia', 'proyeccion', 'cambio', 'uso', 'clavado', 'inestable', 'salto', 'anormal'];
export const SOLO_BOOL = ['valor', 'uso', 'sinreporte'];

// Comparaciones en palabras por "qué mirar" ↔ operador del motor.
export const OPS = {
  def: [{ v: 'gt', t: 'sea mayor que' }, { v: 'lt', t: 'sea menor que' }, { v: 'gte', t: 'sea mayor o igual que' }, { v: 'lte', t: 'sea menor o igual que' }, { v: 'eq', t: 'sea igual a' }, { v: 'neq', t: 'sea distinto de' }],
  bool: [{ v: 'eq', t: 'sea' }, { v: 'neq', t: 'no sea' }],
  tendencia: [{ v: 'baja', t: 'baje más de' }, { v: 'sube', t: 'suba más de' }],
  proyeccion: [{ v: 'lt', t: 'llegue en menos de' }],
  sinreporte: [{ v: 'gte', t: 'lleve sin reportarse más de' }],
  salto: [{ v: 'gte', t: 'salte más de' }],
  // Franco 2026-10-19 (A): el motor compara el desvío CON SIGNO (arriba +, abajo −): hay que elegir el sentido.
  anormal: [{ v: 'baja', t: 'baje más de lo habitual, más de' }, { v: 'sube', t: 'suba más de lo habitual, más de' }],
  vida: [{ v: 'gte', t: 'acumule más de' }],
  caida: [{ v: 'gt', t: 'baje en total más de' }],
  clavado: [{ v: 'lte', t: 'cambie menos de' }],
};
export const VALOR_LAB = { tendencia: 'por minuto', proyeccion: 'horas', sinreporte: 'minutos', vida: 'horas', uso: '% del tiempo', anormal: 'veces lo normal (3 = mucho)' };
export function opsFor(medida, isBool) { return OPS[medida] || (isBool && medida === 'valor' ? OPS.bool : OPS.def); }

let _id = 0;
const nid = () => `k${Date.now().toString(36)}${(++_id).toString(36)}`;

export function emptyCond(alcance, packType) {
  return { uid: nid(), leafId: null, deviceType: packType, equipos: alcance === 'equipo' ? ['este'] : [`tipo:${packType}`], modo: 'uno',
    variable: '', medida: 'valor', op: 'lt', valor: '', objetivo: '', ventana: '10', cuenta: '120', otra: '', limiteVar: '', extra: null };
}
export function emptyModel(pack) {
  const dt = (pack && pack.deviceType) || '';
  return { nombre: '', alcance: 'equipo', union: 'todas', conds: [emptyCond('equipo', dt)], espera: '60', cierre: '120',
    cierreModo: 'auto', gravedad: 'warning', reco: '', significa: '', pasos: '', clase: '', claseEquipo: '', packType: dt };
}

// ── regla → modelo ─────────────────────────────────────────────────────────
// Devuelve null si la regla no se puede editar en v2 (S "N veces en T", desbalance): va al editor anterior.
export function ruleToModel(rule, pack) {
  if (!rule) return emptyModel(pack);
  const dt = rule.deviceType || (pack && pack.deviceType) || '';
  const base = {
    nombre: rule.label || '', union: 'todas', // Regla existente sin graceSec = el motor no espera (0). Mostrar 60 y guardarlo cambiaba la
    // regla sin que nadie lo pidiera (auditoría de umbrales 2026-10-20). Las nuevas siguen con 60.
    espera: String(rule.graceSec != null ? rule.graceSec : 0),
    cierre: String(rule.resolveGraceSec != null ? rule.resolveGraceSec : 120), cierreModo: rule.reset_behavior === 'manual' ? 'manual' : 'auto',
    gravedad: rule.severity || 'warning', reco: rule.recommendation || '', packType: (pack && pack.deviceType) || dt,
    // spec_detalle_alarma_v2 (Qj2/Qj3) — textos del detalle de la alarma.
    significa: rule.meaning || '', pasos: Array.isArray(rule.steps) ? rule.steps.join('\n') : '',
    // spec_supervisor_confiabilidad_v2 (Qs7) — clase del evento para la confiabilidad.
    clase: rule.eventClass || '', claseEquipo: rule.failDeviceType || '',
  };
  if (rule.type === 'S') return null;
  if (rule.type === 'M' && rule.metric === 'spread') return null;
  if (rule.type === 'D' || rule.type === 'C' || rule.type === 'M') {
    return { ...base, alcance: 'equipo', conds: [leafToCond({ ...rule, measure: rule.type === 'C' ? 'setpoint' : rule.type === 'M' ? 'metric' : 'value' }, 'equipo', dt)] };
  }
  if (rule.type === 'cross' && rule.crossExpr) {
    const ce = rule.crossExpr;
    const isG = (n) => n && Array.isArray(n.children);
    // El editor v2 representa un solo nivel (todas / alguna) sin sumas: lo demás va al editor anterior.
    if (!isG(ce) || ce.children.some((c) => isG(c) || Array.isArray(c.sum))) return null;
    const alcance = rule.scope && rule.scope.deviceType ? 'equipo' : 'sitio';
    const anchor = alcance === 'equipo' ? rule.scope.deviceType : null;
    return { ...base, alcance, packType: anchor || base.packType, union: ce.op === 'OR' ? 'alguna' : 'todas',
      conds: ce.children.map((l) => leafToCond(l, alcance, anchor)) };
  }
  return null;
}

function leafToCond(l, alcance, anchorType) {
  const c = emptyCond(alcance, l.deviceType);
  c.leafId = l.leafId || null;
  c.deviceType = l.deviceType;
  c.variable = l.variable || (Array.isArray(l.inputs) && l.inputs[0] && l.inputs[0].variable) || '';
  // Equipos: lista elegida, todos los del tipo, o "este equipo" (ancla).
  if (l.pick && typeof l.pick === 'object' && Array.isArray(l.pick.dIds)) { c.equipos = l.pick.dIds.slice(); c.modo = l.pick.mode === 'all' ? 'todos' : 'uno'; }
  else if (typeof l.pick === 'string' && l.pick !== 'any' && l.pick !== 'all') { c.equipos = [l.pick]; }
  else if (anchorType && l.deviceType === anchorType && alcance === 'equipo') { c.equipos = ['este']; }
  else { c.equipos = [`tipo:${l.deviceType}`]; c.modo = l.pick === 'all' ? 'todos' : 'uno'; }
  const cond = l.condition || {};
  const m = l.measure === 'metric' ? 'metric' : l.measure === 'setpoint' ? 'setpoint' : 'value';
  if (m === 'value') { c.medida = 'valor'; c.op = cond.op || 'gt'; c.valor = cond.value != null ? String(cond.value) : ''; }
  else if (m === 'setpoint') { c.medida = 'limite'; c.op = cond.op || 'gt'; c.valor = cond.value != null ? String(cond.value) : ''; c.limiteVar = (l.setpointSource && l.setpointSource.variable) || ''; }
  else {
    const md = BY_METRIC[l.metric]; c.medida = md ? md.v : 'valor';
    const v = Number(cond.value);
    if (c.medida === 'tendencia' || c.medida === 'anormal') { c.op = cond.op === 'lt' || cond.op === 'lte' ? 'baja' : 'sube'; c.valor = Number.isFinite(v) ? String(Math.abs(v)) : ''; }
    else { c.op = cond.op || 'gt'; c.valor = cond.value != null ? String(cond.value) : ''; }
    if (l.mWindow && l.mWindow.durationSec) c.ventana = String(Math.round(l.mWindow.durationSec / 60 * 10) / 10);
    if (l.mParams && l.mParams.target != null) c.objetivo = String(l.mParams.target);
    if (l.mParams && l.mParams.holdSec != null) c.cuenta = String(l.mParams.holdSec);
    if (Array.isArray(l.inputs) && l.inputs[1]) c.otra = l.inputs[1].variable || '';
  }
  // Campos que el editor no muestra y hay que conservar (histéresis, umbral de ficha, params finos…).
  c.extra = { condition: cond, mWindow: l.mWindow, mParams: l.mParams, freshnessSec: l.freshnessSec, setpointSource: l.setpointSource, fallbackToD: l.fallbackToD };
  return c;
}

// ── modelo → regla ─────────────────────────────────────────────────────────
const toNum = (x) => { const n = Number(String(x).replace(',', '.')); return Number.isFinite(n) ? n : x; };
function condition(c, isBool) {
  const ex = (c.extra && c.extra.condition) || {};
  let op = c.op, value = c.valor === '' ? '' : (isBool ? Number(c.valor) : toNum(c.valor));
  if (c.medida === 'tendencia' || c.medida === 'anormal') { op = c.op === 'baja' ? 'lt' : 'gt'; value = c.op === 'baja' ? -Math.abs(Number(value)) : Math.abs(Number(value)); }
  const out = { op, value };
  // Histéresis y umbral de la ficha que ya tenía la condición: se conservan si no cambió el comparador.
  if (ex.deadband != null && ex.op === op) out.deadband = ex.deadband;
  // Sin número escrito, la condición sigue atada a lo que tenía: el límite de la ficha
  // (limitRef) o el umbral relativo a otra medición (ref). Escribir un número lo deja fijo.
  if (ex.limitRef && (c.valor === '' || c.valor == null)) { delete out.value; out.limitRef = ex.limitRef; }
  else if (ex.ref && (c.valor === '' || c.valor == null)) { delete out.value; out.ref = ex.ref; }
  if (ex.scaleRef) out.scaleRef = ex.scaleRef;
  return out;
}
function metricFields(c) {
  const md = BY_V[c.medida]; const ex = c.extra || {};
  const f = { metric: md.metric };
  if (CON_VENTANA.includes(c.medida)) {
    const sec = Math.round(Number(String(c.ventana).replace(',', '.')) * 60) || 0;
    f.mWindow = { durationSec: sec, minSamples: (ex.mWindow && ex.mWindow.minSamples) || md.min || 3 };
  }
  const params = { ...(ex.mParams || {}) };
  if (c.medida === 'proyeccion') params.target = toNum(c.objetivo);
  if (c.medida === 'salto' || c.medida === 'anormal') params.holdSec = toNum(c.cuenta);
  if (Object.keys(params).length) f.mParams = params;
  return f;
}

// isBoolVar(deviceType, variable) → boolean (lo resuelve el editor con las fichas).
export function modelToRule(model, { pack, existing, editingIndex, isBoolVar }) {
  const packType = model.packType || (pack && pack.deviceType) || '';
  const simple = model.alcance === 'equipo' && model.conds.length === 1 && model.conds[0].equipos.length === 1 && model.conds[0].equipos[0] === 'este';
  const base = existing ? JSON.parse(JSON.stringify(existing)) : {};
  delete base._id;
  delete base._textos;   // marca de lectura (textos heredados de la ficha): nunca se guarda
  for (const f of ['condition', 'crossExpr', 'scope', 'setpointSource', 'fallbackToD', 'metric', 'mWindow', 'mParams', 'inputs', 'window']) delete base[f];
  const r = Object.assign(base, {
    ruleId: existing ? existing.ruleId : genRuleId(pack, packType, model.nombre, editingIndex),
    inferenceId: existing ? existing.inferenceId : genInferenceId(pack, model.nombre, editingIndex),
    label: model.nombre, severity: model.gravedad, recommendation: model.reco || '',
    meaning: (model.significa || '').trim(),
    steps: String(model.pasos || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12),
    graceSec: Number(model.espera) || 0, resolveGraceSec: Number(model.cierre) || 0,
    reset_behavior: model.cierreModo === 'manual' ? 'manual' : 'auto',
    cooldownSec: existing && existing.cooldownSec != null ? existing.cooldownSec : 300,
  });
  if (model.clase) r.eventClass = model.clase; else delete r.eventClass;
  if (model.clase === 'equipo' && model.claseEquipo) r.failDeviceType = model.claseEquipo; else delete r.failDeviceType;
  if (simple) {
    const c = model.conds[0], isBool = !!(isBoolVar && isBoolVar(packType, c.variable));
    Object.assign(r, { deviceType: packType, variable: c.variable });
    if (c.medida === 'valor') { r.type = 'D'; r.condition = condition(c, isBool); }
    else if (c.medida === 'limite') {
      r.type = 'C'; r.condition = condition(c, false);
      const sp = (c.extra && c.extra.setpointSource) || {};
      r.setpointSource = { ...sp, variable: c.limiteVar, scale: sp.scale != null ? sp.scale : 1 };
      r.fallbackToD = c.extra && c.extra.fallbackToD != null ? c.extra.fallbackToD : true;
    } else {
      r.type = 'M'; r.condition = condition(c, false); Object.assign(r, metricFields(c));
      if (c.medida === 'relacion' || c.medida === 'diferencia') r.inputs = [{ deviceType: packType, variable: c.variable }, { deviceType: packType, variable: c.otra }];
    }
    return r;
  }
  // Combinada.
  const used = new Set(model.conds.map((c) => c.leafId).filter(Boolean));
  let n = 1;
  const children = model.conds.map((c) => {
    let leafId = c.leafId; if (!leafId) { while (used.has(`L${n}`)) n++; leafId = `L${n}`; used.add(leafId); }
    const isBool = !!(isBoolVar && isBoolVar(c.deviceType, c.variable));
    const leaf = { leafId, deviceType: c.deviceType, variable: c.variable, condition: condition(c, isBool) };
    const tipo = c.equipos.find((e) => e.startsWith('tipo:'));
    if (c.equipos.includes('este')) { /* ancla: sin pick */ }
    else if (tipo) leaf.pick = c.modo === 'todos' ? 'all' : 'any';
    else leaf.pick = { mode: c.modo === 'todos' ? 'all' : 'any', dIds: c.equipos.slice() };
    if (c.extra && c.extra.freshnessSec != null) leaf.freshnessSec = c.extra.freshnessSec;
    if (c.medida === 'limite') {
      leaf.measure = 'setpoint';
      leaf.setpointSource = { ...((c.extra && c.extra.setpointSource) || {}), variable: c.limiteVar };
      if (c.extra && c.extra.fallbackToD != null) leaf.fallbackToD = c.extra.fallbackToD;
    } else if (c.medida !== 'valor') {
      leaf.measure = 'metric'; Object.assign(leaf, metricFields(c));
      if (c.medida === 'relacion' || c.medida === 'diferencia') leaf.inputs = [{ deviceType: c.deviceType, variable: c.variable }, { deviceType: c.deviceType, variable: c.otra }];
    }
    return leaf;
  });
  Object.assign(r, {
    type: 'cross', deviceType: packType, variable: (model.conds[0] && model.conds[0].variable) || 'combinada',
    condition: null, crossExpr: { op: model.union === 'alguna' ? 'OR' : 'AND', children },
  });
  if (model.alcance === 'equipo') r.scope = { deviceType: packType };
  return r;
}

// Lo que le falta a una condición, en palabras (null = completa).
export function condProblem(c) {
  if (!c.equipos.length) return 'Elegí al menos un equipo.';
  if (!c.variable) return 'Elegí la medición.';
  if (c.medida === 'limite') return c.limiteVar ? null : 'Elegí qué medición del equipo informa el límite.';
  if (c.valor === '' || c.valor == null) return (c.extra && c.extra.condition && (c.extra.condition.limitRef || c.extra.condition.ref)) ? null : 'Falta el valor.';
  if (!Number.isFinite(Number(String(c.valor).replace(',', '.'))) && c.medida !== 'valor') return 'El valor tiene que ser un número.';
  if (CON_VENTANA.includes(c.medida) && !(Number(String(c.ventana).replace(',', '.')) > 0)) return 'Indicá cuántos minutos mirar.';
  if (c.medida === 'clavado' && Number(c.ventana) < 15) return 'Para "quedó clavada" hay que mirar al menos 15 minutos: un sensor clavado solo manda su lectura cada 5 minutos.';
  if (c.medida === 'proyeccion' && (c.objetivo === '' || !Number.isFinite(Number(c.objetivo)))) return 'Indicá a qué valor tiene que llegar.';
  if ((c.medida === 'relacion' || c.medida === 'diferencia') && !c.otra) return 'Elegí la otra medición.';
  return null;
}
