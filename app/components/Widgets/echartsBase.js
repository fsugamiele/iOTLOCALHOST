// DEC-REF-107 (Paso 2, diseño) — MIXIN BASE ECHARTS para widgets gráficos.
//
// El componente que lo usa declara:
//   - un `<div ref="chart" ...>` con dimensiones en su template
//   - un computed `chartOption` (la opción ECharts a renderizar)
// El mixin se encarga de init/setOption/resize/dispose y de re-renderizar
// cuando `chartOption` cambia. La instancia ECharts se guarda en `this._chart`
// (fuera de data() → NO reactiva, evita que Vue la envuelva).
//
// SPA (ssr:false): `mounted` corre solo en cliente, así que echarts.init tiene
// DOM. El import de echarts/liquidfill no toca window (registro perezoso), por
// lo que el build estático (nuxt generate) no rompe.
import * as echarts from 'echarts';
import 'echarts-liquidfill';

export default {
  mounted() {
    this.$nextTick(this.$_renderChart);
  },
  beforeDestroy() {
    this.$_disposeChart();
    window.removeEventListener('resize', this.$_resizeChart);
  },
  watch: {
    chartOption: {
      deep: true,
      handler() {
        this.$nextTick(this.$_renderChart);
      },
    },
  },
  methods: {
    $_renderChart() {
      const el = this.$refs.chart;
      // Sin contenedor (p.ej. estado "sin dato" con v-if) → soltar la instancia.
      if (!el) {
        this.$_disposeChart();
        return;
      }
      if (!this._chart) {
        this._chart = echarts.init(el);
        window.addEventListener('resize', this.$_resizeChart);
      }
      if (this.chartOption) this._chart.setOption(this.chartOption, true);
    },
    $_disposeChart() {
      if (this._chart) {
        this._chart.dispose();
        this._chart = null;
      }
    },
    $_resizeChart() {
      if (this._chart) this._chart.resize();
    },
  },
};
