// spec_textos_alarma_ficha · Qt5 (firmado 2026-10-27) — arreglos puntuales de reglas:
//   H1 eltek-baseline-temperature  AND imposible (> +3 y < −3) → OR
//   H2 cat-GE-16 (código 781)       severidad → advertencia (decisión Franco)
//   H3 cat-AR-08                    recomendación correcta: avisa cada semana + ejercicio con carga (FG Wilson 356-5902 p. 76)
//   H4 gen-autonomy-crit            umbral fijo 12 h → límite crítico de la ficha (12 h), solo si la ficha lo tiene en 12
//   H5 pasos en un solo renglón con «;» → un paso por renglón (cualquier regla)
//
//   docker exec -i node node - < tools/arreglos_reglas_textos.js           → SIMULACIÓN (muestra antes → después)
//   docker exec -i node node - --apply < tools/arreglos_reglas_textos.js   → APLICA por la API (PUT /api/rulepacks/:packId)
// Cada arreglo verifica la forma esperada; si la regla no está como se espera, NO la toca y lo informa.
const http = require('http');
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const jwt = require(NM + 'jsonwebtoken');
const e = process.env;
const APPLY = process.argv.includes('--apply');
if (!e.JWT_SECRET) { console.error('ERROR: falta JWT_SECRET (correr dentro del contenedor node).'); process.exit(1); }
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } }, e.JWT_SECRET, { expiresIn: '10m' });
const req = (method, path, body) => new Promise((ok, ko) => {
  const b = body ? Buffer.from(JSON.stringify(body)) : null;
  const r = http.request({ host: 'localhost', port: Number(e.API_PORT || 3001), method, path, headers: { token: TOKEN, 'Content-Type': 'application/json', ...(b ? { 'Content-Length': b.length } : {}) } }, (res) => {
    let raw = ''; res.on('data', (c) => { raw += c; }); res.on('end', () => { let json = null; try { json = JSON.parse(raw); } catch (_) {} ok({ status: res.statusCode, json, raw }); });
  });
  r.on('error', ko); if (b) r.write(b); r.end();
});
const J = (x) => JSON.stringify(x);

const H3_RECO = 'El grupo no hizo su ejercicio esta semana. Hacerlo funcionar y, una vez por mes, con carga (al menos 50 %) durante 1 a 2 horas; no dejarlo funcionando mucho tiempo con carga baja.';
const H3_SRC = 'FG Wilson 356-5902 v15 §8.2 p. 76 (quincenal 5 min en vacío; mensual ≥ 50 % de carga 1–2 h)';

