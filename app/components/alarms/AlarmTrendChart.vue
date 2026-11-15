<template>
  <!-- Propuesta Alarmas (2026-11) — gráfico del detalle de la alarma.
       Ejes con escala pareja y horas; límites de la ficha con su nombre; medido (línea llena) y
       estimado (punteada); lectura punto por punto (cursor, toque o flechas); debajo, en la misma
       línea de tiempo, las otras mediciones de la regla y las alarmas del sitio; lecturas clave,
       tabla completa y descarga. Usa las variables de color del contenedor (.ad2). -->
  <div class="atc">
    <div class="atc-leyenda">
      <span><svg aria-hidden="true" width="26" height="8" viewBox="0 0 26 8"><path d="M0 4H26" class="atc-serie"></path></svg>Medido</span>
      <span v-if="g.proy"><svg aria-hidden="true" width="26" height="8" viewBox="0 0 26 8"><path d="M0 4H26" class="atc-proy"></path></svg>Estimado al ritmo actual</span>
      <span v-if="g.bandaW > 0"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14"><rect width="14" height="14" class="atc-banda"></rect></svg>Tiempo en alarma</span>
      <span class="atc-leyenda__ayuda">Pasá el cursor o tocá el gráfico para leer cada momento</span>
    </div>

    <div class="atc-scroll">
      <div ref="caja" class="atc-caja" tabindex="0" role="group" :aria-label="'Gráfico de ' + nombre + '. Con las flechas izquierda y derecha se lee cada punto.'"
        @mousemove="mover" @mouseleave="hovT = null" @click="mover" @touchstart.passive="tocar" @touchmove.passive="tocar" @keydown="tecla" @blur="hovT = null">
        <svg :viewBox="'0 0 ' + W + ' ' + g.H" width="100%" role="img" :aria-label="g.resumen" style="display: block">
          <!-- grilla y eje Y -->
          <g v-for="t in g.yTicks" :key="'y' + t.v">
            <line :x1="L" :x2="g.R" :y1="t.y" :y2="t.y" class="atc-grid"></line>
            <text :x="L - 10" :y="t.y + 4" text-anchor="end" class="atc-txt">{{ t.txt }}</text>
          </g>
          <!-- tiempo en alarma -->
          <rect v-if="g.bandaW > 0" :x="g.bandaX" :y="T" :width="g.bandaW" :height="PH" class="atc-banda"></rect>
          <!-- límites con su nombre -->
          <g v-for="r in g.refs" :key="'r' + r.k">
            <line :x1="L" :x2="g.R" :y1="r.y" :y2="r.y" :class="'atc-lim atc-lim--' + r.kind"></line>
            <text :x="L + 8" :y="r.ty" :class="'atc-lim-t atc-lim-t--' + r.kind">{{ r.txt }}</text>
          </g>
          <!-- momentos: aviso, tomada, cierre, ahora -->
          <g v-for="m in g.marcas" :key="'m' + m.k">
            <line :x1="m.x" :x2="m.x" :y1="m.y1" :y2="g.yFin" :class="'atc-marca atc-marca--' + m.k"></line>
            <text :x="m.tx" :y="m.ty" :text-anchor="m.ancla" :class="'atc-marca-t atc-marca-t--' + m.k">{{ m.txt }}</text>
          </g>
          <!-- estimado y medido -->
          <path v-if="g.proy" :d="g.proy" class="atc-proy"></path>
          <path :d="g.d" class="atc-serie"></path>
          <g v-if="g.fin && !hov">
            <circle :cx="g.fin.x" :cy="g.fin.y" r="4.5" class="atc-punto"></circle>
            <text :x="g.fin.tx" :y="g.fin.ty" :text-anchor="g.fin.ancla" class="atc-fin-t">{{ g.fin.txt }}</text>
          </g>
          <!-- carriles: las otras mediciones de la regla y las alarmas del sitio -->
          <g v-for="c in g.carriles" :key="'c' + c.k">
            <text :x="L - 10" :y="c.y + 15" text-anchor="end" class="atc-txt"><title>{{ c.nombreLargo }}</title>{{ c.nombre }}</text>
            <rect :x="L" :y="c.y" :width="g.R - L" height="22" rx="4" class="atc-carril"></rect>
            <g v-for="(s, i) in c.segs" :key="i">
              <rect :x="s.x" :y="c.y" :width="s.w" height="22" rx="4" :class="s.mal ? 'atc-seg atc-seg--mal' : 'atc-seg'"><title>{{ s.titulo }}</title></rect>
              <text v-if="s.cabe" :x="s.x + 8" :y="c.y + 15" :class="s.mal ? 'atc-seg-t atc-seg-t--mal' : 'atc-seg-t'">{{ s.txt }}</text>
            </g>
            <g v-for="(e, i) in c.eventos" :key="'e' + i">
              <path :d="e.d" :class="'atc-ev atc-ev--' + e.sev + (e.actual ? ' atc-ev--actual' : '')"><title>{{ e.titulo }}</title></path>
            </g>
          </g>
          <!-- eje X -->
          <g v-for="t in g.xTicks" :key="'x' + t.t">
            <line :x1="t.x" :x2="t.x" :y1="T + PH" :y2="T + PH + 5" class="atc-tick"></line>
            <text :x="t.x" :y="g.H - 8" text-anchor="middle" class="atc-txt">{{ t.txt }}</text>
          </g>
          <!-- lectura del punto elegido -->
          <g v-if="hov">
            <line :x1="hov.x" :x2="hov.x" :y1="T" :y2="g.yFin" class="atc-cursor"></line>
            <circle :cx="hov.x" :cy="hov.y" r="5.5" class="atc-cursor-p"></circle>
          </g>
        </svg>
        <div v-if="hov" class="atc-tip" role="status" :style="hov.estilo">
          <span class="atc-tip__h">{{ hov.cabeza }}</span>
          <b class="atc-tip__v">{{ hov.valor }}</b>
          <span v-if="hov.rel">{{ hov.rel }}</span>
          <span v-for="(o, i) in hov.otros" :key="i" class="atc-tip__o">{{ o }}</span>
        </div>
      </div>
    </div>

    <div v-if="claves.length" class="atc-claves">
      <div v-for="k in claves" :key="k.k">
        <span class="atc-clave__l">{{ k.lab }}</span>
        <b>{{ k.val }}</b>
        <span class="atc-clave__d">{{ k.det }}</span>
      </div>
    </div>

    <div class="atc-pie">
      <span v-if="g.inv">El eje va de más cargado (arriba) a menos cargado (abajo): descargar se ve como bajar.</span>
      <span class="atc-pie__acc">
        <button type="button" class="atc-link" :aria-expanded="verTabla ? 'true' : 'false'" @click="verTabla = !verTabla">{{ verTabla ? 'Ocultar las lecturas' : 'Ver todas las lecturas' }}</button>
        <button type="button" class="atc-link" @click="descargar">Descargar</button>
      </span>
    </div>

    <div v-if="verTabla" class="atc-tabla">
      <table>
        <thead><tr><th scope="col">Hora</th><th v-for="c in tabla.cols" :key="c.k" scope="col">{{ c.txt }}</th></tr></thead>
        <tbody>
          <tr v-for="r in tabla.filas" :key="r.t" :class="{ aviso: r.aviso }">
            <td>{{ r.hora }}</td><td v-for="(v, i) in r.vals" :key="i">{{ v }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="tabla.total > tabla.filas.length" class="atc-clave__d">Se muestran las últimas {{ tabla.filas.length }} de {{ tabla.total }} lecturas. La descarga las trae todas.</p>
    </div>
  </div>
</template>

<script>
import { num, valor, varNombre, horaHM, diaMes, cuando } from '@/utils/alarmWords';

const W = 1100, L = 132, RM = 24, T = 46, PH = 220;
const X_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 360, 720, 1440, 2880];
const MIN = 60000;

