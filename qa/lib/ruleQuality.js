'use strict';
// spec_supervisor_confiabilidad_v2 (R2) — CALIDAD DE LAS REGLAS. Reproduce la ventana (30 días) con
// el MOTOR COMPLETO del edge (ruleEngine + GRAFCET: espera, histéresis, cierre, cascada de límites,
// todas las reglas juntas como en vivo) y cuenta EPISODIOS, no lecturas. Por regla devuelve
// veredicto, el cálculo que lo respalda y, si avisa de más, un cambio concreto REPRODUCIDO
// (avisos antes → después y fallas reales perdidas). READ-ONLY: no avisa, no escribe en el motor.
//
// Veredictos (§3 de la spec): avisa_de_mas · no_evalua · umbral_revisar · proteccion · inalcanzable · sana.
// Límite declarado: los ticks de "deja de reportar" (staleness) no se reproducen (usan el reloj real).
const mongoose = require('mongoose');
const { engine } = require('./simulate');
const { neededVars } = require('./backtest');

const H = 3600000, MIN = 60000;
const TICK_MS = Number(process.env.QA_RQ_TICK_MS || 10000);
const SAMPLE_MS = 60000;              // muestreo del "% del tiempo en condición"
const GAP_MS = 15 * MIN;              // hueco de datos que corta la "historia continua"
const LARGO_MS = 10 * MIN;            // episodio > 10 min = falla real (no se puede perder al ajustar)
const CORTA_MS = 10 * MIN;            // excursión corta (candidata a filtrar con espera)

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const r2 = (v, d = 2) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const pctl = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function rango(factoryRange) {
  const m = String(factoryRange || '').replace(/(\d),(\d)/g, '$1.$2').match(/-?\d+(?:\.\d+)?/g);
  if (!m || m.length < 2) return null;
  const a = Number(m[0]), b = Number(m[1]); return a < b ? [a, b] : [b, a];
}

// Reproduce [from, to] con las reglas dadas. Devuelve, por instancia, avisos/cierres/excursiones.
async function replay(db, { rules, dIds, devs, siteCode, from, to, vars = null, seed }) {
  const { RE, createRuleFsm } = engine();
  const siteState = new Map();
  for (const d of devs) siteState.set(d.dId, { _deviceType: d.deviceType, _siteCode: siteCode, _deviceName: d.name || d.dId, _lastUpdate: {} });
  await require('../../app/api/services/deviceLimits').loadDeviceContexts(db, dIds, siteState);
  const I = new Map();                                  // key → acumuladores
  const get = (inst) => {
    let x = I.get(inst.key);
    if (!x) { x = { key: inst.key, ruleId: inst.ruleId, dId: inst.dId, avisos: [], cierres: [], exc: [], excStart: null, evaluada: false, onSamples: 0, samples: 0 }; I.set(inst.key, x); }
    if (inst.dId) x.dId = inst.dId;
    return x;
  };
  const fsm = createRuleFsm({
    onNotify: (inst, ctx, now) => { get(inst).avisos.push(now); },
    onResolve: (inst, ctx, now) => { get(inst).cierres.push(now); },
    onTransition: (t) => {
      const x = I.get(t.key) || get({ key: t.key, ruleId: t.ruleId, dId: t.dId });
      if (t.receptivity != null) x.evaluada = true;
      if (t.receptivity === 'on' && x.excStart == null) x.excStart = t.ts;
      else if (t.receptivity !== 'on' && t.receptivity !== 'band' && x.excStart != null) { x.exc.push(t.ts - x.excStart); x.excStart = null; }
    },
  });
  const packs = [{ rules }];
  const ruleById = new Map(rules.map((r) => [r.ruleId, r]));
  const st = { siteState, cooldownState: new Map(), windowState: new Map(), activeState: new Map(), mState: new Map(), fsm };
  const series = seed || null;                          // estadística por equipo|medición (solo 1ª pasada)
  let tick = from, nextSample = from + SAMPLE_MS, rows = 0;
  const advance = (until) => {
    while (tick + TICK_MS <= until) {
      tick += TICK_MS;
      RE.processCombinedTick({ packs, siteState, mState: st.mState, fsm, now: tick });
      fsm.tick(ruleById, tick);
      RE.processSilenceTick({ ruleById, siteState, fsm, silenceMs: 600000, startedAt: from, now: tick });
      RE.processWindowTick({ ruleById, windowState: st.windowState, fsm, now: tick });
      if (tick >= nextSample) {
        nextSample += SAMPLE_MS;
        for (const inst of fsm.instances.values()) {
          const x = get(inst);
          if (inst.lastR != null) { x.evaluada = true; x.samples++; if (inst.lastR === 'on' || inst.lastR === 'band') x.onSamples++; }
        }
      }
    }
  };
  const q = { dId: { $in: dIds } }; if (vars) q.variable = { $in: vars };
  for (let h0 = from; h0 < to; h0 += H) {
    const chunk = await db.collection('data').find({ ...q, time: { $gte: h0, $lt: Math.min(h0 + H, to) } })
      .project({ _id: 0, dId: 1, variable: 1, value: 1, time: 1 }).sort({ time: 1 }).toArray();
    for (const row of chunk) {
      advance(row.time);
      const d = siteState.get(row.dId); if (!d) continue;
      d[row.variable] = row.value; d._lastUpdate[row.variable] = row.time; d._lastSeen = row.time;
      rows++;
      if (series) {
        const k = `${row.dId}|${row.variable}`; const v = num(row.value);
        let s = series.get(k);
        if (!s) { s = { n: 0, mean: 0, m2: 0, min: Infinity, max: -Infinity, dn: 0, d2: 0, last: null, lastT: null, run: 0, runStart: row.time, maxRun: 0 }; series.set(k, s); }
        if (s.lastT != null && row.time - s.lastT > GAP_MS) s.runStart = row.time;
        s.maxRun = Math.max(s.maxRun, row.time - s.runStart); s.lastT = row.time;
        if (v != null) {
          s.n++; const dd = v - s.mean; s.mean += dd / s.n; s.m2 += dd * (v - s.mean);
          if (v < s.min) s.min = v; if (v > s.max) s.max = v;
          if (s.last != null) { s.dn++; s.d2 += (v - s.last) ** 2; }
          s.last = v;
        }
      }
      RE.processMessage({ dId: row.dId, variable: row.variable, value: row.value, ...st, packs, eventTs: row.time });
    }
  }
  advance(to);
  for (const x of I.values()) if (x.excStart != null) { x.exc.push(to - x.excStart); x.excStart = null; }
  return { inst: I, rows };
}

