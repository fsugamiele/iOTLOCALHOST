<template>
  <div>
    <div class="row">
      <div class="col-12">
        <card>
          <div slot="header" class="d-flex justify-content-between align-items-center">
            <div>
              <h3 class="card-title mb-0">Reglas de monitoreo</h3>
              <p class="card-category mb-0">Un pack agrupa las reglas de monitoreo de un tipo de equipo.</p>
            </div>
            <base-button type="primary" size="sm" @click="openCreateModal">
              <i class="tim-icons icon-simple-add"></i> Nuevo pack
            </base-button>
          </div>

          <p v-if="loading" class="text-muted">Cargando...</p>

          <base-table
            v-else
            :data="packs"
            :columns="['pack', 'equipo', 'reglas', 'actualizado', 'acciones']"
            thead-classes="text-primary"
          >
            <template slot-scope="{ row }">
              <td>
                <span class="pack-name">{{ row.packId }}</span>
                <div v-if="row.description" class="pack-desc text-muted">{{ row.description }}</div>
              </td>
              <td>{{ row.deviceType }}</td>
              <td>{{ (row.rules || []).length }}</td>
              <td class="text-muted">{{ formatDate(row.updatedAt) }}</td>
              <td class="text-right">
                <base-button type="info" size="sm" @click="viewPack(row.packId)" title="Ver / editar reglas">
                  <i class="tim-icons icon-notes"></i>
                </base-button>
                <base-button type="danger" size="sm" @click="openDeleteModal(row.packId)" title="Borrar pack">
                  <i class="tim-icons icon-trash-simple"></i>
                </base-button>
              </td>
            </template>
          </base-table>

          <p v-if="!loading && packs.length === 0" class="text-muted mt-3">
            No hay packs todavía. Usá <b>"Nuevo pack"</b> para crear el primero.
          </p>
        </card>
      </div>
    </div>

    <!-- NUEVO PACK — metadata. El pack nace con rules: []; las reglas se
         cargan adentro con el editor. -->
    <el-dialog title="Nuevo pack" :visible.sync="createModal" width="480px" :close-on-click-modal="false" append-to-body>
      <div class="form-group">
        <label>Nombre del pack <span class="text-danger">*</span></label>
        <base-input v-model="newPack.packId" placeholder="ej. cummins-pcc-v1" />
      </div>
      <div class="form-group">
        <label>Equipo <span class="text-danger">*</span></label>
        <el-select
          v-model="newPack.deviceType"
          placeholder="Elegí la ficha del equipo"
          class="select-primary" style="width:100%" filterable
          :disabled="sheets.length === 0"
        >
          <el-option
            v-for="s in sheets" :key="s.deviceType"
            :label="s.manufacturer ? `${s.deviceType} — ${s.manufacturer} ${s.model || ''}`.trim() : s.deviceType"
            :value="s.deviceType"
          />
        </el-select>
        <small v-if="sheets.length === 0" class="text-warning">
          No hay fichas de equipo cargadas — cargá una en "Fichas" antes de crear el pack.
        </small>
      </div>
      <div class="form-group">
        <label>Descripción <span class="text-muted">(opcional)</span></label>
        <base-input v-model="newPack.description" placeholder="Para qué sirve este pack" />
      </div>
      <div slot="footer">
        <base-button type="secondary" @click="createModal = false">Cancelar</base-button>
        <base-button type="primary" @click="submitCreate" :disabled="creating || !newPack.packId || !newPack.deviceType">
          {{ creating ? 'Creando...' : 'Crear pack' }}
        </base-button>
      </div>
    </el-dialog>

    <!-- BORRAR PACK — confirmación simple (sin tipeo). -->
    <el-dialog title="Borrar pack" :visible.sync="deleteModal" width="440px" :close-on-click-modal="false" append-to-body>
      <p>
        ¿Seguro que querés borrar el pack <code>{{ deleteTarget }}</code>?
      </p>
      <p class="text-muted">
        Deja de aplicarse en producción al instante y se pierden sus reglas. Esta acción no se puede deshacer.
      </p>
      <div slot="footer">
        <base-button type="secondary" @click="closeDeleteModal">Cancelar</base-button>
        <base-button type="danger" @click="submitDelete" :disabled="deleting">
          {{ deleting ? 'Borrando...' : 'Borrar pack' }}
        </base-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { Dialog, Select, Option } from 'element-ui';

export default {
  middleware: ['authenticated', 'superadmin'],
  name: 'rulepacks-index',
  components: { [Dialog.name]: Dialog, [Select.name]: Select, [Option.name]: Option },
  data() {
    return {
      loading: true,
      packs: [],
      sheets: [],
      createModal: false,
      creating: false,
      newPack: this.emptyPack(),
      deleteModal: false,
      deleteTarget: '',
      deleting: false
    };
  },
  async mounted() {
    const revalidated = await this.revalidateSuperadmin();
    if (!revalidated) return;
    await this.loadPacks();
    await this.loadSheets();
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
    async loadSheets() {
      try {
        const res = await this.$axios.get('/equipmentsheet', {
          headers: { token: this.$store.state.auth.token }
        });
        this.sheets = res.data?.data || [];
      } catch (e) {
        this.sheets = [];
        this.$notify({
          type: 'warning',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error cargando fichas de equipo'
        });
      }
    },
    formatDate(value) {
      if (!value) return '';
      return new Date(value).toLocaleString();
    },
    emptyPack() {
      return { packId: '', deviceType: '', description: '' };
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
        await this.$axios.put(
          `/rulepacks/${encodeURIComponent(packId)}`,
          {
            rulepack: {
              packId,
              deviceType: this.newPack.deviceType.trim(),
              description: this.newPack.description || '',
              canary: false,
              rules: []
            }
          },
          { headers: { token: this.$store.state.auth.token } }
        );
        this.$notify({
          type: 'success',
          icon: 'tim-icons icon-check-2',
          message: `Pack ${packId} creado.`
        });
        this.createModal = false;
        await this.loadPacks();
        this.viewPack(packId);   // entra directo a cargar reglas
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
      this.deleteModal = true;
    },
    closeDeleteModal() {
      this.deleteModal = false;
      this.deleteTarget = '';
    },
    async submitDelete() {
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
          message: `Pack ${packId} borrado.`
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

<style scoped>
.pack-name { font-weight: 600; }
.pack-desc { font-size: 0.78rem; margin-top: 2px; }
</style>
