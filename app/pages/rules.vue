<template>
  <div>
    <!-- FORM NUEVA REGLA -->
    <div class="row">
      <div class="col-sm-12">
        <card v-if="$store.state.devices.length > 0">
          <div slot="header">
            <h4 class="card-title">Crear nueva Regla</h4>
          </div>

          <div class="row">
            <!-- SENSOR -->
            <div class="col-3">
              <label style="color: #9a9a9a; font-size: 12px; margin-bottom: 5px;">SENSOR</label>
              <el-select
                class="select-success"
                placeholder="Seleccionar sensor"
                v-model="selectedSensorIndex"
                style="width: 100%;"
              >
                <el-option
                  v-for="(widget, index) in sensorWidgets"
                  :key="index"
                  class="text-dark"
                  :value="index"
                  :label="widget.variableFullName"
                ></el-option>
              </el-select>
            </div>

            <!-- CONDICIÓN -->
            <div class="col-2">
              <label style="color: #9a9a9a; font-size: 12px; margin-bottom: 5px;">CONDICIÓN</label>
              <el-select
                class="select-warning"
                placeholder="Condición"
                v-model="newRule.condition"
                style="width: 100%;"
              >
                <el-option class="text-dark" value="=" label="="></el-option>
                <el-option class="text-dark" value=">" label=">"></el-option>
                <el-option class="text-dark" value=">=" label=">="></el-option>
                <el-option class="text-dark" value="<" label="<"></el-option>
                <el-option class="text-dark" value="<=" label="<="></el-option>
                <el-option class="text-dark" value="!=" label="!="></el-option>
              </el-select>
            </div>

            <!-- VALOR SENSOR -->
            <div class="col-2">
              <base-input
                label="Valor"
                v-model="newRule.value"
                type="number"
              ></base-input>
            </div>

            <!-- ACTUADOR -->
            <div class="col-3">
              <label style="color: #9a9a9a; font-size: 12px; margin-bottom: 5px;">ACTUADOR</label>
              <el-select
                class="select-danger"
                placeholder="Seleccionar actuador"
                v-model="selectedActuatorIndex"
                style="width: 100%;"
              >
                <el-option
                  v-for="(widget, index) in actuatorWidgets"
                  :key="index"
                  class="text-dark"
                  :value="index"
                  :label="widget.variableFullName"
                ></el-option>
              </el-select>
            </div>

            <!-- ACCIÓN DEL ACTUADOR -->
            <div class="col-2">
              <label style="color: #9a9a9a; font-size: 12px; margin-bottom: 5px;">ACCIÓN</label>
              <el-select
                class="select-primary"
                placeholder="Acción"
                v-model="newRule.actuatorValue"
                style="width: 100%;"
              >
                <el-option class="text-dark" :value="1" label="Activar (1)"></el-option>
                <el-option class="text-dark" :value="0" label="Desactivar (0)"></el-option>
              </el-select>
            </div>
          </div>

          <div class="row" style="margin-top: 15px;">
            <!-- SELECTOR DE TIEMPO H:M:S -->
            <div class="col-6">
              <label style="color: #9a9a9a; font-size: 12px; margin-bottom: 5px;">
                TIEMPO DE VERIFICACIÓN ({{ triggerTimeInSeconds }} segundos)
              </label>
              <div class="row" style="margin: 0;">
                <div class="col-4" style="padding: 0 5px;">
                  <base-input
                    label="Horas"
                    v-model.number="timeSelector.hours"
                    type="number"
                    min="0"
                    max="23"
                  ></base-input>
                </div>
                <div class="col-4" style="padding: 0 5px;">
                  <base-input
                    label="Minutos"
                    v-model.number="timeSelector.minutes"
                    type="number"
                    min="0"
                    max="59"
                  ></base-input>
                </div>
                <div class="col-4" style="padding: 0 5px;">
                  <base-input
                    label="Segundos"
                    v-model.number="timeSelector.seconds"
                    type="number"
                    min="0"
                    max="59"
                  ></base-input>
                </div>
              </div>
            </div>
          </div>

          <div class="row pull-right">
            <div class="col-12">
              <base-button
                @click="createNewRule()"
                native-type="submit"
                type="primary"
                class="mb-3"
                size="lg"
              >
                Agregar Regla
              </base-button>
            </div>
          </div>
        </card>
        <card v-else>
          Necesitás seleccionar un dispositivo para crear una regla.
        </card>
      </div>
    </div>

    <!-- TABLA DE REGLAS -->
    <div class="row" v-if="$store.state.devices.length > 0">
      <div class="col-sm-12">
        <card>
          <div slot="header">
            <h4 class="card-title">Reglas configuradas</h4>
          </div>

          <el-table
            v-if="$store.state.selectedDevice.rules && $store.state.selectedDevice.rules.length > 0"
            :data="$store.state.selectedDevice.rules"
          >
            <el-table-column min-width="40" label="#" align="center">
              <div slot-scope="{ $index }">{{ $index + 1 }}</div>
            </el-table-column>

            <el-table-column prop="variableFullName" label="Sensor"></el-table-column>

            <el-table-column prop="condition" label="Condición" width="90"></el-table-column>

            <el-table-column prop="value" label="Valor" width="80"></el-table-column>

            <el-table-column label="Actuador">
              <div slot-scope="{ row }">{{ row.actuatorVariableFullName }}</div>
            </el-table-column>

            <el-table-column label="Acción" width="100">
              <div slot-scope="{ row }">
                <span :class="row.actuatorValue == 1 ? 'text-success' : 'text-danger'">
                  {{ row.actuatorValue == 1 ? 'Activar' : 'Desactivar' }}
                </span>
              </div>
            </el-table-column>

            <el-table-column prop="triggerTime" label="Verificación (seg)" width="120"></el-table-column>

            <el-table-column prop="counter" label="Activaciones" width="110"></el-table-column>

            <el-table-column min-width="120" header-align="right" align="right" label="Acciones">
              <div slot-scope="{ row }" class="text-right table-actions">
                <el-tooltip content="Eliminar" effect="light" placement="top">
                  <base-button
                    @click="deleteRule(row)"
                    type="danger"
                    icon
                    size="sm"
                    class="btn-link"
                  >
                    <i class="tim-icons icon-simple-remove"></i>
                  </base-button>
                </el-tooltip>

                <el-tooltip content="Estado" style="margin-left: 20px;">
                  <i
                    class="fas fa-cogs"
                    :class="{ 'text-success': row.status }"
                  ></i>
                </el-tooltip>

                <el-tooltip content="Activar / Desactivar regla" style="margin-left: 5px;">
                  <base-switch
                    @click="updateStatusRule(row)"
                    :value="row.status"
                    type="primary"
                    on-text="ON"
                    off-text="OFF"
                    style="margin-top: 10px;"
                  ></base-switch>
                </el-tooltip>
              </div>
            </el-table-column>
          </el-table>

          <h4 v-else class="card-title">No hay reglas configuradas</h4>
        </card>
      </div>
    </div>
  </div>
