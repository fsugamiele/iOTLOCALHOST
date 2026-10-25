<template>
  <!-- spec_supervisor_confiabilidad_v2 (R4) — línea de tiempo por equipo: en servicio / falla / red / sitio sin energía. -->
  <div>
    <div v-if="!filas.length" class="qv-empty">Sin equipos en la ventana.</div>
    <svg v-else :viewBox="`0 0 ${W} ${alto}`" role="img" aria-label="Disponibilidad de cada equipo en la ventana">
      <g v-for="(f, i) in filas" :key="f.nombre">
        <text x="0" :y="top + i * rowH + 16" class="qv-lab">{{ f.nombre }}</text>
        <rect :x="L" :y="top + i * rowH + 5" :width="W - Rm - L" height="14" rx="3" class="qv-up" />
        <rect v-for="(s, j) in f.tramos" :key="j" :x="X(s.s)" :y="top + i * rowH + 5" :width="Math.max(2.5, X(s.e) - X(s.s))" height="14" :class="'qv-' + s.tipo">
          <title>{{ s.title }}</title>
        </rect>
      </g>
      <text v-for="(d, k) in dias" :key="'d' + k" :x="X(d.t)" :y="alto - 6" :text-anchor="k === 0 ? 'start' : k === dias.length - 1 ? 'end' : 'middle'" class="qv-axis">{{ d.txt }}</text>
    </svg>
  </div>
</template>
<script>
export default {
  name: 'QaGantt',
  props: { filas: { type: Array, default: () => [] }, t0: { type: Number, required: true }, t1: { type: Number, required: true } },
  data: () => ({ W: 640, L: 170, Rm: 10, top: 6, rowH: 26 }),
  computed: {
    alto() { return this.top + this.filas.length * this.rowH + 26; },
    dias() {
      // Marcas desde HOY hacia atrás (hoy, −7 d, −14 d…) para que la última no se pise con "hoy".
      const n = Math.round((this.t1 - this.t0) / 86400000);
      const paso = n > 14 ? 7 : n > 6 ? 2 : 1;
      const out = [];
      for (let d = 0; d <= n; d += paso) out.unshift({ t: this.t1 - d * 86400000, txt: d === 0 ? 'hoy' : `−${d} d` });
      return out;
    },
  },
  methods: {
    X(t) { const c = Math.max(this.t0, Math.min(this.t1, t)); return this.L + ((c - this.t0) / ((this.t1 - this.t0) || 1)) * (this.W - this.Rm - this.L); },
  },
};
</script>
