<template>
  <div class="content">
    <!-- Header -->
    <div class="row">
      <div class="col-12">
        <h2 class="title">
          Panel de Simulador
          <small class="text-muted ml-2">— Wanomi 3.0</small>
        </h2>
        <p class="text-muted mb-4">
          Control de dispositivos simulados por equipo. Editá cualquier variable y
          aplicala para publicarla por MQTT, o dispará un escenario pre-grabado.
        </p>
      </div>
    </div>

    <!-- Estado de carga inicial -->
    <div v-if="loading" class="row">
      <div class="col-12 text-center">
        <i class="tim-icons icon-refresh-01 spin"></i>
        Cargando dispositivos simulados...
      </div>
    </div>

    <!-- Error si la API responde mal -->
    <div v-else-if="loadError" class="row">
      <div class="col-12">
        <card>
          <div class="text-center text-danger">
            <i class="tim-icons icon-alert-circle-exc"></i>
            <h4>No se pudo cargar el panel</h4>
            <p>{{ loadError }}</p>
            <p class="text-muted">
              Verificá que <code>ENABLE_SIMULATOR_API=true</code> esté
              configurado en el backend.
            </p>
          </div>
        </card>
      </div>
    </div>

    <!-- Secciones por equipo -->
    <template v-else>
      <!-- Filtro de sitio (DEC-REF-100 D-2) -->
      <div class="row">
        <div class="col-md-4 col-sm-6">
          <el-select v-model="siteFilter" class="select-primary site-filter" size="small">
            <el-option value="ALL" label="Todos los sitios" />
            <el-option v-for="s in siteOptions" :key="s" :value="s" :label="s" />
          </el-select>
        </div>
      </div>

      <div v-for="section in visibleSections" :key="section.key" class="row">
        <div class="col-12">
          <h3 class="section-title">
            <i :class="['tim-icons', section.icon]"></i>
            {{ section.title }}
          </h3>
          <EquipmentCard
            v-for="family in section.families"
            :key="family"
            :title="familyLabels[family] || family"
            :family="family"
            :devices="devicesByFamily[family]"
            :scenarios="scenarios"
            :note="section.notes && section.notes[family] || ''"
            :user-token="$store.state.auth.token"
            class="mb-4"
          />
        </div>
      </div>

      <p v-if="visibleSections.length === 0" class="text-muted">
        No hay dispositivos simulados para el sitio seleccionado.
      </p>
    </template>
  </div>
</template>

<script>
import EquipmentCard from '~/components/Simulator/EquipmentCard.vue';
import { Select, Option } from 'element-ui';

const ATS_NOTE = 'Editar gen_status a mano propaga sharedState.gen_running al Cummins del sitio (el generador arranca/frena en consecuencia).';

export default {
  name: 'SimulatorPanel',
  middleware: 'authenticated',
  components: { EquipmentCard, [Select.name]: Select, [Option.name]: Option },

  data() {
    return {
      loading: true,
      loadError: null,
      devices: [],
      scenarios: [],
      siteFilter: 'ALL',
      // Orden y composición de las secciones del panel
      sectionDefs: [
        { key: 'gen',   title: 'Generador',    icon: 'icon-button-power', families: ['CUMMINS', 'GEN'] },
        { key: 'ats',   title: 'ATS',          icon: 'icon-refresh-02',   families: ['ATS'], notes: { ATS: ATS_NOTE } },
        { key: 'eltek', title: 'Rectificador', icon: 'icon-light-3',      families: ['ELTEK'] },
        { key: 'sec',   title: 'Seguridad',    icon: 'icon-bell-55',      families: ['SEC'] },
      ],
      familyLabels: {
        CUMMINS: 'Grupo electrógeno — Cummins PowerCommand',
        GEN: 'Grupo electrógeno — GEN legacy',
        ATS: 'Transferencia automática — InteliATS',
        ELTEK: 'Rectificador — Eltek Smartpack S',
        SEC: 'Seguridad perimetral',
      },
    };
  },

  computed: {
    // Sitios disponibles para el filtro (DEC-REF-100 D-2)
    siteOptions() {
      return [...new Set(this.devices.map(d => d.siteId).filter(Boolean))].sort();
    },

    filteredDevices() {
      if (this.siteFilter === 'ALL') return this.devices;
      return this.devices.filter(d => d.siteId === this.siteFilter);
    },

    // Agrupa devices por familia de rol, derivada del name (${siteCode}-${role}).
    // ELTEK-01/02/03 comparten familia 'ELTEK' (una sola tarjeta con selector).
    devicesByFamily() {
      const grouped = {};
      for (const d of this.filteredDevices) {
        const family = this.familyOf(d);
        if (!grouped[family]) grouped[family] = [];
        grouped[family].push(d);
      }
      return grouped;
    },

    visibleSections() {
      return this.sectionDefs
        .map(s => ({
          ...s,
          families: s.families.filter(f => (this.devicesByFamily[f] || []).length > 0),
        }))
        .filter(s => s.families.length > 0);
    },
  },

  async mounted() {
    await this.loadInitialData();
  },

  methods: {
    familyOf(device) {
      const prefix = device.siteId ? device.siteId + '-' : '';
      const role = device.name && device.name.startsWith(prefix)
        ? device.name.slice(prefix.length)
        : device.name || '';
      return role.startsWith('ELTEK') ? 'ELTEK' : role;
    },

    async loadInitialData() {
      this.loading = true;
      this.loadError = null;

      const headers = { headers: { token: this.$store.state.auth.token } };

      try {
        const [devicesRes, scenariosRes] = await Promise.all([
          this.$axios.get('/simulator/devices', headers),
          this.$axios.get('/simulator/scenarios', headers),
        ]);

        if (devicesRes.data.status !== 'success') {
          throw new Error(devicesRes.data.error || 'Error al cargar dispositivos');
        }
        if (scenariosRes.data.status !== 'success') {
          throw new Error(scenariosRes.data.error || 'Error al cargar escenarios');
        }

        this.devices = devicesRes.data.data || [];
        this.scenarios = scenariosRes.data.data || [];

        if (this.devices.length === 0) {
          this.loadError = 'No hay dispositivos simulados disponibles.';
          return;
        }

        // Burst inmediato: reset de todos los devices para que las tarjetas
        // muestren valores sin esperar el próximo ciclo de publicación.
        this.devices.forEach(d => {
          this.$axios.post('/simulator/reset', { dId: d.dId }, headers)
            .catch(err => console.warn('[Simulator] reset burst error:', err.message));
        });

      } catch (err) {
        // Auth 401 → redirect al login (patrón del proyecto)
        if (err.response && err.response.status === 401) {
          window.location.href = '/login';
          return;
        }

        // Endpoint 404 → simulator API deshabilitada
        if (err.response && err.response.status === 404) {
          this.loadError = 'API del simulador no disponible. Verificá que ENABLE_SIMULATOR_API=true en el backend.';
        } else {
          this.loadError = err.message || 'Error inesperado al cargar el panel';
        }
        console.error('[Simulator] loadInitialData error:', err);
      } finally {
        this.loading = false;
      }
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

.section-title {
  font-size: 1.1rem;
  font-weight: 500;
  margin: 1.2rem 0 0.8rem;
  color: rgba(255, 255, 255, 0.9);
}

.section-title i {
  margin-right: 0.5rem;
  color: #e14eca;
}

.site-filter {
  width: 100%;
  margin-bottom: 0.5rem;
}
</style>