function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
const esCat = (s) => !!s && (s.type === 'bool' || (Array.isArray(s.enumValues) && s.enumValues.length > 0)
  || (s.points.length > 0 && s.points.every(p => p.value === 0 || p.value === 1)));
// Último punto con time <= t (búsqueda binaria); -1 si no hay.
function idxHasta(pts, t) {
  let a = 0, b = pts.length - 1, r = -1;
  while (a <= b) { const m = (a + b) >> 1; if (pts[m].time <= t) { r = m; a = m + 1; } else b = m - 1; }
  return r;
}

export default {
  name: 'AlarmTrendChart',
  props: {
    series: { type: Array, required: true },      // [{ points:[{time,value}], label, unit, type, enumValues, deviceName, threshold, atFire, limits }]
    idx: { type: Number, default: 0 },            // medición principal
    from: { type: Number, required: true },
    until: { type: Number, required: true },
    nowMs: { type: Number, required: true },
    abierta: { type: Boolean, default: false },
    firedAt: { type: Number, default: null },
    resolvedAt: { type: Number, default: null },
    ackAt: { type: Number, default: null },
    forecast: { type: Array, default: null },     // [{time,value}] solo si corresponde a la medición principal
    events: { type: Array, default: () => [] },   // alarmas del sitio: [{ ts, label, severity, actual }]
    bucketMs: { type: Number, default: MIN },
    fileName: { type: String, default: 'alarma' },
  },
  data() { return { W, L, T, PH, hovT: null, verTabla: false }; },
  computed: {
    main() { return this.series[this.idx] || this.series[0] || { points: [] }; },
    nombre() { return varNombre(this.main) + (this.main.deviceName ? ' · ' + this.main.deviceName : ''); },
    cat() { return esCat(this.main); },
    g() {
      const s = this.main, pts = s.points || [];
      const R = W - RM;
      const x0 = this.from;
      const finDatos = this.abierta ? Math.max(this.until, this.nowMs) : this.until;
      // Estimado: solo con la alarma abierta; el eje se estira hasta donde llega (con tope).
      let proyPts = [];
      if (this.abierta && !this.cat && Array.isArray(this.forecast) && this.forecast.length > 1) {
        const tope = this.nowMs + Math.max(30 * MIN, 0.6 * (this.nowMs - x0));
        proyPts = this.forecast.filter(p => p.time >= this.nowMs - MIN && p.time <= tope);
        if (proyPts.length < 2) proyPts = [];
      }
      const x1 = proyPts.length ? Math.max(finDatos, proyPts[proyPts.length - 1].time) : finDatos;
      const X = (t) => L + ((t - x0) / Math.max(1, x1 - x0)) * (R - L);

      // ── eje Y: escala pareja; los límites cercanos entran en la escala ──
      let lo, hi, dec = 0, inv = false, step = 1;
      const refs0 = [];
      if (this.cat) { lo = -0.2; hi = 1.2; }
      else {
        const vals = pts.map(p => p.value).concat(proyPts.map(p => p.value));
        lo = Math.min(...vals); hi = Math.max(...vals);
        if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
        const span0 = Math.max(hi - lo, Math.abs(hi) * 0.02, 1e-6);
        const NOM = { trip: 'Crítico', warning: 'Atención' };
        const vistos = new Set();
        for (const l of (s.limits || [])) {
          const k = l.kind + '|' + l.value;
          if (vistos.has(k)) continue; vistos.add(k);
          refs0.push({ k, kind: l.kind, value: l.value, op: l.op, nom: NOM[l.kind] || 'Límite', regla: s.threshold != null && Math.abs(s.threshold - l.value) < 1e-9 });
        }
        if (s.threshold != null && !refs0.some(r => r.regla)) refs0.push({ k: 'regla', kind: 'regla', value: s.threshold, op: null, nom: 'Límite de esta regla', regla: false });
        for (const r of refs0) {
          r.visible = r.kind === 'regla' || r.regla || (r.value >= lo - 1.5 * span0 && r.value <= hi + 1.5 * span0);
          if (r.visible) { lo = Math.min(lo, r.value); hi = Math.max(hi, r.value); }
        }
        const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
        step = niceStep((hi - lo + 2 * pad) / 4);
        lo = Math.floor((lo - pad) / step + 1e-9) * step; hi = Math.ceil((hi + pad) / step - 1e-9) * step;
        dec = Math.max(0, Math.min(3, -Math.floor(Math.log10(step) + 1e-9)));
        const q = step / Math.pow(10, -dec);
        if (Math.abs(q - Math.round(q)) > 1e-6) dec += 1;   // paso 2,5 → un decimal más
        inv = pts.length > 0 && pts.every(p => p.value < 0) && hi <= 0;   // planta DC: descargar = bajar
      }
      const Y = (v) => (inv ? T + ((v - lo) / Math.max(1e-9, hi - lo)) * PH : T + ((hi - v) / Math.max(1e-9, hi - lo)) * PH);
      const u = s.unit ? ' ' + s.unit : '';
      const yTicks = [];
      if (this.cat) { [0, 1].forEach(v => yTicks.push({ v, y: Y(v), txt: valor(v, s) })); }
      else { const n = Math.round((hi - lo) / step); for (let i = 0; i <= n; i++) { const v = lo + i * step; yTicks.push({ v, y: Y(v), txt: num(v, dec) + u }); } }

      // ── límites: nombre sobre la línea, sin pisarse ──
      const refs = refs0.filter(r => r.visible).map(r => ({ ...r, y: Y(r.value) })).sort((a, b) => a.y - b.y);
      let prevTy = -99;
      for (const r of refs) {
        r.txt = `${r.nom} ${num(r.value, Math.max(dec, 1))}${u}${r.regla ? ' · límite de esta regla' : ''}`;
        r.ty = r.y - 6;
        if (r.ty - prevTy < 14 || r.ty < T + 10) r.ty = r.y + 14;
        prevTy = r.ty;
      }

      // ── medido ──
      let d = '';
      pts.forEach((p, i) => {
        const x = X(p.time).toFixed(1), y = Y(p.value).toFixed(1);
        if (!i) d += `M${x} ${y}`; else if (this.cat) d += ` H${x} V${y}`; else d += ` L${x} ${y}`;
      });
      if (this.cat && pts.length) d += ` H${X(Math.min(finDatos, x1)).toFixed(1)}`;
      const proy = proyPts.length ? proyPts.map((p, i) => `${i ? 'L' : 'M'}${X(p.time).toFixed(1)} ${Math.max(T, Math.min(T + PH, Y(p.value))).toFixed(1)}`).join(' ') : '';
      const ult = pts.length ? pts[pts.length - 1] : null;
      let fin = null;
      if (ult) {
        const x = X(ult.time), y = Y(ult.value), izq = x > L + 120;
        fin = { x, y, txt: valor(ult.value, s, this.cat ? undefined : dec + 1), tx: izq ? x - 9 : x + 9, ty: y - 10 < T + 12 ? y + 20 : y - 10, ancla: izq ? 'end' : 'start' };
      }

      // ── carriles ──
      const carriles = [];
      let cy = T + PH + 26;
      const finSeg = (p, nx) => {
        if (nx && nx.time - p.time <= Math.max(10 * MIN, 5 * this.bucketMs)) return nx.time;
        if (!nx && finDatos - p.time <= 15 * MIN) return finDatos;
        return p.time + this.bucketMs;
      };
      this.series.forEach((o, i) => {
        if (o === s || carriles.length >= 3 || !o.points || !o.points.length) return;
        const oc = esCat(o);
        let estado;
        if (oc) estado = (v) => ({ id: v, txt: valor(v, o), mal: typeof o.atFire === 'number' && v === o.atFire });
        else if (typeof o.threshold === 'number' && typeof o.atFire === 'number' && o.atFire !== o.threshold) {
          const lado = Math.sign(o.atFire - o.threshold);
          estado = (v) => { const si = Math.sign(v - o.threshold) === lado; return { id: si ? 1 : 0, txt: si ? 'Se cumple' : 'Normal', mal: si }; };
        } else return;
        const segs = [];
        o.points.forEach((p, j) => {
          const e = estado(p.value), t1 = finSeg(p, o.points[j + 1]);
          const ant = segs[segs.length - 1];
          if (ant && ant.id === e.id && Math.abs(ant.t1 - p.time) < 1) { ant.t1 = t1; return; }
          segs.push({ id: e.id, txt: e.txt, mal: e.mal, t0: p.time, t1 });
        });
        const nombreLargo = varNombre(o) + (o.deviceName ? ' · ' + o.deviceName : '');
        const corto = varNombre(o);
        carriles.push({ k: 's' + i, y: cy, nombre: corto.length > 19 ? corto.slice(0, 18) + '…' : corto, nombreLargo, eventos: [],
          segs: segs.map(g0 => {
            const xa = Math.max(L, X(g0.t0)), xb = Math.min(R, X(g0.t1)), w = Math.max(2, xb - xa);
            return { x: xa, w, txt: g0.txt, mal: g0.mal, cabe: w > String(g0.txt).length * 6.9 + 14, titulo: `${g0.txt} · ${horaHM(g0.t0)} a ${horaHM(g0.t1)}` };
          }) });
        cy += 30;
      });
      const evs = (this.events || []).filter(e => e.ts >= x0 && e.ts <= x1);
      if (evs.length) {
        carriles.push({ k: 'alarmas', y: cy, nombre: 'Alarmas', nombreLargo: 'Alarmas del sitio', segs: [],
          eventos: evs.map(e => {
            const x = X(e.ts), my = cy + 11, r = e.actual ? 7 : 5.5;
            const dd = e.severity === 'critical' ? `M${x} ${my - r} L${x + r} ${my + r - 1} L${x - r} ${my + r - 1} Z`
              : e.severity === 'warning' ? `M${x} ${my - r} L${x + r} ${my} L${x} ${my + r} L${x - r} ${my} Z`
              : `M${x - r + 1} ${my} a${r - 1} ${r - 1} 0 1 0 ${2 * r - 2} 0 a${r - 1} ${r - 1} 0 1 0 ${-(2 * r - 2)} 0 Z`;
            return { d: dd, sev: e.severity || 'info', actual: !!e.actual, titulo: `${horaHM(e.ts)} · ${e.label || 'Alarma'}${e.actual ? ' (esta alarma)' : ''}` };
          }) });
        cy += 30;
      }
      const yFin = carriles.length ? cy - 8 : T + PH;
      const H = (carriles.length ? cy : T + PH + 8) + 22;

      // ── momentos ──
      const marcas = [];
      const dentro = (t) => t != null && t >= x0 && t <= x1;
      if (dentro(this.firedAt)) { const x = X(this.firedAt); const izq = x > L + 90; marcas.push({ k: 'aviso', x, y1: T - 8, tx: izq ? x - 5 : x + 5, ty: T - 26, ancla: izq ? 'end' : 'start', txt: 'Avisó ' + horaHM(this.firedAt) }); }
      if (!this.abierta && dentro(this.resolvedAt)) { const x = X(this.resolvedAt); const der = x < R - 110; marcas.push({ k: 'cierre', x, y1: T - 8, tx: der ? x + 5 : x - 5, ty: T - 26, ancla: der ? 'start' : 'end', txt: 'Se cerró ' + horaHM(this.resolvedAt) }); }
      if (this.abierta && dentro(this.nowMs)) { const x = X(this.nowMs); const der = x < R - 90; marcas.push({ k: 'ahora', x, y1: T - 8, tx: der ? x + 5 : x - 5, ty: T - 11, ancla: der ? 'start' : 'end', txt: 'Ahora ' + horaHM(this.nowMs) }); }
      const xA = dentro(this.firedAt) ? X(this.firedAt) : (this.firedAt != null && this.firedAt < x0 ? L : null);
      const xB = !this.abierta && this.resolvedAt != null ? Math.min(R, X(this.resolvedAt)) : X(Math.min(finDatos, x1));

      // ── eje X: horas redondas ──
      const spanMin = (x1 - x0) / MIN;
      const stepMin = X_STEPS.find(m => spanMin / m <= 9) || 2880;
      const stepMs = stepMin * MIN, off = -new Date(x0).getTimezoneOffset() * MIN;
      const xTicks = [];
      for (let t = Math.ceil((x0 + off) / stepMs) * stepMs - off; t <= x1; t += stepMs) {
        const dd = new Date(t), media = dd.getHours() === 0 && dd.getMinutes() === 0;
        const txt = stepMin >= 1440 ? diaMes(t) : (media && spanMin > 600 ? `${diaMes(t)} 00:00` : horaHM(t));
        const x = X(t);
        if (x >= L + 14 && x <= R - 14) xTicks.push({ t, x, txt });
      }

      const resumen = `${this.nombre}, de ${cuando(x0, this.nowMs)} a ${cuando(finDatos, this.nowMs)}.` + (ult ? ` Última lectura ${valor(ult.value, s)}.` : ' Sin lecturas.');
      return { H, R, X, Y, x0, x1, lo, hi, dec, inv, yTicks, refs, refsTodos: refs0, d, proy, proyPts, fin, carriles, yFin, marcas, xTicks, resumen,
        bandaX: xA != null ? xA : 0, bandaW: xA != null ? Math.max(0, xB - xA) : 0 };
    },
    hov() {
      if (this.hovT == null) return null;
      const s = this.main, pts = s.points || [], g = this.g;
      if (!pts.length) return null;
      let t = Math.max(g.x0, Math.min(g.x1, this.hovT)), v, tipo = 'Medido';
      const ult = pts[pts.length - 1];
      if (t > ult.time + this.bucketMs && g.proyPts.length) {
        const pp = g.proyPts; let j = idxHasta(pp, t); if (j < 0) j = 0;
        const a = pp[j], b = pp[Math.min(pp.length - 1, j + 1)];
        v = b.time > a.time ? a.value + ((b.value - a.value) * (Math.min(t, b.time) - a.time)) / (b.time - a.time) : a.value;
        t = Math.min(t, pp[pp.length - 1].time); tipo = 'Estimado';
      } else {
        let j = idxHasta(pts, t); if (j < 0) j = 0;
        if (j < pts.length - 1 && Math.abs(pts[j + 1].time - t) < Math.abs(pts[j].time - t)) j++;
        t = pts[j].time; v = pts[j].value;
        if (j === pts.length - 1 && this.abierta) tipo = 'Última lectura';
      }
      const x = g.X(t), y = Math.max(T, Math.min(T + PH, g.Y(v)));
      const otros = [];
      if (tipo !== 'Estimado') {
        for (const o of this.series) {
          if (o === s || otros.length >= 3 || !o.points || !o.points.length) continue;
          const j = idxHasta(o.points, t + this.bucketMs);
          if (j >= 0 && t - o.points[j].time <= Math.max(15 * MIN, 5 * this.bucketMs)) otros.push(`${varNombre(o)}: ${valor(o.points[j].value, o)}`);
        }
      } else otros.push('Si sigue al ritmo actual');
      const der = x > W * 0.6;
      return { x, y, cabeza: `${tipo} · ${cuando(t, this.nowMs)}`, valor: valor(v, s, this.cat ? undefined : g.dec + 1), rel: this.relacion(v), otros,
        estilo: { left: der ? `calc(${(x / W * 100).toFixed(2)}% - 14px)` : `calc(${(x / W * 100).toFixed(2)}% + 14px)`, top: `${((T + 6) / g.H * 100).toFixed(1)}%`, transform: der ? 'translateX(-100%)' : 'none' } };
    },
    claves() {
      const s = this.main, pts = s.points || [];
      if (this.cat || !pts.length) return [];
      const d = this.g.dec + 1, out = [];
      const f = (p) => valor(p.value, s, d);
      if (this.firedAt != null && this.firedAt >= pts[0].time - this.bucketMs && this.firedAt <= pts[pts.length - 1].time + this.bucketMs) {
        let j = idxHasta(pts, this.firedAt); if (j < 0) j = 0;
        out.push({ k: 'aviso', lab: 'Al avisar', val: f(pts[j]), det: cuando(this.firedAt, this.nowMs) });
      }
      let mx = pts[0], mn = pts[0];
      for (const p of pts) { if (p.value > mx.value) mx = p; if (p.value < mn.value) mn = p; }
      out.push({ k: 'max', lab: 'Más alto del período', val: f(mx), det: cuando(mx.time, this.nowMs) });
      out.push({ k: 'min', lab: 'Más bajo del período', val: f(mn), det: cuando(mn.time, this.nowMs) });
      const u = pts[pts.length - 1];
      out.push({ k: 'ult', lab: this.abierta ? 'Ahora' : 'Última lectura', val: f(u), det: cuando(u.time, this.nowMs) + (this.relacion(u.value) ? ' · ' + this.relacion(u.value).replace(/^./, c => c.toLowerCase()) : '') });
      return out;
    },
    tabla() {
      const s = this.main, pts = s.points || [];
      const cols = this.series.filter(o => o.points && o.points.length).map((o, i) => ({ k: i, o, txt: varNombre(o) + (o.unit ? ` (${o.unit})` : '') }));
      const total = pts.length;
      const filas = pts.slice(-120).reverse().map(p => ({ t: p.time, hora: cuando(p.time, this.nowMs),
        aviso: this.firedAt != null && Math.abs(p.time - this.firedAt) <= this.bucketMs / 2,
        vals: cols.map(c => this.valEn(c.o, p.time, true)) }));
      return { cols, filas, total };
    },
  },
  // En pantallas angostas el gráfico se desplaza: arranca mostrando lo más reciente.
  mounted() { this.$nextTick(() => { const sc = this.$el.querySelector('.atc-scroll'); if (sc && this.abierta) sc.scrollLeft = sc.scrollWidth; }); },
  methods: {
    // Valor de la medición o en el momento t (la lectura más cercana anterior).
    valEn(o, t, conPalabras) {
      const j = idxHasta(o.points, t + this.bucketMs / 2);
      if (j < 0 || t - o.points[j].time > Math.max(15 * MIN, 5 * this.bucketMs)) return conPalabras ? '—' : '';
      const v = o.points[j].value;
      if (conPalabras) return esCat(o) ? valor(v, o) : num(v, o === this.main ? this.g.dec + 1 : undefined);
      return v;
    },
    // Relación del valor con los límites de la ficha: cuánto se pasó, o que está dentro de lo normal.
    relacion(v) {
      if (this.cat || typeof v !== 'number') return '';
      const s = this.main, u = s.unit ? ' ' + s.unit : '';
      const lims = (this.g.refsTodos || []).filter(r => r.op);
      if (!lims.length) return '';
      const pasado = (r) => (r.op === 'lt' ? v < r.value : r.op === 'lte' ? v <= r.value : r.op === 'gt' ? v > r.value : r.op === 'gte' ? v >= r.value : false);
      const c = lims.filter(pasado);
      const peor = c.find(r => r.kind === 'trip') || c.find(r => r.kind === 'warning');
      if (!peor) return 'Dentro de lo normal';
      const dif = Math.abs(v - peor.value);
      const cual = peor.kind === 'trip' ? 'el límite crítico' : 'el límite de atención';
      const dd = this.g.dec + 1;
      return Math.round(dif * Math.pow(10, dd)) === 0 ? `En ${cual}` : `${num(dif, dd)}${u} pasado ${cual}`;
    },
    tDeX(clientX) {
      const el = this.$refs.caja; if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = ((clientX - r.left) / Math.max(1, r.width)) * W;
      return this.g.x0 + ((x - L) / (this.g.R - L)) * (this.g.x1 - this.g.x0);
    },
    mover(e) { const t = this.tDeX(e.clientX); if (t != null) this.hovT = t; },
    tocar(e) { if (e.touches && e.touches[0]) { const t = this.tDeX(e.touches[0].clientX); if (t != null) this.hovT = t; } },
    tecla(e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Escape') return;
      if (e.key === 'Escape') { this.hovT = null; return; }
      const pts = this.main.points || []; if (!pts.length) return;
      e.preventDefault();
      let j = this.hovT == null ? pts.length - 1 : idxHasta(pts, this.hovT + this.bucketMs / 2);
      if (this.hovT != null) j += e.key === 'ArrowLeft' ? -1 : 1;
      j = Math.max(0, Math.min(pts.length - 1, j));
      this.hovT = pts[j].time;
    },
    descargar() {
      const cols = this.tabla.cols, pts = this.main.points || [];
      const p2 = (n) => String(n).padStart(2, '0');
      const fecha = (t) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
      const celda = (x) => (typeof x === 'number' ? String(x).replace('.', ',') : `"${String(x).replace(/"/g, '""')}"`);
      const lineas = [['Fecha y hora'].concat(cols.map(c => c.txt)).map(celda).join(';')];
      for (const p of pts) lineas.push([celda(fecha(p.time))].concat(cols.map(c => celda(this.valEn(c.o, p.time, false)))).join(';'));
      const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = String(this.fileName).replace(/[^\w.-]+/g, '_') + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  },
};
</script>

<style scoped>
.atc { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.atc-leyenda { display: flex; flex-wrap: wrap; gap: 6px 20px; font-size: 13px; color: var(--mut); align-items: center; }
.atc-leyenda span { display: inline-flex; align-items: center; gap: 8px; }
.atc-leyenda__ayuda { margin-left: auto; }
.atc-scroll { overflow-x: auto; }
.atc-caja { position: relative; min-width: 860px; cursor: crosshair; border-radius: 8px; }
.atc-caja:focus { outline: none; }
.atc-caja:focus-visible { outline: 2px solid var(--acc); outline-offset: 4px; }
.atc-grid { stroke: var(--line); stroke-width: 1; }
.atc-tick { stroke: var(--mut); stroke-width: 1; }
.atc-txt { fill: var(--mut); font-size: 12px; }
.atc-banda { fill: var(--sev-crit); opacity: .13; }
.atc-serie { fill: none; stroke: var(--serie); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.atc-proy { fill: none; stroke: var(--serie); stroke-width: 2; stroke-dasharray: 7 6; }
.atc-punto { fill: var(--serie); stroke: var(--card); stroke-width: 2; }
.atc-fin-t { fill: var(--ink); font-size: 13px; font-weight: 700; paint-order: stroke; stroke: var(--card); stroke-width: 4px; }
.atc-lim { stroke-width: 1.5; stroke-dasharray: 6 5; }
.atc-lim--warning { stroke: var(--sev-warn); } .atc-lim--trip { stroke: var(--sev-crit); } .atc-lim--regla { stroke: var(--mut); }
.atc-lim-t { font-size: 12px; font-weight: 600; paint-order: stroke; stroke: var(--card); stroke-width: 4px; }
.atc-lim-t--warning { fill: var(--atn); } .atc-lim-t--trip { fill: var(--mal); } .atc-lim-t--regla { fill: var(--mut); }
.atc-marca { stroke-width: 1.5; }
.atc-marca--aviso { stroke: var(--sev-crit); } .atc-marca--cierre { stroke: var(--ok); } .atc-marca--ahora { stroke: var(--ink); opacity: .75; }
.atc-marca-t { font-size: 12px; font-weight: 600; }
.atc-marca-t--aviso { fill: var(--mal); } .atc-marca-t--cierre { fill: var(--ok); } .atc-marca-t--ahora { fill: var(--ink); }
.atc-carril { fill: none; stroke: var(--line); stroke-width: 1; }
.atc-seg { fill: var(--grisb); } .atc-seg--mal { fill: var(--malb); }
.atc-seg-t { fill: var(--gris); font-size: 12px; font-weight: 600; pointer-events: none; } .atc-seg-t--mal { fill: var(--mal); }
.atc-ev { stroke-width: 2; }
.atc-ev--critical { fill: var(--sev-crit); stroke: none; } .atc-ev--warning { fill: none; stroke: var(--sev-warn); } .atc-ev--info { fill: none; stroke: var(--mut); }
.atc-ev--actual { stroke: var(--ink); stroke-width: 1.5; }
.atc-cursor { stroke: var(--ink); stroke-width: 1; opacity: .55; }
.atc-cursor-p { fill: var(--card); stroke: var(--ink); stroke-width: 2; }
.atc-tip { position: absolute; pointer-events: none; background: var(--card2); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px;
  display: flex; flex-direction: column; gap: 2px; min-width: 190px; max-width: 280px; font-size: 13px; box-shadow: 0 8px 24px rgba(0, 0, 0, .25); z-index: 2; }
.atc-tip__h { font-size: 12px; color: var(--mut); } .atc-tip__v { font-size: 20px; line-height: 1.2; } .atc-tip__o { font-size: 12px; color: var(--mut); }
.atc-claves { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px 0; border-top: 1px solid var(--line); padding-top: 14px; }
.atc-claves > div { display: flex; flex-direction: column; gap: 2px; padding: 0 16px; border-left: 1px solid var(--line); min-width: 0; }
.atc-claves > div:first-child { padding-left: 0; border-left: 0; }
.atc-claves b { font-size: 18px; color: var(--ink); }
.atc-clave__l { font-size: 13px; color: var(--ink); } .atc-clave__d { font-size: 13px; color: var(--mut); margin: 0; }
.atc-pie { display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: center; font-size: 13px; color: var(--mut); }
.atc-pie__acc { margin-left: auto; display: inline-flex; gap: 8px; }
.atc-link { font: inherit; font-size: 14px; font-weight: 600; min-height: 44px; padding: 0 10px; border: 0; background: transparent; color: var(--acc); cursor: pointer; border-radius: 8px; }
.atc-link:hover { text-decoration: underline; }
.atc-tabla { max-height: 340px; overflow: auto; border: 1px solid var(--line); border-radius: 10px; }
.atc-tabla table { width: 100%; border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums; }
.atc-tabla th { position: sticky; top: 0; background: var(--card2); color: var(--mut); text-align: left; font-weight: 600; padding: 8px 14px; white-space: nowrap; }
.atc-tabla td { padding: 7px 14px; border-top: 1px solid var(--line); color: var(--ink); white-space: nowrap; }
.atc-tabla tr.aviso td { font-weight: 700; background: var(--malb); }
.atc-tabla p { padding: 8px 14px; }
@media (max-width: 600px) {
  .atc-claves { grid-template-columns: 1fr 1fr; gap: 14px 16px; } .atc-claves > div { padding: 0; border-left: 0; }
  .atc-leyenda__ayuda { margin-left: 0; }
}
</style>
