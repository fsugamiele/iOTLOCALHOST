// Banco de conformidad — B2 · reglas M (14 cálculos), en 3 grupos:
//   T · tendencia: slope · projection · acceleration
//   R · relación:  ratio · divergence · spread
//   A · el resto:  dutyCycle · cumulativeSince · stepJump · flatline · staleness · variance · baseline · accumulator
// Se ejecuta concatenado detrás de tools/banco/lib.js (lo orquesta banco.sh --b2):
//   cat tools/banco/lib.js tools/banco/b2.js | docker exec -i node node - --dId X --var V [--sp OTRA] [--only T,R,A]
// Para las M el banco usa espera y cierre de 10 s (GM/CM): las métricas cambian con cada muestra y
// con 30 s la serie de estímulo se volvería muy larga. Lo que se prueba es el ciclo, no el tiempo.

const GM = 10, CM = 10;

async function b2() {
  const only = (arg('only') || 'T,R,A').split(',');
  const want = (k) => only.includes(k);
  const dId = arg('dId'), V = arg('var');
  const dev = await db.collection('devices').findOne({ dId });
  if (!dev || dev.firmwareType !== 'wanomi-sim') throw new Error(`${dId} no es un equipo simulado`);
  const tpl = await db.collection('templates').findOne({ _id: new mongoose.Types.ObjectId(dev.templateId) });
  const floats = ((tpl && tpl.widgets) || []).filter((w) => w.variableType === 'float' && w.variable);
  const w = floats.find((x) => x.variable === V);
  if (!w) throw new Error(`${V} no es una variable float de ${dId}`);
  const SP = arg('sp') || (floats.find((x) => x.variable !== V) || {}).variable;
  const DT = dev.deviceType;
  const u = Math.max(1, 3 * (Number(w.deadband) || 0));
  log(`Banco B2 (M) sobre ${dId} (${DT}) · ${V} · segunda variable ${SP} · paso ${u} · espera/cierre ${GM}s`);
  await mqttCmd(dId, 'resume_publishing');

  const M = (ruleId, label, metric, extra) => ({ ...base(ruleId, label, 'M', DT), graceSec: GM, resolveGraceSec: CM,
    variable: V, unit: '', metric, ...extra });
  // serie: publica cada valor (alternando lo justo para que el simulador publique valores repetidos)
  const feed = async (vals, every) => { for (const v of vals) { await setVal(dId, V, v); await sleep(every); } };
  const flat = (center, n) => Array.from({ length: n }, (_, i) => center + (i % 2 ? u : 0));   // "constante" con ruido mínimo
  const caso = async (R, rule, estimulo, retorno, opts = {}) => {
    const key = `${R}:${opts.dId || dId}`;
    await setVal(dId, V, 50); await sleep(5);
    await putPack(opts.dt || DT, [rule]); await sleep(12);
    let s = now(); await estimulo();
    let ns = fires(await notifs(R, s)), ts = await trans(R, s);
    const f = ns[0];
    result(`${R}-1`, f ? 'VERDE' : 'ROJO', `${rule.label}: avisa cuando la métrica cruza el umbral`,
      `${steps(ts)} · aviso: ${f ? 'sí (métrica ' + (typeof f.value === 'number' ? +f.value.toFixed(3) : f.value) + ' vs ' + f.thresholdUsed + ')' : 'NO'}`);
    if (retorno) {
      s = now(); await retorno();
      const rs = resolves(await notifs(R, s)); ts = await trans(R, s); const row = await fsmRow(key);
      result(`${R}-2`, rs.length === 1 && !(row && row.alarmOpen) ? 'VERDE' : 'ROJO', `${rule.label}: cierra cuando la métrica vuelve`,
        `${steps(ts)} · cierres: ${rs.length} · etapa final ${row ? row.step : 'E1'}`);
    }
    return { key };
  };

  // ── T · tendencia ─────────────────────────────────────────────────────────
  if (want('T')) {
    // slope: pendiente > 5 u/min en 60 s (rampa de +10 cada 8 s ≈ 75/min)
    await caso('bM-slope', M('bM-slope', 'Banco M · tendencia (slope)', 'slope', { condition: { op: 'gt', value: 5 }, mWindow: { durationSec: 60, minSamples: 3 } }),
      () => feed([50, 60, 70, 80, 90, 100], 8), () => feed(flat(100, 10), 8));
    // T-E5 — serie rala: tras >60 s sin muestras, UNA muestra deja el buffer con < minSamples.
    {
      const R = 'bM-slope', key = `${R}:${dId}`;
      await sleep(65); const s = now(); await setVal(dId, V, 120); await sleep(6);
      const row = await fsmRow(key), ts = await trans(R, s);
      result('bM-slope-3', 'OBSERVADO', 'serie rala (menos de minSamples en la ventana) → ¿"Sin datos"?',
        `${steps(ts)} · etapa ${row ? row.step : 'E1 (sin fila)'}. Con report-by-exception una variable estable publica poco: la regla puede caer en "Sin datos" sin que el equipo haya dejado de reportar.`);
    }
    // projection: llega a 1000 en < 1 h (rampa +10/8 s)
    await caso('bM-proj', M('bM-proj', 'Banco M · proyección', 'projection', { condition: { op: 'lt', value: 1 }, unit: 'h', mParams: { target: 1000 }, mWindow: { durationSec: 60, minSamples: 3 } }),
      () => feed([50, 60, 70, 80, 90, 100], 8), () => feed(flat(100, 10), 8));
    // acceleration: 1ª mitad plana, 2ª mitad rampa → Δpendiente > 20
    await caso('bM-accel', M('bM-accel', 'Banco M · aceleración', 'acceleration', { condition: { op: 'gt', value: 20 }, mWindow: { durationSec: 80, minSamples: 6 } }),
      () => feed([...flat(50, 5), 65, 80, 95, 110], 8), () => feed(flat(110, 12), 8));
  }

  // ── R · relación y desbalance ─────────────────────────────────────────────
  if (want('R')) {
    if (!SP) result('bM-R', 'OBSERVADO', 'relación / diferencia', 'el equipo no tiene una segunda variable float');
    else {
      const two = async (a, b) => { await setVal(dId, SP, b); await setVal(dId, V, a); };
      await caso('bM-ratio', M('bM-ratio', 'Banco M · relación (ratio)', 'ratio', { condition: { op: 'gt', value: 2 }, inputs: [{ deviceType: DT, variable: V }, { deviceType: DT, variable: SP }] }),
        async () => { await two(150, 50); await sleep(GM + 12); }, async () => { await two(80, 50); await sleep(CM + 12); });
      await caso('bM-div', M('bM-div', 'Banco M · diferencia (divergence)', 'divergence', { condition: { op: 'gt', value: 20 }, inputs: [{ deviceType: DT, variable: V }, { deviceType: DT, variable: SP }] }),
        async () => { await two(90, 50); await sleep(GM + 12); }, async () => { await two(60, 50); await sleep(CM + 12); });
      // frescura: una entrada se congela > 180 s con la alarma abierta
      {
        const R = 'bM-div', key = `${R}:${dId}`;
        await two(95, 50); await sleep(GM + 12);
        const s = now(); log('   (espera 190 s sin publicar la segunda variable: frescura de las entradas)');
        for (let i = 0; i < 19; i++) { await setVal(dId, V, 95 + (i % 2 ? u : 0)); await sleep(10); }
        const row = await fsmRow(key), ts = await trans(R, s);
        result('bM-div-3', 'OBSERVADO', 'una entrada deja de llegar (> 180 s) con la alarma abierta',
          `${steps(ts)} · etapa ${row ? row.step : '—'} · abierta: ${row ? !!row.alarmOpen : false}`);
        await setVal(dId, SP, 50 + u); await setVal(dId, V, 60); await sleep(CM + 12);
      }
    }
    // spread: necesita ≥ 2 equipos simulados del mismo tipo en el sitio
    const sims = await db.collection('devices').find({ siteId: SITE, firmwareType: 'wanomi-sim' }).toArray();
    const byType = new Map(); for (const d of sims) byType.set(d.deviceType, [...(byType.get(d.deviceType) || []), d]);
    let grupo = null;
    for (const [t, ds] of byType) {
      if (ds.length < 2) continue;
      const tps = await Promise.all(ds.slice(0, 2).map((d) => db.collection('templates').findOne({ _id: new mongoose.Types.ObjectId(d.templateId) })));
      const vs = tps.map((t2) => new Set(((t2 && t2.widgets) || []).filter((x) => x.variableType === 'float').map((x) => x.variable)));
      const comun = [...vs[0]].find((x) => vs[1].has(x));
      if (comun) { grupo = { t, a: ds[0].dId, b: ds[1].dId, v: comun }; break; }
    }
    if (!grupo) result('bM-spread', 'OBSERVADO', 'desbalance entre equipos', 'no hay 2 equipos simulados del mismo tipo con una variable float en común');
    else {
      const R = 'bM-spread', { t, a, b, v } = grupo;
      log(`   desbalance sobre ${t}: ${a} y ${b} · ${v}`);
      const rule = { ...base(R, 'Banco M · desbalance (spread)', 'M', t), graceSec: GM, resolveGraceSec: CM, variable: v, metric: 'spread', condition: { op: 'gt', value: 20 } };
      await setVal(a, v, 50); await setVal(b, v, 52); await sleep(5);
      await putPack(t, [rule]); await sleep(12);
      let s = now(); await setVal(b, v, 90); await sleep(GM + 12);
      let ns = fires(await notifs(R, s));
      result('bM-spread-1', ns[0] && ns[0].dId === b ? 'VERDE' : 'ROJO', 'desbalance: avisa y señala al equipo que se aparta',
        ns[0] ? `aviso en ${ns[0].dId} (esperado ${b}) · métrica ${ns[0].value}` : 'sin aviso');
      // el culpable cambia de equipo con la alarma abierta
      s = now(); await setVal(b, v, 52); await setVal(a, v, 10); await sleep(GM + CM + 15);
      const all = await notifs(R, s); const rowB = await fsmRow(`${R}:${b}`);
      result('bM-spread-2', !(rowB && rowB.alarmOpen) ? 'VERDE' : 'ROJO', 'si el desbalance pasa a otro equipo, la alarma del primero se cierra',
        `avisos: ${fires(all).map((n) => n.dId).join(', ') || '—'} · cierres: ${resolves(all).map((n) => n.dId).join(', ') || '—'} · alarma de ${b} abierta: ${rowB ? !!rowB.alarmOpen : false}`);
      s = now(); await setVal(a, v, 51); await sleep(CM + 12);
      const rowA = await fsmRow(`${R}:${a}`), rowB2 = await fsmRow(`${R}:${b}`);
      const abiertas = [rowA && rowA.alarmOpen ? a : null, rowB2 && rowB2.alarmOpen ? b : null].filter(Boolean);
      result('bM-spread-3', !abiertas.length ? 'VERDE' : 'ROJO', 'sin desbalance: no queda ninguna alarma abierta',
        `${steps(await trans(R, s))} · abiertas: ${abiertas.join(', ') || 'ninguna'}`);
      await api('POST', '/simulator/reset', { dId: a }); await api('POST', '/simulator/reset', { dId: b });
    }
    await putPack(DT, []);
  }

  // ── A · el resto ──────────────────────────────────────────────────────────
  if (want('A')) {
    // dutyCycle: % activo (> 0) en 60 s
    await caso('bM-duty', M('bM-duty', 'Banco M · uso % (dutyCycle)', 'dutyCycle', { condition: { op: 'gt', value: 50 }, unit: '%', mWindow: { durationSec: 60, minSamples: 2 } }),
      async () => { await setVal(dId, V, 0); await sleep(5); await feed(flat(40, 6), 6); }, async () => { await feed(Array.from({ length: 12 }, (_, i) => (i % 2 ? 0 : -u)), 6); });
    // cumulativeSince: caída acumulada > 20, la recarga la reinicia
    await caso('bM-cum', M('bM-cum', 'Banco M · caída acumulada desde la recarga', 'cumulativeSince', { condition: { op: 'gt', value: 20 } }),
      async () => { await feed([100, 95, 90, 85, 80, 75], 5); await sleep(GM + 5); }, async () => { await feed([100], 1); await sleep(CM + 10); });
    // stepJump automático: salto ≥ 20 en un paso
    await caso('bM-jump', M('bM-jump', 'Banco M · salto abrupto', 'stepJump', { condition: { op: 'gte', value: 20 }, mWindow: { durationSec: 60, minSamples: 2 } }),
      async () => { await feed([50, 50 + u], 5); await setVal(dId, V, 80); await sleep(GM + 8); }, async () => { await feed([80 + u, 80, 80 + u], 5); await sleep(CM + 5); });
    // stepJump con cierre manual: tras normalizar espera confirmación (E6)
    {
      const R = 'bM-jumpM';
      const { key } = await caso(R, M(R, 'Banco M · salto abrupto (cierre manual)', 'stepJump', { condition: { op: 'gte', value: 20 }, mWindow: { durationSec: 60, minSamples: 2 }, reset_behavior: 'manual' }),
        async () => { await feed([50, 50 + u], 5); await setVal(dId, V, 80); await sleep(GM + 8); }, null);
      const s = now(); await feed([80 + u, 80, 80 + u], 5); await sleep(CM + 5);
      const row = await fsmRow(key);
      result(`${R}-2`, row && row.step === 'E6' && row.alarmOpen && !resolves(await notifs(R, s)).length ? 'VERDE' : 'ROJO',
        'salto con cierre manual: al normalizarse espera confirmación (no cierra sola)', `${steps(await trans(R, s))} · etapa ${row ? row.step : '—'}`);
    }
    // flatline: rango ≤ 0,5 en 60 s. Con report-by-exception un valor fijo NO se publica:
    // las muestras idénticas se fuerzan con snapshot (republica el estado actual).
    {
      const R = 'bM-flat';
      await caso(R, M(R, 'Banco M · sensor clavado', 'flatline', { condition: { op: 'lte', value: 0.5 }, mWindow: { durationSec: 60, minSamples: 3 } }),
        async () => { await setVal(dId, V, 70); for (let i = 0; i < 6; i++) { await sleep(6); await api('POST', '/simulator/snapshot', { dId }); } await sleep(GM); },
        async () => { await feed([70 + 3 * u, 70, 70 + 3 * u], 5); await sleep(CM + 5); });
      result(`${R}-3`, 'OBSERVADO', 'sensor clavado en un equipo real', 'con report-by-exception un sensor clavado no publica: solo llegan los latidos (cada 5 min). Con ventanas cortas la regla nunca junta muestras; hace falta ventana ≥ 3 latidos (15 min).');
    }
    // staleness: silencio ≥ 1 min (tick del motor cada 30 s)
    {
      const R = 'bM-stale', key = `${R}:${dId}`;
      await putPack(DT, [M(R, 'Banco M · deja de reportar', 'staleness', { condition: { op: 'gte', value: 1 }, unit: 'min' })]); await sleep(12);
      let s = now(); await mqttCmd(dId, 'stop_publishing'); log('   simulador: stop_publishing (100 s)'); await sleep(100);
      let ns = fires(await notifs(R, s));
      result(`${R}-1`, ns.length === 1 ? 'VERDE' : 'ROJO', 'deja de reportar > 1 min: avisa', `${steps(await trans(R, s))} · avisos: ${ns.length}`);
      s = now(); await mqttCmd(dId, 'resume_publishing'); await setVal(dId, V, 61); await sleep(CM + 40);
      const row = await fsmRow(key);
      result(`${R}-2`, resolves(await notifs(R, s)).length === 1 && !(row && row.alarmOpen) ? 'VERDE' : 'ROJO', 'vuelve a reportar: cierra', `${steps(await trans(R, s))}`);
    }
    // variance: σ > 10 en 60 s
    await caso('bM-var', M('bM-var', 'Banco M · lecturas inestables', 'variance', { condition: { op: 'gt', value: 10 }, mWindow: { durationSec: 60, minSamples: 3 } }),
      () => feed([50, 80, 45, 85, 40, 90], 5), () => feed(flat(60, 16), 6));
    // baseline: z > 3 tras madurar con valores estables
    await caso('bM-base', M('bM-base', 'Banco M · fuera de lo normal', 'baseline', { condition: { op: 'gt', value: 3 }, mWindow: { durationSec: 120, minSamples: 8 } }),
      async () => { await feed(flat(60, 16), 5); await setVal(dId, V, 60 + 20 * u); await sleep(GM + 8); }, () => feed(flat(60, 4), 5));
    // accumulator: horas acumuladas ≥ 0,01 h (36 s) → service cierra y pone a 0
    {
      const R = 'bM-acc', key = `${R}:${dId}`;
      await caso(R, M(R, 'Banco M · acumulador (vida útil)', 'accumulator', { condition: { op: 'gte', value: 0.01 }, unit: 'h', reset_behavior: 'manual' }),
        () => feed(flat(60, 10), 6), null);
      const fire = fires(await notifs(R, now() - 120e3))[0];
      if (fire) {
        const s = now(); const r = await api('POST', `/site/${dev.siteId}/alarms/${fire._id}/service`, {}); await sleep(8);
        const row = await fsmRow(key); const rs = resolves(await notifs(R, s));
        await sleep(35); const acc = await db.collection('msoftstate').findOne({ siteId: SITE, ruleId: R, dId }).catch(() => null);   // flush periódico del acumulado
        result(`${R}-2`, r.status === 200 && rs.some((n) => n.mode === 'resolve-by-service') && !(row && row.alarmOpen) ? 'VERDE' : 'ROJO',
          '"Registrar service" cierra la alarma y pone el acumulado en 0', `API ${r.status} · cierre: ${rs.map((n) => n.mode).join(', ') || 'no'} · acumulado guardado: ${acc ? acc.acc : '—'}`);
      } else result(`${R}-2`, 'ROJO', 'service', 'no hubo alarma para registrar el service');
    }
    await putPack(DT, []);
  }

  await api('POST', '/simulator/reset', { dId });
  log('Limpieza: pack de banco vacío y simulador reseteado.');
  informe('INFORME B2 · reglas M');
}

(async () => {
  await connect();
  db = getDb();
  try { await b2(); }
  catch (err) {
    console.error('ERROR:', err.message);
    try { const d0 = await db.collection('devices').findOne({ dId: arg('dId') }); if (d0) await putPack(d0.deviceType, []); await api('POST', '/simulator/reset', { dId: arg('dId') }); log('Limpieza tras el error.'); } catch (_) {}
    close(); process.exit(1);
  }
  close(); process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
