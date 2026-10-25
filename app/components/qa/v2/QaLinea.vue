<template>
  <!-- spec_supervisor_confiabilidad_v2 (R4) — curva con banda de confianza y marca vertical.
       Guardas: solo se dibujan puntos finitos; sin ninguno → estado vacío (nunca ±Infinity). -->
  <div>
    <div v-if="!puntos.length" class="qv-empty">{{ vacio }}</div>
    <svg v-else :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="aria">
      <g v-for="v in [0, 25, 50, 75, 100]" :key="'g' + v">
        <line :x1="L" :x2="W - R" :y1="Y(v)" :y2="Y(v)" class="qv-gl" />
        <text :x="L - 8" :y="Y(v) + 4" text-anchor="end" class="qv-axis">{{ v }} %</text>
      </g>
      <text v-for="(t, i) in ticks" :key="'t' + i" :x="X(t)" :y="H - B + 18" :text-anchor="i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'" class="qv-axis">{{ etiqueta(t) }}</text>
      <text :x="W - R" :y="H - 2" text-anchor="end" class="qv-axis">{{ xLabel }}</text>
      <path v-if="banda" :d="banda" class="qv-band" />
      <path :d="linea" class="qv-line" />
      <g v-if="marker != null">
        <line :x1="X(marker)" :x2="X(marker)" :y1="T" :y2="H - B" class="qv-mark" />
        <text :x="X(marker) + 6" :y="T + 12" class="qv-axis">{{ markerLabel }}</text>
      </g>
    </svg>
  </div>
</template>
<script>
const ok = (v) => typeof v === 'number' && isFinite(v);
export default {
  name: 'QaLinea',
  props: {
    xs: { type: Array, default: () => [] }, ys: { type: Array, default: () => [] },
    lo: { type: Array, default: null }, hi: { type: Array, default: null },
    xMax: { type: Number, required: true }, xLabel: { type: String, default: '' },
    marker: { type: Number, default: null }, markerLabel: { type: String, default: '' },
    aria: { type: String, default: 'gráfico' }, vacio: { type: String, default: 'Sin datos suficientes para dibujar esta curva.' },
  },
  data: () => ({ W: 560, H: 240, L: 48, R: 16, T: 14, B: 34 }),
  computed: {
    puntos() { return this.xs.map((x, i) => [x, this.ys[i]]).filter(([x, y]) => ok(x) && ok(y)); },
    ticks() { return [0, 1, 2, 3, 4, 5].map((i) => (this.xMax * i) / 5); },
    linea() { return this.puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${this.X(x).toFixed(1)} ${this.Y(y).toFixed(1)}`).join(''); },
    banda() {
      if (!this.lo || !this.hi) return null;
      const p = this.xs.map((x, i) => [x, this.lo[i], this.hi[i]]).filter(([x, a, b]) => ok(x) && ok(a) && ok(b));
      if (!p.length) return null;
      let d = p.map(([x, , b], i) => `${i ? 'L' : 'M'}${this.X(x).toFixed(1)} ${this.Y(b).toFixed(1)}`).join('');
      for (let i = p.length - 1; i >= 0; i--) d += `L${this.X(p[i][0]).toFixed(1)} ${this.Y(p[i][1]).toFixed(1)}`;
      return d + 'Z';
    },
  },
  methods: {
    X(v) { return this.L + (v / (this.xMax || 1)) * (this.W - this.R - this.L); },
    Y(v) { return this.H - this.B - (Math.max(0, Math.min(100, v)) / 100) * (this.H - this.B - this.T); },
    etiqueta(v) { return v < 10 ? v.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : Math.round(v); },
  },
};
</script>
