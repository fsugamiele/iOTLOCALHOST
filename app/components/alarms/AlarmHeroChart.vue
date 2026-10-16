<template>
  <!-- FASE 4 rediseño alarmas — gráfico hero del detalle /alarmas/:id.
       Telemetría medida (visualMap: el tramo en violación toma el color de
       severidad), markLine punteada del umbral a lo ancho de TODO el eje,
       bandas sombreadas de episodios previos (30d, vienen del endpoint),
       markPoints fire/ACK/resolve, vertical "ahora" (solo si cae dentro del
       dominio; si la alarma sigue activa y la telemetría quedó corta, el eje
       se extiende hasta ahora) y, si hay forecast, proyección PUNTEADA
       VIOLETA (reservado a pronósticos) con área rgba(167,94,234,0.08) y zona
       de ventana proyectada rgba(29,140,248,0.05) desde "ahora" al fin del
       eje. Mixin echartsBase (init/setOption/ResizeObserver/dispose). -->
  <div ref="chart" class="alarm-hero-chart"></div>
</template>

<script>
import echartsBase from '../Widgets/echartsBase.js';

const SEV_COLORS = { critical: '#fd5d93', warning: '#ff8d72', info: '#1d8cf8' };
const FORECAST = '#a55eea';
const MEASURED = '#00d6b4';
const NOW_SLOP_MS = 5 * 60 * 1000;      // "ahora" se dibuja aunque pase levemente el último dato
const NOW_EXTEND_MS = 6 * 3600 * 1000;  // alarma viva: extiende el eje hasta ahora si la telemetría quedó atrás