// Episodios de una regla (todas sus instancias): [{start, end|null, dId}]
function episodios(inst, ruleId) {
  const out = [];
  for (const x of inst.values()) {
    if (x.ruleId !== ruleId) continue;
    const c = [...x.cierres];
    for (const a of x.avisos) { const i = c.findIndex((t) => t >= a); out.push({ start: a, end: i >= 0 ? c.splice(i, 1)[0] : null, dId: x.dId }); }
  }
  return out.sort((a, b) => a.start - b.start);
}
const parpadeos = (eps, n = 3, ms = 60000) => {
  const by = new Map(); for (const e of eps) (by.get(e.dId) || by.set(e.dId, []).get(e.dId)).push(e.start);
  let c = 0; for (const ts of by.values()) for (let i = 0; i + n - 1 < ts.length; i++) if (ts[i + n - 1] - ts[i] <= ms) { c++; break; }
  return c;
};

async function ruleQuality({ days = 30, now = Date.now() } = {}) {
  const t0 = Date.now();
  const db = mongoose.connection.db;
  const SITE = process.env.SITE_ID || 'CR00061';
  const site = await db.collection('sites').findOne({ siteCode: SITE });
  const dIds = (site && site.devices) || [];
  const devs = await db.collection('devices').find({ dId: { $in: dIds } }).project({ dId: 1, deviceType: 1, name: 1 }).toArray();
  const sheets = new Map((await db.collection('equipmentsheets').find({}).toArray()).map((s) => [s.deviceType, s]));
  const crudos = await db.collection('rulepacks').find({ enabled: { $ne: false } }).toArray();
  const originales = new Map(); for (const p of crudos) for (const r of (p.rules || [])) originales.set(r.ruleId, JSON.parse(JSON.stringify({ ...r, _packId: p.packId })));
  const packs = JSON.parse(JSON.stringify(crudos));
  await require('../../app/api/services/limitRef').resolvePacksForRead(packs, db);
  const rules = packs.flatMap((p) => (p.rules || []).filter((r) => r.enabled !== false && !r._limitRefUnresolved).map((r) => ({ ...r, _packId: p.packId })));
  const sinLimite = packs.flatMap((p) => (p.rules || []).filter((r) => r.enabled !== false && r._limitRefUnresolved).map((r) => ({ ...r, _packId: p.packId })));
  const to = now, from = to - days * 24 * H;

  const series = new Map();
  const base = await replay(db, { rules, dIds, devs, siteCode: SITE, from, to, seed: series });
  const typeOf = new Map(devs.map((d) => [d.dId, d.deviceType]));
  // Estadística por tipo de equipo|medición: el equipo con más lecturas de ese tipo.
  const statOf = (dt, v) => {
    let best = null;
    for (const d of devs) if (d.deviceType === dt) { const s = series.get(`${d.dId}|${v}`); if (s && (!best || s.n > best.n)) best = s; }
    if (!best || best.n < 2) return null;
    const sd = Math.sqrt(best.m2 / (best.n - 1)), sdn = best.dn ? Math.sqrt(best.d2 / best.dn) / Math.SQRT2 : null;
    return { n: best.n, mean: best.mean, sd, sdRuido: sdn, min: best.min, max: best.max, maxRunH: best.maxRun / H };
  };

  const out = [];
  for (const r of [...rules, ...sinLimite]) {
    const orig = originales.get(r.ruleId) || r;
    const sev = r.severity;
    const row = { ruleId: r.ruleId, packId: r._packId, label: r.label, type: r.type, severity: sev, eventClass: r.eventClass || null };
    if (r._limitRefUnresolved) { out.push({ ...row, veredicto: 'no_evalua', porque: 'Usa un límite de la ficha que no tiene valor cargado.', calculo: '', cambio: 'Cargar el valor en la ficha (o en la controladora / el equipo) o poner un número propio.' }); continue; }
    const eps = episodios(base.inst, r.ruleId);
    const insts = [...base.inst.values()].filter((x) => x.ruleId === r.ruleId);
    const evaluada = insts.some((x) => x.evaluada);
    const samples = insts.reduce((s, x) => s + x.samples, 0), onS = insts.reduce((s, x) => s + x.onSamples, 0);
    const pctCond = samples ? (100 * onS) / samples : null;
    const exc = insts.flatMap((x) => x.exc);
    const durs = eps.filter((e) => e.end != null).map((e) => e.end - e.start);
    const perDay = eps.length / days, parp = parpadeos(eps);
    const closeMs = (Number(r.resolveGraceSec) || 0) * 1000;
    const cortas = exc.filter((d) => d < CORTA_MS);
    const cortasEp = eps.filter((e) => e.end != null && e.end - e.start <= Math.max(closeMs, MIN) + 60000).length;
    const shortShare = eps.length ? cortasEp / eps.length : 0;
    const { vars } = neededVars(r);
    const dtPrim = r.deviceType, vPrim = r.variable;
    const stp = dtPrim && vPrim ? statOf(dtPrim, vPrim) : null;
    const thr = r.type === 'D' && r.condition ? num(r.condition.value) : null;
    const op = r.type === 'D' && r.condition ? r.condition.op : null;
    const ficha = sheets.get(dtPrim); const fv = ficha && (ficha.variables || []).find((x) => x.name === vPrim);
    const fisico = fv ? rango(fv.factoryRange) : null;
    const comun = { ...row, avisos: eps.length, porDia: r2(perDay, 2), parpadeos: parp, pctEnCondicion: r2(pctCond, 2),
      duracionMedianaMin: r2(pctl(durs, 0.5) / MIN, 1), episodiosCortosPct: r2(100 * shortShare, 1), excursiones: exc.length,
      graceSec: Number(r.graceSec) || 0, resolveGraceSec: Number(r.resolveGraceSec) || 0,
      umbral: thr, op, estadistica: stp ? { media: r2(stp.mean, 3), sd: r2(stp.sd, 3), sdRuido: r2(stp.sdRuido, 4), min: r2(stp.min, 3), max: r2(stp.max, 3), n: stp.n } : null,
      rangoFisico: fisico };

    // ── no evalúa ──
    if (!evaluada) {
      const falta = vars.filter((v) => !devs.some((d) => series.has(`${d.dId}|${v}`)));
      const win = Math.max(Number(r.mWindow && r.mWindow.durationSec) || 0, Number(r.window && r.window.durationSec) || 0) * 1000;
      const runs = vars.map((v) => Math.max(0, ...devs.map((d) => (series.get(`${d.dId}|${v}`) || {}).maxRun || 0)));
      const maxRun = runs.length ? Math.min(...runs) : 0;
      const porque = falta.length ? `No hay lecturas de ${falta.join(', ')} en ${days} días: la regla no puede evaluarse.`
        : win && win > maxRun ? `Necesita ${r2(win / H, 1)} h de historia continua y el máximo observado es ${r2(maxRun / H, 1)} h.`
          : `En ${days} días la condición nunca tuvo datos suficientes para evaluarse.`;
      out.push({ ...comun, veredicto: 'no_evalua', porque,
        calculo: falta.length ? `mediciones sin lecturas: ${falta.join(', ')}` : `ventana requerida ${r2(win / H, 1)} h · historia continua máx. ${r2(maxRun / H, 1)} h`,
        cambio: falta.length ? 'Verificar que el equipo publique esa medición (plantilla / driver) o desactivar la regla en este sitio.' : 'Guardar la ventana en la base o calcularla desde el historial al arrancar.' });
      continue;
    }

    // ── avisa de más ──
    if (eps.length && (parp > 0 || perDay > 1 || shortShare >= 0.3)) {
      const motivos = [];
      if (parp) motivos.push(`${parp} parpadeo(s) (≥ 3 avisos en 60 s)`);
      if (perDay > 1) motivos.push(`${r2(perDay, 2)} avisos/día`);
      if (shortShare >= 0.3) motivos.push(`${r2(100 * shortShare, 0)} % de los episodios duran menos que la espera de cierre + 1 min`);
      const p95 = pctl(cortas, 0.95);
      // Espera > p95 de las excursiones cortas, con 30 s de margen (una cadencia de lectura típica).
      const graceNueva = p95 ? Math.min(900, Math.max((Number(r.graceSec) || 0) + 30, Math.ceil(p95 / 30000) * 30 + 30)) : null;
      const dbNueva = r.type === 'D' && stp && stp.sdRuido ? r2(2 * stp.sdRuido, 3) : null;
      const dbActual = r.type === 'D' && r.condition ? Number(r.condition.deadband) || 0 : null;
      const prueba = JSON.parse(JSON.stringify(r));
      if (graceNueva) prueba.graceSec = graceNueva;
      if (dbNueva && dbNueva > (dbActual || 0)) prueba.condition.deadband = dbNueva;
      let despues = null, perdidas = null;
      if (graceNueva || (dbNueva && dbNueva > (dbActual || 0))) {
        const rr = await replay(db, { rules: [prueba], dIds, devs, siteCode: SITE, from, to, vars });
        const eps2 = episodios(rr.inst, r.ruleId);
        despues = eps2.length;
        perdidas = eps.filter((e) => (e.end == null ? to : e.end) - e.start > LARGO_MS)
          .filter((e) => !eps2.some((f) => f.start <= (e.end == null ? to : e.end) && (f.end == null ? to : f.end) >= e.start)).length;
      }
      const cambios = [];
      if (graceNueva) cambios.push(`espera ${Number(r.graceSec) || 0} s → ${graceNueva} s`);
      if (dbNueva && dbNueva > (dbActual || 0)) cambios.push(`histéresis ${dbActual || 0} → ${dbNueva}`);
      out.push({ ...comun, veredicto: 'avisa_de_mas', porque: `Avisa de más: ${motivos.join('; ')}.`,
        calculo: [`excursiones < 10 min: n = ${cortas.length}${p95 ? ` · p95 = ${Math.round(p95 / 1000)} s` : ''}`,
          stp && stp.sdRuido != null ? `σ_ruido = ${r2(stp.sdRuido, 4)} → histéresis ≥ 2σ = ${r2(2 * stp.sdRuido, 4)}${r.type !== 'D' ? ' (solo aplicable a reglas de umbral fijo)' : ''}` : null,
          despues != null ? `reproducido ${days} d: ${eps.length} → ${despues} avisos · fallas > 10 min perdidas: ${perdidas}` : null].filter(Boolean).join('\n'),
        cambio: cambios.length ? `${cambios.join(' y ')}.${despues != null ? ` Con ${days} días reproducidos: ${eps.length} → ${despues} avisos, ${perdidas ? `${perdidas} falla(s) real(es) perdida(s) — revisar` : 'ninguna falla real perdida'}.` : ''}` : 'Revisar la condición: los avisos no son excursiones cortas filtrables con espera.',
        propuesta: { graceSec: graceNueva, deadband: dbNueva && dbNueva > (dbActual || 0) ? dbNueva : null, antes: eps.length, despues, perdidas } });
      continue;
    }

    // ── sin avisos: inalcanzable / umbral a revisar / protección ──
    if (!eps.length) {
      if (thr != null && fisico && ((['gt', 'gte'].includes(op) && thr >= fisico[1]) || (['lt', 'lte'].includes(op) && thr <= fisico[0]))) {
        out.push({ ...comun, veredicto: 'inalcanzable', porque: `El umbral (${thr}) queda fuera del rango físico de la medición según la ficha (${fisico[0]} a ${fisico[1]}): nunca puede cumplirse.`,
          calculo: `${op} ${thr} con rango ${fisico[0]}–${fisico[1]}`, cambio: 'Corregir el umbral o atarlo al límite de la ficha.' });
        continue;
      }
      const z = thr != null && stp && stp.sd > 0 ? Math.abs(thr - stp.mean) / stp.sd : null;
      const fijoConFicha = r.type === 'D' && orig.condition && !orig.condition.limitRef && fv && (fv.limits || []).length;
      // Lejano solo es sospechoso con número propio: un límite de la ficha/controladora es del fabricante (protección).
      const deFicha = !!(orig.condition && orig.condition.limitRef);
      if ((z != null && z > 10 && !deFicha) || fijoConFicha) {
        out.push({ ...comun, veredicto: 'umbral_revisar',
          porque: [z != null && z > 10 ? `Alcanzable pero lejano: umbral ${thr}, medición ${r2(stp.min, 2)}–${r2(stp.max, 2)} (media ${r2(stp.mean, 2)}, σ ${r2(stp.sd, 3)}): está a ${r2(z, 1)} σ.` : null,
            fijoConFicha ? 'Usa un número fijo y la ficha tiene límite para esta medición: no sigue a la controladora ni a cada equipo.' : null].filter(Boolean).join(' '),
          calculo: z != null ? `z = |umbral − media| / σ = |${thr} − ${r2(stp.mean, 3)}| / ${r2(stp.sd, 3)} = ${r2(z, 1)}` : 'umbral fijo con límite en la ficha',
          cambio: fijoConFicha ? 'Atar el umbral a la ficha («Usar el umbral de la ficha» en el editor).' : 'Revisar si el umbral corresponde a esta instalación.' });
        continue;
      }
      out.push({ ...comun, veredicto: 'proteccion', porque: `Sin avisos en ${days} días porque la condición no se dio${fisico && thr != null ? `; es alcanzable: rango físico ${fisico[0]}–${fisico[1]}, umbral ${thr}` : ''}${stp ? `, máximo observado ${r2(stp.max, 2)}, mínimo ${r2(stp.min, 2)}` : ''}.`,
        calculo: `en condición ${r2(pctCond, 2) ?? 0} % del tiempo${z != null ? ` · z = ${r2(z, 1)} σ` : ''}${deFicha ? ' · umbral del fabricante (ficha / controladora)' : ''}`, cambio: 'Ninguno. Probarla con un escenario del simulador.' });
      continue;
    }

    out.push({ ...comun, veredicto: 'sana', porque: `${eps.length} aviso(s) en ${days} días (${r2(perDay, 2)}/día), sin parpadeo; duración mediana ${r2(pctl(durs, 0.5) / MIN, 1) ?? '—'} min.`,
      calculo: `en condición ${r2(pctCond, 2)} % del tiempo · episodios cortos ${r2(100 * shortShare, 0)} %`, cambio: 'Ninguno.' });
  }
  const orden = { avisa_de_mas: 0, no_evalua: 1, inalcanzable: 2, umbral_revisar: 3, proteccion: 4, sana: 5 };
  out.sort((a, b) => orden[a.veredicto] - orden[b.veredicto] || (b.avisos || 0) - (a.avisos || 0));
  return { siteCode: SITE, computedAt: new Date(now), days, from, to, rows: base.rows, reglas: out, durationMs: Date.now() - t0,
    notas: ['Los avisos por «equipo que deja de reportar» no se reproducen (dependen del reloj real).'] };
}

module.exports = { ruleQuality, replay, episodios, parpadeos, rango };
