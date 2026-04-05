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
            </el-select>

            <br /><br />

            <!-- FORM NUMBER CHART -->
            <div v-if="widgetType == 'numberchart'">
              <base-input v-model="ncConfig.variableFullName" label="Nombre de Variable" type="text" />
              <base-input v-model="ncConfig.unit" label="Unidad" type="text" />
              <base-input v-model.number="ncConfig.decimalPlaces" label="Decimales" type="number" />

              <label class="control-label">Ícono</label>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px">
                <el-select v-model="ncConfig.icon" placeholder="Ícono" style="flex:1" class="select-primary">
                  <el-option v-for="ic in iconOptions" :key="ic.value" :value="ic.value" :label="ic.label">
                    <i class="fa" :class="ic.value" style="margin-right:8px; width:16px; text-align:center"></i>{{ ic.label }}
                  </el-option>
                </el-select>
                <i class="fa fa-2x" :class="ncConfig.icon" style="min-width:28px; text-align:center; opacity:0.85"></i>
              </div>

              <base-input v-model.number="ncConfig.variableSendFreq" label="Frecuencia de Envío (seg)" type="number" />
              <base-input v-model.number="ncConfig.chartTimeAgo" label="Historial del Gráfico (min)" type="number" />
              <base-input v-model="ncConfig.tasmotaPath" label="Tasmota Path (opcional, ej: DHT11.Temperature)" type="text" placeholder="DHT11.Temperature" />

              <label class="control-label">Color de Widget</label>
              <el-select v-model="ncConfig.class" placeholder="Color de Widget" style="width:100%; margin-bottom:20px" class="select-primary">
                <el-option v-for="c in colorOptions" :key="c.value" :value="c.value" :label="c.label">
                  <span :style="colorDotStyle(c.hex)"></span>{{ c.label }}
                </el-option>
              </el-select>

              <label class="control-label">Tamaño del Widget</label>
              <el-select v-model="ncConfig.column" placeholder="Tamaño del Widget" style="width:100%" class="select-primary">
                <el-option v-for="col in columnOptions" :key="col.value" :value="col.value" :label="col.label" />
              </el-select>
              <br /><br />
            </div>

            <!-- FORM SWITCH -->
            <div v-if="widgetType == 'switch'">
              <base-input v-model="iotSwitchConfig.variableFullName" label="Nombre de Variable" type="text" />
              <base-input v-model="iotSwitchConfig.tasmotaPath" label="Tasmota Path (opcional, ej: POWER)" type="text" placeholder="POWER" />

              <label class="control-label">Ícono</label>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px">
                <el-select v-model="iotSwitchConfig.icon" placeholder="Ícono" style="flex:1" class="select-primary">
                  <el-option v-for="ic in iconOptions" :key="ic.value" :value="ic.value" :label="ic.label">
                    <i class="fa" :class="ic.value" style="margin-right:8px; width:16px; text-align:center"></i>{{ ic.label }}
                  </el-option>
                </el-select>
                <i class="fa fa-2x" :class="iotSwitchConfig.icon" style="min-width:28px; text-align:center; opacity:0.85"></i>
              </div>

              <label class="control-label">Color de Widget</label>
              <el-select v-model="iotSwitchConfig.class" placeholder="Color de Widget" style="width:100%; margin-bottom:20px" class="select-primary">
                <el-option v-for="c in colorOptions" :key="c.value" :value="c.value" :label="c.label">
                  <span :style="colorDotStyle(c.hex)"></span>{{ c.label }}
                </el-option>
              </el-select>

              <label class="control-label">Tamaño del Widget</label>
              <el-select v-model="iotSwitchConfig.column" placeholder="Tamaño del Widget" style="width:100%" class="select-primary">
                <el-option v-for="col in columnOptions" :key="col.value" :value="col.value" :label="col.label" />
              </el-select>
              <br /><br />
            </div>

            <!-- FORM BUTTON -->
            <div v-if="widgetType == 'button'">
              <base-input v-model="configButton.variableFullName" label="Nombre de Variable" type="text" />
              <base-input v-model="configButton.message" label="Mensaje a Enviar" type="text" />
              <base-input v-model="configButton.text" label="Texto del Botón" type="text" />
              <base-input v-model="configButton.tasmotaPath" label="Tasmota Path (opcional, ej: POWER)" type="text" placeholder="POWER" />

              <label class="control-label">Ícono</label>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px">
                <el-select v-model="configButton.icon" placeholder="Ícono" style="flex:1" class="select-primary">
                  <el-option v-for="ic in iconOptions" :key="ic.value" :value="ic.value" :label="ic.label">
                    <i class="fa" :class="ic.value" style="margin-right:8px; width:16px; text-align:center"></i>{{ ic.label }}
                  </el-option>
                </el-select>
                <i class="fa fa-2x" :class="configButton.icon" style="min-width:28px; text-align:center; opacity:0.85"></i>
              </div>

              <label class="control-label">Color de Widget</label>
              <el-select v-model="configButton.class" placeholder="Color de Widget" style="width:100%; margin-bottom:20px" class="select-primary">
                <el-option v-for="c in colorOptions" :key="c.value" :value="c.value" :label="c.label">
                  <span :style="colorDotStyle(c.hex)"></span>{{ c.label }}
                </el-option>
              </el-select>

              <label class="control-label">Tamaño del Widget</label>
              <el-select v-model="configButton.column" placeholder="Tamaño del Widget" style="width:100%" class="select-primary">
                <el-option v-for="col in columnOptions" :key="col.value" :value="col.value" :label="col.label" />
              </el-select>
              <br /><br />
            </div>

            <!-- FORM INDICATOR -->
            <div v-if="widgetType == 'indicator'">
              <base-input v-model="iotIndicatorConfig.variableFullName" label="Nombre de Variable" type="text" />
              <base-input v-model="iotIndicatorConfig.variableSendFreq" label="Frecuencia de Envío (seg)" type="text" />
              <base-input v-model="iotIndicatorConfig.tasmotaPath" label="Tasmota Path (opcional, ej: POWER)" type="text" placeholder="POWER" />

              <label class="control-label">Ícono</label>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px">
                <el-select v-model="iotIndicatorConfig.icon" placeholder="Ícono" style="flex:1" class="select-primary">
                  <el-option v-for="ic in iconOptions" :key="ic.value" :value="ic.value" :label="ic.label">
                    <i class="fa" :class="ic.value" style="margin-right:8px; width:16px; text-align:center"></i>{{ ic.label }}
                  </el-option>
                </el-select>
                <i class="fa fa-2x" :class="iotIndicatorConfig.icon" style="min-width:28px; text-align:center; opacity:0.85"></i>
              </div>

              <label class="control-label">Color de Widget</label>
              <el-select v-model="iotIndicatorConfig.class" placeholder="Color de Widget" style="width:100%; margin-bottom:20px" class="select-primary">
                <el-option v-for="c in colorOptions" :key="c.value" :value="c.value" :label="c.label">
                  <span :style="colorDotStyle(c.hex)"></span>{{ c.label }}
                </el-option>
              </el-select>

              <label class="control-label">Tamaño del Widget</label>
              <el-select v-model="iotIndicatorConfig.column" placeholder="Tamaño del Widget" style="width:100%" class="select-primary">
                <el-option v-for="col in columnOptions" :key="col.value" :value="col.value" :label="col.label" />
              </el-select>
              <br /><br />
            </div>

          </div>

          <!-- WIDGET PREVIEW -->
          <div class="col-6">
            <div v-if="widgetType" style="margin-bottom:10px">
              <h6 class="text-muted">
                <i class="fa fa-eye" style="margin-right:6px"></i>Vista Previa
              </h6>
            </div>
            <Rtnumberchart v-if="widgetType == 'numberchart'" :config="ncConfig" />
            <Iotswitch v-if="widgetType == 'switch'" :config="iotSwitchConfig" />
            <Iotbutton v-if="widgetType == 'button'" :config="configButton" />
            <Iotindicator v-if="widgetType == 'indicator'" :config="iotIndicatorConfig" />
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

        <Rtnumberchart v-if="widget.widget == 'numberchart'" :config="widget" />
        <Iotswitch v-if="widget.widget == 'switch'" :config="widget" />
        <Iotbutton v-if="widget.widget == 'button'" :config="widget" />
        <Iotindicator v-if="widget.widget == 'indicator'" :config="widget" />
      </div>
    </div>

    <!-- SAVE TEMPLATE FORM -->
    <div class="row">
      <card>
        <div slot="header">
          <h4 class="card-title">Guardar Plantilla</h4>
        </div>

        <div class="row">
          <base-input class="col-4" v-model="templateName" label="Nombre" type="text" />
          <base-input class="col-8" v-model="templateDescription" label="Descripción" type="text" />
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
              {{ saveLoading ? 'Guardando...' : 'Guardar Plantilla' }}
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
import { Select, Option, MessageBox } from "element-ui";

