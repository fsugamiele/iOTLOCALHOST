<template>
  <!-- Tabla de estado de sitios del Panel (split de NocSiteBoard — Panel
       personalizable). Fila navega al sitio (drill-down DEC-REF-69). -->
  <div class="noc-sites-table-wrap">
    <div v-if="!sites || sites.length === 0" class="text-muted text-center p-3">
      Sin sitios en el scope.
    </div>
    <div v-else class="table-responsive">
      <table class="table noc-sites-table">
        <thead>
          <!-- R6 · pedido Franco — sin íconos en los headers, solo texto.
               R7 · pedido Franco — "Combustible" abreviado a "Comb.". -->
          <tr>
            <th>Sitio</th>
            <th>Estado</th>
            <th>Comb.</th>
            <th>Temp</th>
            <th>Red</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sites" :key="s.siteCode" class="clickable" @click="goSite(s.siteCode)">
            <td>
              <strong>{{ s.siteCode }}</strong>
              <div class="text-muted small">{{ s.nombre }}</div>
            </td>
            <td>
              <span :class="['noc-badge', 'noc-badge-' + badgeVariant(s.status)]">
                {{ statusLabel(s.status) }}
              </span>
              <div v-if="!s.online" class="text-warning small">offline</div>
            </td>
            <td>
              <template v-if="lastValueValue(s.lastValues.fuel) !== null">
                <div>{{ lastValueValue(s.lastValues.fuel) }}%</div>
                <div class="text-muted small">hace {{ lastValueAge(s.lastValues.fuel) }}</div>
              </template>
              <template v-else>—</template>
            </td>
            <td>
              <template v-if="lastValueValue(s.lastValues.temp) !== null">
                <div>{{ lastValueValue(s.lastValues.temp) }}°C</div>
                <div class="text-muted small">hace {{ lastValueAge(s.lastValues.temp) }}</div>
              </template>
              <template v-else>—</template>
            </td>
            <td>
              <template v-if="lastValueValue(s.lastValues.mains) !== null">
                <div>{{ lastValueValue(s.lastValues.mains) }}V</div>
                <div class="text-muted small">hace {{ lastValueAge(s.lastValues.mains) }}</div>
              </template>
              <template v-else>—</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
export default {
  name: 'NocSitesTable',
  props: {
    sites:   { type: Array,   default: () => [] },
    isLight: { type: Boolean, default: false },
  },
  methods: {
    goSite(siteCode) { this.$router.push('/sites/' + siteCode); },
    badgeVariant(status) {
      if (status === 'critical') return 'danger';
      if (status === 'warning')  return 'warning';
      return 'success';
    },
    // R5 · G8 · 4 — severidad unificada en castellano: Crítico/Atención/Normal.
    statusLabel(status) {
      if (status === 'critical') return 'Crítico';
      if (status === 'warning')  return 'Atención';
      return 'Normal';
    },
    // R5 · G8 · 1 — value y age separados para renderizar en dos líneas.
    lastValueValue(lv) {
      if (!lv || lv.value == null) return null;
      return Math.round(lv.value * 10) / 10;
    },
    lastValueAge(lv) {
      if (!lv) return '';
      const age = lv.ageSec;
      return age < 60 ? age + 's'
           : age < 3600 ? Math.floor(age / 60) + 'm'
           : Math.floor(age / 3600) + 'h';
    },
  },
};
</script>

<style scoped>
.noc-sites-table-wrap { height: 100%; overflow: auto; }
.table-responsive     { overflow-x: auto; }
.noc-sites-table tr.clickable         { cursor: pointer; }
.noc-sites-table tr.clickable:hover   { background: rgba(255, 255, 255, 0.04); }

/* Fallback de badges scoped (ajuste 5') — colores alineados con DEC-REF-27. */
.noc-badge              { display: inline-block; padding: 0.25em 0.55em; border-radius: 0.35em; font-size: 0.75em; font-weight: 600; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
.noc-badge-danger       { background: #E24B4A; }
.noc-badge-warning      { background: #EF9F27; color: #333; }
.noc-badge-success      { background: #639922; }
.noc-badge-info         { background: #3aa2ff; }
</style>
