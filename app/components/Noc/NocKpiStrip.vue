<template>
  <div class="row noc-kpi-strip">
    <div v-for="(kpi, key) in kpis" :key="key" class="col-xl-3 col-md-6 col-12">
      <card class="card-stats noc-kpi-card">
        <div class="noc-kpi-label">{{ kpi.label }}</div>
        <h2 class="noc-kpi-value">
          <template v-if="key === 'dieselDelta24h'">
            <template v-if="kpi.value !== null && kpi.value !== undefined">
              {{ kpi.value }}<span class="noc-kpi-unit"> %</span>
            </template>
            <template v-else><span class="noc-kpi-empty">—</span></template>
          </template>
          <template v-else-if="kpi.value !== null && kpi.value !== undefined">
            {{ kpi.value }}<span v-if="kpi.unit" class="noc-kpi-unit"> {{ kpi.unit }}</span>
          </template>
          <template v-else>
            <span class="noc-kpi-empty">—</span>
          </template>
        </h2>
        <p class="noc-kpi-sublabel">{{ SUBLABELS[key] || kpi.sublabel }}</p>
        <p v-if="key === 'sitesOnline'" class="noc-kpi-detail">de {{ kpi.total }}</p>
        <p v-else-if="key === 'dieselDelta24h'" class="noc-kpi-detail" :class="dieselDeltaClass(kpi.delta24h)">
          <template v-if="kpi.delta24h == null">—</template>
          <template v-else>
            {{ kpi.delta24h < 0 ? '↓' : (kpi.delta24h > 0 ? '↑' : '·') }}
            {{ Math.abs(kpi.delta24h) }} en 24h
          </template>
        </p>
        <p v-else-if="key === 'activeAlerts' && (kpi.critical + kpi.warning) > 0" class="noc-kpi-detail">
          <span v-if="kpi.critical > 0" class="text-danger">{{ kpi.critical }} críticas</span>
          <span v-if="kpi.critical > 0 && kpi.warning > 0"> · </span>
          <span v-if="kpi.warning > 0" class="text-warning">{{ kpi.warning }} atención</span>
        </p>
        <p v-else-if="key === 'uptime' && kpi.expected > 0" class="noc-kpi-detail">
          {{ kpi.received }} / {{ kpi.expected }} msgs
        </p>
      </card>
    </div>
  </div>
</template>

<script>
// Dumb component: renderiza los 4 KPIs con label + sublabel + value tal como
// vienen del contrato /dashboard/noc.
//
// R4 · G7 · 4 — sublabels cortos fijos por key (frontend override sobre lo
// que traiga el backend, para uniformar el visual de la strip). El backend
// mantiene sus sublabels descriptivos para consumidores no visuales.
// Card diésel muestra NIVEL % como value grande y delta24h como detalle
// (rojo si baja, verde si sube).
//
// Prop `scope` viaja desde el día uno (DEC-DASH-2): habilita reuso futuro
// en la site-page (Hub display) sin refactor. En esta ronda no altera nada.
const SUBLABELS = {
  sitesOnline:    'en cadencia',
  dieselDelta24h: 'nivel promedio red',
  activeAlerts:   'activas',
  uptime:         'últimos 7 días',
};

export default {
  name: 'NocKpiStrip',
  props: {
    kpis:  { type: Object, required: true },
    scope: { type: String, default: 'red', validator: v => ['red', 'site'].includes(v) },
  },
  data() { return { SUBLABELS }; },
  methods: {
    dieselDeltaClass(delta) {
      if (delta == null) return '';
      return delta < 0 ? 'text-danger' : (delta > 0 ? 'text-success' : '');
    },
  },
};
</script>

<style scoped>
/* R4 · G7 · 4 — min-height uniforme para las 4 cards y padding consistente
   con el estilo del template (.card-stats trae padding propio de la
   plantilla; acá sólo garantizamos altura mínima y layout vertical). */
.noc-kpi-card {
  min-height: 145px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.noc-kpi-label    { text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.8em; opacity: 0.75; }
.noc-kpi-value    { margin: 0.4em 0 0.15em; font-weight: 500; }
.noc-kpi-unit     { font-size: 0.55em; opacity: 0.7; margin-left: 0.25em; }
.noc-kpi-empty    { opacity: 0.4; }
.noc-kpi-sublabel { margin: 0; font-size: 0.85em; opacity: 0.75; }
.noc-kpi-detail   { margin: 0.35em 0 0; font-size: 0.75em; opacity: 0.8; }
</style>
