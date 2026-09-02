<template>
  <div>
    <!-- FORM ADD DEVICE — DEC-REF-98 D-2 (#73): alta Wanomi 3.0.
         Retirados el wizard Provision y el alta Tasmota (legacy IoTiX —
         la rama backend queda para los equipos en campo). El alta es:
         nombre + template (con su ficha) + sitio + guardar-en-BD. -->
    <div class="row">
      <card>
        <div slot="header">
          <h4 class="card-title">Nuevo dispositivo</h4>
        </div>

        <div class="row">
          <div class="col-6">
            <base-input
              label="Nombre del dispositivo"
              type="text"
              placeholder="Ej: Grupo electrógeno principal"
              v-model="newDevice.name"
            ></base-input>
          </div>

          <div class="col-6">
            <slot name="label">
              <label>Template</label>
            </slot>
            <el-select
              v-model="selectedIndexTemplate"
              placeholder="Elegir template"
              class="select-primary"
              style="width:100%"
            >
              <el-option
                v-for="(template, index) in templates"
                :key="template._id"
                class="text-dark"
                :value="index"
                :label="template.deviceType ? template.name + ' (' + template.deviceType + ')' : template.name"
              ></el-option>
            </el-select>
          </div>
        </div>

        <div class="row">
          <div class="col-6">
            <slot name="label">
              <label>Sitio (opcional)</label>
            </slot>
            <el-select
              v-model="newDevice.siteCode"
              placeholder="Sin sitio — se asocia después"
              class="select-primary"
              style="width:100%"
              filterable
              clearable
            >
              <el-option
                v-for="s in sites"
                :key="s.siteCode"
                :value="s.siteCode"
                :label="(s.nombre || s.siteCode) + ' (' + s.siteCode + ')'"
              ></el-option>
            </el-select>
          </div>

          <div class="col-6">
            <slot name="label">
              <label>Guardar datos en BD</label>
            </slot>
            <div style="padding-top:8px">
              <base-switch v-model="newDevice.saverRule" type="primary" on-text="On" off-text="Off"></base-switch>
              <span class="text-muted" style="margin-left:10px; font-size:12px">
                histórico para gráficos, dwell y frescura
              </span>
            </div>
          </div>
        </div>

        <div class="row pull-right">
          <div class="col-12">
            <base-button @click="createNewDevice()" type="primary" class="mb-3" size="lg" :disabled="creating">
              <i class="fa" :class="creating ? 'fa-spinner fa-spin' : 'fa-plus'" style="margin-right:6px"></i>
              {{ creating ? 'Creando...' : 'Agregar' }}
            </base-button>
          </div>
        </div>
      </card>
    </div>

    <!-- DEVICES TABLE -->
    <div class="row">
      <card>
        <div slot="header">
          <h4 class="card-title">Devices</h4>
        </div>

        <el-table :data="$store.state.devices">
          <el-table-column label="#" min-width="50" align="center">
            <div slot-scope="{ row, $index }">{{ $index + 1 }}</div>
          </el-table-column>

          <el-table-column prop="name" label="Name"></el-table-column>
          <el-table-column prop="dId" label="Device Id"></el-table-column>
          <el-table-column prop="password" label="Password"></el-table-column>
          <el-table-column prop="templateName" label="Template"></el-table-column>
          <el-table-column label="Sitio" width="130">
            <template slot-scope="{ row }">
              <code v-if="row.siteId" style="font-size:11px">{{ row.siteId }}</code>
              <span v-else class="text-muted" style="font-size:12px">—</span>
            </template>
          </el-table-column>
          <!-- Legacy: devices tasmota creados antes de DEC-REF-98 D-2 se
               siguen mostrando como lo que son; ya no se crean nuevos. -->
          <el-table-column label="Type" width="110">
            <template slot-scope="{ row }">
              <span v-if="row.firmwareType === 'tasmota'" style="background:#1d8cf8;color:#fff;border-radius:8px;padding:2px 8px;font-size:11px">Tasmota (legacy)</span>
              <span v-else style="background:#00f2c3;color:#1a1a2e;border-radius:8px;padding:2px 8px;font-size:11px">Wanomi</span>
            </template>
          </el-table-column>

          <el-table-column label="Actions">
            <div slot-scope="{ row }">
              <el-tooltip content="Guardar datos en BD" style="margin-right:10px">
                <i
                  class="fas fa-database"
                  :class="{
                    'text-success': row.saverRule && row.saverRule.status,
                    'text-dark': !row.saverRule || !row.saverRule.status
                  }"
                ></i>
              </el-tooltip>

              <el-tooltip content="Guardar datos en BD (on/off)">
                <base-switch
                  @click="updateSaverRuleStatus(row.saverRule)"
                  :value="row.saverRule && row.saverRule.status"
                  type="primary"
                  on-text="On"
                  off-text="Off"
                ></base-switch>
              </el-tooltip>

              <el-tooltip :content="row.siteId ? 'Cambiar / quitar sitio' : 'Asociar a sitio'" effect="light" :open-delay="300" placement="top" style="margin-left:10px">
                <base-button
                  type="warning"
                  icon
                  size="sm"
                  class="btn-link"
                  @click="openBindModal(row)"
                >
                  <i class="tim-icons icon-pin-3"></i>
                </base-button>
              </el-tooltip>

              <el-tooltip content="Delete" effect="light" :open-delay="300" placement="top">
                <base-button
                  type="danger"
                  icon
                  size="sm"
                  class="btn-link"
                  @click="deleteDevice(row)"
                >
                  <i class="tim-icons icon-simple-remove"></i>
                </base-button>
              </el-tooltip>
            </div>
          </el-table-column>
        </el-table>
      </card>
    </div>

    <!-- CREDENCIALES DEL DEVICE CREADO (DEC-REF-98 D-2): reemplazo honesto
         del wizard — dId + password se muestran UNA vez; la provisión
         física del equipo es manual (fuera de la plataforma). -->
    <el-dialog
      title="Dispositivo creado — credenciales"
      :visible.sync="credentialsModal"
      width="520px"
      :close-on-click-modal="false"
    >
      <p class="text-muted mb-3">
        Guardá estas credenciales — la contraseña no se vuelve a mostrar.
        Se configuran en el equipo junto con la red WiFi.
      </p>

      <div class="provision-field">
        <label>Device ID</label>
        <div class="provision-value">
          <code>{{ createdCredentials.dId }}</code>
          <base-button type="info" size="sm" @click="copyToClipboard(createdCredentials.dId)">
            <i class="fas fa-copy"></i>
          </base-button>
        </div>
      </div>

      <div class="provision-field">
        <label>Device Password</label>
        <div class="provision-value">
          <code>{{ createdCredentials.password }}</code>
          <base-button type="info" size="sm" @click="copyToClipboard(createdCredentials.password)">
            <i class="fas fa-copy"></i>
          </base-button>
        </div>
      </div>

      <span slot="footer">
        <base-button type="primary" @click="credentialsModal = false">Listo</base-button>
      </span>
    </el-dialog>

    <!-- BIND DEVICE ↔ SITE MODAL (DEC-REF-97) -->
    <el-dialog
      :title="bindDevice ? 'Sitio de ' + bindDevice.name + ' (' + bindDevice.dId + ')' : ''"
      :visible.sync="bindModal"
      width="480px"
      append-to-body
    >
      <div v-if="bindDevice">
        <p v-if="bindDevice.siteId" class="text-muted" style="font-size:12px">
          Actualmente asociado a <code style="font-size:11px">{{ bindDevice.siteId }}</code>.
          Elegir otro sitio lo reasigna; "Quitar del sitio" lo deja sin sitio.
        </p>
        <label class="control-label">Sitio</label>
        <el-select
          v-model="bindSiteCode"
          class="select-primary"
          placeholder="Elegir sitio"
          style="width:100%"
          filterable
        >
          <el-option
            v-for="s in sites"
            :key="s.siteCode"
            :value="s.siteCode"
            :label="(s.nombre || s.siteCode) + ' (' + s.siteCode + ')'"
          />
        </el-select>
      </div>
      <span slot="footer">
        <base-button type="secondary" @click="bindModal = false">Cancelar</base-button>
        <base-button
          v-if="bindDevice && bindDevice.siteId"
          type="danger"
          @click="unbindSite"
          :disabled="bindLoading"
        >
          Quitar del sitio
        </base-button>
        <base-button
          type="primary"
          @click="bindSite"
          :disabled="!bindSiteCode || bindSiteCode === (bindDevice && bindDevice.siteId) || bindLoading"
        >
          <i class="fa" :class="bindLoading ? 'fa-spinner fa-spin' : 'fa-link'" style="margin-right:6px"></i>
          Asociar
        </base-button>
      </span>
    </el-dialog>

  </div>
