<template>
  <!-- FASE 4 rediseño alarmas — sparkline mini de una variable hermana
       (siblings del detalle /alarmas/:id), con markLine punteada del umbral
       si viene. Sin ejes: contexto, no análisis. -->
  <div ref="chart" class="alarm-spark"></div>
</template>

<script>
import echartsBase from '../Widgets/echartsBase.js';

export default {
  name: 'AlarmSparkline',
  mixins: [echartsBase],
  props: {
    points:    { type: Array, default: () => [] }, // [{time,value}]
    threshold: { type: Number, default: null },
    isLight:   { type: Boolean, default: false },
  },
  computed: {
    chartOption() {
      const pts = (this.points || [])
        .map(p => [Number(p.time), Number(p.value)])
        .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .sort((a, b) => a[0] - b[0]);
      if (pts.length < 2) return null;
      const th = (typeof this.threshold === 'number' && Number.isFinite(this.threshold))
        ? this.threshold : null;
      // "Caliente" si el último valor ya supera el umbral (misma regla del mockup).
      const hot = th != null && pts[pts.length - 1][1] > th;
      const col = hot ? '#ff8d72' : '#1d8cf8';
      return {
        grid: { left: 4, right: 4, top: 6, bottom: 4 },
        xAxis: { type: 'time', show: false },
        yAxis: { type: 'value', show: false, scale: true },
        tooltip: { show: false },
        series: [{
          type: 'line',
          data: pts,
          showSymbol: false,
          smooth: false,
          silent: true,
          lineStyle: { color: col, width: 1.6 },
          itemStyle: { color: col },
          markLine: (th != null) ? {
            symbol: 'none', silent: true,
            data: [{ yAxis: th, lineStyle: { color: col, type: 'dashed', width: 1, opacity: 0.7 } }],
            label: { show: false },
          } : undefined,
        }],
      };
    },
  },
};
</script>

<style scoped>
.alarm-spark { width: 100%; height: 96px; }
</style>
