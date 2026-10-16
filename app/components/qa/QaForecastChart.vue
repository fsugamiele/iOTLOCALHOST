<template>
  <!-- DEC-REF-144 · Pronóstico de tendencia con ECharts (mixin echartsBase).
       Línea LLENA teal = histórico medido; línea PUNTEADA azul = proyección;
       la banda celeste entre lo/hi = margen de incertidumbre; la horizontal
       roja punteada = umbral de la regla; la vertical gris = "ahora" (separa
       lo medido de lo proyectado). Todo encuadrado como PROYECCIÓN, no certeza
       (dirección DEC-REF-142 §3). Los datos salen crudos del endpoint
       /qa/rule/:id/forecast; este componente solo dibuja. -->
  <div ref="chart" class="qa-echart"></div>
</template>

<script>
import echartsBase from '../Widgets/echartsBase.js';

export default {
  name: 'QaForecastChart',
  mixins: [echartsBase],
  props: {
    historical: { type: Array, default: () => [] },  // [{time,value}]
    projection: { type: Array, default: () => [] },   // [{time,value,lo,hi}]
    threshold: { type: Number, default: null },
    variable: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  computed: {
    chartOption() {
      // Series del histórico: pares [ms, valor] ordenados y saneados.
      const hist = (this.historical || [])
        .map(p => [Number(p.time), Number(p.value)])
        .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .sort((a, b) => a[0] - b[0]);

      // Proyección: valor central + límites lo/hi de la banda.
      const projRaw = (this.projection || [])
        .map(p => ({ time: Number(p.time), value: Number(p.value), lo: Number(p.lo), hi: Number(p.hi) }))
        .filter(p => Number.isFinite(p.time) && Number.isFinite(p.value))
        .sort((a, b) => a.time - b.time);

      if (!hist.length && !projRaw.length) return null;

      const projValue = projRaw.map(p => [p.time, p.value]);
      // Banda: serie base = lo, serie apilada = (hi - lo) con areaStyle tenue.
      // Es el patrón estándar ECharts para pintar el área ENTRE dos curvas sin
      // tapar el fondo. Si falta lo/hi en un punto, no se dibuja banda ahí.
      const hasBand = projRaw.some(p => Number.isFinite(p.lo) && Number.isFinite(p.hi));
      const bandLo = projRaw.map(p => [p.time, Number.isFinite(p.lo) ? p.lo : null]);
      const bandSpan = projRaw.map(p => [
        p.time,
        (Number.isFinite(p.lo) && Number.isFinite(p.hi)) ? (p.hi - p.lo) : null,
      ]);

      const th = (typeof this.threshold === 'number' && Number.isFinite(this.threshold)) ? this.threshold : null;

      // "Ahora" = frontera entre lo medido y lo proyectado. Preferimos el último
      // histórico; si no hay, el primer punto proyectado.
      const nowX = hist.length ? hist[hist.length - 1][0]
        : (projRaw.length ? projRaw[0].time : null);

      // markLine del gráfico (umbral horizontal + "ahora" vertical). Se cuelga
      // de la serie del histórico (siempre presente o, si no, de la proyección).
      const mlData = [];
      if (th != null) {
        mlData.push({
          yAxis: th,
          lineStyle: { color: '#ec250d', type: 'dashed', width: 1 },
          label: { formatter: 'umbral ' + th, color: '#ec250d', fontSize: 9, position: 'insideEndTop' },
        });
      }
      if (nowX != null) {
        mlData.push({
          xAxis: nowX,
          lineStyle: { color: '#8a8a9a', type: 'solid', width: 1, opacity: 0.6 },
          label: { formatter: 'ahora', color: '#8a8a9a', fontSize: 9, position: 'insideStartTop' },
        });
      }

      const fmt = (v) => (v == null ? '' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: 3 }));

      const series = [];

      // (c) Banda de incertidumbre — primero, para que quede DETRÁS de las líneas.
      if (hasBand) {
        series.push({
          name: '__band_lo',
          type: 'line',
          data: bandLo,
          showSymbol: false,
          lineStyle: { opacity: 0 },
          stack: 'band',
          silent: true,
          z: 1,
        });
        series.push({
          name: '__band_span',
          type: 'line',
          data: bandSpan,
          showSymbol: false,
          lineStyle: { opacity: 0 },
          areaStyle: { color: 'rgba(127,176,236,0.18)' },
          stack: 'band',
          silent: true,
          z: 1,
        });
      }

      // (a) Histórico: línea llena teal.
      series.push({
        name: this.variable || 'medido',
        type: 'line',
        data: hist,
        showSymbol: false,
        smooth: false,
        lineStyle: { color: '#00bf9a', width: 2 },
        itemStyle: { color: '#00bf9a' },
        z: 3,
        markLine: mlData.length ? { symbol: 'none', silent: true, data: mlData } : undefined,
      });

      // (b) Proyección: línea punteada azul (info).
      series.push({
        name: 'proyección',
        type: 'line',
        data: projValue,
        showSymbol: false,
        smooth: false,
        lineStyle: { color: '#7fb0ec', width: 2, type: 'dashed' },
        itemStyle: { color: '#7fb0ec' },
        z: 2,
      });

      return {
        grid: { left: 54, right: 16, top: 18, bottom: 28 },
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            const arr = Array.isArray(params) ? params : [params];
            // Ignora las series internas de banda en el tooltip.
            const real = arr.filter(p => p.seriesName !== '__band_lo' && p.seriesName !== '__band_span');
            if (!real.length || !real[0].value) return '';
            const d = new Date(real[0].value[0]);
            const lines = [d.toLocaleString('es-AR')];
            for (const p of real) {
              if (!p.value) continue;
              lines.push(`${p.marker} ${p.seriesName}: ${fmt(p.value[1])}`);
            }
            return lines.join('<br/>');
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
        series,
      };
    },
  },
};
</script>

<style scoped>
.qa-echart { width: 100%; height: 300px; }
</style>