export default {
  name: 'AlarmHeroChart',
  mixins: [echartsBase],
  props: {
    telemetry:  { type: Array, default: () => [] },   // [{time,value}]
    threshold:  { type: Number, default: null },
    unit:       { type: String, default: '' },
    severity:   { type: String, default: 'info' },
    alarmValue: { type: Number, default: null },      // valor actual/disparo (lado del umbral)
    firedAt:    { type: Number, default: null },
    resolvedAt: { type: Number, default: null },
    ackAt:      { type: Number, default: null },
    nowMs:      { type: Number, default: null },      // data.now del server + offset
    forecast:   { type: Object, default: null },      // {points:[{time,value}], quality, ...}
    episodes:   { type: Array, default: () => [] },   // [{firedAt,resolvedAt}] previos
    isLight:    { type: Boolean, default: false },
  },
  computed: {
    sevColor() { return SEV_COLORS[this.severity] || SEV_COLORS.info; },
    tel() {
      return (this.telemetry || [])
        .map(p => [Number(p.time), Number(p.value)])
        .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .sort((a, b) => a[0] - b[0]);
    },
    forecastPts() {
      if (!this.forecast || !Array.isArray(this.forecast.points)) return [];
      return this.forecast.points
        .map(p => [Number(p.time), Number(p.value)])
        .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .sort((a, b) => a[0] - b[0]);
    },
    chartOption() {
      const tel = this.tel;
      if (!tel.length) return null;
      const th = (typeof this.threshold === 'number' && Number.isFinite(this.threshold))
        ? this.threshold : null;
      const axis = this.isLight ? '#5a5e7a' : '#8a8a9a';
      const grid = this.isLight ? 'rgba(30,30,60,0.12)' : 'rgba(130,130,150,0.15)';

      const fPts = this.forecastPts;
      const domainStart = tel[0][0];
      let domainEnd = tel[tel.length - 1][0];
      if (fPts.length) domainEnd = Math.max(domainEnd, fPts[fPts.length - 1][0]);

      // "Ahora": solo si cae dentro del dominio (±slop). Si la alarma sigue
      // viva y la telemetría quedó atrás (<6h), se EXTIENDE el eje hasta ahora
      // para que la línea y la zona proyectada sean visibles. Resuelta vieja
      // → fuera de dominio → no se dibuja.
      let nowX = null;
      if (this.nowMs != null && this.nowMs >= domainStart) {
        if (this.nowMs <= domainEnd + NOW_SLOP_MS) {
          nowX = this.nowMs;
        } else if (!fPts.length && this.resolvedAt == null
                   && this.nowMs - tel[tel.length - 1][0] < NOW_EXTEND_MS) {
          domainEnd = this.nowMs;
          nowX = this.nowMs;
        }
      }

      const valAt = (t) => {
        let best = null;
        for (const p of tel) {
          if (best === null || Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
        }
        return best ? best[1] : (th != null ? th : tel[0][1]);
      };

      // Lado de la violación: por el valor actual/disparo de la alarma.
      const above = th != null && this.alarmValue != null ? this.alarmValue >= th : true;

      const mlData = [];
      if (th != null) {
        mlData.push({
          yAxis: th,
          lineStyle: { color: this.sevColor, type: 'dashed', width: 1.4 },
          label: {
            formatter: `umbral ${th}${this.unit ? ' ' + this.unit : ''}`,
            color: this.sevColor, fontSize: 10, position: 'insideEndTop',
          },
        });
      }
      if (nowX != null) {
        mlData.push({
          xAxis: nowX,
          lineStyle: { color: axis, type: 'dashed', width: 1, opacity: 0.55 },
          label: { formatter: 'ahora', color: axis, fontSize: 10, position: 'insideStartTop' },
        });
      }

      // Bandas de episodios previos (recortadas al dominio visible).
      const maData = [];
      for (const ep of (this.episodes || [])) {
        const x1 = Number(ep.firedAt);
        if (!Number.isFinite(x1)) continue;
        const x2raw = ep.resolvedAt != null ? Number(ep.resolvedAt) : domainEnd;
        if (!Number.isFinite(x2raw)) continue;
        const a = Math.max(x1, domainStart);
        const b = Math.min(x2raw, domainEnd);
        if (b > a) maData.push([{ xAxis: a }, { xAxis: b }]);
      }

      const mpData = [];
      if (this.firedAt != null) {
        mpData.push({
          coord: [this.firedAt, valAt(this.firedAt)],
          symbol: 'triangle', symbolSize: 12,
          itemStyle: { color: '#fd5d93' },
          label: { formatter: 'fire', color: '#fd5d93', fontSize: 10, position: 'top' },
        });
      }
      if (this.resolvedAt != null) {
        mpData.push({
          coord: [this.resolvedAt, valAt(this.resolvedAt)],
          symbol: 'triangle', symbolSize: 12, symbolRotate: 180,
          itemStyle: { color: '#00bf9a' },
          label: { formatter: 'resolve', color: '#00bf9a', fontSize: 10, position: 'bottom' },
        });
      }
      if (this.ackAt != null) {
        mpData.push({
          coord: [this.ackAt, valAt(this.ackAt)],
          symbol: 'pin', symbolSize: 26,
          itemStyle: { color: '#1d8cf8' },
          label: { formatter: 'ACK', color: '#1d8cf8', fontSize: 9, position: 'bottom', distance: 6 },
        });
      }

      const series = [{
        name: 'medido',
        type: 'line',
        data: tel,
        showSymbol: false,
        smooth: 0.3,
        lineStyle: { width: 2 },
        itemStyle: { color: MEASURED },
        z: 3,
        markLine: mlData.length ? { symbol: 'none', silent: true, data: mlData } : undefined,
        markPoint: mpData.length ? { silent: true, data: mpData } : undefined,
        markArea: maData.length ? {
          silent: true,
          itemStyle: { color: this.sevColor, opacity: 0.08 },
          data: maData,
        } : undefined,
      }];

      // visualMap: tramo en violación pintado con el color de severidad.
      const visualMap = (th != null) ? {
        show: false, seriesIndex: 0, dimension: 1,
        pieces: above
          ? [{ max: th, color: MEASURED }, { min: th, color: this.sevColor }]
          : [{ max: th, color: this.sevColor }, { min: th, color: MEASURED }],
      } : undefined;

      // Pronóstico: violeta punteado anclado al último punto medido + zona
      // azul de ventana proyectada desde "ahora" (o el último dato) al fin.
      if (fPts.length) {
        const last = tel[tel.length - 1];
        const zoneStart = nowX != null ? nowX : last[0];
        const zoneEnd = fPts[fPts.length - 1][0];
        series.push({
          name: 'pronóstico',
          type: 'line',
          data: [last, ...fPts],
          showSymbol: false,
          smooth: false,
          lineStyle: { color: FORECAST, width: 2, type: 'dashed' },
          itemStyle: { color: FORECAST },
          areaStyle: { color: 'rgba(167,94,234,0.08)' },
          z: 2,
          markArea: (zoneEnd > zoneStart) ? {
            silent: true,
            itemStyle: { color: 'rgba(29,140,248,0.05)' },
            data: [[{ xAxis: zoneStart }, { xAxis: zoneEnd }]],
          } : undefined,
        });
      }

      const fmt = (v) => (v == null ? '' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: 3 }));
      return {
        grid: { left: 54, right: 20, top: 20, bottom: 30 },
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            const arr = Array.isArray(params) ? params : [params];
            if (!arr.length || !arr[0].value) return '';
            const lines = [new Date(arr[0].value[0]).toLocaleString('es-AR')];
            for (const p of arr) {
              if (!p.value) continue;
              lines.push(`${p.marker} ${p.seriesName}: ${fmt(p.value[1])}${this.unit ? ' ' + this.unit : ''}`);
            }
            return lines.join('<br/>');
          },
        },
        visualMap,
        xAxis: {
          type: 'time',
          min: domainStart,
          max: domainEnd,
          axisLabel: { color: axis, fontSize: 10 },
          axisLine: { lineStyle: { color: axis } },
        },
        yAxis: {
          type: 'value', scale: true,
          name: this.unit || '',
          nameTextStyle: { color: axis, fontSize: 10 },
          axisLabel: { color: axis, fontSize: 10 },
          splitLine: { lineStyle: { color: grid } },
        },
        series,
      };
    },
  },
};
</script>

<style scoped>
.alarm-hero-chart { width: 100%; height: 380px; }
</style>
