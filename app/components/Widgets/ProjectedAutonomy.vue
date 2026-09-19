<template>
  <div class="projected-autonomy">
    <template v-if="hasData">
      <div ref="chart" class="projected-autonomy__canvas"></div>
    </template>
    <template v-else>
      <span v-if="context === 'editor'" class="projected-autonomy__na">—</span>
      <span v-else class="projected-autonomy__nodata">sin dato</span>
    </template>
  </div>
</template>

<script>
// DEC-REF-98 D-3 (#73) + DEC-REF-107 (Paso 2, diseño) — projectedAutonomy.
// Ahora se dibuja como gauge radial ECharts con zonas de color por umbral.
// value = horas de autonomía que PUBLICA EL EQUIPO (la calcula el controlador
// del fabricante — la ficha la declara; la plataforma no estima consumo).
// Color con criterio tanque: lo crítico es ABAJO (criticalLow/warningLow, en h).
import echartsBase from '@/components/Widgets/echartsBase.js';

export default {
  name: 'ProjectedAutonomy',
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
    hours() { return Number(this.value); },
    formatted() {
      const h = this.hours;
      if (h < 1) return Math.round(h * 60) + ' min';
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return mm ? `${hh} h ${mm} min` : `${hh} h`;
    },
    gaugeMax() {
      const t = this.config.thresholds || {};
      const mx = Math.max(this.hasData ? this.hours : 0, t.warningLow || 0, t.criticalLow || 0);
      return mx * 1.2 > 24 ? Math.ceil(mx * 1.2) : 24;
    },
    // Segmentos del arco: crítico (rojo) abajo, warning (ámbar) medio, ok
    // (verde) arriba. Sin umbrales → arco neutro azul.
    axisSegments() {
      const t = this.config.thresholds || {};
      const max = this.gaugeMax;
      if (t.criticalLow == null && t.warningLow == null) return [[1, '#1d8cf8']];
      const c = t.criticalLow != null ? t.criticalLow : t.warningLow;
      const w = t.warningLow  != null ? t.warningLow  : t.criticalLow;
      const lo = Math.min(c, w);
      const hi = Math.max(c, w);
      const segs = [[lo / max, '#fd5d93']];
      if (hi > lo) segs.push([hi / max, '#ff8d72']);
      segs.push([1, '#00bf9a']);
      return segs;
    },
    chartOption() {
      return {
        series: [{
          type: 'gauge',
          min: 0,
          max: this.gaugeMax,
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
            formatter: () => this.formatted,
            color: '#fff',
            fontSize: 16,
            fontWeight: '600',
            offsetCenter: [0, '42%'],
          },
          data: [{ value: this.hours }],
        }],
      };
    },
  },
};
</script>

<style scoped>
.projected-autonomy {
  display: flex;
  justify-content: center;
}
.projected-autonomy__canvas {
  width: 100%;
  height: 150px;
  max-width: 220px;
}
.projected-autonomy__nodata { color: #6b7280; font-style: italic; opacity: 0.7; }
.projected-autonomy__na     { color: #6b7280; opacity: 0.7; font-size: 1.4em; }
</style>