</template>

<script>
import { Select, Option } from "element-ui";
import { Table, TableColumn } from "element-ui";

export default {
  middleware: "authenticated",
  components: {
    [Option.name]: Option,
    [Select.name]: Select,
    [Table.name]: Table,
    [TableColumn.name]: TableColumn
  },
  data() {
    return {
      selectedSensorIndex: null,
      selectedActuatorIndex: null,
      newRule: {
        condition: null,
        value: null,
        triggerTime: 1,
        actuatorValue: null
      },
      timeSelector: {
        hours: 0,
        minutes: 1,
        seconds: 0
      }
    };
  },
  computed: {
    sensorWidgets() {
      const device = this.$store.state.selectedDevice;
      if (!device || !device.template || !device.template.widgets) return [];
      return device.template.widgets;
    },
    actuatorWidgets() {
      const device = this.$store.state.selectedDevice;
      if (!device || !device.template || !device.template.widgets) return [];
      return device.template.widgets.filter(w => w.variableType === "output");
    },
    triggerTimeInSeconds() {
      return (this.timeSelector.hours * 3600) +
             (this.timeSelector.minutes * 60) +
             this.timeSelector.seconds;
    }
  },
  methods: {
    deleteRule(rule) {
      const axiosHeaders = {
        headers: { token: this.$store.state.auth.token },
        params: { emqxRuleId: rule.emqxRuleId }
      };

      this.$axios
        .delete("/rule", axiosHeaders)
        .then(res => {
          if (res.data.status == "success") {
            this.$notify({
              type: "success",
              icon: "tim-icons icon-check-2",
              message: "Regla eliminada correctamente"
            });
            this.$store.dispatch("getDevices");
          }
        })
        .catch(() => {
          this.$notify({
            type: "danger",
            icon: "tim-icons icon-alert-circle-exc",
            message: "Error al eliminar la regla"
          });
        });
    },

    updateStatusRule(rule) {
      const axiosHeaders = {
        headers: { token: this.$store.state.auth.token }
      };

      var ruleCopy = JSON.parse(JSON.stringify(rule));
      ruleCopy.status = !ruleCopy.status;

      this.$axios
        .put("/rule", { rule: ruleCopy }, axiosHeaders)
        .then(res => {
          if (res.data.status == "success") {
            this.$notify({
              type: "success",
              icon: "tim-icons icon-check-2",
              message: "Estado de la regla actualizado"
            });
            this.$store.dispatch("getDevices");
          }
        })
        .catch(() => {
          this.$notify({
            type: "danger",
            icon: "tim-icons icon-alert-circle-exc",
            message: "Error al actualizar el estado"
          });
        });
    },

    createNewRule() {
      if (this.selectedSensorIndex === null) {
        this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "Seleccioná un sensor" });
        return;
      }
      if (!this.newRule.condition) {
        this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "Seleccioná una condición" });
        return;
      }
      if (this.newRule.value === null || this.newRule.value === "") {
        this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "Ingresá un valor" });
        return;
      }
      if (this.selectedActuatorIndex === null) {
        this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "Seleccioná un actuador" });
        return;
      }
      if (this.newRule.actuatorValue === null) {
        this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "Seleccioná la acción del actuador" });
        return;
      }
      if (this.triggerTimeInSeconds < 1) {
        this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "El tiempo de verificación debe ser al menos 1 segundo" });
        return;
      }

      const device = this.$store.state.selectedDevice;
      const sensor = this.sensorWidgets[this.selectedSensorIndex];
      const actuator = this.actuatorWidgets[this.selectedActuatorIndex];

      const toSend = {
        newRule: {
          dId: device.dId,
          deviceName: device.name,
          status: true,
          variable: sensor.variable,
          variableFullName: sensor.variableFullName,
          condition: this.newRule.condition,
          value: Number(this.newRule.value),
          triggerTime: this.triggerTimeInSeconds || 1,
          actuatorVariable: actuator.variable,
          actuatorVariableFullName: actuator.variableFullName,
          actuatorValue: this.newRule.actuatorValue
        }
      };

      const axiosHeaders = {
        headers: { token: this.$store.state.auth.token }
      };

      this.$axios
        .post("/rule", toSend, axiosHeaders)
        .then(res => {
          if (res.data.status == "success") {
            this.selectedSensorIndex = null;
            this.selectedActuatorIndex = null;
            this.newRule = { condition: null, value: null, triggerTime: 1, actuatorValue: null };
            this.timeSelector = { hours: 0, minutes: 1, seconds: 0 };

            this.$notify({
              type: "success",
              icon: "tim-icons icon-check-2",
              message: "Regla creada correctamente"
            });
            this.$store.dispatch("getDevices");
          }
        })
        .catch(() => {
          this.$notify({
            type: "danger",
            icon: "tim-icons icon-alert-circle-exc",
            message: "Error al crear la regla"
          });
        });
    }
  }
};
</script>
