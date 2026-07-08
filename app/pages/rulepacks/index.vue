<template>
  <div>
    <div class="row">
      <div class="col-12">
        <card>
          <div slot="header" class="d-flex justify-content-between align-items-center">
            <h3 class="card-title mb-0">Reglas de monitoreo</h3>
            <base-button type="primary" size="sm" @click="openCreateModal">
              <i class="tim-icons icon-simple-add"></i> Nuevo pack
            </base-button>
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
            No hay packs. Usá "Nuevo pack" para crear el primero.
          </p>
        </card>
      </div>
    </div>

    <!-- NUEVO PACK — form de metadata. El pack se crea con rules: [];
         reglas individuales llegan en Capa 3 (editor crossExpr). -->
    <el-dialog
      title="Nuevo pack"
      :visible.sync="createModal"
      width="500px"
      :close-on-click-modal="false"
    >
      <div class="form-group">
        <label>packId <span class="text-danger">*</span></label>
        <base-input
          v-model="newPack.packId"
          placeholder="ej. cummins-pcc-v1"
        />
      </div>
      <div class="form-group">
        <label>deviceType <span class="text-danger">*</span></label>
        <base-input
          v-model="newPack.deviceType"
          placeholder="ej. cummins-pcc"
        />
      </div>
      <div class="form-group">
        <label>Descripción</label>
        <base-input
          v-model="newPack.description"
          placeholder="opcional"
        />
      </div>
      <div class="form-group">
        <base-checkbox v-model="newPack.canary">
          canary (excluido del motor edge — útil para probar reglas)
        </base-checkbox>
      </div>
      <div slot="footer">
        <base-button type="secondary" @click="createModal = false">
          Cancelar
        </base-button>
        <base-button
          type="primary"
          @click="submitCreate"
          :disabled="creating || !newPack.packId || !newPack.deviceType"
        >
          {{ creating ? 'Creando...' : 'Crear' }}
        </base-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
export default {
  middleware: ['authenticated', 'superadmin'],
  name: 'rulepacks-index',
  data() {
    return {
      loading: true,
      packs: [],
      createModal: false,
      creating: false,
      newPack: this.emptyPack()
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
    },
    emptyPack() {
      return { packId: '', deviceType: '', description: '', canary: false };
    },
    openCreateModal() {
      this.newPack = this.emptyPack();
      this.createModal = true;
    },
    async submitCreate() {
      if (!this.newPack.packId || !this.newPack.deviceType) return;
      this.creating = true;
      const packId = this.newPack.packId.trim();
      try {
        // El pack se crea sin reglas — Capa 3 alta las reglas.
        // Backend acepta rules: [] (schema default; validatePackCrossRules
        // no falla con array vacío — verificado antes de aplicar).
        await this.$axios.put(
          `/rulepacks/${encodeURIComponent(packId)}`,
          {
            rulepack: {
              packId,
              deviceType: this.newPack.deviceType.trim(),
              description: this.newPack.description || '',
              canary: !!this.newPack.canary,
              rules: []
            }
          },
          { headers: { token: this.$store.state.auth.token } }
        );
        this.$notify({
          type: 'success',
          icon: 'tim-icons icon-check-2',
          message: `Pack ${packId} creado. El motor edge recargó automáticamente (SF-3).`
        });
        this.createModal = false;
        await this.loadPacks();
      } catch (e) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error creando pack'
        });
      } finally {
        this.creating = false;
      }
    }
  }
};
</script>
