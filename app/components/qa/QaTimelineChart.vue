<template>
  <!-- DEC-REF-141 · Línea de tiempo con ECharts (mixin echartsBase). La curva es la
       medición en el tiempo (auto-escalada); las verticales son cada vez que la alarma
       se prendió (rojo) o apagó (azul); la horizontal punteada roja es el umbral.
       Reemplaza el SVG a mano. -->
  <div ref="chart" class="qa-echart"></div>
</template>

<script>
import echartsBase from '../Widgets/echartsBase.js';

export default {
  name: 'QaTimelineChart',
  mixins: [echartsBase],
  props: {
    telemetry: { type: Array, default: () => [] }, // [{time,value}]
    events: { type: Array, default: () => [] },    // [{time,kind}]
    threshold: { type: Number, default: null },
    variable: { type: String, default: '' },
    hours: { type: Number, default: 48 },
  },
  computed: {
    chartOption() {
      const tel = (this.telemetry || [])
        .map(p => [Number(p.time), Number(p.value)])
        .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .sort((a, b) => a[0] - b[0]);
      const evs = (this.events || []).slice(0, 200);
      if (!tel.length && !evs.length) return null;
      const th = (typeof this.threshold === 'number') ? this.threshold : null;

      // Marcas verticales de encendido/apagado de la alarma.
      const evLines = evs.map(e => ({
        xAxis: Number(e.time),
        lineStyle: { color: e.kind === 'resolve' ? '#2b64a6' : '#ec250d', width: 1, opacity: 0.55 },
      }));
      const thLine = (th != null) ? [{
        yAxis: th,
        lineStyle: { color: '#ec250d', type: 'dashed', width: 1 },
        label: { formatter: 'umbral ' + th, color: '#ec250d', fontSize: 9 },
      }] : [];

      return {
        grid: { left: 54, right: 16, top: 16, bottom: 28 },
        tooltip: {
          trigger: 'axis',
          formatter: (p) => {
            if (!p || !p.length || !p[0].value) return '';
            const d = new Date(p[0].value[0]);
            return d.toLocaleString('es-AR') + '<br/>' + (this.variable || 'valor') + ': ' + p[0].value[1];
          },
        },
        xAxis: {
          type: 'time',
          axisLabel: { color: '#8a8a9a', fontSize: 9 },
          axisLine: { lineStyle: { color: '#55556a' } },
        },
        yAxis: {
          type: 'value', scale: true,
          name: this.variable || '',
          nameTextStyle: { color: '#8a8a9a', fontSize: 9 },
          axisLabel: { color: '#8a8a9a', fontSize: 9 },
          splitLine: { lineStyle: { color: 'rgba(130,130,150,0.15)' } },
        },
        series: [{
          type: 'line',
          showSymbol: false,
          smooth: true,
          data: tel,
          lineStyle: { color: '#00bf9a', width: 1.5 },
          itemStyle: { color: '#00bf9a' },
          markLine: (thLine.length || evLines.length) ? {
            symbol: 'none', silent: true,
            data: [...thLine, ...evLines],
          } : undefined,
        }],
      };
    },
  },
};
</script>

<style scoped>
.qa-echart { width: 100%; height: 340px; }
</style>
