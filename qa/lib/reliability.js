'use strict';
// spec_supervisor_confiabilidad_v2 (R1) — CÁLCULO de confiabilidad. Funciones PURAS: no tocan
// Mongo (eso vive en qa/checks/reliability.js). Todo lo que devuelven es número finito o null:
// un indicador que no se puede calcular es null, nunca Infinity/NaN (§0 de la spec).
//
//   D1 falla = episodio de regla crítica (aviso → cierre) del equipo; episodios superpuestos del
//      mismo equipo = UNA falla (la misma caída leída como un evento, no como alarmas sueltas).
//   D2 MTTR = reconocimiento → cierre · respuesta = aviso → reconocimiento · fuera de servicio = aviso → cierre.
//   D4 confianza alta n ≥ 5 y completitud ≥ 95 % · media n ≥ 2 · baja el resto.
//   Qs2 episodios sin reconocimiento: cuentan en n, fuera de servicio y Ao; no en MTTR/respuesta.
//   Qs3 cierre en otro equipo (antes del fix del 22/10): se empareja con el aviso abierto de la
//       misma regla en el sitio y se marca `reconstruida`.

const H = 3600000;

// ── χ² ─────────────────────────────────────────────────────────────────────────────────────
// Cuantil de χ² por inversión de la gamma incompleta regularizada (Numerical Recipes §6.2).
function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x; const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015; for (const ci of c) s += ci / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
function gammaP(a, x) {                      // P(a, x) regularizada inferior
  if (x <= 0) return 0;
  const gln = lnGamma(a);
  if (x < a + 1) {                           // serie
    let ap = a, sum = 1 / a, del = sum;
    for (let i = 0; i < 500; i++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, hh = d;   // fracción continua (Lentz) → Q
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; hh *= del; if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * hh;
}
// χ²(p; k): valor x tal que P(χ²_k ≤ x) = p. Bisección (robusta; 200 iteraciones sobran).
function chi2Inv(p, k) {
  if (!(p > 0 && p < 1) || !(k > 0)) return null;
  let lo = 0, hi = Math.max(10, k * 10);
  while (gammaP(k / 2, hi / 2) < p) hi *= 2;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (gammaP(k / 2, m / 2) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// IC bilateral del MTBF, ensayo truncado por tiempo. n = 0 → solo cota inferior (hi null).
function mtbfCI(TO, n, conf = 0.90) {
  if (!(TO > 0)) return { lo: null, hi: null };
  const a = 1 - conf;
  const lo = 2 * TO / chi2Inv(1 - a / 2, 2 * n + 2);
  const hi = n > 0 ? 2 * TO / chi2Inv(a / 2, 2 * n) : null;
  return { lo, hi };
}

// ── Episodios ──────────────────────────────────────────────────────────────────────────────
// events: notificaciones {ruleId, dId, siteId, kind, time, ackAt, severity, label} ORDENADAS por
// time, incluyendo para cada par el último aviso anterior a la ventana si seguía abierto.
function buildEpisodes(events) {
  const open = new Map();                    // ruleId|dId → episodio abierto
  const out = []; let huerfanos = 0;
  for (const e of events) {
    const k = `${e.ruleId}|${e.dId}`;
    if (e.kind !== 'resolve') {
      if (open.has(k)) continue;             // aviso repetido de un episodio abierto
      const ep = { ruleId: e.ruleId, dId: e.dId, siteId: e.siteId, label: e.label || e.ruleId, severity: e.severity,
        start: e.time, end: null, ackAt: e.ackAt || null, reconstruida: false };
      open.set(k, ep); out.push(ep);
      continue;
    }
    let ep = open.get(k), kk = k;
    if (!ep) {                               // Qs3: cierre registrado en otro equipo
      for (const [ok, o] of open) if (o.ruleId === e.ruleId && o.siteId === e.siteId && o.dId !== e.dId) { ep = o; kk = ok; break; }
      if (ep) ep.reconstruida = true;
    }
    if (!ep) { huerfanos++; continue; }
    ep.end = e.time; ep.closeMode = e.mode || null;
    if (!ep.ackAt && e.ackAt) ep.ackAt = e.ackAt;
    open.delete(kk);
  }
  return { episodes: out, huerfanos };
}

// Qs8 — rebotes: un nuevo aviso de la MISMA regla en el MISMA equipo antes de `gapMs` desde el
// cierre anterior es la misma falla (se extiende el episodio). Devuelve { episodes, rebotes }.
function mergeRebounds(episodes, gapMs) {
  const by = new Map();
  for (const e of [...episodes].sort((a, b) => a.start - b.start)) {
    const k = `${e.ruleId}|${e.dId}`; (by.get(k) || by.set(k, []).get(k)).push(e);
  }
  const out = []; let rebotes = 0;
  for (const list of by.values()) {
    let cur = null;
    for (const e of list) {
      if (cur && cur.end != null && e.start - cur.end < gapMs) {
        cur.end = e.end; cur.closeMode = e.closeMode; cur.reconstruida = cur.reconstruida || e.reconstruida;
        if (!cur.ackAt && e.ackAt) cur.ackAt = e.ackAt; cur.rebotes = (cur.rebotes || 0) + 1; rebotes++;
      } else { cur = { ...e }; out.push(cur); }
    }
  }
  return { episodes: out.sort((a, b) => a.start - b.start), rebotes };
}

// Recorta a [t0, t1] y une los episodios críticos superpuestos de un equipo en fallas.
function failuresOf(episodes, t0, t1) {
  const iv = episodes
    .map((e) => ({ ...e, s: Math.max(e.start, t0), e: Math.min(e.end == null ? t1 : e.end, t1), censurada: e.end == null || e.end > t1 }))
    .filter((x) => x.e > x.s || (x.e === x.s && x.start >= t0))
    .sort((a, b) => a.s - b.s);
  const out = [];
  for (const x of iv) {
    const last = out[out.length - 1];
    if (last && x.s <= last.end) {
      last.end = Math.max(last.end, x.e); last.censurada = last.censurada || x.censurada;
      last.causas.push(x.label); last.reconstruida = last.reconstruida || x.reconstruida;
      if (x.ackAt && (!last.ackAt || x.ackAt < last.ackAt)) last.ackAt = x.ackAt;
    } else out.push({ start: x.s, end: x.e, ackAt: x.ackAt, causas: [x.label], censurada: x.censurada, reconstruida: x.reconstruida, antesDeVentana: x.start < t0 });
  }
  return out;
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const round = (v, d = 3) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

function confianza(n, completitud, cfg) {
  const ok = completitud != null && completitud >= cfg.completitudMin;
  if (n >= cfg.confAltaN && ok) return 'alta';
  if (n >= cfg.confMediaN && ok) return 'media';
  return 'baja';
}

// Indicadores de un equipo. T en horas (puede ser menor que la ventana si el equipo es nuevo).
function indicators(fallas, T, completitud, cfg, tStart) {
  const n = fallas.length;
  // downH: horas fuera de servicio con la plataforma viva (Qs9); si falta, la duración de reloj.
  const down = fallas.map((f) => (f.downH != null ? f.downH : (f.end - f.start) / H));
  const TO = Math.max(0, T - down.reduce((s, v) => s + v, 0));
  const rep = fallas.filter((f) => !f.censurada && f.ackAt && f.ackAt >= f.start && f.ackAt <= f.end);
  const mttr = mean(rep.map((f) => (f.end - f.ackAt) / H));
  const mrt = mean(rep.map((f) => (f.ackAt - f.start) / H));
  const mdt = mean(fallas.filter((f) => !f.censurada).map((f) => (f.downH != null ? f.downH : (f.end - f.start) / H)));
  const ci = mtbfCI(TO, n, cfg.confidence);
  const mtbf = n ? TO / n : null;
  const lam = n && TO > 0 ? (n / TO) * 1000 : null;          // por 1000 h
  const Rt = (t) => (mtbf ? 100 * Math.exp(-t / mtbf) : null);
  return {
    n, nReconocidas: rep.length, T: round(T, 2), TO: round(TO, 2), downH: round(T - TO, 3),
    mtbf: round(mtbf, 1), mtbf_lo: round(ci.lo, 1), mtbf_hi: round(ci.hi, 1), lam: round(lam, 3),
    mttr: round(mttr, 3), mrt: round(mrt, 3), mdt: round(mdt, 3),
    Ai: mtbf && mttr != null ? round(100 * mtbf / (mtbf + mttr), 3) : null,
    Aa: null,                                                  // Qs1: sin ventanas de mantenimiento con duración
    Ao: T > 0 ? round(100 * TO / T, 3) : null,
    R24: round(Rt(24), 2), R168: round(Rt(168), 2), R720: round(Rt(720), 2),
    R168_cota: !n && ci.lo ? round(100 * Math.exp(-168 / ci.lo), 2) : null,   // n = 0: cota inferior
    M4: mttr ? round(100 * (1 - Math.exp(-cfg.slaRepairH / mttr)), 2) : null,
    completitud: round(completitud, 2), conf: confianza(n, completitud, cfg),
    beta: n >= 10 && tStart != null ? round(crowBeta(fallas.map((f) => f.start), tStart, T), 3) : null,
  };
}

// Crow-AMSAA (proceso de Weibull para equipos reparables), truncado por tiempo:
// β = n / Σ ln(T / tᵢ), tᵢ horas desde el inicio de la ventana. β≈1 tasa constante.
function crowBeta(starts, tStart, T) {
  if (!starts.length || !T) return null;
  let s = 0; for (const t of starts) { const ti = Math.max((t - tStart) / H, 1e-3); s += Math.log(T / ti); }
  return s > 0 ? starts.length / s : null;
}

// ISA-18.2 / EEMUA 191 sobre los avisos del sitio en [t1 − dias, t1].
function isaLoad(fires, episodes, t1, cfg) {
  const dias = cfg.isaDays, t0 = t1 - dias * 24 * H;
  const fs = fires.filter((f) => f.time >= t0 && f.time <= t1).sort((a, b) => a.time - b.time);
  const horas = new Array(dias * 24).fill(0);
  const por10 = new Map();
  for (const f of fs) {
    horas[Math.min(horas.length - 1, Math.floor((f.time - t0) / H))]++;
    const w = Math.floor((f.time - t0) / 600000); por10.set(w, (por10.get(w) || 0) + 1);
  }
  const ventanas = dias * 144;
  const max10 = Math.max(0, ...por10.values());
  const flood = [...por10.values()].filter((c) => c > cfg.floodPerTen).length;
  const porPar = new Map();
  for (const f of fs) { const k = `${f.ruleId}|${f.dId}`; (porPar.get(k) || porPar.set(k, []).get(k)).push(f.time); }
  let chattering = 0;
  for (const ts of porPar.values()) {
    for (let i = 0; i + cfg.chatterN - 1 < ts.length; i++) if (ts[i + cfg.chatterN - 1] - ts[i] <= cfg.chatterSec * 1000) { chattering++; break; }
  }
  const stale = episodes.filter((e) => (e.end == null ? t1 : e.end) - e.start > cfg.staleH * H && (e.end == null || e.end >= t0)).length;
  const porRegla = new Map(); for (const f of fs) porRegla.set(f.ruleId, (porRegla.get(f.ruleId) || 0) + 1);
  const top = [...porRegla.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    dias, total: fs.length, por_hora: round(fs.length / (dias * 24), 3), por10: round(fs.length / ventanas, 3),
    max10, flood_pct: round(100 * flood / ventanas, 3), chattering, stale,
    top10: fs.length ? round(100 * top.reduce((s, x) => s + x[1], 0) / fs.length, 1) : null,
    topReglas: top.map(([ruleId, n]) => ({ ruleId, n })), horas,
  };
}

// Caídas del sitio a partir de ventanas de 5 min: sin lecturas de ningún rectificador mientras
// otro equipo del sitio sí publica (descarta "se cayó la plataforma"). Precisión ±5 min.
function siteOutages(bucketsRect, bucketsOtros, b0, b1, bucketMin = 5) {
  if (!bucketsRect.size) return null;
  const caidas = []; let cur = null;
  for (let b = b0; b <= b1; b++) {
    const down = !bucketsRect.has(b) && bucketsOtros.has(b);
    if (down) { if (cur) cur.fin = b; else cur = { ini: b, fin: b }; } else if (cur) { caidas.push(cur); cur = null; }
  }
  if (cur) caidas.push(cur);
  const downH = caidas.reduce((s, c) => s + (c.fin - c.ini + 1) * bucketMin / 60, 0);
  const T = (b1 - b0 + 1) * bucketMin / 60;
  return { Ao: round(100 * (T - downH) / T, 3), downH: round(downH, 3), caidas: caidas.length,
    detalle: caidas.slice(-20).map((c) => ({ desde: c.ini * bucketMin * 60000, hasta: (c.fin + 1) * bucketMin * 60000 })) };
}

// Agregado del parque: suma de n y de TO (no promedio de porcentajes).
function aggregate(eqs, fallasAll, cfg) {
  const n = eqs.reduce((s, e) => s + e.n, 0), TO = eqs.reduce((s, e) => s + (e.TO || 0), 0), T = eqs.reduce((s, e) => s + (e.T || 0), 0);
  const comp = eqs.map((e) => e.completitud).filter((v) => v != null);
  const r = indicators([], 0, null, cfg);   // forma
  const ci = mtbfCI(TO, n, cfg.confidence);
  const rep = fallasAll.filter((f) => !f.censurada && f.ackAt && f.ackAt >= f.start && f.ackAt <= f.end);
  const mttr = mean(rep.map((f) => (f.end - f.ackAt) / H));
  const mtbf = n ? TO / n : null;
  return { ...r, n, nReconocidas: rep.length, T: round(T, 2), TO: round(TO, 2),
    mtbf: round(mtbf, 1), mtbf_lo: round(ci.lo, 1), mtbf_hi: round(ci.hi, 1), lam: n && TO ? round(1000 * n / TO, 3) : null,
    mttr: round(mttr, 3), mrt: round(mean(rep.map((f) => (f.ackAt - f.start) / H)), 3),
    mdt: round(mean(fallasAll.filter((f) => !f.censurada).map((f) => (f.end - f.start) / H)), 3),
    Ai: mtbf && mttr != null ? round(100 * mtbf / (mtbf + mttr), 3) : null,
    Ao: T ? round(100 * TO / T, 3) : null,
    M4: mttr ? round(100 * (1 - Math.exp(-cfg.slaRepairH / mttr)), 2) : null,
    R24: mtbf ? round(100 * Math.exp(-24 / mtbf), 2) : null,
    completitud: comp.length ? round(Math.min(...comp), 2) : null,
    conf: confianza(n, comp.length ? Math.min(...comp) : null, cfg) };
}

module.exports = { mergeRebounds, lnGamma, gammaP, chi2Inv, mtbfCI, buildEpisodes, failuresOf, indicators, crowBeta, isaLoad, siteOutages, aggregate, confianza, H };
