<template>
  <div class="row noc-site-board">
    <div class="col-lg-7 col-md-12">
      <card class="noc-map-card">
        <div slot="header"><h5 class="card-title mb-0">Mapa de sitios</h5></div>
        <div ref="mapEl" class="noc-map"></div>
        <div class="map-legend">
          <span class="legend-item"><span class="dot dot-critical"></span> Urgencia</span>
          <span class="legend-item"><span class="dot dot-warning"></span> Atención</span>
          <span class="legend-item"><span class="dot dot-ok"></span> Normal</span>
        </div>
      </card>
    </div>
    <div class="col-lg-5 col-md-12">
      <card class="noc-table-card">
        <div slot="header"><h5 class="card-title mb-0">Estado de sitios</h5></div>
        <div v-if="!sites || sites.length === 0" class="text-muted text-center p-3">
          Sin sitios en el scope.
        </div>
        <table v-else class="table noc-sites-table">
          <thead>
            <tr>
              <th>Sitio</th><th>Estado</th><th>Fuel</th><th>Temp</th><th>Mains</th>
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
              <td>{{ lastValueDisplay(s.lastValues.fuel, '%') }}</td>
              <td>{{ lastValueDisplay(s.lastValues.temp, '°C') }}</td>
              <td>{{ lastValueDisplay(s.lastValues.mains, 'V') }}</td>
            </tr>
          </tbody>
        </table>
      </card>
    </div>
  </div>
</template>

<script>
// Card doble: mini-mapa Leaflet (patrón sites/index.vue) + tabla de estado.
// Pin y fila navegan a /sites/:siteCode (drill-down DEC-REF-69). Reusa el
// factory divIcon extraído a leafletPin.js (ajuste 3', fuente única DEC-REF-27).
// isLight se acepta como prop uniforme con el resto del NOC (los tiles OSM
// funcionan bien en ambos temas — no lo aplico dentro).
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { iconForStatus } from '@/components/Noc/leafletPin.js';

export default {
  name: 'NocSiteBoard',
  props: {
    sites:   { type: Array,   default: () => [] },
    isLight: { type: Boolean, default: false },
  },
  data() { return { map: null, markers: [] }; },
  mounted() {
    this.initMap();
    this.renderPins();
  },
  beforeDestroy() {
    if (this.map) { this.map.remove(); this.map = null; }
  },
  watch: {
    sites: { deep: false, handler() { this.renderPins(); } },
  },
  methods: {
    initMap() {
      this.map = L.map(this.$refs.mapEl).setView([-28.5, -57.0], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(this.map);
    },
    renderPins() {
      if (!this.map) return;
      this.markers.forEach(m => this.map.removeLayer(m));
      this.markers = [];
      (this.sites || [])
        .filter(s => s.lat != null && s.lng != null)
        .forEach(s => this.addPin(s));
      this.$nextTick(() => this.map && this.map.invalidateSize());
    },
    addPin(site) {
      const marker = L.marker([site.lat, site.lng], { icon: iconForStatus(site.status) })
        .addTo(this.map)
        .bindTooltip(`${site.nombre || site.siteCode} (${site.siteCode})`);
      marker.on('click', () => this.goSite(site.siteCode));
      this.markers.push(marker);
    },
    goSite(siteCode) { this.$router.push('/sites/' + siteCode); },
    badgeVariant(status) {
      if (status === 'critical') return 'danger';
      if (status === 'warning')  return 'warning';
      return 'success';
    },
    statusLabel(status) {
      if (status === 'critical') return 'Urgencia';
      if (status === 'warning')  return 'Atención';
      return 'Normal';
    },
    lastValueDisplay(lv, unit) {
      if (!lv || lv.value == null) return '—';
      const val = Math.round(lv.value * 10) / 10;
      const age = lv.ageSec;
      const ageStr = age < 60 ? age + 's'
                   : age < 3600 ? Math.floor(age / 60) + 'm'
                   : Math.floor(age / 3600) + 'h';
      return `${val}${unit} · hace ${ageStr}`;
    },
  },
};
</script>

<style scoped>
.noc-map        { height: 400px; width: 100%; }
.noc-map-card,
.noc-table-card { height: 100%; }
.map-legend     { display: flex; gap: 1em; margin-top: 0.5em; font-size: 0.85em; }
.legend-item    { display: flex; align-items: center; gap: 0.35em; }
.dot            { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot-critical   { background: #E24B4A; }
.dot-warning    { background: #EF9F27; }
.dot-ok         { background: #639922; }
.noc-sites-table tr.clickable         { cursor: pointer; }
.noc-sites-table tr.clickable:hover   { background: rgba(255, 255, 255, 0.04); }

/* Fallback de badges scoped (ajuste 5') — no dependemos de que el template
   Bootstrap traiga .badge-*. Colores alineados con DEC-REF-27. */
.noc-badge              { display: inline-block; padding: 0.25em 0.55em; border-radius: 0.35em; font-size: 0.75em; font-weight: 600; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
.noc-badge-danger       { background: #E24B4A; }
.noc-badge-warning      { background: #EF9F27; color: #333; }
.noc-badge-success      { background: #639922; }
.noc-badge-info         { background: #3aa2ff; }
</style>
