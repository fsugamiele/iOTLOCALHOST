<template>
  <!-- FASE 4 rediseño alarmas — mini gráfico de columnas con los fires de la
       regla por semana (5 buckets, del más viejo a "esta"). Detalle /alarmas/:id. -->
  <div ref="chart" class="alarm-rec-chart"></div>
</template>

<script>
import echartsBase from '../Widgets/echartsBase.js';

export default {
  name: 'AlarmRecurrenceChart',
  mixins: [echartsBase],
  props: {
    weekly:  { type: Array, default: () => [] }, // [5] fires por semana
    color:   { type: String, default: '#1d8cf8' },
    isLight: { type: Boolean, default: false },
  },
  computed: {
    chartOption() {
      const w = (this.weekly || []).map(n => Number(n) || 0);
      if (w.length !== 5 || w.every(n => n === 0)) return null;
      const axis = this.isLight ? '#5a5e7a' : '#8a8a9a';
      return {
        grid: { left: 26, right: 8, top: 10, bottom: 22 },
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            const p = Array.isArray(params) ? params[0] : params;
            return `${p.name}: ${p.value} fire${p.value === 1 ? '' : 's'}`;
          },
        },
        xAxis: {
          type: 'category',
          data: ['S−4', 'S−3', 'S−2', 'S−1', 'esta'],
          axisLabel: { color: axis, fontSize: 9 },
          axisLine: { lineStyle: { color: axis } },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          axisLabel: { color: axis, fontSize: 9 },
          splitLine: { lineStyle: { color: this.isLight ? 'rgba(30,30,60,0.10)' : 'rgba(130,130,150,0.12)' } },
        },
        series: [{
          type: 'bar',
          data: w,
          barMaxWidth: 22,
          itemStyle: { color: this.color, borderRadius: [3, 3, 0, 0], opacity: 0.9 },
        }],
      };
    },
  },
};
</script>

<style scoped>
.alarm-rec-chart { width: 100%; height: 130px; }
</style>
