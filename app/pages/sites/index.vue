<template>
  <div class="content">
    <!-- Header simple -->
    <div class="row">
      <div class="col-12">
        <h2 class="title">
          Sitios
          <small class="text-muted ml-2">— monitoreo</small>
        </h2>
        <p class="text-muted mb-4">
          Mapa de sitios con estado en vivo. Hacé clic en un sitio para ver el detalle.
        </p>
      </div>
    </div>

    <!-- Estado de carga inicial -->
    <div v-if="loading" class="row">
      <div class="col-12 text-center">
        <i class="tim-icons icon-refresh-01 spin"></i>
        Cargando sitios...
      </div>
    </div>

    <!-- Error si la API responde mal -->
    <div v-else-if="loadError" class="row">
      <div class="col-12">
        <card>
          <div class="text-center text-danger">
            <i class="tim-icons icon-alert-circle-exc"></i>
            <h4>No se pudieron cargar los sitios</h4>
            <p>{{ loadError }}</p>
          </div>
        </card>
      </div>
    </div>

    <!-- Mapa -->
    <div v-show="!loading && !loadError" class="row">
      <div class="col-12">
        <card>
          <div ref="mapEl" class="sites-map"></div>
          <!-- Leyenda -->
          <div class="map-legend">
            <span class="legend-item"><span class="dot dot-critical"></span> Urgencia</span>
            <span class="legend-item"><span class="dot dot-warning"></span> Atención</span>
            <span class="legend-item"><span class="dot dot-ok"></span> Normal</span>
          </div>
        </card>
      </div>
    </div>

    <!-- GESTIÓN DE SITIOS (DEC-REF-97): alta/edición/borrado por UI.
         La escritura la autoriza el backend (grants); si el usuario no
         tiene grant que cubra el operador/zona, el 403 se muestra claro. -->
    <div class="row">
      <div class="col-12">
        <card>
          <div slot="header" style="display:flex; justify-content:space-between; align-items:center">
            <h4 class="card-title" style="margin:0">Gestión de sitios</h4>
            <base-button type="primary" size="sm" @click="openCreate">
              <i class="fa fa-plus" style="margin-right:6px"></i>Nuevo sitio
            </base-button>
          </div>

          <el-table :data="sitesAdmin" size="small">
            <el-table-column prop="siteCode" label="Código" width="110">
              <template slot-scope="{ row }">
                <code style="font-size:11px">{{ row.siteCode }}</code>
              </template>
            </el-table-column>
            <el-table-column prop="nombre" label="Nombre" min-width="140" />
            <el-table-column prop="tipo" label="Tipo" width="100" />
            <el-table-column label="Operador / Zona" min-width="150">
              <template slot-scope="{ row }">
                {{ operatorLabel(row.operatorCode) }} · {{ zoneLabel(row.operatorCode, row.zoneCode) }}
              </template>
            </el-table-column>
            <el-table-column label="Dispositivos" width="110" align="center">
              <template slot-scope="{ row }">
                <span style="background:#1d8cf8; color:#fff; border-radius:10px; padding:2px 10px; font-size:12px">
                  {{ (row.devices || []).length }}
                </span>
              </template>
            </el-table-column>
            <el-table-column header-align="right" align="right" label="Acciones" width="130">
              <div slot-scope="{ row }" class="text-right table-actions">
                <el-tooltip content="Ver detalle" effect="light" :open-delay="300" placement="top">
                  <base-button @click="$router.push('/sites/' + row.siteCode)" type="info" icon size="sm" class="btn-link">
                    <i class="tim-icons icon-zoom-split"></i>
                  </base-button>
                </el-tooltip>
                <el-tooltip content="Editar" effect="light" :open-delay="300" placement="top">
                  <base-button @click="openEdit(row)" type="warning" icon size="sm" class="btn-link">
                    <i class="tim-icons icon-pencil"></i>
                  </base-button>
                </el-tooltip>
                <el-tooltip content="Eliminar" effect="light" :open-delay="300" placement="top">
                  <base-button @click="deleteSite(row)" type="danger" icon size="sm" class="btn-link">
                    <i class="fa fa-trash"></i>
                  </base-button>
                </el-tooltip>
              </div>
            </el-table-column>
          </el-table>
        </card>
      </div>
    </div>

    <!-- MODAL CREAR / EDITAR SITIO -->
    <el-dialog
      :title="editing ? 'Editar sitio ' + siteForm.siteCode : 'Nuevo sitio'"
      :visible.sync="siteModal"
      width="60%"
      append-to-body
    >
      <div class="row">
        <base-input
          class="col-4"
          v-model="siteForm.siteCode"
          label="Código de sitio (identidad, inmutable)"
          placeholder="ej. CR99001"
          :disabled="editing"
        />
        <base-input class="col-8" v-model="siteForm.nombre" label="Nombre" placeholder="ej. Torre Corrientes Capital" />
      </div>
      <div class="row">
        <div class="col-4">
          <label class="control-label">Tipo</label>
          <el-select v-model="siteForm.tipo" placeholder="Tipo" style="width:100%" class="select-primary">
            <el-option value="BTS" label="BTS" />
            <el-option value="shelter" label="Shelter" />
            <el-option value="repeater" label="Repetidor" />
          </el-select>
        </div>
        <div class="col-4">
          <label class="control-label">Operador</label>
          <el-select
            v-model="siteForm.operatorCode"
            placeholder="Operador"
            style="width:100%"
            class="select-primary"
            filterable
            @change="siteForm.zoneCode = ''"
          >
            <el-option
              v-for="op in operators"
              :key="op.operatorCode"
              :value="op.operatorCode"
              :label="(op.displayName || op.operatorCode) + ' (' + op.operatorCode + ')'"
            />
          </el-select>
        </div>
        <div class="col-4">
          <label class="control-label">Zona</label>
          <el-select
            v-model="siteForm.zoneCode"
            placeholder="Zona"
            style="width:100%"
            class="select-primary"
            filterable
            :disabled="!siteForm.operatorCode"
          >
            <el-option
              v-for="z in zonesForOperator"
              :key="z.zoneCode"
              :value="z.zoneCode"
              :label="(z.displayName || z.zoneCode) + ' (' + z.zoneCode + ')'"
            />
          </el-select>
        </div>
      </div>
      <div class="row" style="margin-top:14px">
        <base-input class="col-3" v-model.number="siteForm.lat" label="Latitud" type="number" placeholder="-28.4691" />
        <base-input class="col-3" v-model.number="siteForm.lng" label="Longitud" type="number" placeholder="-57.8342" />
        <base-input class="col-6" v-model="siteForm.direccion" label="Dirección" placeholder="calle y número" />
      </div>
      <div class="row">
        <base-input class="col-4" v-model="siteForm.provincia" label="Provincia" />
        <base-input class="col-4" v-model="siteForm.localidad" label="Localidad" />
        <base-input class="col-4" v-model="siteForm.notes" label="Notas (opcional)" />
      </div>
      <span slot="footer">
        <base-button type="secondary" @click="siteModal = false">Cancelar</base-button>
        <base-button type="primary" @click="saveSite" :disabled="!canSaveSite || saving">
          <i class="fa" :class="saving ? 'fa-spinner fa-spin' : 'fa-save'" style="margin-right:6px"></i>
          {{ saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear sitio') }}
        </base-button>
      </span>
    </el-dialog>

  </div>
</template>

<script>
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Table, TableColumn, Dialog, Select, Option, Tooltip, MessageBox } from 'element-ui';
// DEC-REF-27 · fuente única del pin — extraído en R3 de #49 (ajuste 3'/2').
import { iconForStatus } from '@/components/Noc/leafletPin.js';

const EMPTY_SITE_FORM = () => ({
  siteCode: '',
  nombre: '',
  tipo: '',
  operatorCode: '',
  zoneCode: '',
  lat: null,
  lng: null,
  direccion: '',
  provincia: '',
  localidad: '',
  notes: '',
});

export default {
  name: 'SitesMap',
  middleware: 'authenticated',
  components: {
    [Table.name]: Table,
    [TableColumn.name]: TableColumn,
    [Dialog.name]: Dialog,
    [Select.name]: Select,
    [Option.name]: Option,
    [Tooltip.name]: Tooltip,
  },

  data() {
    return {
      loading: true,
      loadError: null,
      sites: [],
      map: null,
      markers: [],

      // DEC-REF-97 — gestión CRUD
      sitesAdmin: [],
      operators: [],
      zones: [],
      siteModal: false,
      editing: false,
      siteForm: EMPTY_SITE_FORM(),
      saving: false,
    };
  },

  computed: {
    zonesForOperator() {
      return this.zones.filter((z) => z.operatorCode === this.siteForm.operatorCode);
    },
    canSaveSite() {
      const f = this.siteForm;
      return !!(f.siteCode && f.nombre && f.tipo && f.operatorCode && f.zoneCode);
    },
  },

  async mounted() {
    this.initMap();
    await this.loadSites();
    this.loadAdminData();

    // SF-4 · DEC-REF-64-A (ii) + R13 — real-time-lite del pin, SILENCIOSO.
    // Al llegar una notif del bus, refrescamos SOLO los pins que cambiaron
    // status via `refreshSitesSilently()` — sin tocar `loading` (no aparece
    // el spinner) y sin desmontar/remontar el mapa (no parpadea). Cambio
    // acotado por marker: `setIcon(newIcon)` solo si el status del site
    // cambió. Espeja el patrón DEC-REF-44 con el pulido de calidad de
    // R13 (deuda declarada al cerrar R12/GATE 10-bis).
    this._notifHandler = () => {
      this.refreshSitesSilently().catch((e) => console.warn('[SitesMap] silent refresh failed', e));
    };
    this.$nuxt.$on('wanomi:notif', this._notifHandler);
  },

  beforeDestroy() {
    // Limpieza listener wanomi:notif — evita fugas si el usuario navega
    // fuera de /sites y vuelve.
    if (this._notifHandler) {
      this.$nuxt.$off('wanomi:notif', this._notifHandler);
      this._notifHandler = null;
    }
    // Teardown del mapa (DEC-STACK-1: ciclo de vida explícito, migrable)
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  },

  methods: {
    initMap() {
      // Centro aproximado NEA Argentina (Corrientes); zoom regional
      this.map = L.map(this.$refs.mapEl).setView([-28.5, -57.0], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(this.map);
    },

    async loadSites() {
      this.loading = true;
      this.loadError = null;

      const headers = { headers: { token: this.$store.state.auth.token } };

      try {
        const res = await this.$axios.get('/sites/status', headers);

        if (res.data.status !== 'success') {
          throw new Error(res.data.error || 'Error al cargar sitios');
        }

        this.sites = res.data.data || [];
        this.renderPins();

        if (this.sites.length === 0) {
          this.loadError = 'No hay sitios disponibles.';
        }
      } catch (err) {
        if (err.response && err.response.status === 401) {
          window.location.href = '/login';
          return;
        }
        this.loadError = err.message || 'Error inesperado al cargar los sitios';
        console.error('[Sites] loadSites error:', err);
      } finally {
        this.loading = false;
        // Leaflet necesita recalcular tamaño tras render (el div estaba oculto)
        this.$nextTick(() => {
          if (this.map) this.map.invalidateSize();
        });
      }
    },

    renderPins() {
      // Limpiar marcadores previos
      this.markers.forEach((m) => this.map.removeLayer(m));
      this.markers = [];

      this.sites
        .filter((s) => s.lat != null && s.lng != null)
        .forEach((s) => this.addPin(s));
    },

    addPin(site) {
      const marker = L.marker([site.lat, site.lng], { icon: iconForStatus(site.status) })
        .addTo(this.map)
        .bindTooltip(`${site.nombre || site.siteCode} (${site.siteCode})`);

      marker.on('click', () => {
        this.$router.push('/sites/' + site.siteCode);
      });

      // R13 — anotar el siteCode en el marker para lookup en el refresh
      // silencioso. Prefijo `_` como convención de campo interno.
      marker._siteCode = site.siteCode;

      this.markers.push(marker);
    },

    // R13 — refresco silencioso. No prende `loading` (no aparece el
    // spinner), no desmonta el mapa (no parpadea), y actualiza SOLO los
    // markers cuyo status cambió (via setIcon). Sites nuevos: se agregan;
    // sites removidos: se quitan. Silent-on-error — el próximo evento
    // del bus reintenta naturalmente.
    async refreshSitesSilently() {
      const headers = { headers: { token: this.$store.state.auth.token } };
      let nextSites;
      try {
        const res = await this.$axios.get('/sites/status', headers);
        if (res.data.status !== 'success') return;
        nextSites = res.data.data || [];
      } catch (err) {
        console.warn('[SitesMap] silent /sites/status fetch failed:', err.message || err);
        return;
      }

      // Lookup por siteCode
      const nextBySite = new Map(nextSites.map((s) => [s.siteCode, s]));
      const prevBySite = new Map(this.sites.map((s) => [s.siteCode, s]));

      // 1) Update: cambiar icon SOLO si el status del site cambió.
      this.markers.forEach((marker) => {
        const next = nextBySite.get(marker._siteCode);
        if (!next) return;  // sitio removido, se maneja en (3)
        const prev = prevBySite.get(marker._siteCode);
        if (!prev || prev.status !== next.status) {
          marker.setIcon(iconForStatus(next.status));
        }
      });

      // 2) Add: sitios nuevos (raro pero contemplado — p.ej. otro operador
      // dio grant recién). Solo si tienen coords.
      const existingCodes = new Set(this.markers.map((m) => m._siteCode));
      nextSites
        .filter((s) => !existingCodes.has(s.siteCode) && s.lat != null && s.lng != null)
        .forEach((s) => this.addPin(s));

      // 3) Remove: sitios que ya no están (grant revocado, borrado). Filtra
      // this.markers in-place, quitando del mapa los sin match.
      this.markers = this.markers.filter((marker) => {
        if (nextBySite.has(marker._siteCode)) return true;
        this.map.removeLayer(marker);
        return false;
      });

      // Actualizar el array reactivo — se conserva por si algún consumer
      // futuro depende de él (leyenda, contadores).
      this.sites = nextSites;
    },

    // DEC-REF-97 — gestión CRUD ------------------------------------------

    async loadAdminData() {
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        const [sitesRes, opsRes, zonesRes] = await Promise.all([
          this.$axios.get('/site', headers),
          this.$axios.get('/operator', headers),
          this.$axios.get('/zone', headers),
        ]);
        if (sitesRes.data.status === 'success') this.sitesAdmin = sitesRes.data.data || [];
        if (opsRes.data.status === 'success') this.operators = opsRes.data.data || [];
        if (zonesRes.data.status === 'success') this.zones = zonesRes.data.data || [];
      } catch (err) {
        console.warn('[Sites] loadAdminData error:', err.message || err);
      }
    },

    operatorLabel(code) {
      const op = this.operators.find((o) => o.operatorCode === code);
      return op ? op.displayName || op.operatorCode : code;
    },

    zoneLabel(operatorCode, zoneCode) {
      const z = this.zones.find((x) => x.operatorCode === operatorCode && x.zoneCode === zoneCode);
      return z ? z.displayName || z.zoneCode : zoneCode;
    },

    openCreate() {
      this.editing = false;
      this.siteForm = EMPTY_SITE_FORM();
      this.siteModal = true;
    },

    openEdit(row) {
      this.editing = true;
      this.siteForm = {
        siteCode: row.siteCode,
        nombre: row.nombre || '',
        tipo: row.tipo || '',
        operatorCode: row.operatorCode || '',
        zoneCode: row.zoneCode || '',
        lat: row.lat != null ? row.lat : null,
        lng: row.lng != null ? row.lng : null,
        direccion: row.direccion || '',
        provincia: row.provincia || '',
        localidad: row.localidad || '',
        notes: row.notes || '',
      };
      this.siteModal = true;
    },

    async saveSite() {
      if (this.saving) return;
      this.saving = true;
      const headers = { headers: { token: this.$store.state.auth.token } };
      const f = this.siteForm;
      try {
        let res;
        if (this.editing) {
          // PUT /site: siteCode identifica; solo campos editables viajan.
          res = await this.$axios.put('/site', {
            site: {
              siteCode: f.siteCode,
              nombre: f.nombre,
              tipo: f.tipo,
              operatorCode: f.operatorCode,
              zoneCode: f.zoneCode,
              lat: f.lat,
              lng: f.lng,
              direccion: f.direccion,
              provincia: f.provincia,
              localidad: f.localidad,
              notes: f.notes,
            },
          }, headers);
        } else {
          res = await this.$axios.post('/site', { newSite: { ...f } }, headers);
        }
        if (res.data.status === 'success') {
          this.$notify({
            type: 'success',
            icon: 'tim-icons icon-check-2',
            message: this.editing ? 'Sitio actualizado' : `Sitio ${f.siteCode} creado`,
          });
          this.siteModal = false;
          await Promise.all([this.loadAdminData(), this.refreshSitesSilently()]);
        }
      } catch (err) {
        const msg = (err.response && err.response.data && err.response.data.error) || 'Error al guardar el sitio';
        this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: String(msg) });
      } finally {
        this.saving = false;
      }
    },

    async deleteSite(row) {
      // Fricción de escritura (patrón rulepacks): confirm explícito; si el
      // backend responde 409 (sitio con devices), segundo confirm para
      // forzar (desvincula los devices en cascada, sites.js:359-361).
      try {
        await MessageBox.confirm(
          `¿Eliminar el sitio "${row.nombre || row.siteCode}" (${row.siteCode})? Esta acción no se puede deshacer.`,
          'Confirmar eliminación',
          { confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar', type: 'warning' }
        );
      } catch {
        return;
      }

      const headers = { headers: { token: this.$store.state.auth.token } };
      let params = { siteCode: row.siteCode };
      try {
        await this.$axios.delete('/site', { ...headers, params });
      } catch (err) {
        if (err.response && err.response.status === 409) {
          try {
            await MessageBox.confirm(
              `El sitio tiene ${(row.devices || []).length} dispositivo(s) asociados. ¿Forzar el borrado? Los dispositivos quedarán desvinculados.`,
              'Sitio con dispositivos',
              { confirmButtonText: 'Forzar borrado', cancelButtonText: 'Cancelar', type: 'warning' }
            );
          } catch {
            return;
          }
          params = { siteCode: row.siteCode, force: 'true' };
          try {
            await this.$axios.delete('/site', { ...headers, params });
          } catch (err2) {
            const msg2 = (err2.response && err2.response.data && err2.response.data.error) || 'Error al eliminar el sitio';
            this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: String(msg2) });
            return;
          }
        } else {
          const msg = (err.response && err.response.data && err.response.data.error) || 'Error al eliminar el sitio';
          this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: String(msg) });
          return;
        }
      }

      this.$notify({ type: 'success', icon: 'tim-icons icon-check-2', message: `Sitio ${row.siteCode} eliminado` });
      await Promise.all([this.loadAdminData(), this.refreshSitesSilently()]);
    },
  },
};
</script>

<style scoped>
.spin {
  display: inline-block;
  animation: spin 1s linear infinite;
  margin-right: 0.5rem;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.sites-map {
  height: 480px;
  width: 100%;
  border-radius: 8px;
}

.map-legend {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.75rem;
  font-size: 0.85rem;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.dot-critical { background: #E24B4A; }
.dot-warning  { background: #EF9F27; }
.dot-ok       { background: #639922; }
</style>

<!-- DEC-REF-70 (f) · #50 — .site-pin vive en assets/sass/dashboard/custom/_leaflet-pins.scss (global). -->