</template>


<script>
import { Table, TableColumn } from "element-ui";
import { Select, Option } from "element-ui";
import { Dialog, MessageBox } from "element-ui";

export default {
  middleware: "authenticated",
  components: {
    [Table.name]: Table,
    [TableColumn.name]: TableColumn,
    [Option.name]: Option,
    [Select.name]: Select,
    [Dialog.name]: Dialog,
  },
  data() {
    return {
      templates: [],
      selectedIndexTemplate: null,
      creating: false,
      newDevice: {
        name: "",
        templateId: "",
        templateName: "",
        siteCode: "",
        saverRule: true
      },
      // Credenciales post-alta (DEC-REF-98 D-2)
      credentialsModal: false,
      createdCredentials: { dId: "", password: "" },

      // DEC-REF-97 — bind device ↔ site
      sites: [],
      bindModal: false,
      bindDevice: null,
      bindSiteCode: "",
      bindLoading: false
    };
  },
  mounted() {
    this.getTemplates();
    this.getSites();
  },
  methods: {

    // ── Bind device ↔ site (DEC-REF-97) ───────────────────────────

    async getSites() {
      // Los sitios son dato de referencia para el selector; si falla, el
      // resto de la página sigue operando.
      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };
      try {
        const res = await this.$axios.get("/site", axiosHeaders);
        if (res.data.status == "success") {
          this.sites = res.data.data;
        }
      } catch (error) {
        console.log("[Devices] getSites error:", error);
      }
    },

    openBindModal(device) {
      this.bindDevice = device;
      this.bindSiteCode = device.siteId || "";
      this.bindModal = true;
    },

    async bindSite() {
      if (this.bindLoading || !this.bindDevice || !this.bindSiteCode) return;
      const dId = this.bindDevice.dId;
      const prevSite = this.bindDevice.siteId;

      // Reasignación: el backend rechaza bind sobre sitio ajeno (409),
      // así que se desvincula primero del sitio previo (con confirm).
      if (prevSite && prevSite !== this.bindSiteCode) {
        try {
          await MessageBox.confirm(
            `El dispositivo está asociado a ${prevSite}. ¿Reasignarlo a ${this.bindSiteCode}?`,
            "Reasignar sitio",
            { confirmButtonText: "Reasignar", cancelButtonText: "Cancelar", type: "warning" }
          );
        } catch {
          return;
        }
      }

      this.bindLoading = true;
      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };
      try {
        if (prevSite && prevSite !== this.bindSiteCode) {
          await this.$axios.delete("/site/devices", {
            ...axiosHeaders,
            params: { siteCode: prevSite, dId },
          });
        }
        const res = await this.$axios.post("/site/devices", { siteCode: this.bindSiteCode, dId }, axiosHeaders);
        if (res.data.status == "success") {
          this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: `${dId} asociado a ${this.bindSiteCode}` });
          this.bindModal = false;
          this.$store.dispatch("getDevices");
        }
      } catch (e) {
        const msg = (e.response && e.response.data && e.response.data.error) || "Error al asociar el dispositivo";
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: String(msg) });
      } finally {
        this.bindLoading = false;
      }
    },

    async unbindSite() {
      if (this.bindLoading || !this.bindDevice || !this.bindDevice.siteId) return;
      const dId = this.bindDevice.dId;
      const siteCode = this.bindDevice.siteId;
      this.bindLoading = true;
      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };
      try {
        const res = await this.$axios.delete("/site/devices", {
          ...axiosHeaders,
          params: { siteCode, dId },
        });
        if (res.data.status == "success") {
          this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: `${dId} desvinculado de ${siteCode}` });
          this.bindModal = false;
          this.$store.dispatch("getDevices");
        }
      } catch (e) {
        const msg = (e.response && e.response.data && e.response.data.error) || "Error al desvincular el dispositivo";
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: String(msg) });
      } finally {
        this.bindLoading = false;
      }
    },

    copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: "Copiado" });
      });
    },

    // ── Device CRUD ───────────────────────────────────────────────

    updateSaverRuleStatus(rule) {
      if (!rule) return;
      var ruleCopy = JSON.parse(JSON.stringify(rule));
      ruleCopy.status = !ruleCopy.status;

      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };

      this.$axios.put("/saver-rule", { rule: ruleCopy }, axiosHeaders)
        .then(res => {
          if (res.data.status == "success") {
            this.$store.dispatch("getDevices");
            this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: "Guardado en BD actualizado" });
          }
        })
        .catch(e => {
          console.log(e);
          this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: "Error actualizando el guardado en BD" });
        });
    },

    async createNewDevice() {
      if (this.creating) return;
      if (!this.newDevice.name) {
        this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "Falta el nombre del dispositivo" });
        return;
      }
      if (this.selectedIndexTemplate == null) {
        this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "Hay que elegir un template" });
        return;
      }

      this.newDevice.templateId = this.templates[this.selectedIndexTemplate]._id;
      this.newDevice.templateName = this.templates[this.selectedIndexTemplate].name;

      this.creating = true;
      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };

      try {
        const res = await this.$axios.post("/device", { newDevice: {
          name: this.newDevice.name,
          templateId: this.newDevice.templateId,
          templateName: this.newDevice.templateName,
          saverRule: this.newDevice.saverRule,
        } }, axiosHeaders);

        if (res.data.status != "success") return;

        const dId = res.data.dId;

        // DEC-REF-78: selección del device recién creado por preferencia
        // de sesión (localStorage), no por estado en Mongo.
        const userId = this.$store.state.auth
          && this.$store.state.auth.userData
          && this.$store.state.auth.userData._id;
        if (userId && dId) {
          localStorage.setItem('lastSelectedDId:' + userId, dId);
        }

        // Bind al sitio elegido (opcional). Fallo parcial explícito: el
        // device YA existe — se informa y queda para asociar por la tabla.
        if (this.newDevice.siteCode) {
          try {
            await this.$axios.post("/site/devices", { siteCode: this.newDevice.siteCode, dId }, axiosHeaders);
          } catch (e) {
            const msg = (e.response && e.response.data && e.response.data.error) || "error desconocido";
            this.$notify({
              type: "warning",
              icon: "tim-icons icon-alert-circle-exc",
              message: `Dispositivo creado pero NO se pudo asociar a ${this.newDevice.siteCode} (${msg}). Asocialo desde la tabla.`,
            });
          }
        }

        this.createdCredentials = { dId, password: res.data.password };
        this.credentialsModal = true;

        this.$store.dispatch("getDevices");
        this.newDevice.name = "";
        this.newDevice.siteCode = "";
        this.newDevice.saverRule = true;
        this.selectedIndexTemplate = null;
      } catch (e) {
        console.log(e);
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: "Error al crear el dispositivo" });
      } finally {
        this.creating = false;
      }
    },

    async getTemplates() {
      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };
      try {
        const res = await this.$axios.get("/template", axiosHeaders);
        if (res.data.status == "success") {
          this.templates = res.data.data;
        }
      } catch (error) {
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: "Error obteniendo templates" });
        console.log(error);
      }
    },

    deleteDevice(device) {
      const axiosHeaders = {
        headers: { token: this.$store.state.auth.token },
        params: { dId: device.dId }
      };
      this.$axios.delete("/device", axiosHeaders)
        .then(res => {
          if (res.data.status == "success") {
            this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: device.name + " eliminado" });
            this.$store.dispatch("getDevices");
          }
        })
        .catch(e => {
          console.log(e);
          this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: "Error eliminando " + device.name });
        });
    }
  }
};
</script>

<style scoped>
.provision-field {
  margin-bottom: 12px;
}
.provision-field label {
  display: block;
  font-size: 0.8em;
  text-transform: uppercase;
  color: #9a9a9a;
  margin-bottom: 4px;
}
.provision-field code {
  font-size: 1em;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(255,255,255,0.08);
}
.provision-value {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
