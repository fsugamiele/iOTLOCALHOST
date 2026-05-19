<template>
  <div class="device-list">
    <!-- Iteramos por site agrupando devices -->
    <div
      v-for="site in groupedSites"
      :key="site.siteId"
      class="site-group"
    >
      <div class="site-header">
        <i class="tim-icons icon-pin"></i>
        <strong>{{ site.siteId }}</strong>
        <span class="text-muted ml-1 site-location">{{ siteLabel(site.siteId) }}</span>
      </div>

      <ul class="device-items">
        <li
          v-for="device in site.devices"
          :key="device.dId"
          :class="['device-item', { 'is-selected': selectedDId === device.dId }]"
          @click="selectDevice(device)"
        >
          <span class="status-dot status-idle" :title="'Estado: en reposo'"></span>
          <span class="device-name">
            {{ roleLabel(device) }}
          </span>
          <small class="device-template text-muted">
            {{ shortTemplate(device.templateName) }}
          </small>
        </li>
      </ul>
    </div>

    <!-- Botón reset visible solo si hay device seleccionado -->
    <div v-if="selectedDId" class="reset-section">
      <base-button
        type="warning"
        size="sm"
        class="btn-block"
        @click="$emit('reset-device', selectedDId)"
      >
        <i class="tim-icons icon-refresh-01"></i>
        Reiniciar dispositivo
      </base-button>
    </div>
  </div>
</template>

<script>
// Etiquetas humanas para los 3 sites de Corrientes (del pitch a Claro)
const SITE_LABELS = {
  CR00015: 'Empedrado',
  CR00073: 'Palmar de San Luis',
  CR00203: 'Capital',
};

export default {
  name: 'SimulatorDeviceList',

  props: {
    devices: {
      type: Array,
      required: true,
    },
    selectedDId: {
      type: String,
      default: null,
    },
  },

  computed: {
    // Agrupar devices por siteId, manteniendo orden estable
    groupedSites() {
      const groups = {};
      for (const d of this.devices) {
        if (!groups[d.siteId]) {
          groups[d.siteId] = { siteId: d.siteId, devices: [] };
        }
        groups[d.siteId].devices.push(d);
      }
      // Ordenar devices dentro de cada site: SEC antes que GEN
      for (const siteId in groups) {
        groups[siteId].devices.sort((a, b) => {
          if (a.name.endsWith('SEC')) return -1;
          if (b.name.endsWith('SEC')) return 1;
          return 0;
        });
      }
      // Retornar como array ordenado por siteId
      return Object.values(groups).sort((a, b) =>
        a.siteId.localeCompare(b.siteId)
      );
    },
  },

  methods: {
    selectDevice(device) {
      this.$emit('select-device', device);
    },

    siteLabel(siteId) {
      return SITE_LABELS[siteId] || '';
    },

    roleLabel(device) {
      // device.name es algo como "CR00015-SEC" → extraer "SEC" o "GEN"
      const role = device.name.split('-').pop();
      if (role === 'SEC') return 'Seguridad';
      if (role === 'GEN') return 'Generador';
      return device.name;
    },

    shortTemplate(name) {
      // "WN-SITE-SEC v2" → "SEC v2"
      return name ? name.replace('WN-SITE-', '') : '';
    },
  },
};
</script>

<style scoped>
.device-list {
  font-size: 0.9rem;
}

.site-group {
  margin-bottom: 1.2rem;
}

.site-group:last-child {
  margin-bottom: 0;
}

.site-header {
  display: flex;
  align-items: center;
  padding: 0.4rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 0.5rem;
}

.site-header i {
  margin-right: 0.4rem;
  color: #e14eca;
}

.site-location {
  font-size: 0.8rem;
}

.device-items {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.device-item {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.4rem;
  margin-bottom: 0.2rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.device-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.device-item.is-selected {
  background: rgba(225, 78, 202, 0.15);
  border-left: 3px solid #e14eca;
  padding-left: 0.7rem;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 0.6rem;
  flex-shrink: 0;
}

.status-idle {
  background: #00f2c3;
  box-shadow: 0 0 6px rgba(0, 242, 195, 0.5);
}

.device-name {
  flex: 1;
  font-weight: 500;
}

.device-template {
  font-size: 0.75rem;
}

.reset-section {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
