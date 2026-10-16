// Banco de conformidad — B1 · núcleo de alarmas: D con umbral de ficha (DF), S (N veces en T),
// C (vs setpoint del equipo, con respaldo) y cross (plana y anidada).
// Se ejecuta CONCATENADO detrás de tools/banco/lib.js (el contenedor node no monta tools/):
//   cat tools/banco/lib.js tools/banco/b1.js | docker exec -i node node - --dId XXXXXXXX --var V [--sp OTRA] [--T 100]
// Lo orquesta tools/banco/banco.sh --b1.

async function b1() {
  const only = (arg('only') || 'DF,S,C,X').split(',');
  const want = (k) => only.includes(k);
  const dId = arg('dId'), V = arg('var');
  const dev = await db.collection('devices').findOne({ dId });
  if (!dev || dev.firmwareType !== 'wanomi-sim') throw new Error(`${dId} no es un equipo simulado`);
  const tpl = await db.collection('templates').findOne({ _id: new mongoose.Types.ObjectId(dev.templateId) });
  const floats = ((tpl && tpl.widgets) || []).filter((w) => w.variableType === 'float' && w.variable);
  const w = floats.find((x) => x.variable === V);
  if (!w) throw new Error(`${V} no es una variable float de ${dId}`);
  const SP = arg('sp') || (floats.find((x) => x.variable !== V) || {}).variable;
  if (!SP) throw new Error('el equipo necesita una segunda variable float (--sp) para C y cross');
  const wsp = floats.find((x) => x.variable === SP);
  const DT = dev.deviceType;
  const u = Math.max(1, 3 * (Number(w.deadband) || 0), 3 * (Number(wsp && wsp.deadband) || 0));
  const T = Number(arg('T', 100));
  const lo = T - 3 * u, hi = T + 3 * u, hi2 = T + 5 * u;
  log(`Banco B1 sobre ${dId} (${DT}) · valor ${V} · segunda variable ${SP} · umbral ${T} · paso ${u}`);
  await mqttCmd(dId, 'resume_publishing');
  await setVal(dId, V, lo); await setVal(dId, SP, lo); await sleep(8);

  // ── DF · D con umbral de FICHA (cascada ficha → regla) ─────────────────────
  if (want('DF')) {
    const R = 'banco-DF', key = `${R}:${dId}`;
    const sh = await api('GET', `/equipmentsheet/${DT}`);
    const sheet = sh.json && (sh.json.data || sh.json);
    const vars0 = JSON.parse(JSON.stringify((sheet && sheet.variables) || []));
    const libre = (x) => ['trip', 'warning'].find((k) => !(x.limits || []).some((l) => l.kind === k && ['gt', 'gte'].includes(l.op)));
    const candidatas = [V, ...floats.map((f) => f.variable).filter((n) => n !== V)];
    const VF = candidatas.find((n) => { const x = vars0.find((y) => y.name === n); return x && libre(x); });
    const vv = VF ? vars0.find((y) => y.name === VF) : null;
    const kind = vv ? libre(vv) : null;
    const resumen = candidatas.map((n) => { const x = vars0.find((y) => y.name === n); return `${n}: ${x ? (x.limits || []).map((l) => l.kind + ' ' + l.op + ' ' + l.value).join(', ') || 'sin límites' : 'NO está en la ficha'}`; }).join(' | ');
    if (!vv || !kind) {
      result('DF', 'OBSERVADO', 'D con umbral de ficha', `ninguna variable float del equipo está en la ficha ${DT} con un límite "gt" libre — no se toca. Ficha: ${resumen}`);
    } else {
      const setLimit = async (value) => {
        const vars = JSON.parse(JSON.stringify(vars0));
        const x = vars.find((y) => y.name === VF);
        x.limits = [...(x.limits || []).filter((l) => !(l.kind === kind && ['gt', 'gte'].includes(l.op))), { kind, op: 'gt', value, unit: x.unit, source: 'banco de conformidad (temporal)' }];
        const r = await api('PUT', `/equipmentsheet/${DT}`, { newEquipmentSheet: { variables: vars } });
        if (r.status !== 200) throw new Error(`PUT ficha → ${r.status} ${r.raw.slice(0, 200)}`);
        log(`   ficha ${DT}: límite ${kind} de ${VF} = ${value}`);
      };
      try {
        log(`   DF sobre ${VF} (límite ${kind} gt)`);
        await setVal(dId, VF, lo); await sleep(8);
        await setLimit(T);
        await putPack(DT, [{ ...base(R, 'Banco · umbral de ficha (DF)', 'D', DT), variable: VF, unit: vv.unit || '', condition: { limitRef: kind, op: 'gt', deadband: 2 * u } }]);
        await sleep(15);
        let s = now(); await setVal(dId, VF, hi); await sleep(GRACE + 15);
        let ns = fires(await notifs(R, s));
        result('DF1', ns[0] && Number(ns[0].thresholdUsed) === T ? 'VERDE' : 'ROJO', 'dispara con el umbral que dice la ficha',
          ns[0] ? `aviso con umbral ${ns[0].thresholdUsed} (ficha ${T})` : 'sin aviso');
        s = now(); await setLimit(T + 10 * u); await sleep(20);
        let all = await notifs(R, s); let row = await fsmRow(key);
        result('DF2', resolves(all).some((n) => n.mode === 'resolve-by-edit') && !(row && row.alarmOpen) ? 'VERDE' : 'ROJO',
          `subir el límite en la ficha (${T + 10 * u}) con la alarma abierta: cierra por edición y queda vigilando`,
          `cierres: ${resolves(all).map((n) => n.mode).join(', ') || 'ninguno'} · ${steps(await trans(R, s))} · abierta: ${row ? !!row.alarmOpen : false}`);
        s = now(); await setLimit(T - u); await sleep(GRACE + 20);
        all = await notifs(R, s); row = await fsmRow(key);
        const f3 = fires(all)[0];
        result('DF3', f3 && Number(f3.thresholdUsed) === T - u && row && row.alarmOpen ? 'VERDE' : 'ROJO',
          `bajar el límite en la ficha (${T - u}) con el valor arriba: repite el proceso y avisa con el umbral nuevo`,
          `${steps(await trans(R, s))} · aviso: ${f3 ? 'sí (umbral ' + f3.thresholdUsed + ')' : 'no'}`);
      } finally {
        await putPack(DT, []);                         // primero sacar la regla (la ficha no deja borrar un límite en uso)
        const r = await api('PUT', `/equipmentsheet/${DT}`, { newEquipmentSheet: { variables: vars0 } });
        log(`   ficha ${DT} restaurada → ${r.status}`);
        await setVal(dId, VF, lo); await sleep(8);
      }
    }
  }

  // ── S · N veces en T ───────────────────────────────────────────────────────
  if (want('S')) {
    const R = 'banco-S', key = `${R}:${dId}`, N = 3, WIN = 60;
    await putPack(DT, [{ ...base(R, 'Banco · N veces en T (S)', 'S', DT), variable: V, unit: w.unit || '',
      window: { durationSec: WIN, countThreshold: N, matchCondition: { op: 'gt', value: T } } }]);
    await sleep(15);
    let s = now();
    await setVal(dId, V, hi); await sleep(5); await setVal(dId, V, lo); await sleep(5); await setVal(dId, V, hi2); await sleep(GRACE + 10);
    let ts = await trans(R, s), ns = fires(await notifs(R, s));
    result('S1', !ns.length && !ts.some((t) => t.to === 'E3') ? 'VERDE' : 'ROJO', `${N - 1} veces en ${WIN}s no alcanza: no avisa`, `${steps(ts)} · avisos: ${ns.length}`);
    await setVal(dId, V, lo); await sleep(WIN + 5);              // vaciar la ventana
    s = now();
    for (const v of [hi, hi2, hi]) { await setVal(dId, V, v); await sleep(5); }
    await sleep(GRACE + 10);
    ts = await trans(R, s); ns = fires(await notifs(R, s));
    result('S2', ns.length === 1 && Number(ns[0].thresholdUsed) === N ? 'VERDE' : 'ROJO', `${N} veces en ${WIN}s: avisa una vez tras la espera`,
      `${steps(ts)} · avisos: ${ns.length}${ns[0] ? ' (umbral ' + ns[0].thresholdUsed + ')' : ''}`);
    // S3 (decisión A, spec_grafcet_g1d) — un valor normal NO cierra mientras queden N en la
    // ventana; cierra cuando la ventana baja de N (y pasa el tiempo de cierre).
    s = now(); await setVal(dId, V, lo); await sleep(20);
    let row3 = await fsmRow(key); let rs = resolves(await notifs(R, s));
    result('S3a', row3 && row3.alarmOpen && !rs.length ? 'VERDE' : 'ROJO', `un valor normal con ${N} coincidencias todavía en la ventana: la alarma sigue`,
      `${steps(await trans(R, s))} · abierta: ${row3 ? !!row3.alarmOpen : false} · cierres: ${rs.length}`);
    await sleep(WIN + CLOSE);
    ts = await trans(R, s); rs = resolves(await notifs(R, s)); row3 = await fsmRow(key);
    result('S3b', rs.length === 1 && !(row3 && row3.alarmOpen) ? 'VERDE' : 'ROJO', `cuando quedan menos de ${N} en la ventana, cierra tras el tiempo de cierre`,
      `${steps(ts)} · cierres: ${rs.length}`);
    // S4 — sin valores nuevos, la ventana se vacía sola: ¿alguien la reevalúa?
    s = now(); await setVal(dId, V, hi); await sleep(5); await setVal(dId, V, hi2); await sleep(5); await setVal(dId, V, hi); await sleep(GRACE + 10);
    const abierta = (await fsmRow(key)) || {};
    s = now(); await sleep(WIN + CLOSE + 10);                     // nadie publica: la ventana se vacía
    ts = await trans(R, s); rs = resolves(await notifs(R, s));
    result('S4', abierta.alarmOpen && rs.length ? 'VERDE' : abierta.alarmOpen ? 'ROJO' : 'OBSERVADO',
      'sin valores nuevos, cuando la ventana se vacía la alarma cierra sola',
      `alarma abierta al empezar: ${!!abierta.alarmOpen} · ${WIN + CLOSE + 10}s sin publicar: ${steps(ts)} · cierres: ${rs.length}.`);
    await putPack(DT, []); await setVal(dId, V, lo); await sleep(8);
  }

  // ── C · contra el setpoint del equipo (SP) + respaldo D ────────────────────
  if (want('C')) {
    const R = 'banco-C', key = `${R}:${dId}`;
    const ruleC = (spVar) => ({ ...base(R, 'Banco · vs setpoint (C)', 'C', DT), variable: V, unit: w.unit || '',
      condition: { op: 'gt', value: T }, setpointSource: { variable: spVar }, fallbackToD: true, on_missing_ref: 'ignore' });
    await setVal(dId, SP, T); await sleep(5);
    await putPack(DT, [ruleC(SP)]); await sleep(15);
    let s = now(); await setVal(dId, V, hi); await sleep(GRACE + 15);
    let ns = fires(await notifs(R, s));
    result('C1', ns[0] && ns[0].mode === 'calibrated' && Number(ns[0].thresholdUsed) === T ? 'VERDE' : 'ROJO',
      `dispara contra el setpoint del equipo (${SP} = ${T})`, ns[0] ? `modo ${ns[0].mode} · umbral ${ns[0].thresholdUsed}` : 'sin aviso');
    // C2 — cambia el SETPOINT con la alarma abierta, sin publicar el valor.
    s = now(); await setVal(dId, SP, T + 10 * u); await sleep(CLOSE + 15);
    let ts = await trans(R, s), rs = resolves(await notifs(R, s)), row = await fsmRow(key);
    result('C2', rs.length && !(row && row.alarmOpen) ? 'VERDE' : 'ROJO',
      `sube el setpoint (${T + 10 * u}) con la alarma abierta: rige al instante y la alarma pasa a cierre`,
      `${steps(ts)} · cierres: ${rs.length} · abierta: ${row ? !!row.alarmOpen : false}`);
    // C3 — llega el valor: con el setpoint nuevo, cierra.
    s = now(); await setVal(dId, V, hi2); await sleep(CLOSE + 15);
    ts = await trans(R, s); rs = resolves(await notifs(R, s)); row = await fsmRow(key);
    result('C3', !(row && row.alarmOpen) ? 'VERDE' : 'ROJO', 'con el siguiente valor rige el setpoint nuevo y la alarma cierra',
      `${steps(ts)} · cierres: ${rs.length} · abierta: ${row ? !!row.alarmOpen : false}`);
    // C4 — sin setpoint (variable que el equipo no publica): respaldo D + aviso informativo.
    await setVal(dId, V, lo); await sleep(8);
    s = now();
    await putPack(DT, [ruleC('banco_setpoint_inexistente')]); await sleep(15);
    await setVal(dId, V, hi); await sleep(GRACE + 15);
    const all = await notifs(R, s); ns = fires(all);
    const info = all.filter((n) => n.severity === 'info');
    result('C4', ns[0] && ns[0].mode === 'fallback' && Number(ns[0].thresholdUsed) === T ? 'VERDE' : 'ROJO',
      'sin setpoint disponible usa el umbral de respaldo y lo informa',
      `${ns[0] ? 'modo ' + ns[0].mode + ' · umbral ' + ns[0].thresholdUsed : 'sin aviso'} · avisos informativos "setpoint no disponible": ${info.length}`);
    await putPack(DT, []); await setVal(dId, V, lo); await sleep(8);
  }

  // ── cross · combinadas (instancia por SITIO) ───────────────────────────────
  if (want('X')) {
    const mismos = await db.collection('devices').countDocuments({ siteId: SITE, deviceType: DT });
    if (mismos > 1) {
      result('X0', 'OBSERVADO', 'hoja cross con varios equipos del mismo tipo',
        `el sitio tiene ${mismos} equipos ${DT}: cada hoja lee el PRIMER equipo de ese tipo que encuentra (no se elige cuál). El banco puede leer otro equipo.`);
    }
    const leaf = (variable, op, value) => ({ deviceType: DT, variable, condition: { op, value } });
    const R1 = 'banco-X1', R2 = 'banco-X2', sc = dev.siteId;
    // X1 · plana: V>T Y SP>T
    await putPack(DT, [{ ...base(R1, 'Banco · combinada plana (X1)', 'cross', DT), variable: V, crossExpr: { op: 'AND', children: [leaf(V, 'gt', T), leaf(SP, 'gt', T)] } }]);
    await sleep(15);
    let s = now(); await setVal(dId, V, hi); await sleep(GRACE + 10);
    let ns = fires(await notifs(R1, s));
    result('X1a', !ns.length ? 'VERDE' : 'ROJO', 'una sola condición de dos (Y): no avisa', `avisos: ${ns.length} · ${steps(await trans(R1, s))}`);
    s = now(); await setVal(dId, SP, hi); await sleep(GRACE + 15);
    ns = fires(await notifs(R1, s));
    result('X1b', ns.length === 1 ? 'VERDE' : 'ROJO', 'las dos condiciones: avisa una vez tras la espera', `avisos: ${ns.length} · ${steps(await trans(R1, s))}`);
    s = now(); await setVal(dId, SP, lo); await sleep(CLOSE + 15);
    let rs = resolves(await notifs(R1, s)), row = await fsmRow(`${R1}:${sc}`);
    result('X1c', rs.length === 1 && !(row && row.alarmOpen) ? 'VERDE' : 'ROJO', 'cae una condición: cierra tras el tiempo de cierre',
      `cierres: ${rs.length} · ${steps(await trans(R1, s))}`);
    await setVal(dId, V, lo); await sleep(8);
    // X2 · anidada: (V>T Y SP>T) O V>T+10u
    const big = T + 10 * u;
    await putPack(DT, [{ ...base(R2, 'Banco · combinada anidada (X2)', 'cross', DT), variable: V,
      crossExpr: { op: 'OR', children: [{ op: 'AND', children: [leaf(V, 'gt', T), leaf(SP, 'gt', T)] }, leaf(V, 'gt', big)] } }]);
    await sleep(15);
    s = now(); await setVal(dId, V, big + 2 * u); await sleep(GRACE + 15);
    ns = fires(await notifs(R2, s));
    result('X2a', ns.length === 1 ? 'VERDE' : 'ROJO', `rama O sola (${V} > ${big}): avisa`, `avisos: ${ns.length} · ${steps(await trans(R2, s))}`);
    s = now(); await setVal(dId, SP, hi); await setVal(dId, V, hi); await sleep(CLOSE + 10);
    rs = resolves(await notifs(R2, s));
    result('X2b', !rs.length ? 'VERDE' : 'ROJO', 'pasa de una rama a la otra sin hueco: sigue la misma alarma', `cierres: ${rs.length} · ${steps(await trans(R2, s))}`);
    s = now(); await setVal(dId, V, lo); await sleep(CLOSE + 15);
    rs = resolves(await notifs(R2, s)); row = await fsmRow(`${R2}:${sc}`);
    result('X2c', rs.length === 1 && !(row && row.alarmOpen) ? 'VERDE' : 'ROJO', 'no se cumple ninguna rama: cierra',
      `cierres: ${rs.length} · ${steps(await trans(R2, s))}`);
    await putPack(DT, []);
  }

  await api('POST', '/simulator/reset', { dId });
  log('Limpieza: pack de banco vacío, ficha restaurada, simulador reseteado.');
  informe('INFORME B1 · núcleo (DF · S · C · cross)', ['DF', 'DF1', 'DF2', 'DF3', 'S1', 'S2', 'S3a', 'S3b', 'S4', 'C1', 'C2', 'C3', 'C4', 'X0', 'X1a', 'X1b', 'X1c', 'X2a', 'X2b', 'X2c']);
}

(async () => {
  await connect();
  db = getDb();
  try { await b1(); }
  catch (err) {
    console.error('ERROR:', err.message);
    try { const d0 = await db.collection('devices').findOne({ dId: arg('dId') }); if (d0) await putPack(d0.deviceType, []); await api('POST', '/simulator/reset', { dId: arg('dId') }); log('Limpieza tras el error: pack de banco vacío y simulador reseteado.'); } catch (_) {}
    close(); process.exit(1);
  }
  close(); process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
