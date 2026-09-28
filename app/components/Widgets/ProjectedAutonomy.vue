<template>
  <div class="projected-autonomy">
    <template v-if="hasData">
      <span v-if="sourceLabel" class="pa-badge" :class="'pa-badge--' + sourceKind" :title="sourceTip">{{ sourceLabel }}</span>
      <div ref="chart" class="projected-autonomy__canvas"></div>
      <div v-if="hasExtra" class="pa-info">
        <div v-if="fuel != null" class="pa-bar" :title="'Combustible ' + fuelPct + '%'">
          <span class="pa-bar__fill" :style="{ width: fuelPct + '%' }"></span>
          <span class="pa-bar__txt">{{ litersFmt }}</span>
        </div>
        <div v-if="lph != null" class="pa-lph">{{ lphFmt }}</div>
      </div>
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
    // #88 — variables hermanas que publica el edge (autonomy.js). Las alimenta
    // el Live dedicado ProjectedAutonomyLive (widget de primera clase); el
    // presenter queda PURO (solo props, sin MQTT).
    source:  { default: null },   // 'measured' | 'estimated'
    lph:     { default: null },   // consumo usado (L/h)
    liters:  { default: null },   // litros restantes
    fuel:    { default: null },   // % de combustible (barra)
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  computed: {
    hasData() {
      return this.value !== null && this.value !== undefined && Number.isFinite(Number(this.value));
    },
    sourceKind() { return this.source === 'measured' ? 'measured' : 'estimated'; },
    sourceLabel() {
      if (this.source === 'measured') return 'medida';
      if (this.source === 'estimated') return 'estimada';
      return '';
    },
    sourceTip() {
      return this.sourceKind === 'measured'
        ? 'Autonomía MEDIDA: consumo real observado con el grupo en marcha.'
        : 'Autonomía ESTIMADA: consumo nominal de la ficha (aún sin medición en marcha).';
    },
    hasExtra() { return this.fuel != null || this.lph != null || this.liters != null; },
    fuelPct() { const f = Number(this.fuel); return Number.isFinite(f) ? Math.max(0, Math.min(100, Math.round(f))) : 0; },
    litersFmt() { return this.liters != null ? `${Math.round(Number(this.liters))} L` : `${this.fuelPct}%`; },
    lphFmt() {
      const n = Math.round(Number(this.lph) * 10) / 10;
      return `${n} L/h ${this.sourceKind === 'measured' ? '(observado)' : '(nominal)'}`;
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  position: relative;
}
.projected-autonomy__canvas {
  /* DEC-REF-113 F3 (#84) — llenar la celda; min-height por si la cadena
     flex no resuelve alto (editor/preview). */
  width: 100%;
  height: 100%;
  min-height: 120px;
  flex: 1 1 auto;
}
.projected-autonomy__nodata { color: #6b7280; font-style: italic; opacity: 0.7; }
.projected-autonomy__na     { color: #6b7280; opacity: 0.7; font-size: 1.4em; }

/* #88 — badge de fuente (medida/estimada) + barra de combustible + consumo */
.pa-badge { position: absolute; top: 2px; right: 4px; font-size: 0.62rem; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; border-radius: 10px; padding: 2px 8px; z-index: 2; }
.pa-badge--measured  { color: #00806c; background: rgba(0,191,154,.18); }
.pa-badge--estimated { color: #7d879c; background: rgba(136,152,170,.18); }
.pa-info { width: 100%; padding: 0 6px 2px; }
.pa-bar { position: relative; height: 16px; border-radius: 8px; background: rgba(136,152,170,.18); overflow: hidden; margin-bottom: 3px; }
.pa-bar__fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #00bf9a, #00d9b8); border-radius: 8px; transition: width .4s ease; }
.pa-bar__txt { position: relative; display: block; text-align: center; font-size: 0.66rem; line-height: 16px; font-weight: 600; color: #32325d; }
.pa-lph { text-align: center; font-size: 0.66rem; color: #8898aa; }
body:not(.white-content) .pa-bar__txt { color: #fff; }
</style>
