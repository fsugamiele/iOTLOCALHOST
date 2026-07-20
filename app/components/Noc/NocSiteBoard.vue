<template>
  <div class="row noc-site-board">
    <div class="col-xl-7 col-12">
      <card class="noc-map-card">
        <div slot="header"><h5 class="card-title mb-0">Mapa de sitios</h5></div>
        <div ref="mapEl" class="noc-map"></div>
        <div class="map-legend">
          <!-- R5 · G8 · 4 — misma clasificación que la tabla (Crítico/Atención/Normal). -->
          <span class="legend-item"><span class="dot dot-critical"></span> Crítico</span>
          <span class="legend-item"><span class="dot dot-warning"></span> Atención</span>
          <span class="legend-item"><span class="dot dot-ok"></span> Normal</span>
        </div>
      </card>
    </div>
    <div class="col-xl-5 col-12">
      <card class="noc-table-card">
        <div slot="header"><h5 class="card-title mb-0">Estado de sitios</h5></div>
        <div v-if="!sites || sites.length === 0" class="text-muted text-center p-3">
          Sin sitios en el scope.
        </div>
        <div v-else class="table-responsive">
        <table class="table noc-sites-table">
          <thead>
            <!-- R6 · pedido Franco — sin íconos en los headers, solo texto.
                 R7 · pedido Franco — "Combustible" abreviado a "Comb." para
                 no romper el layout de la columna. -->
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
    // R5 · G8 · 4 — severidad unificada en castellano en toda la página.
    // Tabla: Crítico / Atención / Normal.
    statusLabel(status) {
      if (status === 'critical') return 'Crítico';
      if (status === 'warning')  return 'Atención';
      return 'Normal';
    },
    // R5 · G8 · 1 — separadas en value y age para renderizar en dos líneas
    // (patrón espejo de la columna "Sitio": código bold + nombre muted).
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
/* R4 · G7 · 5 — mapa 400px por defecto; en <768px baja a 300px. */
.noc-map        { height: 400px; width: 100%; }
@media (max-width: 767.98px) {
  .noc-map      { height: 300px; }
}
/* Tabla scrollea horizontal en mobile (evita colapsar celdas) */
.table-responsive { overflow-x: auto; }
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

/* R6 · pedido Franco — separación coherente entre esta card y la
   Tendencia · red, matching la que existe entre Tendencia y las
   Alertas recientes/7 días. El card interno tiene margin-bottom:30px
   propio del template (assets/sass/dashboard/custom/_card.scss:6),
   pero al forzar height:100% en las cards para igualar la altura, el
   flex del col visualmente absorbe ese margen. Compensamos aplicando
   el mismo 30px directo al row wrapper. */
.noc-site-board                       { margin-bottom: 30px; }

/* Fallback de badges scoped (ajuste 5') — no dependemos de que el template
   Bootstrap traiga .badge-*. Colores alineados con DEC-REF-27. */
.noc-badge              { display: inline-block; padding: 0.25em 0.55em; border-radius: 0.35em; font-size: 0.75em; font-weight: 600; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
.noc-badge-danger       { background: #E24B4A; }
.noc-badge-warning      { background: #EF9F27; color: #333; }
.noc-badge-success      { background: #639922; }
.noc-badge-info         { background: #3aa2ff; }
</style>

<!-- DEC-REF-70 (f) · #50 — .site-pin vive en assets/sass/dashboard/custom/_leaflet-pins.scss (global). -->

