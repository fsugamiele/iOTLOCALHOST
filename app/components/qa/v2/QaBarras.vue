<template>
  <!-- spec_supervisor_confiabilidad_v2 (R4) — avisos por hora con la meta de ISA-18.2 punteada. -->
  <div>
    <div v-if="!hay" class="qv-empty">Sin avisos en la ventana.</div>
    <svg v-else :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Avisos por hora">
      <g v-for="v in grid" :key="v">
        <line :x1="L" :x2="W - R" :y1="Y(v)" :y2="Y(v)" class="qv-gl" />
        <text :x="L - 6" :y="Y(v) + 4" text-anchor="end" class="qv-axis">{{ v }}</text>
      </g>
      <rect v-for="b in barras" :key="b.i" :x="L + b.i * bw + 0.5" :y="Y(b.c)" :width="Math.max(1, bw - 1)" :height="Y(0) - Y(b.c)" :class="b.c > meta ? 'qv-bar qv-bar--alta' : 'qv-bar'">
        <title>{{ b.c }} avisos</title>
      </rect>
      <line :x1="L" :x2="W - R" :y1="Y(meta)" :y2="Y(meta)" class="qv-limit" />
      <text v-for="d in dias" :key="'d' + d" :x="L + d * 24 * bw" :y="H - 6" :text-anchor="d === 0 ? 'start' : d === nd ? 'end' : 'middle'" class="qv-axis">{{ d === nd ? 'hoy' : `−${nd - d} d` }}</text>
    </svg>
  </div>
</template>
<script>
export default {
  name: 'QaBarras',
  props: { valores: { type: Array, default: () => [] }, meta: { type: Number, default: 6 } },
  data: () => ({ W: 640, H: 170, L: 34, R: 8, T: 10, B: 24 }),
  computed: {
    barras() { return this.valores.map((c, i) => ({ c, i })).filter((b) => typeof b.c === 'number' && b.c > 0); },
    hay() { return this.valores.some((v) => typeof v === 'number' && v > 0); },
    yMax() { const m = Math.max(this.meta + 2, ...this.valores.filter((v) => typeof v === 'number' && isFinite(v))); return Math.ceil(m / 5) * 5; },
    grid() { return [0, this.yMax / 2, this.yMax]; },
    bw() { return (this.W - this.L - this.R) / Math.max(1, this.valores.length); },
    nd() { return Math.round(this.valores.length / 24); },
    dias() { return Array.from({ length: this.nd + 1 }, (_, i) => i); },
  },
  methods: { Y(v) { return this.H - this.B - (v / (this.yMax || 1)) * (this.H - this.B - this.T); } },
};
</script>