export default {
  middleware: "authenticated",
  components: {
    [Table.name]: Table,
    [TableColumn.name]: TableColumn,
    [Dialog.name]: Dialog,
    [Tooltip.name]: Tooltip,
    [Option.name]: Option,
    [Select.name]: Select,
  },
  data() {
    return {
      widgets: [],
      templates: [],
      widgetType: "",
      templateName: "",
      templateDescription: "",
      saveLoading: false,
      deleteLoadingId: null,
      showDetailModal: false,
      selectedTemplate: null,

      iconOptions: [
        // Ambiente / Sensores
        { value: "fa-thermometer-half", label: "Temperatura" },
        { value: "fa-tint",             label: "Humedad" },
        { value: "fa-wind",             label: "Viento" },
        { value: "fa-cloud",            label: "Nube" },
        { value: "fa-sun",              label: "Sol / Luz" },
        { value: "fa-fire",             label: "Fuego / Calor" },
        { value: "fa-snowflake",        label: "Frío" },
        { value: "fa-water",            label: "Agua / Caudal" },
        // Energía
        { value: "fa-bolt",             label: "Electricidad" },
        { value: "fa-plug",             label: "Enchufe" },
        { value: "fa-battery-full",     label: "Batería Llena" },
        { value: "fa-battery-half",     label: "Batería Media" },
        { value: "fa-battery-empty",    label: "Batería Vacía" },
        // Hogar / Control
        { value: "fa-home",             label: "Casa" },
        { value: "fa-lightbulb",        label: "Foco" },
        { value: "fa-fan",              label: "Ventilador" },
        { value: "fa-door-open",        label: "Puerta Abierta" },
        { value: "fa-door-closed",      label: "Puerta Cerrada" },
        { value: "fa-lock",             label: "Candado" },
        { value: "fa-lock-open",        label: "Candado Abierto" },
        { value: "fa-bath",             label: "Baño" },
        // Estado / Sistema
        { value: "fa-power-off",        label: "Encendido/Apagado" },
        { value: "fa-toggle-on",        label: "Toggle Activo" },
        { value: "fa-toggle-off",       label: "Toggle Inactivo" },
        { value: "fa-wifi",             label: "WiFi" },
        { value: "fa-signal",           label: "Señal" },
        { value: "fa-eye",              label: "Sensor / Vista" },
        { value: "fa-bell",             label: "Alarma" },
        { value: "fa-exclamation-triangle", label: "Advertencia" },
        // Datos / Gráficos
        { value: "fa-chart-line",       label: "Gráfico Línea" },
        { value: "fa-chart-bar",        label: "Gráfico Barras" },
        { value: "fa-database",         label: "Base de Datos" },
        { value: "fa-sync",             label: "Sincronizar" },
        // Varios
        { value: "fa-cog",              label: "Configuración" },
        { value: "fa-tools",            label: "Herramientas" },
        { value: "fa-map-marker-alt",   label: "Ubicación" },
        { value: "fa-clock",            label: "Reloj / Tiempo" },
        { value: "fa-car",              label: "Vehículo" },
        { value: "fa-industry",         label: "Industria" },
        { value: "fa-check-circle",     label: "OK / Éxito" },
      ],

      colorOptions: [
        { value: "success", label: "Verde",   hex: "#00f2c3" },
        { value: "primary", label: "Morado",  hex: "#e14eca" },
        { value: "info",    label: "Azul",    hex: "#1d8cf8" },
        { value: "warning", label: "Naranja", hex: "#ff8d72" },
        { value: "danger",  label: "Rojo",    hex: "#fd5d93" },
      ],

      columnOptions: [
        { value: "col-3",  label: "Pequeño (25%)"     },
        { value: "col-4",  label: "Pequeño (33%)"     },
        { value: "col-5",  label: "Mediano (42%)"     },
        { value: "col-6",  label: "Mediano (50%)"     },
        { value: "col-7",  label: "Mediano (58%)"     },
        { value: "col-8",  label: "Grande (66%)"      },
        { value: "col-9",  label: "Grande (75%)"      },
        { value: "col-10", label: "Grande (83%)"      },
        { value: "col-11", label: "Muy Grande (92%)"  },
        { value: "col-12", label: "Completo (100%)"   },
      ],

      ncConfig: {
        userId: "sampleuserid",
        selectedDevice: { name: "Home", dId: "8888" },
        variableFullName: "temperature",
        variable: "varname",
        variableType: "input",
        variableSendFreq: "30",
        unit: "°C",
        class: "success",
        column: "col-12",
        decimalPlaces: 2,
        widget: "numberchart",
        icon: "fa-thermometer-half",
        chartTimeAgo: 60,
        demo: true,
        tasmotaPath: "",
      },

      iotSwitchConfig: {
        userId: "userid",
        selectedDevice: { name: "Home", dId: "8888" },
        variableFullName: "Luz",
        variable: "varname",
        variableType: "output",
        class: "danger",
        widget: "switch",
        icon: "fa-lightbulb",
        column: "col-6",
        tasmotaPath: "",
      },

      iotIndicatorConfig: {
        userId: "userid",
        selectedDevice: { name: "Home", dId: "8888" },
        variableFullName: "Estado",
        variable: "varname",
        variableType: "input",
        variableSendFreq: "30",
        class: "success",
        widget: "indicator",
        icon: "fa-toggle-on",
        column: "col-6",
        tasmotaPath: "",
      },

      configButton: {
        userId: "userid",
        selectedDevice: {
          name: "Home",
          dId: "8888",
          templateName: "Power Sensor",
          templateId: "984237562348756ldksjfh",
          saverRule: false,
        },
        variableFullName: "Bomba",
        variable: "var1",
        variableType: "output",
        icon: "fa-power-off",
        column: "col-4",
        widget: "button",
        class: "danger",
        message: "{'fanstatus': 'stop'}",
        text: "Enviar",
        tasmotaPath: "",
      },
    };
  },

  computed: {
    canAddWidget() {
      if (!this.widgetType) return false;
      const configs = {
        numberchart: this.ncConfig,
        switch: this.iotSwitchConfig,
        button: this.configButton,
        indicator: this.iotIndicatorConfig,
      };
      const config = configs[this.widgetType];
      return config && !!config.variableFullName.trim();
    },
  },

  mounted() {
    this.getTemplates();
  },

  methods: {
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

    colorHex(colorValue) {
      const c = this.colorOptions.find((o) => o.value === colorValue);
      return c ? c.hex : "#aaa";
    },

    colorLabel(colorValue) {
      const c = this.colorOptions.find((o) => o.value === colorValue);
      return c ? c.label : colorValue;
    },

    columnLabel(colValue) {
      const c = this.columnOptions.find((o) => o.value === colValue);
      return c ? c.label : colValue;
    },

    viewTemplate(template) {
      this.selectedTemplate = template;
      this.showDetailModal = true;
    },

    moveWidget(index, direction) {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= this.widgets.length) return;
      const arr = [...this.widgets];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      this.widgets = arr;
    },

    async getTemplates() {
      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };
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
      this.saveLoading = true;
      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };
      const toSend = {
        template: {
          name: this.templateName,
          description: this.templateDescription,
          widgets: this.widgets,
        },
      };
      try {
        const res = await this.$axios.post("/template", toSend, axiosHeaders);
        if (res.data.status == "success") {
          this.$notify({
            type: "success",
            icon: "tim-icons icon-check-2",
            message: "¡Plantilla guardada!",
          });
          this.getTemplates();
          this.widgets = [];
          this.templateName = "";
          this.templateDescription = "";
          this.widgetType = "";
        }
      } catch (error) {
        this.$notify({
          type: "danger",
          icon: "tim-icons icon-alert-circle-exc",
          message: "Error al guardar plantilla",
        });
      } finally {
        this.saveLoading = false;
      }
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

    addNewWidget() {
      const configs = {
        numberchart: this.ncConfig,
        switch: this.iotSwitchConfig,
        button: this.configButton,
        indicator: this.iotIndicatorConfig,
      };
      const config = configs[this.widgetType];
      const varName = config.variableFullName.trim();

      if (this.widgets.some((w) => w.variableFullName.trim() === varName)) {
        this.$notify({
          type: "warning",
          icon: "tim-icons icon-alert-circle-exc",
          message: `Ya existe un widget con la variable "${varName}"`,
        });
        return;
      }

      config.variable = this.makeid(10);
      this.widgets.push(JSON.parse(JSON.stringify(config)));
      config.variableFullName = "";
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
