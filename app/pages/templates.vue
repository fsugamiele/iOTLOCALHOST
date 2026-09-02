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

            <!-- FORM VALUE STATUS (catálogo · DEC-REF-76 / -76-A / -76-B) -->
            <div v-if="widgetType == 'valueStatus'">
              <!-- DEC-REF-97: con ficha elegida, la variable técnica sale del
                   picker de arriba (estricto); sin ficha, texto libre. -->
              <base-input
                v-if="!sheetVariables.length"
                v-model="valueStatusConfig.variable"
                label="Variable (nombre técnico del mapa del equipo, ej: oil_pressure)"
                type="text"
              />
              <base-input
                v-else
                :value="valueStatusConfig.variable"
                label="Variable (técnica — se fija desde la ficha, arriba)"
                type="text"
                disabled
              />
              <base-input v-model="valueStatusConfig.variableFullName" label="Nombre de Variable (sin unidad entre paréntesis)" type="text" />

              <label class="control-label">Tipo de dato</label>
              <el-select v-model="valueStatusConfig.variableType" placeholder="Tipo" style="width:100%; margin-bottom:20px" class="select-primary">
                <el-option value="float" label="float — número con decimales" />
                <el-option value="int" label="int — número entero" />
                <el-option value="bool" label="bool — verdadero/falso" />
                <el-option value="categorical" label="categorical — estado nombrado" />
              </el-select>

              <base-input v-model="valueStatusConfig.unit" label="Unidad (opcional, ej: °C, psi, %)" type="text" />
              <base-input v-model.number="valueStatusConfig.variableSendFreq" label="Frecuencia de Envío (seg)" type="number" />
              <base-input v-model.number="valueStatusConfig.decimalPlaces" label="Decimales (opcional; vacío = default por tipo)" type="number" />

              <!-- DEC-REF-76-C: los 4 inputs de umbral se retiran del mini-form
                   (los umbrales son semántica de alarma; el color de estado se
                   resuelve en #53 según los 3 caminos registrados). El campo
                   `thresholds` PERMANECE en el sub-schema — sin datos que lo
                   populen, ValueStatus renderiza neutro por DEC-REF-76 iii. -->

              <label class="control-label">Ícono</label>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px">
                <el-select v-model="valueStatusConfig.icon" placeholder="Ícono" style="flex:1" class="select-primary">
                  <el-option v-for="ic in iconOptions" :key="ic.value" :value="ic.value" :label="ic.label">
                    <i class="fa" :class="ic.value" style="margin-right:8px; width:16px; text-align:center"></i>{{ ic.label }}
                  </el-option>
                </el-select>
                <i class="fa fa-2x" :class="valueStatusConfig.icon" style="min-width:28px; text-align:center; opacity:0.85"></i>
              </div>

              <label class="control-label">Tamaño del Widget</label>
              <el-select v-model="valueStatusConfig.column" placeholder="Tamaño del Widget" style="width:100%" class="select-primary">
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
            <component
              v-if="widgetType"
              :is="resolveWidget(widgetType, { context: 'editor' })"
              :config="previewConfig"
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
          <h4 class="card-title">Guardar Plantilla</h4>
        </div>

        <div class="row">
          <base-input class="col-4" v-model="templateName" label="Nombre" type="text" />
          <base-input class="col-8" v-model="templateDescription" label="Descripción" type="text" />
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
import { resolveWidget } from "@/components/Widgets/resolver.js";

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

      // DEC-REF-97: fichas de equipo disponibles y ficha elegida para la
      // plantilla en construcción ('' = sin ficha, compat pre-ficha).
      sheets: [],
      templateDeviceType: "",
      sheetVarPick: "",

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

      // DEC-REF-76-B (iv): 5° config para valueStatus.
      // NO incluye selectedDevice/userId (DEC-REF-75-B iii).
      // DEC-REF-76-C: NO incluye thresholds — el color de estado se
      // resuelve en #53 (fuente única desde el motor, ver 3 caminos).
      valueStatusConfig: {
        variable: "",
        variableFullName: "",
        variableType: "float",
        unit: "",
        variableSendFreq: 60,
        decimalPlaces: null,
        icon: "fa-signal",
        column: "col-4",
        widget: "valueStatus",
      },
    };
  },

  computed: {
    canAddWidget() {
      if (!this.widgetType) return false;
      const config = this.previewConfig;
      if (!config || !config.variableFullName || !config.variableFullName.trim()) return false;
      // DEC-REF-76-B (iii): valueStatus exige `variable` no vacía además.
      if (this.widgetType === 'valueStatus') {
        if (!config.variable || !config.variable.trim()) return false;
      }
      return true;
    },
    previewConfig() {
      const configs = {
        numberchart: this.ncConfig,
        switch:      this.iotSwitchConfig,
        button:      this.configButton,
        indicator:   this.iotIndicatorConfig,
        valueStatus: this.valueStatusConfig,
      };
      return configs[this.widgetType];
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
      const cfg = this.previewConfig;
      if (!v || !cfg) return;
      // La variable TÉCNICA es la de la ficha (es la que viaja en el topic
      // MQTT y la que compara el motor de reglas — DEC-REF-91).
      cfg.variable = v.name;
      cfg.variableFullName = v.label || v.name;
      if ("unit" in cfg) cfg.unit = v.unit || "";
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
          await this.getTemplates();
          this.widgets = [];
          this.templateName = "";
          this.templateDescription = "";
          this.templateDeviceType = "";
          this.sheetVarPick = "";
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
      const config = this.previewConfig;
      const isValueStatus = this.widgetType === 'valueStatus';
      // DEC-REF-97: la variable vino del catálogo de la ficha → es la clave
      // real (técnica) y NO se pisa con makeid.
      const fromSheet = this.sheetVariableNames.includes(config.variable);

      // DEC-REF-76-B (ii): dedupe por `variable` en valueStatus (clave real
      // de unicidad); en los 4 legacy sigue por variableFullName.trim()
      // (retrocompatibilidad — el makeid garantiza `variable` único).
      // DEC-REF-97: si vino de la ficha, dedupe por variable técnica en
      // todos los tipos (es la clave real contra el equipo).
      if (isValueStatus || fromSheet) {
        const varName = (config.variable || '').trim();
        if (this.widgets.some((w) => w.variable === varName)) {
          this.$notify({
            type: "warning",
            icon: "tim-icons icon-alert-circle-exc",
            message: `Ya existe un widget con la variable "${varName}"`,
          });
          return;
        }
      } else {
        const label = config.variableFullName.trim();
        if (this.widgets.some((w) => (w.variableFullName || '').trim() === label)) {
          this.$notify({
            type: "warning",
            icon: "tim-icons icon-alert-circle-exc",
            message: `Ya existe un widget con la variable "${label}"`,
          });
          return;
        }
      }

      // DEC-REF-76-B (i): NO pisar `variable` con makeid en valueStatus
      // (la variable la fija el mapa Modbus del equipo, no la plataforma).
      // DEC-REF-97: tampoco si vino de la ficha (la fija el catálogo).
      if (!isValueStatus && !fromSheet) {
        config.variable = this.makeid(10);
      }

      // Normalización pre-push (smoke: v-model.number sobre input vacío
      // preserva "" en local state → post-save Mongo lo castea a null sin
      // error, pero la PREVIEW usa "" directo: `"" != null` es TRUE →
      // decimalPlaces devuelve "" → toFixed("") colapsa a 0 decimales.
      // NaN en cambio hace REVENTAR Template.create con Cast to Number
      // failed). Normalizamos antes del push para que preview y post-save
      // coincidan.
      if (isValueStatus) {
        const toNumOrNull = (v) => (Number.isFinite(v) ? v : null);
        config.decimalPlaces     = toNumOrNull(config.decimalPlaces);
        // variableSendFreq: si el usuario borró el default, restauramos 60
        // (frecuencia null persistida en Mongo dejaría al widget sin ciclo).
        config.variableSendFreq  = Number.isFinite(config.variableSendFreq)
          ? config.variableSendFreq
          : 60;
      }

      this.widgets.push(JSON.parse(JSON.stringify(config)));

      // Reset del form: label siempre; en valueStatus además reset de
      // variable/unit/decimalPlaces (DEC-REF-76-C iv) para que el próximo
      // widget no herede campos del anterior. Se conservan variableType
      // (default sano), icon y column (defaults del form).
      config.variableFullName = "";
      this.sheetVarPick = "";
      if (isValueStatus) {
        config.variable      = "";
        config.unit          = "";
        config.decimalPlaces = null;
      }
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
