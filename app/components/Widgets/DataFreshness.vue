<template>
  <span class="data-freshness" :class="'data-freshness--' + status">
    <template v-if="!hasData">
      <span v-if="context === 'editor'" class="data-freshness__na">—</span>
      <span v-else class="data-freshness__nodata">sin dato</span>
    </template>
    <template v-else>
      <span class="data-freshness__age">hace {{ ageLabel }}</span>
    </template>
  </span>
</template>

<script>
// DEC-REF-98 D-3 (#73) — dataFreshness. La frescura ES el dato: no
// muestra el valor, muestra cuánto hace que llegó (prop `time`, que
// LiveValue entrega desde el publish o del seed histórico).
// Color por config.cadenceExpected (seg): ok ≤ 1× cadencia,
// warning ≤ 2×, critical > 2×. Sin cadencia declarada → azul neutro
// (solo edad, sin juicio — no hay criterio contra qué medir).
//
// NOTA DE PUREZA: es el único presenter con un timer propio (30 s) —
// la edad envejece aunque no lleguen publishes (de hecho ESE es su
// punto). El timer solo corre en context live.
export default {
  name: 'DataFreshness',
  props: {
    value:   { default: null },
    time:    { default: null },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  data() {
    return { now: Date.now(), timer: null };
  },
  computed: {
    hasData() {
      return Number.isFinite(this.time);
    },
    ageSec() {
      return Math.max(0, Math.round((this.now - this.time) / 1000));
    },
    ageLabel() {
      const s = this.ageSec;
      if (s < 60) return s + ' s';
      if (s < 3600) return Math.floor(s / 60) + ' min';
      const h = Math.floor(s / 3600);
      const m = Math.round((s % 3600) / 60);
      return m ? `${h} h ${m} min` : `${h} h`;
    },
    status() {
      if (!this.hasData) return this.context === 'editor' ? 'na' : 'nodata';
      const cadence = Number(this.config.cadenceExpected);
      if (!Number.isFinite(cadence) || cadence <= 0) return 'unknown';
      if (this.ageSec <= cadence) return 'ok';
      if (this.ageSec <= cadence * 2) return 'warning';
      return 'critical';
    },
  },
  mounted() {
    if (this.context === 'live') {
      this.timer = setInterval(() => { this.now = Date.now(); }, 30000);
    }
  },
  beforeDestroy() {
    if (this.timer) clearInterval(this.timer);
  },
};
</script>

<style scoped>
.data-freshness__age { font-size: 1.2em; font-weight: 600; }

.data-freshness           { color: #1d8cf8; }
.data-freshness--ok       { color: #00bf9a; }
.data-freshness--warning  { color: #ff8d72; }
.data-freshness--critical { color: #fd5d93; }
.data-freshness--unknown  { color: #1d8cf8; }
.data-freshness--nodata, .data-freshness--na { color: #6b7280; }
.data-freshness__nodata { font-style: italic; opacity: 0.7; }
</style>
