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
            :columns="['deviceType', 'fabricante', 'modelo', 'origen', 'dominio', 'variables', 'creada', 'acciones']"
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
              <td>{{ domainLabel(row.domain) }}</td>
              <td>{{ (row.variables || []).length }}</td>
              <td>{{ formatDate(row.createdTime) }}</td>
              <td>
                <base-button type="info" size="sm" @click="openDetailModal(row)" title="Ver detalle">
                  <i class="tim-icons icon-notes"></i>
                </base-button>
                <!-- spec_perfiles_controladora — modelos concretos de controladora de esta ficha -->
                <base-button type="success" size="sm" @click="openControladoras(row)" title="Controladoras (modelos)">
                  <i class="tim-icons icon-settings"></i>
                </base-button>
                <base-button
                  v-if="isSuperadmin"
                  type="warning"
                  size="sm"
                  @click="openEditModal(row)"
                  title="Editar"
                >
                  <i class="tim-icons icon-pencil"></i>
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
      :title="editing ? 'Editar ficha de equipo' : 'Nueva ficha de equipo'"
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
          <base-input v-model="newSheet.deviceType" placeholder="ej. cummins-pcc" :disabled="editing" />
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
      <div class="row">
        <div class="col-md-6 form-group">
          <!-- DEC-REF-108 F2 (#80): el dominio arma los tabs de la página de sitio. -->
          <label>Dominio (tab del sitio)</label>
          <select v-model="newSheet.domain" class="form-control">
            <option value="">— Sin clasificar (tab General) —</option>
            <option value="energia">Energía y red</option>
            <option value="grupo">Grupo y combustible</option>
            <option value="seguridad">Seguridad física</option>
            <option value="infraestructura">Infraestructura</option>
          </select>
        </div>
        <div class="col-md-6 form-group">
          <!-- spec_detalle_alarma_v2 (Qj4): resume el estado del equipo en el detalle de una alarma. -->
          <label>Medición principal</label>
          <select v-model="newSheet.primaryVariable" class="form-control">
            <option value="">— Ninguna (solo muestra si reporta) —</option>
            <option v-for="v in newSheet.variables.filter(x => x.name)" :key="v.name" :value="v.name">{{ (v.label || v.name) + (v.unit ? ' (' + v.unit + ')' : '') }}</option>
          </select>
          <small class="text-muted">Se muestra en el detalle de una alarma, en "Equipos del sitio ahora".</small>
        </div>
      </div>

      <!-- DEC-REF-115 (#85) — parámetros del cálculo de autonomía de LA
           PLATAFORMA: el edge-engine deriva y publica autonomy_hours como
           variable de primera clase (widget + histórico + alarmable).
           Las controladoras reales no garantizan esa variable (Franco). -->
      <div class="row">
        <div class="col-12">
          <h5 class="mb-1 mt-2">Autonomía — la calcula la plataforma</h5>
          <p class="text-muted" style="font-size:12px">
            autonomy_hours = nivel de combustible [%] × capacidad del tanque / 100 / consumo.
            Si el tanque varía por instalación, se ajusta por equipo en Devices.
            Sin variable de combustible = no hay cálculo (el widget muestra "sin dato").
          </p>
        </div>
        <div class="col-md-4 form-group">
          <label>Variable de combustible (%)</label>
          <select v-model="newSheet.autonomy.fuelVariable" class="form-control">
            <option value="">— Sin cálculo —</option>
            <option v-for="v in newSheet.variables" :key="v.name" :value="v.name">{{ v.label || v.name }}</option>
          </select>
        </div>
        <div class="col-md-4 form-group">
          <label>Capacidad del tanque (L)</label>
          <base-input v-model="newSheet.autonomy.tankCapacity" placeholder="ej. 250" type="number" />
        </div>
        <div class="col-md-4 form-group">
          <label>Consumo (L/h)</label>
          <base-input v-model="newSheet.autonomy.consumptionLph" placeholder="ej. 3.46" type="number" />
        </div>
        <!-- Auditoría 2026-10-14 (F-04/M-01) — parámetros de marcha y del consumo medido -->
        <div class="col-md-3 form-group">
          <label>Variable de marcha</label>
          <select v-model="newSheet.autonomy.runningVariable" class="form-control">
            <option value="">— Alias por defecto —</option>
            <option v-for="v in newSheet.variables" :key="'run-' + v.name" :value="v.name">{{ v.label || v.name }}</option>
          </select>
        </div>
        <div class="col-md-3 form-group">
          <label>Umbral de marcha (ej. rpm &gt; 300)</label>
          <base-input v-model="newSheet.autonomy.runningThreshold" placeholder="0" type="number" />
        </div>
        <div class="col-md-3 form-group">
          <label>Buffer de consumo (h de marcha)</label>
          <base-input v-model="newSheet.autonomy.windowHours" placeholder="24" type="number" />
        </div>
        <div class="col-md-3 form-group">
          <label>Marcha mínima (min)</label>
          <base-input v-model="newSheet.autonomy.minRunMinutes" placeholder="45" type="number" />
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
          <div class="col-md-3 form-group">
            <label>Unidad</label>
            <base-input v-model="v.unit" placeholder="ej. kPa" />
          </div>
          <div class="col-md-3 form-group">
            <label>Rango de fábrica</label>
            <base-input v-model="v.factoryRange" placeholder="ej. 0-100" />
          </div>
          <div class="col-md-3 form-group">
            <label>Cadencia</label>
            <base-input v-model="v.cadence" placeholder="ej. 60s" />
          </div>
          <div class="col-md-3 form-group">
            <label>Umbral de cambio</label>
            <base-input v-model="v.deadband" placeholder="ej. 0.5" type="number" />
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
          <div class="col-12 mb-1">
            <a href="#" class="ficha-tx-tog" @click.prevent="$set(l.texts, 'open', !l.texts.open)">
              {{ l.texts.open ? '▾' : '▸' }} Textos de la alarma
              <small class="text-muted">{{ textsResumen(l.texts) }}</small>
            </a>
            <div v-if="l.texts.open" class="ficha-tx">
              <small class="text-muted d-block mb-1">Las reglas que usan este límite toman estos textos cuando no tienen uno propio. <code>{umbral}</code> se reemplaza por el valor del equipo.</small>
              <base-input v-model="l.texts.meaning" label="Qué significa esta alarma" placeholder="Qué pasa físicamente y qué consecuencia tiene" />
              <base-input v-model="l.texts.operatorAction" label="Qué tiene que hacer el operador" placeholder="Una acción del NOC en una frase" />
              <label class="mb-0">Pasos a seguir <small class="text-muted">(uno por renglón · primero remoto, después en sitio)</small></label>
              <textarea v-model="l.texts.steps" class="form-control mb-2" rows="4"></textarea>
              <label class="mb-0">Causas probables <small class="text-muted">(una por renglón · orden del fabricante)</small></label>
              <textarea v-model="l.texts.causes" class="form-control mb-2" rows="3"></textarea>
              <base-input v-model="l.texts.source" label="Fuente de los textos" placeholder="Documento, edición y página — o PROVISORIO" />
            </div>
          </div>
        </div>
      </div>

      <div slot="footer">
        <base-button type="secondary" @click="createModal = false">Cancelar</base-button>
        <base-button type="primary" @click="submitCreate" :disabled="creating || !canCreate">
          {{ creating ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear ficha') }}
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
          · dominio {{ domainLabel(detailSheet.domain) }}
          · versión {{ detailSheet.version || 1 }}
        </p>
        <base-table
          :data="detailSheet.variables || []"
          :columns="['nombre', 'legible', 'tipo', 'unidad', 'rango fábrica', 'cadencia', 'umbral cambio', 'límites']"
          thead-classes="text-primary"
        >
          <template slot-scope="{ row }">
            <td><code>{{ row.name }}</code></td>
            <td>{{ row.label || '—' }}</td>
            <td>{{ row.type || '—' }}</td>
            <td>{{ row.unit || '—' }}</td>
            <td>{{ row.factoryRange || '—' }}</td>
            <td>{{ row.cadence || '—' }}</td>
            <td>{{ (row.deadband === null || row.deadband === undefined) ? '—' : row.deadband }}</td>
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

    <!-- spec_perfiles_controladora — CONTROLADORAS de la ficha (modelos concretos). -->
    <el-dialog
      :title="ctrlSheet ? `Controladoras · ${ctrlSheet.manufacturer || ''} ${ctrlSheet.model || ''} (${ctrlSheet.deviceType})` : ''"
      :visible.sync="ctrlModal"
      width="860px"
      append-to-body
      @closed="ctrlSheet = null"
    >
      <controller-profiles v-if="ctrlSheet" :key="ctrlSheet.deviceType" :sheet="ctrlSheet" :is-superadmin="isSuperadmin" />
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
import ControllerProfiles from '@/components/fichas/ControllerProfiles.vue';   // spec_perfiles_controladora

// Enums de UI espejo del backend (fuente única: app/api/models/rule_definition.js
// D-3). La pantalla en idioma de usuario completa queda en BACKLOG-UI-13.
const OPERATORS = ['lt', 'lte', 'gt', 'gte', 'eq', 'neq'];
const OPERATOR_LABELS = {
  gt: 'mayor que', gte: 'mayor o igual que',
  lt: 'menor que', lte: 'menor o igual que',
  eq: 'igual a', neq: 'distinto a',
};


// spec_textos_alarma_ficha (Qt1) — textos de la alarma por límite: formulario ↔ payload.
function textsForm(t) {
  const x = t || {};
  return { open: false, meaning: x.meaning || '', operatorAction: x.operatorAction || '',
    steps: Array.isArray(x.steps) ? x.steps.join('\n') : '', causes: Array.isArray(x.causes) ? x.causes.join('\n') : '', source: x.source || '' };
}
function textsPayload(t) {
  if (!t) return undefined;
  const lines = (s) => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  const out = { meaning: String(t.meaning || '').trim() || undefined, operatorAction: String(t.operatorAction || '').trim() || undefined,
    steps: lines(t.steps).slice(0, 12), causes: lines(t.causes), source: String(t.source || '').trim() || undefined };
  if (!out.steps.length) delete out.steps;
  if (!out.causes.length) delete out.causes;
  return Object.values(out).some(v => v !== undefined) ? out : undefined;
}

export default {
  middleware: ['authenticated'],
  name: 'fichas-page',
  components: {
    [Dialog.name]: Dialog,
    [Select.name]: Select,
    [Option.name]: Option,
    ControllerProfiles,
  },
  data() {
    return {
      OPERATORS,
      OPERATOR_LABELS,
      loading: true,
      sheets: [],
      createModal: false,
      creating: false,
      editing: false,   // DEC-REF-111 — el modal reusa el form para editar
      newSheet: this.emptySheet(),
      detailModal: false,
      detailSheet: null,
      ctrlModal: false,
      ctrlSheet: null,
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
  // keep-alive (layouts/default.vue): al VOLVER a esta pestaña no corre mounted();
  // se recargan los datos para no mostrar valores viejos (ej. ficha editada en otra).
  // El primer activated() viene pegado al mount → se saltea con _kaSeen.
  activated() {
    if (!this._kaSeen) { this._kaSeen = true; return; }
    if (this.createModal) return;   // formulario abierto: no pisar la edición
    this.loadSheets();
  },
  methods: {
    openControladoras(row) { this.ctrlSheet = row; this.ctrlModal = true; },
    // Auditoría 2026-10-14 (F-04) — arma el bloque autonomy conservando los campos
    // que el form no edita (flowVariable/flowScale/minDropPct). Vacío → no se envía.
    buildAutonomyPayload(a) {
      const out = { ...a };
      out.tankCapacity = Number(a.tankCapacity);
      out.consumptionLph = Number(a.consumptionLph);
      for (const k of ['runningThreshold', 'windowHours', 'minRunMinutes', 'minDropPct', 'flowScale']) {
        // vacío → null: el PUT mergea campo a campo, null pisa (limpia) el valor previo
        out[k] = (out[k] === '' || out[k] == null) ? null : Number(out[k]);
      }
      for (const k of ['runningVariable', 'flowVariable']) {
        if (!out[k]) out[k] = null;
      }
      return out;
    },
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
      return {
        deviceType: '', manufacturer: '', model: '', origin: 'own', domain: '', primaryVariable: '', variables: [],
        // DEC-REF-115 (#85): parámetros del cálculo de autonomía (vacío = sin cálculo).
        autonomy: { fuelVariable: '', tankCapacity: '', consumptionLph: '', runningVariable: '', runningThreshold: '', windowHours: '', minRunMinutes: '' },
      };
    },
    // DEC-REF-108 F2 (#80): label legible del dominio (tab del sitio).
    domainLabel(domain) {
      const LABELS = {
        energia: 'Energía y red',
        grupo: 'Grupo y combustible',
        seguridad: 'Seguridad física',
        infraestructura: 'Infraestructura',
      };
      return LABELS[domain] || '—';
    },
    openCreateModal() {
      this.newSheet = this.emptySheet();
      this.pdfDraftName = '';
      this.rawCandidates = [];
      this.editing = false;
      this.createModal = true;
    },

    // DEC-REF-111 — edición de ficha. Reusa el modal del alta con el form
    // precargado; deviceType queda disabled (inmutable, es el identificador).
    openEditModal(row) {
      const c = JSON.parse(JSON.stringify(row));
      this.newSheet = {
        deviceType: c.deviceType,
        manufacturer: c.manufacturer || '',
        model: c.model || '',
        origin: c.origin || 'own',
        domain: c.domain || '',
        primaryVariable: c.primaryVariable || '',
        // DEC-REF-115 (#85): config de autonomía (vacía si la ficha no tiene).
        // Auditoría 2026-10-14 (F-04): se conservan TODOS los campos del bloque
        // (flowVariable, flowScale, …) aunque el form no los muestre.
        autonomy: {
          ...(c.autonomy || {}),
          fuelVariable: (c.autonomy && c.autonomy.fuelVariable) || '',
          tankCapacity: (c.autonomy && c.autonomy.tankCapacity) || '',
          consumptionLph: (c.autonomy && c.autonomy.consumptionLph) || '',
          runningVariable: (c.autonomy && c.autonomy.runningVariable) || '',
          runningThreshold: (c.autonomy && c.autonomy.runningThreshold != null) ? c.autonomy.runningThreshold : '',
          windowHours: (c.autonomy && c.autonomy.windowHours) || '',
          minRunMinutes: (c.autonomy && c.autonomy.minRunMinutes) || '',
        },
        variables: (c.variables || []).map(v => ({
          name: v.name || '',
          label: v.label || '',
          type: v.type || 'float',
          unit: v.unit || '',
          factoryRange: v.factoryRange || '',
          cadence: v.cadence || '',
          deadband: v.deadband == null ? '' : v.deadband,
          // Se conservan when / relativeTo (antes se perdían al editar desde esta pantalla) y los
          // textos de la alarma del límite (spec_textos_alarma_ficha Qt1).
          limits: (v.limits || []).map(l => ({
            ...l,
            kind: l.kind || 'warning',
            op: l.op || '',
            value: l.value == null ? '' : l.value,
            unit: l.unit || '',
            source: l.source || '',
            texts: textsForm(l.texts),
          })),
        })),
      };
      this.pdfDraftName = '';
      this.rawCandidates = [];
      this.editing = true;
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
              deadband: (v.deadband === null || v.deadband === undefined) ? null : v.deadband,
              limits: (v.limits || []).map(l => ({ ...l, texts: textsForm(l.texts) })),
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
        name: '', label: text.slice(0, 80), type: 'float', unit: '', factoryRange: '', cadence: '', deadband: null, limits: [],
      });
    },
    addVariable() {
      this.newSheet.variables.push({
        name: '', label: '', type: 'number', unit: '', factoryRange: '', cadence: '', deadband: null, limits: [],
      });
    },
    textsResumen(t) {
      if (!t) return '';
      const n = [t.meaning, t.operatorAction, t.steps].filter(x => String(x || '').trim()).length;
      return n ? `(${n} de 3 cargados${/PROVISORIO/i.test(t.source || '') ? ' · PROVISORIO' : ''})` : '(sin textos)';
    },
    addLimit(variable) {
      variable.limits.push({ kind: 'warning', op: 'gt', value: null, unit: '', source: '', texts: textsForm(null) });
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
          domain: this.newSheet.domain || '',
          primaryVariable: this.newSheet.primaryVariable || '',
          // DEC-REF-115 (#85): con variable de combustible → bloque completo;
          // sin ella → null (limpia; la plataforma no calcula a medias).
          autonomy: this.newSheet.autonomy.fuelVariable
            ? this.buildAutonomyPayload(this.newSheet.autonomy)
            : null,
          variables: this.newSheet.variables.map(v => ({
            name: v.name.trim(),
            label: v.label || undefined,
            type: v.type,
            unit: v.unit || undefined,
            factoryRange: v.factoryRange || undefined,
            cadence: v.cadence || undefined,
            deadband: v.deadband === '' || v.deadband === null || v.deadband === undefined ? undefined : Number(v.deadband),
            limits: (v.limits || []).map(l => ({
              kind: l.kind,
              op: l.op,
              value: l.value === '' || l.value === null ? undefined : Number(l.value),
              unit: l.unit || undefined,
              source: l.source || undefined,
              when: l.when || undefined,   // precondición (ej. solo en marcha) — no se pierde al editar
              relativeTo: l.relativeTo || undefined,   // E1 · U-04 — escalado C3 (12/24 V): no se pierde al editar
              texts: textsPayload(l.texts),   // spec_textos_alarma_ficha Qt1 — textos de la alarma del límite
            })),
          })),
        };
        // DEC-REF-111 — PUT si editás una ficha existente; POST si es nueva.
        let extra = '';
        if (this.editing) {
          const url = '/equipmentsheet/' + encodeURIComponent(payload.deviceType);
          let r;
          try {
            r = await this.$axios.put(url, { newEquipmentSheet: payload }, this.headers());
          } catch (e) {
            // spec_cascada_ficha Q4 — cambio de unidad: confirmación explícita.
            if (e.response?.status === 409 && e.response?.data?.code === 'UNIT_CHANGE' &&
                window.confirm(e.response.data.error + '\n\n¿Confirmás el cambio de unidad?')) {
              r = await this.$axios.put(url, { newEquipmentSheet: { ...payload, confirmUnitChange: true } }, this.headers());
            } else {
              throw e;
            }
          }
          // spec_cascada_ficha C1 — informar a qué templates llegó el cambio.
          const d = r.data || {};
          if ((d.propagated || []).length) extra += ` Actualizados ${d.propagated.length} template(s): ${d.propagated.map(p => p.template).join(', ')}.`;
          if ((d.propagationErrors || []).length) extra += ` No se pudieron actualizar: ${d.propagationErrors.map(p => p.template).join(', ')}.`;
          if ((d.unitWarnings || []).length) extra += ' Revisar: ' + d.unitWarnings.join(' · ');
        } else {
          await this.$axios.post('/equipmentsheet', { newEquipmentSheet: payload }, this.headers());
        }
        this.$notify({
          type: 'success',
          icon: 'tim-icons icon-check-2',
          message: `Ficha ${payload.deviceType} ${this.editing ? 'actualizada' : 'creada'}.${extra}`,
        });
        this.createModal = false;
        this.editing = false;
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
.ficha-tx-tog { font-size: 12px; }
.ficha-tx { border-left: 3px solid #e2e8f0; padding: 6px 0 4px 10px; margin-top: 4px; }
</style>