(async () => {
  const packs = ((await req('GET', '/api/rulepacks')).json || {}).data || [];
  const sheets = ((await req('GET', '/api/equipmentsheet')).json || {}).data || [];
  const limite = (dt, v, kind, dir) => {
    const s = sheets.find((x) => x.deviceType === dt); const vv = s && (s.variables || []).find((x) => x.name === v);
    const c = vv ? (vv.limits || []).filter((l) => l.kind === kind && (dir === 'lt' ? ['lt', 'lte'] : ['gt', 'gte']).includes(l.op)) : [];
    return c.length === 1 ? c[0] : null;
  };
  let total = 0;
  for (const p of packs) {
    const rules = (p.rules || []).map((x) => JSON.parse(JSON.stringify(x)));
    const log = [];
    for (const r of rules) {
      // H1 — un AND cuyos dos hijos son la misma medición, uno > +x y otro < −x: imposible → OR.
      if (r.ruleId === 'eltek-baseline-temperature') {
        let hecho = false;
        const fix = (n) => {
          if (!n || !Array.isArray(n.children)) return;
          if (n.op === 'AND' && n.children.length === 2) {
            const [a, b] = n.children;
            const ca = a && a.condition, cb = b && b.condition;
            const opuestos = ca && cb && a.variable === b.variable && (a.metric || '') === (b.metric || '')
              && ((['gt', 'gte'].includes(ca.op) && ['lt', 'lte'].includes(cb.op) && ca.value > cb.value)
               || (['lt', 'lte'].includes(ca.op) && ['gt', 'gte'].includes(cb.op) && cb.value > ca.value));
            if (opuestos) { n.op = 'OR'; hecho = true; return; }
          }
          n.children.forEach(fix);
        };
        if (r.crossExpr) fix(r.crossExpr);
        log.push(hecho ? `H1 ${r.ruleId}: AND → OR (desvío por encima O por debajo)` : `H1 ${r.ruleId}: NO se encontró el AND imposible — no se toca. Forma: ${J(r.crossExpr || r.condition).slice(0, 300)}`);
      }
      // H2
      if (r.ruleId === 'cat-GE-16') {
        if (r.severity !== 'warning') { log.push(`H2 ${r.ruleId}: severidad ${r.severity} → warning`); r.severity = 'warning'; }
        else log.push(`H2 ${r.ruleId}: ya es advertencia`);
      }
      // H3 — la recomendación hablaba de poner en AUTO; la regla es «sin ejercicio semanal».
      if (r.ruleId === 'cat-AR-08') {
        if (r.recommendation !== H3_RECO) { log.push(`H3 ${r.ruleId}: recomendación «${String(r.recommendation || '').slice(0, 80)}» → «${H3_RECO.slice(0, 80)}…»`); r.recommendation = H3_RECO; }
        if (!r.meaning) { r.meaning = 'El grupo electrógeno no funcionó en la última semana: sin ejercicio puede fallar cuando haga falta.'; log.push(`H3 ${r.ruleId}: significado cargado`); }
        if (!(r.steps || []).length) {
          r.steps = ['Verificar en el historial cuándo funcionó por última vez', 'Programar el ejercicio del grupo (arranque en vacío unos minutos)', 'Una vez por mes, hacerlo con carga (≥ 50 %) durante 1 a 2 horas', `Fuente: ${H3_SRC}`];
          log.push(`H3 ${r.ruleId}: pasos cargados`);
        }
      }
      // H4 — el crítico de autonomía pasa a la ficha si la ficha lo tiene en el mismo valor.
      if (r.ruleId === 'gen-autonomy-crit') {
        const c = r.condition || {};
        if (c.limitRef) log.push(`H4 ${r.ruleId}: ya usa el límite de la ficha`);
        else {
          const lim = limite(r.deviceType || p.deviceType, r.variable, 'trip', 'lt');
          if (lim && Number(lim.value) === Number(c.value) && ['lt', 'lte'].includes(c.op)) {
            log.push(`H4 ${r.ruleId}: ${c.op} ${c.value} fijo → límite crítico de la ficha ${r.deviceType || p.deviceType}.${r.variable} (${lim.value} h)`);
            r.condition = { op: c.op, limitRef: 'trip', ...(c.deadband != null ? { deadband: c.deadband } : {}) };
          } else log.push(`H4 ${r.ruleId}: NO se toca — condición ${J(c)}, límite crítico de ficha ${lim ? lim.op + ' ' + lim.value : 'inexistente'} (${r.deviceType || p.deviceType}.${r.variable})`);
        }
      }
      // H5 — pasos en un renglón con «;».
      if (Array.isArray(r.steps) && r.steps.length === 1 && r.steps[0].includes(';')) {
        const nuevos = r.steps[0].split(';').map((x) => x.trim()).filter(Boolean).slice(0, 12);
        if (nuevos.length > 1) { log.push(`H5 ${r.ruleId}: 1 renglón → ${nuevos.length} pasos`); r.steps = nuevos; }
      }
    }
    const cambia = J(rules) !== J(p.rules || []);
    log.forEach((x) => console.log(`[${p.packId}] ${x}`));
    if (!cambia) continue;
    total++;
    if (APPLY) {
      const body = { rulepack: { packId: p.packId, deviceType: p.deviceType, version: (p.version || 1) + 1, description: p.description || '', canary: !!p.canary, rules } };
      const put = await req('PUT', `/api/rulepacks/${encodeURIComponent(p.packId)}`, body);
      console.log(`PUT ${p.packId} → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
    }
  }
  console.log(`\n${total} pack(s) ${APPLY ? 'actualizado(s)' : 'a actualizar (simulación: correr con --apply para escribir)'}.`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
