<template>
  <div>
    <div class="row">
      <div class="col-12">
        <card>
          <div slot="header" class="d-flex justify-content-between align-items-center">
            <h3 class="card-title mb-0">Fichas de equipo</h3>
            <div v-if="isSuperadmin">
              <!-- DEC-REF-98 D-1 (#73): alta asistida desde el PDF del
                   fabricante — el extractor propone un draft que se REVISA
                   en el modal antes de guardar (nada persiste solo). -->
              <base-button type="info" size="sm" @click="$refs.pdfInput.click()" :disabled="extracting">
                <i class="fa" :class="extracting ? 'fa-spinner fa-spin' : 'fa-file-pdf-o'"></i>
                {{ extracting ? ' Extrayendo...' : ' Cargar desde PDF' }}
              </base-button>
              <input
                ref="pdfInput"
                type="file"
                accept="application/pdf"
                style="display:none"
                @change="onPdfSelected"
              />
              <base-button type="primary" size="sm" @click="openCreateModal">
                <i class="tim-icons icon-simple-add"></i> Nueva ficha
              </base-button>
            </div>
          </div>

          <p class="text-muted">
            Catálogo global de equipos (DEC-REF-91). La ficha es la única autora del
            <code>deviceType</code>: templates, devices y packs la referencian.
            Las fichas no se editan (DEC-REF-97 D-1) — si una ficha quedó mal, se borra y se recrea.
          </p>

          <p v-if="loading" class="text-muted">Cargando...</p>

          <base-table
            v-else
            :data="sheets"
            :columns="['deviceType', 'fabricante', 'modelo', 'origen', 'variables', 'creada', 'acciones']"
            thead-classes="text-primary"
          >
            <template slot-scope="{ row }">
              <td><code>{{ row.deviceType }}</code></td>
              <td>{{ row.manufacturer || '—' }}</td>
              <td>{{ row.model || '—' }}</td>
              <td>
                <span class="badge" :class="row.origin === 'own' ? 'badge-info' : 'badge-secondary'">
                  {{ row.origin === 'own' ? 'propio' : (row.origin === 'third_party' ? 'tercero' : '—') }}
                </span>
              </td>
              <td>{{ (row.variables || []).length }}</td>
              <td>{{ formatDate(row.createdTime) }}</td>
              <td>
                <base-button type="info" size="sm" @click="openDetailModal(row)" title="Ver detalle">
                  <i class="tim-icons icon-notes"></i>
                </base-button>
                <base-button
                  v-if="isSuperadmin"
                  type="danger"
                  size="sm"
                  @click="openDeleteModal(row.deviceType)"
                  title="Borrar"
                >
                  <i class="tim-icons icon-trash-simple"></i>
                </base-button>
              </td>
            </template>
          </base-table>

          <p v-if="!loading && sheets.length === 0" class="text-muted mt-3">
            No hay fichas cargadas. Sin fichas no se pueden crear packs ni templates con tipo de equipo.
          </p>
        </card>
      </div>
    </div>

    <!-- NUEVA FICHA — DEC-REF-97. El deviceType ES la identidad (DEC-REF-91);
         se escribe una sola vez y no se edita. -->
    <el-dialog
      title="Nueva ficha de equipo"
      :visible.sync="createModal"
      width="720px"
      :close-on-click-modal="false"
    >
      <!-- Banner de draft (DEC-REF-98): visible solo cuando el contenido
           vino del PDF — la revisión humana es parte del flujo firmado. -->
      <div v-if="pdfDraftName" class="alert alert-info" style="font-size:13px">
        <i class="fa fa-file-pdf-o" style="margin-right:6px"></i>
        Draft propuesto desde <b>{{ pdfDraftName }}</b> por extracción automática.
        <b>Revisá y corregí antes de guardar</b> — la extracción es best-effort.
      </div>

      <div class="row">
        <div class="col-md-6 form-group">
          <label>deviceType <span class="text-danger">*</span> (identificador, no se edita)</label>
          <base-input v-model="newSheet.deviceType" placeholder="ej. cummins-pcc" />
        </div>
        <div class="col-md-6 form-group">
          <label>Origen <span class="text-danger">*</span></label>
          <select v-model="newSheet.origin" class="form-control">
            <option value="own">propio</option>
            <option value="third_party">tercero</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div class="col-md-6 form-group">
          <label>Fabricante</label>
          <base-input v-model="newSheet.manufacturer" placeholder="ej. Cummins" />
        </div>
        <div class="col-md-6 form-group">
          <label>Modelo</label>
          <base-input v-model="newSheet.model" placeholder="ej. PowerCommand 1.1" />
        </div>
      </div>

      <hr />
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h5 class="mb-0">Variables</h5>
        <base-button type="primary" size="sm" @click="addVariable">
          <i class="tim-icons icon-simple-add"></i> Variable
        </base-button>
      </div>

      <!-- Candidatos no resueltos del PDF (DEC-REF-98): líneas que parecen
           variable pero no cerraron la forma. Se listan para que el humano
           decida — la extracción no descarta mudo. -->
      <div v-if="rawCandidates.length" class="alert alert-warning" style="font-size:12px">
        <b>{{ rawCandidates.length }} línea(s) del PDF parecen variables pero no se pudieron resolver solas:</b>
        <div v-for="(c, ci) in rawCandidates" :key="ci" class="d-flex justify-content-between align-items-center mt-1">
          <code style="font-size:11px">{{ c }}</code>
          <base-button type="primary" size="sm" @click="addCandidateAsVariable(ci)">
            <i class="tim-icons icon-simple-add"></i> Agregar
          </base-button>
        </div>
      </div>

      <p v-if="newSheet.variables.length === 0" class="text-muted">
        Sin variables declaradas, las reglas y templates que referencien esta ficha
        usarán texto libre con aviso (fallback firmado en S6).
      </p>

      <div v-for="(v, i) in newSheet.variables" :key="i" class="variable-block mb-3 p-2">
        <div class="d-flex justify-content-between align-items-center">
          <strong>Variable {{ i + 1 }}</strong>
          <base-button type="danger" size="sm" @click="newSheet.variables.splice(i, 1)" title="Quitar variable">
            <i class="tim-icons icon-trash-simple"></i>
          </base-button>
        </div>
        <div class="row mt-2">
          <div class="col-md-4 form-group">
            <label>Nombre técnico <span class="text-danger">*</span></label>
            <base-input v-model="v.name" placeholder="ej. oil_pressure" />
            <small class="text-muted">El que viaja en el tópico MQTT.</small>
          </div>
          <div class="col-md-4 form-group">
            <label>Nombre legible</label>
            <base-input v-model="v.label" placeholder="ej. Presión de aceite" />
          </div>
          <div class="col-md-4 form-group">
            <label>Tipo</label>
            <select v-model="v.type" class="form-control">
              <!-- float/int/bool/categorical: los que entienden los widgets
                   del catálogo (valueStatus et al). number/string/boolean:
                   valores históricos de fichas cargadas a mano. -->
              <option value="float">float</option>
              <option value="int">int</option>
              <option value="bool">bool</option>
              <option value="categorical">categorical</option>
              <option value="number">number</option>
              <option value="string">string</option>
              <option value="boolean">boolean</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="col-md-4 form-group">
            <label>Unidad</label>
            <base-input v-model="v.unit" placeholder="ej. kPa" />
          </div>
          <div class="col-md-4 form-group">
            <label>Rango de fábrica</label>
            <base-input v-model="v.factoryRange" placeholder="ej. 0-100" />
          </div>
          <div class="col-md-4 form-group">
            <label>Cadencia</label>
            <base-input v-model="v.cadence" placeholder="ej. 60s" />
          </div>
        </div>

        <!-- Límites del fabricante (DEC-REF-94). Pueden ser cero — condición
             firmada: exigir al menos uno impediría dar de alta equipo propio
             sin manual. -->
        <div class="d-flex justify-content-between align-items-center mt-1">
          <label class="mb-0">Límites del fabricante</label>
          <base-button type="secondary" size="sm" @click="addLimit(v)">
            <i class="tim-icons icon-simple-add"></i> Límite
          </base-button>
        </div>
        <div v-for="(l, j) in v.limits" :key="j" class="row mt-1 align-items-end">
          <div class="col-md-2 form-group mb-1">
            <select v-model="l.kind" class="form-control">
              <option value="warning">warning</option>
              <option value="trip">trip</option>
            </select>
          </div>
          <div class="col-md-3 form-group mb-1">
            <select v-model="l.op" class="form-control">
              <option v-for="op in OPERATORS" :key="op" :value="op">{{ OPERATOR_LABELS[op] }}</option>
            </select>
          </div>
          <div class="col-md-2 form-group mb-1">
            <base-input v-model="l.value" placeholder="valor" type="number" />
          </div>
          <div class="col-md-2 form-group mb-1">
            <base-input v-model="l.unit" placeholder="unidad" />
          </div>
          <div class="col-md-2 form-group mb-1">
            <base-input v-model="l.source" placeholder="fuente" />
          </div>
          <div class="col-md-1 form-group mb-1">
            <base-button type="danger" size="sm" @click="v.limits.splice(j, 1)">
              <i class="tim-icons icon-trash-simple"></i>
            </base-button>
          </div>
        </div>
      </div>

      <div slot="footer">
        <base-button type="secondary" @click="createModal = false">Cancelar</base-button>
        <base-button type="primary" @click="submitCreate" :disabled="creating || !canCreate">
          {{ creating ? 'Creando...' : 'Crear ficha' }}
        </base-button>
      </div>
    </el-dialog>

    <!-- DETALLE — lectura. La ficha no se edita (DEC-REF-97 D-1). -->
    <el-dialog
      :title="`Ficha ${detailSheet ? detailSheet.deviceType : ''}`"
      :visible.sync="detailModal"
      width="720px"
    >
      <template v-if="detailSheet">
        <p>
          <strong>{{ detailSheet.manufacturer || '—' }} {{ detailSheet.model || '' }}</strong>
          · origen {{ detailSheet.origin === 'own' ? 'propio' : 'tercero' }}
          · versión {{ detailSheet.version || 1 }}
        </p>
        <base-table
          :data="detailSheet.variables || []"
          :columns="['nombre', 'legible', 'tipo', 'unidad', 'rango fábrica', 'cadencia', 'límites']"
          thead-classes="text-primary"
        >
          <template slot-scope="{ row }">
            <td><code>{{ row.name }}</code></td>
            <td>{{ row.label || '—' }}</td>
            <td>{{ row.type || '—' }}</td>
            <td>{{ row.unit || '—' }}</td>
            <td>{{ row.factoryRange || '—' }}</td>
            <td>{{ row.cadence || '—' }}</td>
            <td>
              <span v-if="!(row.limits || []).length" class="text-muted">—</span>
              <span v-for="(l, j) in row.limits" :key="j" class="badge badge-warning mr-1">
                {{ l.kind }}: {{ OPERATOR_LABELS[l.op] || l.op }} {{ l.value }} {{ l.unit || '' }}
              </span>
            </td>
          </template>
        </base-table>
      </template>
      <div slot="footer">
        <base-button type="secondary" @click="detailModal = false">Cerrar</base-button>
      </div>
    </el-dialog>

    <!-- BORRAR — fricción de escritura (patrón rulepacks/index.vue). El backend
         rechaza con 409 si la ficha está referenciada por templates o packs. -->
    <el-dialog
      title="Confirmar borrado"
      :visible.sync="deleteModal"
      width="500px"
      :close-on-click-modal="false"
    >
      <p>
        Estás por borrar la ficha <code>{{ deleteTarget }}</code>. Si alguna
        template o pack la referencia, el backend lo rechaza (409).
      </p>
      <p class="text-muted">Para confirmar, escribí el deviceType exacto abajo:</p>
      <base-input v-model="deleteConfirmInput" :placeholder="deleteTarget" />
      <div slot="footer">
        <base-button type="secondary" @click="closeDeleteModal">Cancelar</base-button>
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
import { Dialog, Select, Option } from 'element-ui';

// Enums de UI espejo del backend (fuente única: app/api/models/rule_definition.js
// D-3). La pantalla en idioma de usuario completa queda en BACKLOG-UI-13.
const OPERATORS = ['lt', 'lte', 'gt', 'gte', 'eq', 'neq'];
const OPERATOR_LABELS = {
  gt: 'mayor que', gte: 'mayor o igual que',
  lt: 'menor que', lte: 'menor o igual que',
  eq: 'igual a', neq: 'distinto a',
};

export default {
  middleware: ['authenticated'],
  name: 'fichas-page',
  components: {
    [Dialog.name]: Dialog,
    [Select.name]: Select,
    [Option.name]: Option,
  },
  data() {
    return {
      OPERATORS,
      OPERATOR_LABELS,
      loading: true,
      sheets: [],
      createModal: false,
      creating: false,
      newSheet: this.emptySheet(),
      detailModal: false,
      detailSheet: null,
      deleteModal: false,
      deleteTarget: '',
      deleteConfirmInput: '',
      deleting: false,

      // DEC-REF-98 — extracción desde PDF
      extracting: false,
      pdfDraftName: '',
      rawCandidates: [],
    };
  },
  computed: {
    // Lectura global (D-1); escritura solo superadmin. El backend re-gatea
    // cada verbo (403) — esto es solo visibilidad de botones.
    isSuperadmin() {
      const grants = this.$store.state.auth?.userData?.grants || [];
      return grants.some(g => g.role === 'superadmin');
    },
    canCreate() {
      return (
        this.newSheet.deviceType.trim() !== '' &&
        this.newSheet.variables.every(v => (v.name || '').trim() !== '')
      );
    },
  },
  async mounted() {
    await this.loadSheets();
  },
  methods: {
    headers() {
      return { headers: { token: this.$store.state.auth.token } };
    },
    async loadSheets() {
      this.loading = true;
      try {
        const res = await this.$axios.get('/equipmentsheet', this.headers());
        this.sheets = res.data?.data || [];
      } catch (e) {
        if (e.response?.status === 401) return this.$router.push('/login');
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error cargando fichas',
        });
      } finally {
        this.loading = false;
      }
    },
    formatDate(value) {
      if (!value) return '—';
      return new Date(value).toLocaleString();
    },
    emptySheet() {
      return { deviceType: '', manufacturer: '', model: '', origin: 'own', variables: [] };
    },
    openCreateModal() {
      this.newSheet = this.emptySheet();
      this.pdfDraftName = '';
      this.rawCandidates = [];
      this.createModal = true;
    },

    // DEC-REF-98 D-1 — PDF → extract → draft precargado en el modal.
    // El modal se abre SIEMPRE (aunque el draft salga vacío): la revisión
    // humana es parte del flujo, no un fallback.
    onPdfSelected(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';  // permite re-elegir el mismo archivo
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) {
        this.$notify({
          type: 'warning',
          icon: 'tim-icons icon-alert-circle-exc',
          message: 'El PDF supera 15 MB — dividilo o cargá la ficha a mano.',
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || '');
        const base64 = dataUrl.split(',')[1] || '';
        this.extracting = true;
        try {
          const res = await this.$axios.post(
            '/equipmentsheet/extract',
            { pdfBase64: base64 },
            this.headers()
          );
          const draft = res.data && res.data.draft;
          if (!draft) throw new Error('respuesta sin draft');
          this.newSheet = {
            ...this.emptySheet(),
            manufacturer: draft.manufacturer || '',
            model: draft.model || '',
            variables: (draft.variables || []).map(v => ({
              name: v.name || '',
              label: v.label || '',
              type: v.type || 'float',
              unit: v.unit || '',
              factoryRange: v.factoryRange || '',
              cadence: v.cadence || '',
              limits: v.limits || [],
            })),
          };
          this.rawCandidates = draft.rawCandidates || [];
          this.pdfDraftName = file.name;
          this.createModal = true;
          this.$notify({
            type: 'info',
            icon: 'tim-icons icon-check-2',
            message: `Draft extraído: ${(draft.variables || []).length} variable(s) propuesta(s). Revisá antes de guardar.`,
          });
        } catch (e) {
          this.$notify({
            type: 'danger',
            icon: 'tim-icons icon-alert-circle-exc',
            message: e.response?.data?.error || 'No se pudo extraer el PDF',
          });
        } finally {
          this.extracting = false;
        }
      };
      reader.readAsDataURL(file);
    },

    addCandidateAsVariable(index) {
      const text = this.rawCandidates[index];
      this.rawCandidates.splice(index, 1);
      this.newSheet.variables.push({
        name: '', label: text.slice(0, 80), type: 'float', unit: '', factoryRange: '', cadence: '', limits: [],
      });
    },
    addVariable() {
      this.newSheet.variables.push({
        name: '', label: '', type: 'number', unit: '', factoryRange: '', cadence: '', limits: [],
      });
    },
    addLimit(variable) {
      variable.limits.push({ kind: 'warning', op: 'gt', value: null, unit: '', source: '' });
    },
    async submitCreate() {
      if (!this.canCreate) return;
      this.creating = true;
      try {
        // Limpiar strings vacíos a undefined-less (el schema los tolera, pero
        // mandar el payload mínimo evita ruido en la colección).
        const payload = {
          deviceType: this.newSheet.deviceType.trim(),
          manufacturer: this.newSheet.manufacturer || undefined,
          model: this.newSheet.model || undefined,
          origin: this.newSheet.origin,
          variables: this.newSheet.variables.map(v => ({
            name: v.name.trim(),
            label: v.label || undefined,
            type: v.type,
            unit: v.unit || undefined,
            factoryRange: v.factoryRange || undefined,
            cadence: v.cadence || undefined,
            limits: (v.limits || []).map(l => ({
              kind: l.kind,
              op: l.op,
              value: l.value === '' || l.value === null ? undefined : Number(l.value),
              unit: l.unit || undefined,
              source: l.source || undefined,
            })),
          })),
        };
        await this.$axios.post('/equipmentsheet', { newEquipmentSheet: payload }, this.headers());
        this.$notify({
          type: 'success',
          icon: 'tim-icons icon-check-2',
          message: `Ficha ${payload.deviceType} creada.`,
        });
        this.createModal = false;
        await this.loadSheets();
      } catch (e) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error creando ficha',
        });
      } finally {
        this.creating = false;
      }
    },
    openDetailModal(sheet) {
      this.detailSheet = sheet;
      this.detailModal = true;
    },
    openDeleteModal(deviceType) {
      this.deleteTarget = deviceType;
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
      try {
        await this.$axios.delete(
          `/equipmentsheet/${encodeURIComponent(this.deleteTarget)}`,
          this.headers()
        );
        this.$notify({
          type: 'success',
          icon: 'tim-icons icon-check-2',
          message: `Ficha ${this.deleteTarget} borrada.`,
        });
        this.closeDeleteModal();
        await this.loadSheets();
      } catch (e) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error borrando ficha',
        });
      } finally {
        this.deleting = false;
      }
    },
  },
};
</script>

<style scoped>
.variable-block {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
</style>
