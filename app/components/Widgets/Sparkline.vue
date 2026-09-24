<template>
  <div class="sparkline">
    <div ref="chart" class="sparkline__canvas"></div>
    <div v-if="hasData" class="sparkline__last">{{ display }} <small>{{ unit }}</small></div>
    <div v-else class="sparkline__nodata">
      <span v-if="context === 'editor'">—</span><span v-else>sin dato</span>
    </div>
  </div>
</template>

<script>
// DEC-REF-107 (Paso 2) — REPRESENTACIÓN `sparkline` de la familia numérica.
// Mini tendencia. Toma el HISTORIAL de la variable (GET /get-last-data →
// [{time,value}]) al montar y APENDE cada valor live que llega por `value`
// (buffer rodante). En editor muestra una serie de muestra.
import echartsBase from '@/components/Widgets/echartsBase.js';

export default {
  name: 'Sparkline',
  mixins: [echartsBase],
  props: {
    value:   { default: null },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  data() {
    return { series: [] };  // [{ time, value }]
  },
  computed: {
    unit() { return this.config.unit || ''; },
    hasData() {
      return this.series.length > 0 || (this.value != null && Number.isFinite(Number(this.value)));
    },
    decimals() {
      return Number.isFinite(this.config.decimalPlaces) ? this.config.decimalPlaces : (this.config.variableType === 'int' ? 0 : 1);
    },
    display() {
      const last = this.series.length ? this.series[this.series.length - 1].value : Number(this.value);
      return Number.isFinite(last) ? last.toFixed(this.decimals) : '—';
    },
    points() { return this.series.map((p) => [p.time, p.value]); },
    chartOption() {
      return {
        grid: { left: 2, right: 2, top: 6, bottom: 2 },
        xAxis: { type: 'time', show: false },
        yAxis: { type: 'value', show: false, scale: true },
        // DEC-REF-113 F1 (#84) — valores al pasar el puntero sobre la línea
        // (pedido de Franco: la mini tendencia también informa el punto).
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line', lineStyle: { color: '#6b7280', width: 1 } },
          backgroundColor: 'rgba(30, 30, 47, 0.92)',
          borderWidth: 0,
          textStyle: { color: '#fff', fontSize: 11 },
          formatter: (ps) => {
            const p = Array.isArray(ps) ? ps[0] : ps;
            if (!p || !p.value) return '';
            const d = new Date(p.value[0]);
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            const v = Number(p.value[1]);
            const val = Number.isFinite(v) ? v.toFixed(this.decimals) : p.value[1];
            return `${hh}:${mm} — <b>${val}</b> ${this.unit}`;
          },
        },
        series: [{
          type: 'line',
          data: this.points,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2, color: '#00bf9a' },
          areaStyle: { color: 'rgba(29,140,248,0.15)' },
        }],
      };
    },
  },
  watch: {
    value(v) {
      if (v != null && Number.isFinite(Number(v))) {
        this.series.push({ time: Date.now(), value: Number(v) });
        if (this.series.length > 300) this.series.shift();
      }
    },
  },
  async mounted() {
    if (this.context === 'editor') {
      this.series = this.sampleSeries();
      return;
    }
    if (this.config.dId && this.config.variable) {
      try {
        const res = await this.$axios.get('/get-last-data', {
          params: { dId: this.config.dId, variable: this.config.variable, chartTimeAgo: this.config.chartTimeAgo || 60 },
          headers: { token: this.$store.state.auth.token },
        });
        if (res.data && res.data.status === 'success' && Array.isArray(res.data.data)) {
          this.series = res.data.data
            .filter((d) => d && Number.isFinite(Number(d.value)) && Number.isFinite(Number(d.time)))
            .map((d) => ({ time: Number(d.time), value: Number(d.value) }));
        }
      } catch (e) {
        // Silent: sin historial, el buffer live va llenando solo.
      }
    }
  },
  methods: {
    sampleSeries() {
      const now = Date.now();
      const arr = [];
      let v = 40;
      for (let i = 30; i >= 0; i--) {
        v += (Math.random() - 0.5) * 8;
        arr.push({ time: now - i * 60000, value: Math.round(v * 10) / 10 });
      }
      return arr;
    },
  },
};
</script>

<style scoped>
.sparkline { width: 100%; display: flex; flex-direction: column; }
.sparkline__canvas { width: 100%; height: 70px; }
.sparkline__last { text-align: right; font-weight: 600; color: #fff; font-size: 1.1em; }
/* DEC-REF-113 F1 (#84) — modo claro: el último valor era blanco (invisible). */
.white-content .sparkline__last { color: #2b3553; }
.sparkline__last small { color: #6b7280; font-size: 0.7em; }
.sparkline__nodata { color: #6b7280; font-style: italic; opacity: 0.7; text-align: center; }
</style>
