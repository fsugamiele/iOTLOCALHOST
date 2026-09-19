<template>
  <div class="gauge">
    <template v-if="hasData">
      <div ref="chart" class="gauge__canvas"></div>
    </template>
    <template v-else>
      <span v-if="context === 'editor'" class="gauge__na">—</span>
      <span v-else class="gauge__nodata">sin dato</span>
    </template>
  </div>
</template>

<script>
// DEC-REF-107 (Paso 2) — REPRESENTACIÓN `gauge` de la familia numérica.
// Gauge radial ECharts con aguja y zonas de color por umbral. Sirve para
// cualquier numérico: autonomía, RPM, presión, temperatura. Rango: gaugeMin/
// gaugeMax si están, si no automático. Zonas por thresholds (criterio genérico
// DEC-REF-70 g): critical/warning low y high.
import echartsBase from '@/components/Widgets/echartsBase.js';

export default {
  name: 'Gauge',
  mixins: [echartsBase],
  props: {
    value:   { default: null },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  computed: {
    hasData() {
      return this.value !== null && this.value !== undefined && Number.isFinite(Number(this.value));
    },
    num() { return Number(this.value); },
    unit() { return this.config.unit || ''; },
    decimals() {
      return Number.isFinite(this.config.decimalPlaces) ? this.config.decimalPlaces : (this.config.variableType === 'int' ? 0 : 1);
    },
    label() {
      const n = this.hasData ? this.num.toFixed(this.decimals) : '—';
      return this.unit ? `${n} ${this.unit}` : `${n}`;
    },
    min() {
      return Number.isFinite(this.config.gaugeMin) ? this.config.gaugeMin : 0;
    },
    max() {
      if (Number.isFinite(this.config.gaugeMax)) return this.config.gaugeMax;
      const t = this.config.thresholds || {};
      const mx = Math.max(this.hasData ? this.num : 0, t.warningHigh || 0, t.criticalHigh || 0, t.warningLow || 0, t.criticalLow || 0);
      return mx * 1.2 > 10 ? Math.ceil(mx * 1.2) : 10;
    },
    // Segmentos de color del arco (fracciones ascendentes hasta 1).
    axisSegments() {
      const t = this.config.thresholds || {};
      const span = this.max - this.min || 1;
      const f = (v) => Math.min(1, Math.max(0, (v - this.min) / span));
      const pts = [];
      if (t.criticalLow != null) pts.push([f(t.criticalLow), '#fd5d93']);
      if (t.warningLow  != null) pts.push([f(t.warningLow),  '#ff8d72']);
      // tramo medio "ok"
      const highStart = t.warningHigh != null ? f(t.warningHigh) : (t.criticalHigh != null ? f(t.criticalHigh) : 1);
      pts.push([highStart, '#00bf9a']);
      if (t.warningHigh  != null) pts.push([t.criticalHigh != null ? f(t.criticalHigh) : 1, '#ff8d72']);
      if (t.criticalHigh != null) pts.push([1, '#fd5d93']);
      // Sin ningún umbral → arco neutro.
      const hasAny = t.criticalLow != null || t.warningLow != null || t.warningHigh != null || t.criticalHigh != null;
      if (!hasAny) return [[1, '#1d8cf8']];
      // Asegurar orden ascendente y terminar en 1.
      const seen = [];
      let last = 0;
      for (const [frac, col] of pts) {
        const ff = Math.max(last, Math.min(1, frac));
        seen.push([ff, col]);
        last = ff;
      }
      if (seen.length && seen[seen.length - 1][0] < 1) seen.push([1, seen[seen.length - 1][1]]);
      return seen;
    },
    chartOption() {
      return {
        series: [{
          type: 'gauge',
          min: this.min,
          max: this.max,
          radius: '95%',
          center: ['50%', '60%'],
          startAngle: 210,
          endAngle: -30,
          progress: { show: false },
          pointer: { width: 4, length: '62%', itemStyle: { color: 'auto' } },
          axisLine: { lineStyle: { width: 10, color: this.axisSegments } },
          axisTick: { show: false },
          splitLine: { length: 10, lineStyle: { color: '#3a4150', width: 1 } },
          axisLabel: { color: '#6b7280', fontSize: 9, distance: 12 },
          anchor: { show: false },
          title: { show: false },
          detail: {
            valueAnimation: true,
            formatter: () => this.label,
            color: '#fff',
            fontSize: 15,
            fontWeight: '600',
            offsetCenter: [0, '42%'],
          },
          data: [{ value: this.hasData ? this.num : this.min }],
        }],
      };
    },
  },
};
</script>

<style scoped>
.gauge { display: flex; justify-content: center; }
.gauge__canvas { width: 100%; height: 150px; max-width: 220px; }
.gauge__nodata { color: #6b7280; font-style: italic; opacity: 0.7; }
.gauge__na     { color: #6b7280; opacity: 0.7; font-size: 1.4em; }
</style>
