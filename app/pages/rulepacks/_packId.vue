<template>
  <div>
    <div class="row">
      <div class="col-12">
        <card>
          <div slot="header" class="d-flex justify-content-between align-items-center">
            <div>
              <h3 class="card-title mb-1">{{ packId }}</h3>
              <p class="text-muted mb-0" v-if="pack">
                {{ pack.description || 'sin descripción' }}
              </p>
            </div>
            <base-button type="secondary" size="sm" @click="goBack">
              <i class="tim-icons icon-minimal-left"></i> Volver
            </base-button>
          </div>

          <p v-if="loading" class="text-muted">Cargando...</p>

          <template v-else-if="pack">
            <div class="row">
              <div class="col-md-3">
                <strong>deviceType:</strong> {{ pack.deviceType }}
              </div>
              <div class="col-md-2">
                <strong>version:</strong> {{ pack.version }}
              </div>
              <div class="col-md-2">
                <strong>canary:</strong>
                <span
                  class="badge"
                  :class="pack.canary ? 'badge-warning' : 'badge-secondary'"
                >
                  {{ pack.canary ? 'canary' : 'prod' }}
                </span>
              </div>
              <div class="col-md-5">
                <strong>actualizado:</strong> {{ formatDate(pack.updatedAt) }}
              </div>
            </div>

            <hr />

            <h4>Reglas ({{ (pack.rules || []).length }})</h4>
            <p class="text-info">
              <i class="tim-icons icon-alert-circle-exc"></i>
              Edición de reglas: <strong>Capa 3</strong>. Esta vista es
              read-only.
            </p>

            <base-table
              v-if="(pack.rules || []).length > 0"
              :data="pack.rules"
              :columns="['ruleId', 'label', 'type', 'severity', 'variable', 'cooldownSec']"
              thead-classes="text-primary"
            >
              <template slot-scope="{ row }">
                <td>{{ row.ruleId }}</td>
                <td>{{ row.label }}</td>
                <td>{{ row.type }}</td>
                <td>
                  <span class="badge" :class="severityBadge(row.severity)">
                    {{ row.severity }}
                  </span>
                </td>
                <td>{{ row.variable }}</td>
                <td>{{ row.cooldownSec }}</td>
              </template>
            </base-table>

            <p v-else class="text-muted">
              Este pack no tiene reglas todavía. Agregalas desde Capa 3.
            </p>
          </template>
        </card>
      </div>
    </div>
  </div>
</template>

<script>
// SF-5 Capa 2 · DEC-REF-62.d — página de detalle read-only. El editor
// de reglas (Capa 3) reemplaza esta vista o convive con ella con un
// modo edit. La revalidación con /me no se repite acá: el middleware
// `superadmin.js` ya validó grants del store al entrar, y la
// revalidación fresca contra DB vive en /rulepacks (index) como
// gate de la superficie de escritura. Detalle read-only no paga ese
// costo — consistente con DEC-REF-62.a "doble chequeo solo en consola".
export default {
  middleware: ['authenticated', 'superadmin'],
  name: 'rulepacks-detail',
  data() {
    return {
      loading: true,
      pack: null
    };
  },
  computed: {
    packId() {
      return this.$route.params.packId;
    }
  },
  async mounted() {
    await this.loadPack();
  },
  methods: {
    async loadPack() {
      this.loading = true;
      try {
        const res = await this.$axios.get(
          `/rulepacks/${encodeURIComponent(this.packId)}`,
          { headers: { token: this.$store.state.auth.token } }
        );
        this.pack = res.data?.data || null;
      } catch (e) {
        const status = e.response?.status;
        const msg = e.response?.data?.error || 'Error cargando pack';
        this.$notify({
          type: status === 404 ? 'warning' : 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: msg
        });
        this.$router.push('/rulepacks');
      } finally {
        this.loading = false;
      }
    },
    goBack() {
      this.$router.push('/rulepacks');
    },
    formatDate(value) {
      if (!value) return '';
      const d = new Date(value);
      return d.toLocaleString();
    },
    severityBadge(sev) {
      if (sev === 'critical') return 'badge-danger';
      if (sev === 'warning') return 'badge-warning';
      return 'badge-info';
    }
  }
};
</script>
