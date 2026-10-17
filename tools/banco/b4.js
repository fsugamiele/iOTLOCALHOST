// Banco de conformidad — B4 · reglas COMBINADAS (spec_reglas_compuestas, DEC-REF-151).
// Se ejecuta concatenado detrás de tools/banco/lib.js (lo orquesta banco.sh --b4):
//   cat tools/banco/lib.js tools/banco/b4.js | docker exec -i node node - --dId X --var V [--sp OTRA] [--only A,B,C]
//   A · lógica en un equipo: bK-1/2/3/4/5/6/11   B · varios equipos: bK-7/8   C · setpoint, vida útil, límites: bK-9/10/12
// Espera y cierre de 10 s (como B2). El banco solo observa: transiciones, notificaciones y rulefsm.

const GK = 10, CK = 10;

async function b4() {
  const only = (arg('only') || 'A,B,C').split(',');
  const want = (k) => only.includes(k);
  const dId = arg('dId'), V = arg('var');
  const dev = await db.collection('devices').findOne({ dId });
  if (!dev || dev.firmwareType !== 'wanomi-sim') throw new Error(`${dId} no es un equipo simulado`);
  const tpl = await db.collection('templates').findOne({ _id: new mongoose.Types.ObjectId(dev.templateId) });
  const floats = ((tpl && tpl.widgets) || []).filter((w) => w.variableType === 'float' && w.variable);
  if (!floats.find((x) => x.variable === V)) throw new Error(`${V} no es una variable float de ${dId}`);
  const SP = arg('sp') || (floats.find((x) => x.variable !== V && !/setpoint/i.test(x.variable)) || {}).variable;
  if (!SP) throw new Error('hace falta una segunda variable float (--sp)');
  const DT = dev.deviceType;
  log(`Banco B4 (combinadas) sobre ${dId} (${DT}) · ${V} · segunda variable ${SP} · espera/cierre ${GK}s`);
  await mqttCmd(dId, 'resume_publishing');

  // Regla combinada de banco. `variable` raíz = la de la primera condición (el schema la exige).
  const K = (ruleId, label, crossExpr, extra = {}) => ({ ...base(ruleId, label, 'cross', extra.dt || DT), graceSec: GK, resolveGraceSec: CK,
    variable: firstVar(crossExpr), crossExpr, ...extra, dt: undefined });
  const firstVar = (n) => (n.children ? firstVar(n.children[0]) : n.variable);
  const val = (leafId, variable, op, value, more = {}) => ({ leafId, deviceType: more.dt || DT, variable, condition: { op, value }, ...more, dt: undefined });
  const met = (leafId, variable, metric, op, value, more = {}) => ({ leafId, deviceType: DT, variable, measure: 'metric', metric, condition: { op, value }, ...more });
  const key = (R, x) => `${R}:${x || dId}`;
  const shot = async (R, k) => { const row = await fsmRow(k); return row ? `${row.step}${row.alarmOpen ? ' (abierta)' : ''}` : 'E1 (sin fila)'; };
  const start = async (R, rule, pre) => { await setVal(dId, V, 50); await setVal(dId, SP, 50); if (pre) await pre(); await sleep(5); await putPack(rule._dt || DT, [rule]); await sleep(12); };

  // ── A · lógica en un equipo ────────────────────────────────────────────────
  if (want('A')) {
    // bK-1 · Y de valor + tendencia (ancla) · bK-11 foto del disparo
    {
      const R = 'bK-1';
      const rule = K(R, 'Banco K · valor Y tendencia', { op: 'AND', children: [
        val('L1', V, 'gt', 80), met('L2', SP, 'slope', 'gt', 5, { mWindow: { durationSec: 60, minSamples: 3 } })] }, { scope: { deviceType: DT } });
      await start(R, rule);
      let s = now(); await setVal(dId, V, 90);
      for (const x of [50, 60, 70, 80, 90]) { await setVal(dId, SP, x); await sleep(8); }
      await sleep(GK + 5);
      const f = fires(await notifs(R, s))[0];
      result('bK-1a', f ? 'VERDE' : 'ROJO', 'Y de valor + tendencia: avisa con las dos', `${steps(await trans(R, s))} · etapa ${await shot(R, key(R))}`);
      const ls = (f && f.leaves) || [];
      result('bK-11', ls.length === 2 && ls.every((l) => l.state === 'si' && l.leafId) ? 'VERDE' : 'ROJO', 'la notificación trae la foto del disparo (cada condición con valor, umbral y estado)',
        ls.map((l) => `${l.leafId}=${l.state} (${typeof l.value === 'number' ? +l.value.toFixed(2) : l.value} vs ${l.threshold})`).join(' · ') || 'sin leaves');
      s = now(); await setVal(dId, V, 60); await sleep(CK + 12);
      const rs = resolves(await notifs(R, s));
      result('bK-1b', rs.length === 1 ? 'VERDE' : 'ROJO', 'cae una condición (valor): cierra', `${steps(await trans(R, s))} · cierres ${rs.length}`);
    }
    // bK-3 · tendencia juntando muestras + valor que se cumple (Y): no decide
    {
      const R = 'bK-3';
      const rule = K(R, 'Banco K · juntando muestras', { op: 'AND', children: [
        val('L1', V, 'gt', 80), met('L2', SP, 'slope', 'gt', 5, { mWindow: { durationSec: 600, minSamples: 200 } })] }, { scope: { deviceType: DT } });
      await start(R, rule);
      const s = now(); await setVal(dId, V, 90); await sleep(GK + 15);
      const ts = await trans(R, s);
      result('bK-3', !ts.some((t) => t.to === 'E3' || t.to === 'E5') ? 'VERDE' : 'ROJO', 'una condición juntando muestras en un Y: no decide (ni aviso ni "Sin datos")', `${steps(ts)} · etapa ${await shot(R, key(R))}`);
    }
    // bK-2 · O de valor + proyección (la proyección todavía juntando)
    {
      const R = 'bK-2';
      const rule = K(R, 'Banco K · valor O proyección', { op: 'OR', children: [
        val('L1', V, 'gt', 80), met('L2', SP, 'projection', 'lt', 1, { mParams: { target: 1000 }, mWindow: { durationSec: 600, minSamples: 200 } })] }, { scope: { deviceType: DT } });
      await start(R, rule);
      const s = now(); await setVal(dId, V, 90); await sleep(GK + 10);
      result('bK-2', fires(await notifs(R, s)).length ? 'VERDE' : 'ROJO', 'O: alcanza con una condición aunque la otra esté juntando', `${steps(await trans(R, s))}`);
    }
    // bK-4 · una entrada deja de llegar con la alarma abierta → Sin datos; vuelve · bK-5 un "no" cierra igual
    {
      const R = 'bK-4';
      const rule = K(R, 'Banco K · frescura', { op: 'AND', children: [val('L1', V, 'gt', 80), val('L2', SP, 'gt', 40, { freshnessSec: 60 })] }, { scope: { deviceType: DT } });
      await start(R, rule);
      let s = now(); await setVal(dId, V, 90); await sleep(GK + 10);
      const abrió = fires(await notifs(R, s)).length > 0;
      log(`   simulador: mute_sensor ${SP} — 75 s sin esa entrada`);
      await mqttCmd(dId, 'mute_sensor', { sensor: SP });
      for (let i = 0; i < 8; i++) { await setVal(dId, V, 90 + (i % 2)); await sleep(10); }
      let row = await fsmRow(key(R));
      result('bK-4a', abrió && row && row.step === 'E5' && row.alarmOpen ? 'VERDE' : 'ROJO', 'una entrada deja de llegar con la alarma abierta: "Sin datos", sigue abierta', `aviso: ${abrió} · etapa ${await shot(R, key(R))}`);
      await mqttCmd(dId, 'unmute_sensor', { sensor: SP }); await setVal(dId, SP, 51); await sleep(15);
      row = await fsmRow(key(R));
      result('bK-4b', row && row.step === 'E3' && row.alarmOpen ? 'VERDE' : 'ROJO', 'vuelve el dato: vuelve a "Alarma" sin un aviso nuevo', `etapa ${await shot(R, key(R))} · avisos ${fires(await notifs(R, s)).length}`);
      await mqttCmd(dId, 'mute_sensor', { sensor: SP });
      for (let i = 0; i < 8; i++) { await setVal(dId, V, 90 + (i % 2)); await sleep(10); }
      s = now(); await setVal(dId, V, 60); await sleep(CK + 12);
      const rs = resolves(await notifs(R, s));
      result('bK-5', rs.length === 1 ? 'VERDE' : 'ROJO', 'un "no" en un Y cierra aunque la otra condición esté sin dato', `${steps(await trans(R, s))} · cierres ${rs.length}`);
      await mqttCmd(dId, 'unmute_sensor', { sensor: SP });
    }
    // bK-6 · evento (salto) + valor: dentro / fuera de holdSec (30 s en el banco)
    {
      const R = 'bK-6';
      const rule = K(R, 'Banco K · salto + valor', { op: 'AND', children: [
        met('L1', V, 'stepJump', 'gte', 20, { mWindow: { durationSec: 60, minSamples: 2 }, mParams: { holdSec: 30 } }), val('L2', SP, 'gt', 40)] }, { scope: { deviceType: DT } });
      await start(R, rule);
      let s = now(); await setVal(dId, V, 51); await sleep(5); await setVal(dId, V, 80); await sleep(GK + 5);
      result('bK-6a', fires(await notifs(R, s)).length ? 'VERDE' : 'ROJO', 'salto con la otra condición cumplida: avisa', steps(await trans(R, s)));
      await sleep(30 + CK + 10);
      const row = await fsmRow(key(R));
      result('bK-6b', !(row && row.alarmOpen) ? 'VERDE' : 'ROJO', 'pasados los 30 s del salto: se cierra sola', `etapa ${await shot(R, key(R))}`);
      await setVal(dId, SP, 30); await setVal(dId, V, 50); await sleep(8); await setVal(dId, V, 51); await sleep(5);
      s = now(); await setVal(dId, V, 80); await sleep(40); await setVal(dId, SP, 50); await sleep(GK + 10);
      result('bK-6c', !fires(await notifs(R, s)).length ? 'VERDE' : 'ROJO', 'la otra condición se cumple 40 s después del salto (fuera de los 30 s): no avisa', steps(await trans(R, s)));
    }
    await putPack(DT, []);
  }

  // ── B · varios equipos (ancla y "alguno/todos") ─────────────────────────────
  if (want('B')) {
    const sims = await db.collection('devices').find({ siteId: SITE, firmwareType: 'wanomi-sim' }).toArray();
    const byType = new Map(); for (const d of sims) byType.set(d.deviceType, [...(byType.get(d.deviceType) || []), d]);
    let g = null;
    for (const [t, ds] of byType) {
      if (ds.length < 2 || t === DT) continue;
      const tps = await Promise.all(ds.map((d) => db.collection('templates').findOne({ _id: new mongoose.Types.ObjectId(d.templateId) })));
      const sets = tps.map((t2) => new Set(((t2 && t2.widgets) || []).filter((x) => x.variableType === 'float').map((x) => x.variable)));
      const v = [...sets[0]].find((x) => sets.every((s2) => s2.has(x)));
      if (v) { g = { t, ids: ds.map((d) => d.dId), v }; break; }
    }
    if (!g) result('bK-7', 'OBSERVADO', 'varios equipos', 'no hay 2+ equipos simulados del mismo tipo (distinto de ' + DT + ') con una variable float en común');
    else {
      const { t, ids, v } = g;
      log(`   equipos ${t}: ${ids.join(', ')} · ${v}`);
      const setAll = async (vals) => { for (let i = 0; i < ids.length; i++) await setVal(ids[i], v, vals[i]); };
      // bK-7 · ancla con varios equipos: una alarma por equipo, cada condición mira el suyo
      {
        const R = 'bK-7';
        const rule = { ...K(R, 'Banco K · ancla por equipo', { op: 'AND', children: [val('L1', v, 'gt', 70, { dt: t })] }, { scope: { deviceType: t } }), deviceType: t, _dt: t };
        await setAll(ids.map(() => 50)); await sleep(5); await putPack(t, [rule]); await sleep(12);
        const s = now(); await setAll(ids.map((_, i) => (i === 0 ? 90 : 50))); await sleep(GK + 10);
        const rows = await Promise.all(ids.map((x) => fsmRow(key(R, x))));
        const ok = rows[0] && rows[0].alarmOpen && rows.slice(1).every((r) => !(r && r.alarmOpen));
        result('bK-7', ok ? 'VERDE' : 'ROJO', 'regla por equipo: alarma solo en el equipo que cumple', ids.map((x, i) => `${x}: ${rows[i] ? rows[i].step + (rows[i].alarmOpen ? ' abierta' : '') : 'E1'}`).join(' · ') + ` · avisos en ${fires(await notifs(R, s)).map((n) => n.dId).join(', ') || '—'}`);
      }
      // bK-8 · sin ancla: "alguno" vs "todos"
      {
        const any = { ...K('bK-8any', 'Banco K · alguno', { op: 'AND', children: [val('L1', v, 'gt', 70, { dt: t, pick: 'any' })] }), deviceType: t };
        const all = { ...K('bK-8all', 'Banco K · todos', { op: 'AND', children: [val('L1', v, 'gt', 70, { dt: t, pick: 'all' })] }), deviceType: t };
        await setAll(ids.map(() => 50)); await sleep(5); await putPack(t, [any, all]); await sleep(12);
        let s = now(); await setAll(ids.map((_, i) => (i === 0 ? 90 : 50))); await sleep(GK + 10);
        const a1 = fires(await notifs('bK-8any', s)).length, l1 = fires(await notifs('bK-8all', s)).length;
        result('bK-8a', a1 && !l1 ? 'VERDE' : 'ROJO', '"alguno": alcanza con un equipo · "todos": no alcanza', `alguno avisó: ${!!a1} · todos avisó: ${!!l1}`);
        s = now(); await setAll(ids.map(() => 90)); await sleep(GK + 10);
        result('bK-8b', fires(await notifs('bK-8all', s)).length ? 'VERDE' : 'ROJO', '"todos": con todos los equipos cumpliendo, avisa', steps(await trans('bK-8all', s)));
      }
      for (const x of ids) await api('POST', '/simulator/reset', { dId: x });
      await putPack(t, []);
    }
  }

  // ── C · setpoint, vida útil, límites ────────────────────────────────────────
  if (want('C')) {
    // bK-9 · respecto del setpoint (G1d · C2: el setpoint nuevo rige al instante)
    const spVar = (floats.find((x) => /setpoint/i.test(x.variable)) || {}).variable;
    if (!spVar) result('bK-9', 'OBSERVADO', 'respecto del setpoint', `${DT} no tiene una variable float de setpoint en su plantilla`);
    else {
      const R = 'bK-9';
      const rule = K(R, 'Banco K · respecto del setpoint', { op: 'AND', children: [
        { leafId: 'L1', deviceType: DT, variable: V, measure: 'setpoint', setpointSource: { variable: spVar }, condition: { op: 'gt', value: 1000 } }] }, { scope: { deviceType: DT } });
      await start(R, rule, () => setVal(dId, spVar, 90));
      let s = now(); await setVal(dId, spVar, 70); await setVal(dId, V, 80); await sleep(GK + 10);
      result('bK-9a', fires(await notifs(R, s)).length ? 'VERDE' : 'ROJO', `${V} 80 > setpoint ${spVar} 70 (no el respaldo 1000): avisa`, steps(await trans(R, s)));
      s = now(); await setVal(dId, spVar, 90); await sleep(CK + 12);
      result('bK-9b', resolves(await notifs(R, s)).length === 1 ? 'VERDE' : 'ROJO', 'sube el setpoint a 90: el umbral nuevo rige y cierra', steps(await trans(R, s)));
    }
    // bK-10 · vida útil dentro de un Y + "Registrar service"
    {
      const R = 'bK-10';
      const rule = K(R, 'Banco K · vida útil', { op: 'AND', children: [met('L1', V, 'accumulator', 'gte', 0.003), val('L2', SP, 'gt', 40)] }, { scope: { deviceType: DT }, reset_behavior: 'manual' });
      await start(R, rule);
      let s = now();
      for (let i = 0; i < 6; i++) { await setVal(dId, V, 60 + (i % 2)); await sleep(5); }
      await sleep(GK);
      const f = fires(await notifs(R, s))[0];
      result('bK-10a', f ? 'VERDE' : 'ROJO', 'vida útil acumulada ≥ umbral con la otra condición: avisa', steps(await trans(R, s)));
      if (f) {
        s = now(); const r = await api('POST', `/site/${dev.siteId}/alarms/${f._id}/service`, {}); await sleep(8);
        const rs = resolves(await notifs(R, s)); await sleep(35);
        const acc = await db.collection('msoftstate').findOne({ siteId: SITE, ruleId: `${R}#L1`, dId }).catch(() => null);
        result('bK-10b', r.status === 200 && rs.filter((n) => n.mode === 'resolve-by-service').length === 1 ? 'VERDE' : 'ROJO', '"Registrar service" cierra y pone la condición en 0',
          `API ${r.status}${r.status !== 200 ? ' ' + r.raw.slice(0, 120) : ''} · cierre: ${rs.map((n) => n.mode).join(', ') || 'no'} · acumulado guardado: ${acc ? acc.acc : '—'}`);
      }
    }
    // bK-12 · límites (la API rechaza)
    {
      const many = K('bK-12a', 'Banco K · 9 condiciones', { op: 'AND', children: Array.from({ length: 9 }, (_, i) => val(`L${i + 1}`, V, 'gt', 1)) });
      const m4 = K('bK-12b', 'Banco K · 4 métricas', { op: 'AND', children: Array.from({ length: 4 }, (_, i) => met(`M${i + 1}`, V, 'variance', 'gt', 1, { mWindow: { durationSec: 60, minSamples: 3 } })) });
      for (const [c, rule, que] of [['bK-12a', many, '9 condiciones'], ['bK-12b', m4, '4 métricas']]) {
        let st = 0, msg = '';
        try { await putPack(DT, [rule]); st = 200; } catch (err) { msg = err.message; st = /→ (\d+)/.test(msg) ? Number(RegExp.$1) : 0; }
        result(c, st === 400 ? 'VERDE' : 'ROJO', `la API rechaza una combinada con ${que}`, `PUT → ${st} · ${msg.replace(/^PUT pack → \d+ /, '').slice(0, 140)}`);
      }
    }
    await putPack(DT, []);
  }

  await api('POST', '/simulator/reset', { dId });
  log('Limpieza: pack de banco vacío y simulador reseteado.');
  informe('INFORME B4 · reglas combinadas');
}

(async () => {
  await connect();
  db = getDb();
  try { await b4(); }
  catch (err) {
    console.error('ERROR:', err.message);
    try { const d0 = await db.collection('devices').findOne({ dId: arg('dId') }); if (d0) await putPack(d0.deviceType, []); await api('POST', '/simulator/reset', { dId: arg('dId') }); log('Limpieza tras el error.'); } catch (_) {}
    close(); process.exit(1);
  }
  close(); process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
