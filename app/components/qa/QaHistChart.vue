<template>
  <!-- DEC-REF-141 · Histograma de distribución con ECharts (mixin echartsBase).
       Cada barra = cuántas lecturas cayeron en ese rango de la variable. Las barras
       del lado "en alarma" (según el operador) se pintan rojas; la línea punteada
       roja marca el umbral. Reemplaza el SVG a mano (no escalaba/renderizaba bien). -->
  <div ref="chart" class="qa-echart"></div>
</template>

<script>
import echartsBase from '../Widgets/echartsBase.js';

export default {
  name: 'QaHistChart',
  mixins: [echartsBase],
  props: {
    histogram: { type: Array, default: () => [] }, // [{from,to,count}]
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    threshold: { type: Number, default: null },
    op: { type: String, default: null },  // 'gt'|'gte'|'lt'|'lte'|'eq'|'neq'|null
    variable: { type: String, default: '' },
  },
  computed: {
    chartOption() {
      const bins = this.histogram || [];
      if (!bins.length) return null;
      const th = (typeof this.threshold === 'number') ? this.threshold : null;
      const op = this.op;
      const fmt = (v) => (v == null ? '' : (Math.abs(v) >= 100 ? Number(v).toFixed(0) : Number(v).toFixed(1)));

      // ¿El bin cae del lado "en alarma"? Depende del operador de la regla.
      const inAlarm = (b) => {
        if (th == null || !op) return false;
        const c = (b.from + b.to) / 2;
        if (op === 'gt' || op === 'gte') return c > th;
        if (op === 'lt' || op === 'lte') return c < th;
        if (op === 'eq') return th >= b.from && th <= b.to;
        if (op === 'neq') return !(th >= b.from && th <= b.to);
        return false;
      };

      const labels = bins.map(b => fmt((b.from + b.to) / 2));
      const data = bins.map(b => ({
        value: b.count,
        itemStyle: { color: inAlarm(b) ? '#ec250d' : '#00bf9a' },
      }));

      // Índice del bin que contiene el umbral → línea vertical punteada.
      let thIdx = -1;
      if (th != null) {
        for (let i = 0; i < bins.length; i++) {
          if (th >= bins[i].from && th <= bins[i].to) { thIdx = i; break; }
        }
      }

      const series = [{
        type: 'bar',
        data,
        barWidth: '92%',
        markLine: thIdx >= 0 ? {
          symbol: 'none', silent: true,
          lineStyle: { color: '#ec250d', type: 'dashed', width: 2 },
          label: { formatter: 'umbral ' + fmt(th), color: '#ec250d', fontSize: 10, position: 'insideEndTop' },
          data: [{ xAxis: thIdx }],
        } : undefined,
      }];

      return {
        grid: { left: 46, right: 14, top: 30, bottom: 34 },
        title: {
          text: this.variable ? ('Distribución de ' + this.variable) : 'Distribución de la medición',
          textStyle: { color: '#b9b9c3', fontSize: 12, fontWeight: 'normal' }, left: 0, top: 2,
        },
        tooltip: {
          trigger: 'axis',
          formatter: (p) => {
            const b = bins[p[0].dataIndex] || {};
            return `${p[0].value} lectura(s)<br/>entre ${fmt(b.from)} y ${fmt(b.to)}`;
          },
        },
        xAxis: {
          type: 'category', data: labels,
          axisLabel: { color: '#8a8a9a', fontSize: 9, interval: 'auto' },
          axisLine: { lineStyle: { color: '#55556a' } },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value', name: 'lecturas',
          nameTextStyle: { color: '#8a8a9a', fontSize: 9 },
          axisLabel: { color: '#8a8a9a', fontSize: 9 },
          splitLine: { lineStyle: { color: 'rgba(130,130,150,0.15)' } },
        },
        series,
      };
    },
  },
};
</script>

<style scoped>
.qa-echart { width: 100%; height: 190px; }
</style>
