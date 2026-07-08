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
            :columns="['packId', 'deviceType', 'version', 'reglas', 'canary', 'actualizado', 'acciones']"
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
              <td>
                <base-button
                  type="info"
                  size="sm"
                  @click="viewPack(row.packId)"
                  title="Ver / Editar"
                >
                  <i class="tim-icons icon-notes"></i>
                </base-button>
                <base-button
                  type="danger"
                  size="sm"
                  @click="openDeleteModal(row.packId)"
                  title="Borrar"
                >
                  <i class="tim-icons icon-trash-simple"></i>
                </base-button>
              </td>
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

    <!-- BORRAR — fricción explícita. El usuario escribe el packId a
         mano; el botón "Borrar definitivo" queda disabled hasta que
         el texto matchee exacto. Evita clicks accidentales; el
         hot-reload SF-3 hace efectivo el DELETE al instante. -->
    <el-dialog
      title="Confirmar borrado"
      :visible.sync="deleteModal"
      width="500px"
      :close-on-click-modal="false"
    >
      <p>
        Estás por borrar el pack
        <code>{{ deleteTarget }}</code>. El motor edge lo recargará al
        instante (SF-3) — el pack deja de aplicarse en producción.
      </p>
      <p class="text-muted">
        Para confirmar, escribí el packId exacto abajo:
      </p>
      <base-input
        v-model="deleteConfirmInput"
        :placeholder="deleteTarget"
      />
      <div slot="footer">
        <base-button type="secondary" @click="closeDeleteModal">
          Cancelar
        </base-button>
        <base-button
          type="danger"
          @click="submitDelete"
          :disabled="deleting || deleteConfirmInput !== deleteTarget"
        >
          {{ deleting ? 'Borrando...' : 'Borrar definitivo' }}
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
      newPack: this.emptyPack(),
      deleteModal: false,
      deleteTarget: '',
      deleteConfirmInput: '',
      deleting: false
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
    },
    viewPack(packId) {
      this.$router.push(`/rulepacks/${encodeURIComponent(packId)}`);
    },
    openDeleteModal(packId) {
      this.deleteTarget = packId;
      this.deleteConfirmInput = '';
      this.deleteModal = true;
    },
    closeDeleteModal() {
      this.deleteModal = false;
      this.deleteTarget = '';
      this.deleteConfirmInput = '';
    },
    async submitDelete() {
      if (this.deleteConfirmInput !== this.deleteTarget) return;
      this.deleting = true;
      const packId = this.deleteTarget;
      try {
        await this.$axios.delete(
          `/rulepacks/${encodeURIComponent(packId)}`,
          { headers: { token: this.$store.state.auth.token } }
        );
        this.$notify({
          type: 'success',
          icon: 'tim-icons icon-check-2',
          message: `Pack ${packId} borrado. El motor edge recargó (SF-3).`
        });
        this.closeDeleteModal();
        await this.loadPacks();
      } catch (e) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error borrando pack'
        });
      } finally {
        this.deleting = false;
      }
    }
  }
};
</script>
