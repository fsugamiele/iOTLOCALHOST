'use strict';
// spec_supervisor_confiabilidad_v2 §7 — pruebas del cálculo (sin Mongo):  node qa/test/reliability.test.js
const assert = require('assert');
const R = require('../lib/reliability');
const H = R.H;
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('  ✓', name); };
const cfg = { confidence: 0.90, slaRepairH: 4, confAltaN: 5, confMediaN: 2, completitudMin: 95,
  isaDays: 7, floodPerTen: 10, chatterN: 3, chatterSec: 60, staleH: 24 };

t('χ² contra tabla publicada (error < 0,1 %)', () => {
  const tabla = [[0.95, 1, 3.841], [0.95, 2, 5.991], [0.95, 4, 9.488], [0.95, 10, 18.307], [0.95, 20, 31.410],
    [0.95, 42, 58.124], [0.05, 2, 0.1026], [0.05, 8, 2.733], [0.05, 20, 10.851], [0.05, 40, 26.509],
    [0.975, 10, 20.483], [0.025, 10, 3.247], [0.99, 30, 50.892]];
  for (const [p, k, v] of tabla) { const x = R.chi2Inv(p, k); assert(Math.abs(x - v) / v < 1e-3, `χ²(${p};${k}) = ${x} ≠ ${v}`); }
});

t('IC del MTBF: n = 4, TO = 704,8 h → [77,0 ; 515,8] · n = 0 → solo cota 240,3 h', () => {
  const a = R.mtbfCI(704.8, 4); assert.strictEqual(+a.lo.toFixed(1), 77.0); assert.strictEqual(+a.hi.toFixed(1), 515.8);
  const b = R.mtbfCI(720, 0); assert.strictEqual(+b.lo.toFixed(1), 240.3); assert.strictEqual(b.hi, null);
});

t('cobertura del IC 90 % con λ conocido (2000 corridas, MTBF real 150 h, T 720 h)', () => {
  let rnd = 12345; const u = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  let dentro = 0; const N = 2000;
  for (let i = 0; i < N; i++) {
    let tt = 0, n = 0; for (;;) { tt += -150 * Math.log(1 - u()); if (tt > 720) break; n++; }
    const c = R.mtbfCI(720, n); if (c.lo <= 150 && (c.hi == null || c.hi >= 150)) dentro++;
  }
  assert(dentro / N >= 0.88, `cobertura ${dentro / N}`); console.log(`      cobertura = ${(100 * dentro / N).toFixed(1)} %`);
});

const ev = (ruleId, dId, kind, h, extra = {}) => ({ ruleId, dId, siteId: 'S1', kind, time: h * H, severity: 'critical', label: ruleId, ...extra });

t('episodios: aviso repetido se ignora; cierre en otro equipo se reconstruye (Qs3); cierre huérfano se cuenta', () => {
  const { episodes, huerfanos } = R.buildEpisodes([
    ev('A', 'd1', 'fire', 1), ev('A', 'd1', 'fire', 1.5), ev('A', 'd1', 'resolve', 2),
    ev('X', 'd1', 'fire', 3), ev('X', 'd2', 'resolve', 4),
    ev('B', 'd3', 'resolve', 5),
  ]);
  assert.strictEqual(episodes.length, 2); assert.strictEqual(episodes[1].reconstruida, true);
  assert.strictEqual(episodes[1].end, 4 * H); assert.strictEqual(huerfanos, 1);
});

t('superpuestos del mismo equipo = una falla; recorte a la ventana; abierta al final = censurada', () => {
  const { episodes } = R.buildEpisodes([ev('A', 'd', 'fire', -2), ev('B', 'd', 'fire', 1), ev('A', 'd', 'resolve', 2), ev('B', 'd', 'resolve', 3),
    ev('C', 'd', 'fire', 10)]);
  const f = R.failuresOf(episodes, 0, 12 * H);
  assert.strictEqual(f.length, 2); assert.strictEqual(f[0].start, 0); assert.strictEqual(f[0].end, 3 * H);
  assert.deepStrictEqual(f[0].causas, ['A', 'B']); assert.strictEqual(f[1].censurada, true); assert.strictEqual(f[1].end, 12 * H);
});

