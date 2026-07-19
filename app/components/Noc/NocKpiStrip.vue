<template>
  <div class="row noc-kpi-strip">
    <div v-for="(kpi, key) in kpis" :key="key" class="col-lg-3 col-md-6 col-sm-6">
      <card class="card-stats noc-kpi-card">
        <div class="noc-kpi-label">{{ kpi.label }}</div>
        <h2 class="noc-kpi-value">
          <template v-if="kpi.value !== null && kpi.value !== undefined">
            {{ kpi.value }}<span v-if="kpi.unit" class="noc-kpi-unit"> {{ kpi.unit }}</span>
          </template>
          <template v-else>
            <span class="noc-kpi-empty">—</span>
          </template>
        </h2>
        <p class="noc-kpi-sublabel">{{ kpi.sublabel }}</p>
        <p v-if="key === 'sitesOnline'" class="noc-kpi-detail">de {{ kpi.total }}</p>
        <p v-else-if="key === 'dieselDelta24h' && kpi.sitesWithFuel != null" class="noc-kpi-detail">
          {{ kpi.sitesWithFuel }} sitios con fuel
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
// vienen del contrato /dashboard/noc. Sin lógica de negocio — el desglose
// visual (críticas/atención · sitios con fuel · received/expected) es
// presentación de campos ya provistos por el backend.
//
// Prop `scope` viaja desde el día uno (DEC-DASH-2): habilita reuso futuro
// en la site-page (Hub display) sin refactor. En esta ronda no altera nada.
export default {
  name: 'NocKpiStrip',
  props: {
    kpis:  { type: Object, required: true },
    scope: { type: String, default: 'red', validator: v => ['red', 'site'].includes(v) },
  },
};
</script>

<style scoped>
.noc-kpi-label    { text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.8em; opacity: 0.75; }
.noc-kpi-value    { margin: 0.4em 0 0.15em; font-weight: 500; }
.noc-kpi-unit     { font-size: 0.55em; opacity: 0.7; margin-left: 0.25em; }
.noc-kpi-empty    { opacity: 0.4; }
.noc-kpi-sublabel { margin: 0; font-size: 0.85em; opacity: 0.75; }
.noc-kpi-detail   { margin: 0.35em 0 0; font-size: 0.75em; opacity: 0.8; }
</style>
