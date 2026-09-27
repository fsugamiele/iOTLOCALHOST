<template>
  <!-- Mapa de sitios del Panel (split de NocSiteBoard — Panel personalizable:
       el mapa y la tabla ahora son widgets independientes). Pin navega al
       sitio (drill-down DEC-REF-69). -->
  <div class="noc-site-map">
    <div ref="mapEl" class="noc-map"></div>
    <div class="map-legend">
      <!-- R5 · G8 · 4 — misma clasificación que la tabla (Crítico/Atención/Normal). -->
      <span class="legend-item"><span class="dot dot-critical"></span> Crítico</span>
      <span class="legend-item"><span class="dot dot-warning"></span> Atención</span>
      <span class="legend-item"><span class="dot dot-ok"></span> Normal</span>
    </div>
  </div>
</template>

<script>
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { iconForStatus } from '@/components/Noc/leafletPin.js';

export default {
  name: 'NocSiteMap',
  props: {
    sites:   { type: Array,   default: () => [] },
    isLight: { type: Boolean, default: false },
  },
  data() { return { map: null, markers: [] }; },
  mounted() {
    this.initMap();
    this.renderPins();
    // La grilla dispara window.resize tras drag/resize: Leaflet no escucha
    // el resize del contenedor, hay que invalidar el tamaño a mano.
    this._onResize = () => { this.map && this.map.invalidateSize(); };
    window.addEventListener('resize', this._onResize);
  },
  beforeDestroy() {
    if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
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
  },
};
</script>

<style scoped>
.noc-site-map  { height: 100%; display: flex; flex-direction: column; }
/* El mapa llena el widget; la grilla define la altura (autoajustable). */
.noc-map       { flex: 1 1 auto; min-height: 200px; width: 100%; }
.map-legend    { display: flex; gap: 1em; margin-top: 0.5em; font-size: 0.85em; flex: 0 0 auto; }
.legend-item   { display: flex; align-items: center; gap: 0.35em; }
.dot           { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot-critical  { background: #E24B4A; }
.dot-warning   { background: #EF9F27; }
.dot-ok        { background: #639922; }
</style>
