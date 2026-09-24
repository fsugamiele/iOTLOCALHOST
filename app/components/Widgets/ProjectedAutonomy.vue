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
      // DEC-REF-113 F1 (#84) — texto del valor legible en modo claro
      // (mismo patrón que Gauge.vue: se relee en cada tick de dato).
      const isLight = typeof document !== 'undefined' && document.body.classList.contains('white-content');
      return {
        series: [{
          type: 'gauge',
          min: 0,
          max: this.gaugeMax,
          // DEC-REF-113 F3 (#84) — geometría anti-distorsión: radio 80% (el
          // 95% pegaba los números al borde), 4 divisiones con etiquetas
          // enteras (antes labels solapados tipo "4,8 / 9,6 / 14,4").
          radius: '80%',
          center: ['50%', '58%'],
          startAngle: 210,
          endAngle: -30,
          splitNumber: 4,
          progress: { show: false },
          pointer: { width: 4, length: '62%', itemStyle: { color: 'auto' } },
          axisLine: { lineStyle: { width: 10, color: this.axisSegments } },
          axisTick: { show: false },
          splitLine: { length: 10, lineStyle: { color: '#3a4150', width: 1 } },
          axisLabel: { color: '#6b7280', fontSize: 10, distance: 14, formatter: (v) => String(Math.round(v)) },
          anchor: { show: false },
          title: { show: false },
          detail: {
            valueAnimation: true,
            formatter: () => this.formatted,
            color: isLight ? '#2b3553' : '#fff',
            fontSize: 18,
            fontWeight: '600',
            offsetCenter: [0, '40%'],
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
  width: 100%;
}
.projected-autonomy__canvas {
  /* DEC-REF-113 F3 (#84) — llenar la celda; min-height por si la cadena
     flex no resuelve alto (editor/preview). */
  width: 100%;
  height: 100%;
  min-height: 140px;
}
.projected-autonomy__nodata { color: #6b7280; font-style: italic; opacity: 0.7; }
.projected-autonomy__na     { color: #6b7280; opacity: 0.7; font-size: 1.4em; }
</style>
