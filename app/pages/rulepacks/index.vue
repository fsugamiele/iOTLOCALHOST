<template>
  <div>
    <div class="row">
      <div class="col-12">
        <card>
          <div slot="header" class="d-flex justify-content-between align-items-center">
            <h3 class="card-title mb-0">Reglas de monitoreo</h3>
          </div>

          <p v-if="loading" class="text-muted">Cargando...</p>

          <base-table
            v-else
            :data="packs"
            :columns="['packId', 'deviceType', 'version', 'reglas', 'canary', 'actualizado']"
            thead-classes="text-primary"
          >
            <template slot-scope="{ row }">
              <td>{{ row.packId }}</td>
              <td>{{ row.deviceType }}</td>
              <td>{{ row.version }}</td>
              <td>{{ (row.rules || []).length }}</td>
              <td>
                <span
                  class="badge"
                  :class="row.canary ? 'badge-warning' : 'badge-secondary'"
                >
                  {{ row.canary ? 'canary' : 'prod' }}
                </span>
              </td>
              <td>{{ formatDate(row.updatedAt) }}</td>
            </template>
          </base-table>

          <p v-if="!loading && packs.length === 0" class="text-muted mt-3">
            No hay packs. La consola de creación llega en una próxima capa.
          </p>
        </card>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  middleware: ['authenticated', 'superadmin'],
  name: 'rulepacks-index',
  data() {
    return {
      loading: true,
      packs: []
    };
  },
  async mounted() {
    // DEC-REF-62.a — revalidación de rol contra DB fresca al montar la
    // consola. El middleware `superadmin.js` valida grants del store
    // (que persistieron desde el último login). Un grant revocado
    // POST-login no aparece en el store hasta próximo re-login, así
    // que la consola pega a `/me` una vez al montar para cortar ese
    // caso. Página normal (non-consola) no paga este costo.
    const revalidated = await this.revalidateSuperadmin();
    if (!revalidated) return;
    await this.loadPacks();
  },
  methods: {
    async revalidateSuperadmin() {
      try {
        const res = await this.$axios.get('/me', {
          headers: { token: this.$store.state.auth.token }
        });
        const grants = res.data?.data?.grants || [];
        const stillSuperadmin = grants.some(g => g.role === 'superadmin');
        if (!stillSuperadmin) {
          this.$notify({
            type: 'warning',
            icon: 'tim-icons icon-alert-circle-exc',
            message: 'Rol superadmin revocado. Redirigiendo al dashboard.'
          });
          this.$router.push('/dashboard');
          return false;
        }
        return true;
      } catch (e) {
        // Token vencido u otro problema de auth → volver a login
        this.$router.push('/login');
        return false;
      }
    },
    async loadPacks() {
      this.loading = true;
      try {
        const res = await this.$axios.get('/rulepacks', {
          headers: { token: this.$store.state.auth.token }
        });
        this.packs = res.data?.data || [];
      } catch (e) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error cargando packs'
        });
      } finally {
        this.loading = false;
      }
    },
    formatDate(value) {
      if (!value) return '';
      const d = new Date(value);
      return d.toLocaleString();
    }
  }
};
</script>
