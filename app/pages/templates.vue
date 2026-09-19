<template>
  <div>

    <!-- WIDGET CONFIGURATOR -->
    <div class="row">
      <card>
        <div slot="header">
          <h4 class="card-title">Configurar Widget</h4>
        </div>

        <div class="row">
          <!-- WIDGET SELECTOR AND FORMS -->
          <div class="col-6">

            <!-- FICHA DE EQUIPO (DEC-REF-97): la plantilla nace atada a una
                 ficha. Si la ficha declara variables, la variable técnica del
                 widget se elige del catálogo de la ficha (estricto); si la
                 ficha no declara variables (o no hay ficha), el flujo queda
                 libre como antes (compat pre-ficha). -->
            <label class="control-label" style="margin-top:18px">Ficha de equipo</label>
            <el-select
              v-model="templateDeviceType"
              class="select-info"
              placeholder="Sin ficha (compat legacy)"
              style="width: 100%;"
              filterable
              clearable
            >
              <el-option
                v-for="s in sheets"
                :key="s.deviceType"
                :value="s.deviceType"
                :label="sheetLabel(s)"
              />
            </el-select>
            <div
              v-if="templateDeviceType && !sheetVariables.length"
              class="alert alert-warning"
              style="margin-top:10px; padding:8px 12px; font-size:12px"
            >
              <i class="fa fa-exclamation-triangle" style="margin-right:6px"></i>
              La ficha <b>{{ templateDeviceType }}</b> no declara variables — la carga del widget queda libre.
            </div>

            <br />

            <!-- WIDGET TYPE SELECTOR -->
            <label class="control-label">Widget</label>
            <el-select
              v-model="widgetType"
              class="select-success"
              placeholder="Widget"
              style="width: 100%;"
            >
              <el-option value="numberchart" label="Number Chart — Sensor Numérico (entrada ←)">
                <i class="fa fa-chart-line" style="margin-right:8px"></i>Number Chart — Sensor Numérico (entrada ←)
              </el-option>
              <el-option value="indicator" label="Indicador Booleano — On/Off (entrada ←)">
                <i class="fa fa-toggle-on" style="margin-right:8px"></i>Indicador Booleano — On/Off (entrada ←)
              </el-option>
              <el-option value="switch" label="Switch — Control On/Off (salida →)">
                <i class="fa fa-power-off" style="margin-right:8px"></i>Switch — Control On/Off (salida →)
              </el-option>
              <el-option value="button" label="Botón — Envío de Comando (salida →)">
                <i class="fa fa-hand-pointer" style="margin-right:8px"></i>Botón — Envío de Comando (salida →)
              </el-option>
              <el-option value="valueStatus" label="Valor con Estado — luz por umbral (catálogo)">
                <i class="fa fa-signal" style="margin-right:8px"></i>Valor con Estado — luz por umbral (catálogo)
              </el-option>
              <!-- DEC-REF-98 D-3 (#73): widgets Wanomi 3.0 -->
              <el-option-group label="Wanomi 3.0">
                <el-option value="tankLevel" label="Nivel de Tanque — % con litros (Wanomi 3.0)">
                  <i class="fa fa-tint" style="margin-right:8px"></i>Nivel de Tanque — % con litros (Wanomi 3.0)
                </el-option>
                <el-option value="multiState" label="Estado Múltiple — estado nombrado con catálogo (Wanomi 3.0)">
                  <i class="fa fa-toggle-on" style="margin-right:8px"></i>Estado Múltiple — estado nombrado con catálogo (Wanomi 3.0)
                </el-option>
                <el-option value="projectedAutonomy" label="Autonomía Proyectada — horas que publica el equipo (Wanomi 3.0)">
                  <i class="fa fa-battery-half" style="margin-right:8px"></i>Autonomía Proyectada — horas que publica el equipo (Wanomi 3.0)
                </el-option>
                <el-option value="dataFreshness" label="Frescura de Datos — hace cuánto llegó el dato (Wanomi 3.0)">
                  <i class="fa fa-sync" style="margin-right:8px"></i>Frescura de Datos — hace cuánto llegó el dato (Wanomi 3.0)
                </el-option>
                <el-option value="booleanDwell" label="Permanencia Booleana — cuánto lleva en este estado (Wanomi 3.0)">
                  <i class="fa fa-clock" style="margin-right:8px"></i>Permanencia Booleana — cuánto lleva en este estado (Wanomi 3.0)
                </el-option>
                <el-option value="equipmentAlarms" label="Alarmas del Equipo — feed del sitio filtrado (Wanomi 3.0)">
                  <i class="fa fa-bell" style="margin-right:8px"></i>Alarmas del Equipo — feed del sitio filtrado (Wanomi 3.0)
                </el-option>
              </el-option-group>
            </el-select>

            <br /><br />

            <!-- SELECTOR DE VARIABLE DESDE LA FICHA (DEC-REF-97):
                 visible solo si hay ficha elegida CON variables. Aplica al
                 config del widget activo: fija `variable` (técnica, viaja en
                 el topic MQTT) y autocompleta label/unidad/tipo. -->
            <div v-if="widgetType && sheetVariables.length">
              <label class="control-label">
                Variable de la ficha <code style="font-size:11px">{{ templateDeviceType }}</code>
              </label>
              <el-select
                v-model="sheetVarPick"
                class="select-info"
                placeholder="Elegir variable del catálogo de la ficha"
                style="width: 100%; margin-bottom: 6px"
                filterable
                @change="applySheetVariable"
              >
                <el-option
                  v-for="v in sheetVariables"
                  :key="v.name"
                  :value="v.name"
                  :label="sheetVarLabel(v)"
                />
              </el-select>
              <p class="text-muted" style="font-size:11px; margin-bottom:16px">
                La variable técnica queda atada a la ficha; el nombre visible se puede ajustar abajo.
              </p>
            </div>

            <!-- CONFIG FORM (DEC-REF-107): un solo formulario genérico
                 dirigido por el descriptor del tipo activo. Reemplaza los
                 11 mini-formularios v-if calcados. -->
            <widget-config-form
              v-if="activeDescriptor"
              :descriptor="activeDescriptor"
              :config="widgetDraft"
              :sheet-variables="sheetVariables"
            />

          </div>

          <!-- WIDGET PREVIEW -->
          <div class="col-6">
            <div v-if="widgetType" style="margin-bottom:10px">
              <h6 class="text-muted">
                <i class="fa fa-eye" style="margin-right:6px"></i>Vista Previa
              </h6>
            </div>
            <component
              v-if="widgetType && widgetDraft"
              :is="resolveWidget(widgetType, { context: 'editor' })"
              :config="widgetDraft"
            />
          </div>
        </div>

        <!-- ADD WIDGET BUTTON -->
        <div class="row" style="margin-top:12px">
          <div class="col-12" style="text-align:right">
            <base-button
              type="primary"
              size="lg"
              :disabled="!canAddWidget"
              @click="addNewWidget()"
            >
              <i class="fa fa-plus" style="margin-right:6px"></i>Agregar Widget
            </base-button>
          </div>
        </div>

      </card>
    </div>

    <!-- WIDGET LIST PREVIEW (before saving) -->
    <div class="row" v-if="widgets.length > 0">
      <div class="col-12" style="margin-bottom:10px">
        <h6 class="text-muted">
          <i class="fa fa-th" style="margin-right:6px"></i>Widgets en esta plantilla
          <span style="background:#e14eca; color:#fff; border-radius:10px; padding:1px 8px; font-size:12px; margin-left:6px">{{ widgets.length }}</span>
        </h6>
      </div>
      <div
        v-for="(widget, index) in widgets"
        :key="index"
        :class="[widget.column]"
      >
        <div style="display:flex; justify-content:flex-end; align-items:center; gap:4px; margin-bottom:6px">
          <base-button
            size="sm"
            type="default"
            icon
            :disabled="index === 0"
            @click="moveWidget(index, -1)"
          >
            <i class="fa fa-arrow-left"></i>
          </base-button>
          <base-button
            size="sm"
            type="default"
            icon
            :disabled="index === widgets.length - 1"
            @click="moveWidget(index, 1)"
          >
            <i class="fa fa-arrow-right"></i>
          </base-button>
          <base-button size="sm" type="danger" icon @click="deleteWidget(index)">
            <i class="fa fa-trash"></i>
          </base-button>
        </div>

        <component :is="resolveWidget(widget.widget, { context: 'editor' })" :config="widget" />
      </div>
    </div>

    <!-- SAVE TEMPLATE FORM -->
    <div class="row">
      <card>
        <div slot="header">
          <h4 class="card-title">
            {{ editingTemplateId ? 'Editar Plantilla' : 'Guardar Plantilla' }}
            <base-button
              v-if="editingTemplateId"
              size="sm"
              type="default"
              style="margin-left:12px"
              @click="cancelEditTemplate()"
            >
              Cancelar edición
            </base-button>
          </h4>
          <p v-if="editingTemplateId" class="text-muted" style="font-size:12px; margin-bottom:0">
            <i class="fa fa-exclamation-triangle" style="margin-right:6px"></i>
            Quitar variables en uso por dispositivos o reglas será rechazado por el sistema.
          </p>
        </div>

        <div class="row">
          <base-input class="col-4" v-model="templateName" label="Nombre" type="text" />
          <base-input class="col-5" v-model="templateDescription" label="Descripción" type="text" />
          <base-input class="col-3" v-model.number="templateHeartbeatSec" label="Latido del equipo (seg)" type="number" />
        </div>

        <div class="row">
          <div class="col-12">
            <p class="text-muted" style="font-size:12px; margin-top:-8px; margin-bottom:10px">
              <i class="fa fa-heartbeat" style="margin-right:6px"></i>
              Latido: aunque ninguna variable supere su umbral de cambio, el equipo publica todo
              cada esta cantidad de segundos para avisar que está vivo. El estado online del
              sitio y el indicador de Uptime se calculan contra este valor.
            </p>
          </div>
        </div>

        <div class="row" v-if="templateDeviceType">
          <div class="col-12">
            <p class="text-muted" style="font-size:12px; margin-bottom:10px">
              <i class="fa fa-link" style="margin-right:6px"></i>
              La plantilla quedará asociada a la ficha
              <code style="font-size:11px">{{ templateDeviceType }}</code>
              (elegida arriba, en el configurador de widgets).
            </p>
          </div>
        </div>

        <div class="row">
          <div class="col-12" style="text-align:right">
            <base-button
              type="primary"
              size="lg"
              :disabled="widgets.length === 0 || !templateName || saveLoading"
              @click="saveTemplate()"
            >
              <i
                class="fa"
                :class="saveLoading ? 'fa-spinner fa-spin' : 'fa-save'"
                style="margin-right:6px"
              ></i>
              {{ saveLoading ? 'Guardando...' : (editingTemplateId ? 'Guardar Cambios' : 'Guardar Plantilla') }}
            </base-button>
          </div>
        </div>
      </card>
    </div>

    <!-- TEMPLATES TABLE -->
    <div class="row">
      <card>
        <div slot="header">
          <h4 class="card-title">Plantillas</h4>
        </div>

        <div class="row">
          <el-table :data="templates">
            <el-table-column min-width="50" label="#" align="center">
              <div slot-scope="{ $index }">{{ $index + 1 }}</div>
            </el-table-column>

            <el-table-column prop="name" label="Nombre" />
            <el-table-column prop="description" label="Descripción" />

            <el-table-column label="Ficha" width="160">
              <template slot-scope="{ row }">
                <code v-if="row.deviceType" style="font-size:11px">{{ row.deviceType }}</code>
                <span v-else class="text-muted" style="font-size:12px">sin ficha</span>
              </template>
            </el-table-column>

            <el-table-column label="Widgets" align="center" width="90">
              <template slot-scope="{ row }">
                <span style="background:#e14eca; color:#fff; border-radius:10px; padding:2px 10px; font-size:12px">
                  {{ row.widgets.length }}
                </span>
              </template>
            </el-table-column>

            <el-table-column header-align="right" align="right" label="Acciones" width="120">
              <div slot-scope="{ row }" class="text-right table-actions">
                <el-tooltip content="Ver detalle" effect="light" :open-delay="300" placement="top">
                  <base-button @click="viewTemplate(row)" type="info" icon size="sm" class="btn-link">
                    <i class="tim-icons icon-zoom-split"></i>
                  </base-button>
                </el-tooltip>
                <el-tooltip content="Editar" effect="light" :open-delay="300" placement="top">
                  <base-button @click="openEditTemplate(row)" type="warning" icon size="sm" class="btn-link">
                    <i class="fa fa-pencil"></i>
                  </base-button>
                </el-tooltip>
                <el-tooltip content="Eliminar" effect="light" :open-delay="300" placement="top">
                  <base-button
                    @click="deleteTemplate(row)"
                    type="danger"
                    icon
                    size="sm"
                    class="btn-link"
                    :disabled="deleteLoadingId === row._id"
                  >
                    <i class="fa" :class="deleteLoadingId === row._id ? 'fa-spinner fa-spin' : 'fa-trash'"></i>
                  </base-button>
                </el-tooltip>
              </div>
            </el-table-column>
          </el-table>
        </div>
      </card>
    </div>

    <!-- TEMPLATE DETAIL MODAL -->
    <el-dialog
      :title="selectedTemplate ? 'Plantilla: ' + selectedTemplate.name : ''"
      :visible.sync="showDetailModal"
      width="60%"
      append-to-body
    >
      <div v-if="selectedTemplate">
        <p class="text-muted" style="margin-bottom:16px">{{ selectedTemplate.description }}</p>
        <el-table :data="selectedTemplate.widgets" size="small">
          <el-table-column label="Tipo" width="130">
            <template slot-scope="{ row }">
              <span style="text-transform:capitalize">{{ row.widget }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="variableFullName" label="Variable" />
          <el-table-column label="Ícono" width="100" align="center">
            <template slot-scope="{ row }">
              <i class="fa fa-lg" :class="row.icon"></i>
            </template>
          </el-table-column>
          <el-table-column label="Color" width="110">
            <template slot-scope="{ row }">
              <span :style="colorDotStyle(colorHex(row.class))"></span>{{ colorLabel(row.class) }}
            </template>
          </el-table-column>
          <el-table-column label="Tamaño" width="140">
            <template slot-scope="{ row }">
              {{ columnLabel(row.column) }}
            </template>
          </el-table-column>
          <el-table-column prop="tasmotaPath" label="Tasmota Path" width="160">
            <template slot-scope="{ row }">
              <code v-if="row.tasmotaPath" style="font-size:11px">{{ row.tasmotaPath }}</code>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <span slot="footer">
        <base-button type="primary" @click="showDetailModal = false">Cerrar</base-button>
      </span>
    </el-dialog>

  </div>
</template>

<script>
import { Table, TableColumn, Dialog, Tooltip } from "element-ui";
import { Select, Option, OptionGroup, Input, MessageBox } from "element-ui";
import { resolveWidget } from "@/components/Widgets/resolver.js";
import WidgetConfigForm from "@/components/Widgets/WidgetConfigForm.vue";
import {
  getDescriptor,
  colorHex,
  colorLabel,
  columnLabel,
} from "@/components/Widgets/widgetRegistry.js";

export default {
  middleware: "authenticated",
  components: {
    [Table.name]: Table,
    [TableColumn.name]: TableColumn,
    [Dialog.name]: Dialog,
    [Tooltip.name]: Tooltip,
    [Option.name]: Option,
    [OptionGroup.name]: OptionGroup,
    [Input.name]: Input,
    [Select.name]: Select,
    WidgetConfigForm,
  },
  data() {
    return {
      widgets: [],
      templates: [],
      widgetType: "",
      // DEC-REF-107 (Paso 1): un único borrador de widget, reconstruido desde
      // el descriptor del tipo activo. Reemplaza los 11 objetos de config.
      widgetDraft: null,
      templateName: "",
      templateDescription: "",
      templateHeartbeatSec: 300,
      saveLoading: false,
      deleteLoadingId: null,
      // DEC-REF-100 D-6 (#75, F4): plantilla en edición. null = modo alta.
      editingTemplateId: null,
      showDetailModal: false,
      selectedTemplate: null,

      // DEC-REF-97: fichas de equipo disponibles y ficha elegida para la
      // plantilla en construcción ('' = sin ficha, compat pre-ficha).
      sheets: [],
      templateDeviceType: "",
      sheetVarPick: "",
    };
  },

  computed: {
    // DEC-REF-107: descriptor del tipo de widget activo (fuente de campos,
    // defaults, dedupe y normalización).
    activeDescriptor() {
      return getDescriptor(this.widgetType);
    },
    canAddWidget() {
      const d = this.activeDescriptor;
      const config = this.widgetDraft;
      if (!d || !config) return false;
      if (!config.variableFullName || !config.variableFullName.trim()) return false;
      // DEC-REF-76-B (iii) / DEC-REF-98 D-3: los widgets de variable exigen
      // `variable` no vacía (clave real contra el equipo). equipmentAlarms y
      // legacy no la exigen (su unicidad es por tipo / variableFullName).
      if (d.isVariableWidget) {
        if (!config.variable || !config.variable.trim()) return false;
      }
      return true;
    },
    // DEC-REF-97: ficha elegida y su catálogo de variables.
    selectedSheet() {
      return this.sheets.find((s) => s.deviceType === this.templateDeviceType) || null;
    },
    sheetVariables() {
      return this.selectedSheet ? this.selectedSheet.variables || [] : [];
    },
    sheetVariableNames() {
      return this.sheetVariables.map((v) => v.name);
    },
  },
  watch: {
    // DEC-REF-107: al cambiar el tipo, se arranca un borrador limpio desde el
    // descriptor. Cambiar de tipo resetea los campos en curso (intencional).
    widgetType() {
      const d = this.activeDescriptor;
      this.widgetDraft = d ? d.defaultConfig() : null;
      this.sheetVarPick = "";
    },
    // DEC-REF-97: al cambiar la ficha, los widgets ya acumulados cuya
    // variable técnica queda fuera del catálogo nuevo se avisan (ámbar),
    // NO se borran — el usuario decide.
    templateDeviceType() {
      this.sheetVarPick = "";
      if (!this.templateDeviceType || !this.sheetVariables.length || !this.widgets.length) return;
      const fuera = this.widgets.filter((w) => !this.sheetVariableNames.includes(w.variable));
      if (fuera.length) {
        this.$notify({
          type: "warning",
          icon: "tim-icons icon-alert-circle-exc",
          message: `${fuera.length} widget(s) usan variables fuera de la ficha ${this.templateDeviceType}. Se conservan, pero la plantilla puede quedar inconsistente.`,
        });
      }
    },
  },
  mounted() {
    this.getTemplates();
    this.getSheets();
  },

  methods: {
    resolveWidget,
    // DEC-REF-107: helpers de color/tamaño ahora viven en el registry.
    colorHex,
    colorLabel,
    columnLabel,

    colorDotStyle(hex) {
      return {
        display: "inline-block",
        width: "12px",
        height: "12px",
        borderRadius: "50%",
        background: hex || "#aaa",
        marginRight: "8px",
        border: "1px solid rgba(255,255,255,0.3)",
        verticalAlign: "middle",
      };
    },

    viewTemplate(template) {
      this.selectedTemplate = template;
      this.showDetailModal = true;
    },

    // DEC-REF-97: helpers de ficha -------------------------------------
    sheetLabel(s) {
      const fab = [s.manufacturer, s.model].filter(Boolean).join(" ");
      return fab ? `${s.deviceType} — ${fab}` : s.deviceType;
    },

    sheetVarLabel(v) {
      const unit = v.unit ? ` [${v.unit}]` : "";
      return `${v.label || v.name} (${v.name})${unit}`;
    },

    async getSheets() {
      // La ficha es opcional: si el endpoint falla, la página sigue
      // operando en modo legacy sin bloquear al usuario.
      const axiosHeaders = {
        headers: { token: this.$store.state.auth.token },
      };
      try {
        const res = await this.$axios.get("/equipmentsheet", axiosHeaders);
        if (res.data.status == "success") {
          this.sheets = res.data.data;
        }
      } catch (error) {
        this.$notify({
          type: "warning",
          icon: "tim-icons icon-alert-circle-exc",
          message: "No se pudieron cargar las fichas de equipo",
        });
      }
    },

    applySheetVariable(varName) {
      const v = this.sheetVariables.find((x) => x.name === varName);
      const cfg = this.widgetDraft;
      if (!v || !cfg) return;
      // La variable TÉCNICA es la de la ficha (es la que viaja en el topic
      // MQTT y la que compara el motor de reglas — DEC-REF-91).
      cfg.variable = v.name;
      cfg.variableFullName = v.label || v.name;
      if ("unit" in cfg) cfg.unit = v.unit || "";
      // P2 (#79): el umbral de cambio nace en la ficha (precisión del
      // fabricante). Si el config del widget lo soporta, se hereda.
      if ("deadband" in cfg) cfg.deadband = Number.isFinite(v.deadband) ? v.deadband : null;
      // valueStatus declara variableType propio: se adopta el de la ficha
      // solo si es uno de los 4 que el widget entiende.
      if (
        this.widgetType === "valueStatus" &&
        ["float", "int", "bool", "categorical"].includes(v.type)
      ) {
        cfg.variableType = v.type;
      }
    },

    moveWidget(index, direction) {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= this.widgets.length) return;
      const arr = [...this.widgets];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      this.widgets = arr;
    },

    async getTemplates() {
      const axiosHeaders = {
        headers: {
          token: this.$store.state.auth.token,
          "Cache-Control": "no-cache"
        },
        params: { _t: Date.now() }
      };
      try {
        const res = await this.$axios.get("/template", axiosHeaders);
        if (res.data.status == "success") {
          this.templates = res.data.data;
        }
      } catch (error) {
        this.$notify({
          type: "danger",
          icon: "tim-icons icon-alert-circle-exc",
          message: "Error al obtener plantillas",
        });
      }
    },

    async saveTemplate() {
      if (this.saveLoading) return;

      // DEC-REF-97: con ficha elegida, los widgets cuya variable técnica
      // queda fuera del catálogo se confirman explícitamente (la plantilla
      // puede guardarse igual — la ficha puede crecer después — pero el
      // usuario queda avisado).
      if (this.templateDeviceType && this.sheetVariables.length) {
        const fuera = this.widgets.filter((w) => !this.sheetVariableNames.includes(w.variable));
        if (fuera.length) {
          try {
            await MessageBox.confirm(
              `${fuera.length} widget(s) usan variables que no están en la ficha "${this.templateDeviceType}". ¿Guardar la plantilla de todas formas?`,
              "Variables fuera de la ficha",
              {
                confirmButtonText: "Guardar igual",
                cancelButtonText: "Revisar",
                type: "warning",
              }
            );
          } catch {
            return;
          }
        }
      }

      this.saveLoading = true;
      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };
      const toSend = {
        template: {
          name: this.templateName,
          description: this.templateDescription,
          deviceType: this.templateDeviceType || "",
          heartbeatSec: Number(this.templateHeartbeatSec) > 0 ? Number(this.templateHeartbeatSec) : 300,
          widgets: this.widgets,
        },
      };
      try {
        // DEC-REF-100 D-6 (F4): edición → PUT con templateId; alta → POST.
        const res = this.editingTemplateId
          ? await this.$axios.put("/template", { templateId: this.editingTemplateId, ...toSend }, axiosHeaders)
          : await this.$axios.post("/template", toSend, axiosHeaders);
        if (res.data.status == "success") {
          this.$notify({
            type: "success",
            icon: "tim-icons icon-check-2",
            message: this.editingTemplateId ? "¡Cambios guardados!" : "¡Plantilla guardada!",
          });
          await this.getTemplates();
          this.resetTemplateForm();
        }
      } catch (error) {
        // El 409 del PUT trae el detalle (variables en uso por devices o reglas).
        const detail = error.response && error.response.data && error.response.data.error;
        this.$notify({
          type: "danger",
          icon: "tim-icons icon-alert-circle-exc",
          message: typeof detail === "string" ? detail : (this.editingTemplateId ? "Error al guardar cambios" : "Error al guardar plantilla"),
        });
      } finally {
        this.saveLoading = false;
      }
    },

    // DEC-REF-100 D-6 (F4): carga la plantilla en el configurador para editarla.
    // La edición de tamaño (column) sale gratis: los widgets cargados se
    // retocan con los mini-forms existentes y se reordenan/quitan igual.
    openEditTemplate(template) {
      this.editingTemplateId = template._id;
      this.templateName = template.name;
      this.templateDescription = template.description || "";
      this.templateHeartbeatSec = Number(template.heartbeatSec) > 0 ? Number(template.heartbeatSec) : 300;
      this.templateDeviceType = template.deviceType || "";
      this.sheetVarPick = "";
      this.widgetType = "";
      this.widgets = JSON.parse(JSON.stringify(template.widgets || []));
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    cancelEditTemplate() {
      this.resetTemplateForm();
    },

    resetTemplateForm() {
      this.editingTemplateId = null;
      this.widgets = [];
      this.templateName = "";
      this.templateDescription = "";
      this.templateHeartbeatSec = 300;
      this.templateDeviceType = "";
      this.sheetVarPick = "";
      this.widgetType = "";
    },

    async deleteTemplate(template) {
      try {
        await MessageBox.confirm(
          `¿Eliminar la plantilla "${template.name}"? Esta acción no se puede deshacer.`,
          "Confirmar eliminación",
          {
            confirmButtonText: "Eliminar",
            cancelButtonText: "Cancelar",
            type: "warning",
          }
        );
      } catch {
        return;
      }

      this.deleteLoadingId = template._id;
      const axiosHeaders = {
        headers: { token: this.$store.state.auth.token },
        params: { templateId: template._id },
      };
      try {
        const res = await this.$axios.delete("/template", axiosHeaders);
        if (res.data.status == "fail" && res.data.error == "template in use") {
          this.$notify({
            type: "danger",
            icon: "tim-icons icon-alert-circle-exc",
            message: `${template.name} está en uso. ¡Primero eliminá los dispositivos vinculados!`,
          });
          return;
        }
        if (res.data.status == "success") {
          this.$notify({
            type: "success",
            icon: "tim-icons icon-check-2",
            message: `${template.name} eliminada`,
          });
          this.getTemplates();
        }
      } catch (error) {
        this.$notify({
          type: "danger",
          icon: "tim-icons icon-alert-circle-exc",
          message: "Error al eliminar plantilla",
        });
      } finally {
        this.deleteLoadingId = null;
      }
    },

    // DEC-REF-107: alta de widget genérica, dirigida por el descriptor.
    // Preserva las guardas previas: dedupe (por tipo / variable / nombre),
    // makeid solo para no-variable no-ficha, y normalización pre-push.
    addNewWidget() {
      const d = this.activeDescriptor;
      const config = this.widgetDraft;
      if (!d || !config) return;

      const isAlarms = d.dedupeKey === "type";
      const isVariableWidget = d.isVariableWidget;
      // DEC-REF-97: la variable vino del catálogo de la ficha → clave real
      // (técnica) y NO se pisa con makeid.
      const fromSheet = this.sheetVariableNames.includes(config.variable);

      if (isAlarms) {
        // equipmentAlarms: uno por plantilla (su fuente es el feed del sitio).
        if (this.widgets.some((w) => w.widget === d.type)) {
          this.$notify({
            type: "warning",
            icon: "tim-icons icon-alert-circle-exc",
            message: "Ya hay un widget de alarmas del equipo en esta plantilla (uno alcanza)",
          });
          return;
        }
      } else if (isVariableWidget || fromSheet) {
        // DEC-REF-76-B (ii): dedupe por `variable` (clave real de unicidad).
        const varName = (config.variable || "").trim();
        if (this.widgets.some((w) => w.variable === varName)) {
          this.$notify({
            type: "warning",
            icon: "tim-icons icon-alert-circle-exc",
            message: `Ya existe un widget con la variable "${varName}"`,
          });
          return;
        }
      } else {
        // Legacy: dedupe por variableFullName (el makeid garantiza `variable` único).
        const label = (config.variableFullName || "").trim();
        if (this.widgets.some((w) => (w.variableFullName || "").trim() === label)) {
          this.$notify({
            type: "warning",
            icon: "tim-icons icon-alert-circle-exc",
            message: `Ya existe un widget con la variable "${label}"`,
          });
          return;
        }
      }

      // DEC-REF-76-B (i) / DEC-REF-98: NO pisar `variable` con makeid en los
      // widgets de variable ni si vino de la ficha; equipmentAlarms no tiene.
      if (!isVariableWidget && !fromSheet && !isAlarms) {
        config.variable = this.makeid(10);
      }

      // Normalización pre-push (toNumOrNull / restore defaults / filtro
      // enumValues) — encapsulada por tipo en el descriptor.
      d.normalize(config);

      this.widgets.push(JSON.parse(JSON.stringify(config)));

      // Borrador limpio para el próximo widget del mismo tipo.
      this.widgetDraft = d.defaultConfig();
      this.sheetVarPick = "";
    },

    deleteWidget(index) {
      this.widgets.splice(index, 1);
    },

    makeid(length) {
      var result = "";
      var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      return result;
    },
  },
};
</script>
