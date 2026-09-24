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
    // DEC-REF-113 F2 (#84) — re-dibujar cuando cambia el TAMAÑO DE LA CELDA
    // (drag/resize de la grilla, cambio de tab): antes solo se escuchaba
    // window.resize, y el gráfico quedaba distorsionado dentro de la celda.
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.$_resizeChart());
    }
  },
  beforeDestroy() {
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
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
        // DEC-REF-113 F2 (#84) — observar la celda real del gráfico.
        if (this._ro) { this._ro.disconnect(); this._ro.observe(el); }
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