t('indicadores: MTTR solo con reconocimiento dentro del episodio (Qs2); Ai/Ao/M(4 h)/R', () => {
  const fallas = [
    { start: 10 * H, end: 13 * H, ackAt: 11 * H, censurada: false },   // resp 1 h, rep 2 h
    { start: 100 * H, end: 101 * H, ackAt: null, censurada: false },   // sin ack: n y Ao sí, MTTR no
  ];
  const r = R.indicators(fallas, 720, 99, cfg, 0);
  assert.strictEqual(r.n, 2); assert.strictEqual(r.nReconocidas, 1); assert.strictEqual(r.TO, 716);
  assert.strictEqual(r.mtbf, 358); assert.strictEqual(r.mttr, 2); assert.strictEqual(r.mrt, 1); assert.strictEqual(r.mdt, 2);
  assert.strictEqual(r.Ao, +(100 * 716 / 720).toFixed(3)); assert.strictEqual(r.Ai, +(100 * 358 / 360).toFixed(3));
  assert.strictEqual(r.M4, +(100 * (1 - Math.exp(-2))).toFixed(2)); assert.strictEqual(r.conf, 'media'); assert.strictEqual(r.Aa, null);
});

t('equipo sin fallas: nada infinito ni 100 % falso; R(7 d) solo como cota', () => {
  const r = R.indicators([], 720, 100, cfg, 0);
  for (const [k, v] of Object.entries(r)) assert(v === null || typeof v !== 'number' || isFinite(v), `${k} no finito`);
  assert.strictEqual(r.mtbf, null); assert.strictEqual(r.R24, null); assert.strictEqual(r.mtbf_lo, 240.3);
  assert.strictEqual(r.R168_cota, +(100 * Math.exp(-168 / R.mtbfCI(720, 0).lo)).toFixed(2)); assert.strictEqual(r.conf, 'baja');
});

t('confianza (D4)', () => {
  assert.strictEqual(R.confianza(5, 95, cfg), 'alta'); assert.strictEqual(R.confianza(5, 94.9, cfg), 'baja');
  assert.strictEqual(R.confianza(2, 99, cfg), 'media'); assert.strictEqual(R.confianza(1, 100, cfg), 'baja');
});

t('Crow-AMSAA: tasa constante → β ≈ 1; fallas que se aceleran → β > 1', () => {
  let rnd = 7; const u = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  const st = []; let tt = 0; for (;;) { tt += -5 * Math.log(1 - u()); if (tt > 2000) break; st.push(tt * H); }
  const b = R.crowBeta(st, 0, 2000); assert(b > 0.85 && b < 1.15, `β=${b}`);
  const acc = Array.from({ length: 30 }, (_, i) => Math.sqrt((i + 1) / 30) * 700 * H);
  assert(R.crowBeta(acc, 0, 720) > 1.5);
});

t('ISA-18.2: tasa, inundación, parpadeo, permanentes, top 10', () => {
  const t1 = 7 * 24 * H; const fires = [];
  for (let i = 0; i < 12; i++) fires.push(ev('F', 'd', 'fire', 50 + i / 120));        // 12 en 6 min → inundación
  fires.push(ev('C', 'd', 'fire', 10), ev('C', 'd', 'fire', 10 + 20 / 3600), ev('C', 'd', 'fire', 10 + 40 / 3600));  // parpadeo
  const eps = [{ start: 1 * H, end: 30 * H }, { start: 100 * H, end: null }];
  const r = R.isaLoad(fires, eps, t1, cfg);
  assert.strictEqual(r.total, 15); assert.strictEqual(r.max10, 12); assert.strictEqual(r.chattering, 2);
  assert.strictEqual(r.stale, 2); assert.strictEqual(r.top10, 100); assert.strictEqual(r.horas.length, 168);
  assert.strictEqual(r.flood_pct, +(100 / 1008).toFixed(3));
});

t('caídas del sitio: solo cuenta rectificadores callados con la plataforma viva', () => {
  const rect = new Set(), otros = new Set();
  for (let b = 0; b < 100; b++) { otros.add(b); if (b < 40 || b >= 46) rect.add(b); }   // 6 ventanas sin rectif.
  rect.delete(80); otros.delete(80);                                                    // plataforma caída: no cuenta
  const s = R.siteOutages(rect, otros, 0, 99);
  assert.strictEqual(s.caidas, 1); assert.strictEqual(s.downH, 0.5); assert.strictEqual(s.Ao, +(100 * (100 - 6) / 100).toFixed(3));
  assert.strictEqual(R.siteOutages(new Set(), otros, 0, 99), null);
});

t('rebotes (Qs8): la misma regla y equipo antes de 30 min = un episodio; otra regla u otro equipo no', () => {
  const e = (r, d, s, en) => ({ ruleId: r, dId: d, start: s * H, end: en == null ? null : en * H });
  const { episodes, rebotes } = R.mergeRebounds([e('A', 'd', 0, 1), e('A', 'd', 1.4, 2), e('A', 'd', 3, 4), e('B', 'd', 4.1, 5), e('A', 'x', 4.2, 5)], 30 * 60000);
  assert.strictEqual(rebotes, 1); assert.strictEqual(episodes.length, 4);
  assert.strictEqual(episodes[0].end, 2 * H); assert.strictEqual(episodes[0].rebotes, 1);
});

console.log(`\n${ok} pruebas OK`);
