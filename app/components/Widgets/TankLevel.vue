<template>
  <div class="tank-level">
    <template v-if="hasData">
      <div ref="chart" class="tank-level__canvas"></div>
      <div v-if="liters !== null" class="tank-level__liters">
        {{ liters }} <small>{{ config.tankUnit || 'L' }}</small>
      </div>
    </template>
    <template v-else>
      <span v-if="context === 'editor'" class="tank-level__na">—</span>
      <span v-else class="tank-level__nodata">sin dato</span>
    </template>
  </div>
</template>

<script>
// DEC-REF-98 D-3 (#73) + DEC-REF-107 (Paso 2, diseño) — tankLevel.
// Ahora se dibuja con ECharts liquidFill (líquido ondulante) en vez de la
// barra CSS. value = nivel 0-100 (%). Si el template declara tankCapacity,
// muestra el contenido absoluto (litros = % × capacidad). Color por
// thresholds (convención DEC-REF-70 g): para un tanque lo crítico es ABAJO
// → criticalLow/warningLow. Sin umbrales → azul neutro (no afirmar "ok" sin
// criterio, misma regla que ValueStatus).
import echartsBase from '@/components/Widgets/echartsBase.js';

export default {
  name: 'TankLevel',
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
    pct() {
      const n = Number(this.value);
      return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
    },
    liters() {
      const cap = Number(this.config.tankCapacity);
      if (!Number.isFinite(cap) || cap <= 0) return null;
      return Math.round(this.pct * cap / 100);
    },
    status() {
      if (!this.hasData) return this.context === 'editor' ? 'na' : 'nodata';
      const t = this.config.thresholds || {};
      const n = this.pct;
      if (t.criticalLow != null && n < t.criticalLow) return 'critical';
      if (t.warningLow  != null && n < t.warningLow)  return 'warning';
      if (t.criticalLow != null || t.warningLow != null) return 'ok';
      return 'unknown';
    },
    statusColor() {
      return {
        ok:       '#00bf9a',
        warning:  '#ff8d72',
        critical: '#fd5d93',
      }[this.status] || '#1d8cf8';
    },
    chartOption() {
      const color = this.statusColor;
      const frac = this.pct / 100;
      return {
        series: [{
          type: 'liquidFill',
          radius: '92%',
          center: ['50%', '50%'],
          data: [frac, frac],          // dos ondas desfasadas
          color: [color],
          backgroundStyle: { color: 'rgba(255,255,255,0.04)' },
          outline: {
            show: true,
            borderDistance: 2,
            itemStyle: { borderColor: color, borderWidth: 2, shadowBlur: 0 },
          },
          amplitude: 5,
          waveLength: '80%',
          period: 3000,
          label: {
            formatter: () => this.pct + '%',
            fontSize: 22,
            fontWeight: '600',
            color: '#fff',
            insideColor: '#0b0f19',
          },
        }],
      };
    },
  },
};
</script>

<style scoped>
.tank-level {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.tank-level__canvas {
  width: 140px;
  height: 140px;
}
.tank-level__liters {
  margin-top: 4px;
  color: #9aa5b1;
  font-size: 0.8em;
}
.tank-level__nodata { color: #6b7280; font-style: italic; opacity: 0.7; }
.tank-level__na     { color: #6b7280; opacity: 0.7; font-size: 1.4em; }
</style>
