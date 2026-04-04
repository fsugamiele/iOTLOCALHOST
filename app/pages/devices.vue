<template>
  <div>
    <!-- FORM ADD DEVICE -->
    <div class="row">
      <card>
        <div slot="header">
          <h4 class="card-title">Add new Device</h4>
        </div>

        <div class="row">
          <div class="col-6">
            <base-input
              label="Device Name"
              type="text"
              placeholder="Ex: Home, Office..."
              v-model="newDevice.name"
            ></base-input>
          </div>

          <div class="col-6">
            <slot name="label">
              <label>Template</label>
            </slot>
            <el-select
              v-model="selectedIndexTemplate"
              placeholder="Select Template"
              class="select-primary"
              style="width:100%"
            >
              <el-option
                v-for="(template, index) in templates"
                :key="template._id"
                class="text-dark"
                :value="index"
                :label="template.name"
              ></el-option>
            </el-select>
          </div>
        </div>

        <div class="row pull-right">
          <div class="col-12">
            <base-button @click="createNewDevice()" type="primary" class="mb-3" size="lg">
              Add
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

          <el-table-column label="Actions">
            <div slot-scope="{ row }">
              <el-tooltip content="Provision Device" style="margin-right:10px">
                <base-button
                  type="info"
                  icon
                  size="sm"
                  class="btn-link"
                  @click="openProvisionModal(row)"
                >
                  <i class="fas fa-wifi"></i>
                </base-button>
              </el-tooltip>

              <el-tooltip content="Saver Status Indicator" style="margin-right:10px">
                <i
                  class="fas fa-database"
                  :class="{
                    'text-success': row.saverRule && row.saverRule.status,
                    'text-dark': !row.saverRule || !row.saverRule.status
                  }"
                ></i>
              </el-tooltip>

              <el-tooltip content="Database Saver">
                <base-switch
                  @click="updateSaverRuleStatus(row.saverRule)"
                  :value="row.saverRule && row.saverRule.status"
                  type="primary"
                  on-text="On"
                  off-text="Off"
                ></base-switch>
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

    <!-- PROVISION WIZARD MODAL -->
    <el-dialog
      title="Provision Device"
      :visible.sync="provisionModal"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-steps :active="provisionStep" finish-status="success" align-center class="mb-4">
        <el-step title="Credentials"></el-step>
        <el-step title="WiFi Config"></el-step>
        <el-step title="Send"></el-step>
      </el-steps>

      <!-- STEP 0: Generated credentials -->
      <div v-if="provisionStep === 0">
        <p class="text-muted mb-3">
          Device created. Save these credentials — the password won't be shown again.
        </p>
        <div class="provision-field">
          <label>Device ID</label>
          <div class="provision-value">
            <code>{{ provisionData.dId }}</code>
            <base-button type="info" size="sm" @click="copyToClipboard(provisionData.dId)">
              <i class="fas fa-copy"></i>
            </base-button>
          </div>
        </div>
        <div class="provision-field">
          <label>Device Password</label>
          <div class="provision-value">
            <code>{{ provisionData.password }}</code>
            <base-button type="info" size="sm" @click="copyToClipboard(provisionData.password)">
              <i class="fas fa-copy"></i>
            </base-button>
          </div>
        </div>
      </div>

      <!-- STEP 1: WiFi config -->
      <div v-if="provisionStep === 1">
        <div class="alert alert-info mb-3" style="border-radius:8px; padding:12px 16px;">
          <i class="fas fa-wifi mr-2"></i>
          <strong>Before continuing:</strong> connect this computer to the device's WiFi AP.<br>
          <span class="text-muted" style="font-size:0.85em;">
            The ESP8266 creates a network like <strong>Wanomi-Config-XXXXXX</strong> when unconfigured.
          </span>
        </div>
        <base-input
          label="Your WiFi Network (SSID)"
          placeholder="Ex: HomeNetwork"
          v-model="provisionForm.ssid"
        ></base-input>
        <base-input
          label="WiFi Password"
          type="password"
          placeholder="Your WiFi password"
          v-model="provisionForm.wifiPassword"
        ></base-input>
        <base-input
          label="Platform Server IP"
          placeholder="Ex: 192.168.1.100"
          v-model="provisionForm.serverIP"
        ></base-input>
        <base-input
          label="Device AP IP (default: 192.168.4.1)"
          placeholder="192.168.4.1"
          v-model="provisionForm.deviceIP"
        ></base-input>
      </div>

      <!-- STEP 2: Send -->
      <div v-if="provisionStep === 2">
        <div v-if="!provisionSent">
          <p class="text-muted mb-3">Ready to send configuration to the device.</p>
          <div class="provision-field">
            <label>Target</label>
            <code>http://{{ provisionForm.deviceIP }}/provision</code>
          </div>
          <div class="provision-field mt-2">
            <label>Payload</label>
            <pre class="provision-payload">{{ provisionPayloadPreview }}</pre>
          </div>
        </div>

        <div v-if="provisionSent && provisionSuccess" class="text-center">
          <i class="fas fa-check-circle text-success" style="font-size:48px"></i>
          <h4 class="mt-3 text-success">Device Configured!</h4>
          <p class="text-muted">The device will reboot and connect to your WiFi.<br>Switch back to your home network — it will appear in the dashboard shortly.</p>
        </div>

        <div v-if="provisionSent && !provisionSuccess" class="text-center">
          <i class="fas fa-times-circle text-danger" style="font-size:48px"></i>
          <h4 class="mt-3 text-danger">Could not reach device</h4>
          <p class="text-muted">{{ provisionError }}</p>
          <p class="text-muted" style="font-size:0.85em">Make sure your computer is connected to the device's WiFi AP and the device IP is correct.</p>
        </div>
      </div>

      <span slot="footer">
        <base-button type="secondary" @click="provisionModal = false">Close</base-button>
        <base-button
          v-if="provisionStep > 0 && !provisionSent"
          type="default"
          @click="provisionStep--"
        >Back</base-button>
        <base-button
          v-if="provisionStep < 2"
          type="primary"
          @click="provisionNextStep()"
        >Next</base-button>
        <base-button
          v-if="provisionStep === 2 && !provisionSent"
          type="success"
          :loading="provisionSending"
          @click="sendProvision()"
        >Send to Device</base-button>
      </span>
    </el-dialog>

  </div>
</template>


<script>
import { Table, TableColumn } from "element-ui";
import { Select, Option } from "element-ui";
import { Dialog, Steps, Step } from "element-ui";

export default {
  middleware: "authenticated",
  components: {
    [Table.name]: Table,
    [TableColumn.name]: TableColumn,
    [Option.name]: Option,
    [Select.name]: Select,
    [Dialog.name]: Dialog,
    [Steps.name]: Steps,
    [Step.name]: Step,
  },
  data() {
    return {
      templates: [],
      selectedIndexTemplate: null,
      newDevice: {
        name: "",
        templateId: "",
        templateName: ""
      },
      // Provision wizard
      provisionModal: false,
      provisionStep: 0,
      provisionData: { dId: "", password: "" },
      provisionForm: {
        ssid: "",
        wifiPassword: "",
        serverIP: process.env.mqtt_host || "",
        deviceIP: "192.168.4.1"
      },
      provisionSending: false,
      provisionSent: false,
      provisionSuccess: false,
      provisionError: ""
    };
  },
  computed: {
    provisionPayloadPreview() {
      return JSON.stringify({
        ssid: this.provisionForm.ssid,
        wifiPassword: "••••••••",
        dId: this.provisionData.dId,
        devicePassword: this.provisionData.password,
        serverIP: this.provisionForm.serverIP,
        serverPort: "3001"
      }, null, 2);
    }
  },
  mounted() {
    this.getTemplates();
  },
  methods: {

    // ── Provision wizard ──────────────────────────────────────────

    openProvisionModal(device) {
      this.provisionData = { dId: device.dId, password: device.password };
      this.resetProvisionWizard();
      this.provisionStep = 1; // skip step 0 (credentials already exist)
      this.provisionModal = true;
    },

    resetProvisionWizard() {
      this.provisionStep = 0;
      this.provisionSent = false;
      this.provisionSuccess = false;
      this.provisionError = "";
      this.provisionSending = false;
    },

    provisionNextStep() {
      if (this.provisionStep === 1) {
        if (!this.provisionForm.ssid) {
          this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "WiFi SSID is required" });
          return;
        }
        if (!this.provisionForm.serverIP) {
          this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "Server IP is required" });
          return;
        }
      }
      this.provisionStep++;
    },

    async sendProvision() {
      this.provisionSending = true;
      const payload = {
        ssid: this.provisionForm.ssid,
        wifiPassword: this.provisionForm.wifiPassword,
        dId: this.provisionData.dId,
        devicePassword: this.provisionData.password,
        serverIP: this.provisionForm.serverIP,
        serverPort: "3001"
      };

      try {
        const res = await fetch(`http://${this.provisionForm.deviceIP}/provision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000)
        });

        if (res.ok) {
          this.provisionSuccess = true;
        } else {
          this.provisionError = `Device responded with HTTP ${res.status}`;
          this.provisionSuccess = false;
        }
      } catch (err) {
        this.provisionSuccess = false;
        this.provisionError = err.message || "Connection timed out";
      } finally {
        this.provisionSending = false;
        this.provisionSent = true;
      }
    },

    copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: "Copied to clipboard" });
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
            this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: "Device Saver Status Updated" });
          }
        })
        .catch(e => {
          console.log(e);
          this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: "Error updating saver rule status" });
        });
    },

    createNewDevice() {
      if (!this.newDevice.name) {
        this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "Device Name is Empty :(" });
        return;
      }
      if (this.selectedIndexTemplate == null) {
        this.$notify({ type: "warning", icon: "tim-icons icon-alert-circle-exc", message: "Template must be selected" });
        return;
      }

      this.newDevice.templateId = this.templates[this.selectedIndexTemplate]._id;
      this.newDevice.templateName = this.templates[this.selectedIndexTemplate].name;

      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };

      this.$axios.post("/device", { newDevice: this.newDevice }, axiosHeaders)
        .then(res => {
          if (res.data.status == "success") {
            this.$store.dispatch("getDevices");

            // Open provision wizard with generated credentials
            this.provisionData = { dId: res.data.dId, password: res.data.password };
            this.resetProvisionWizard();
            this.provisionModal = true;

            this.newDevice.name = "";
            this.selectedIndexTemplate = null;

            this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: "Device added — configure it now!" });
          }
        })
        .catch(e => {
          console.log(e);
          this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: "Error adding device" });
        });
    },

    async getTemplates() {
      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };
      try {
        const res = await this.$axios.get("/template", axiosHeaders);
        if (res.data.status == "success") {
          this.templates = res.data.data;
        }
      } catch (error) {
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: "Error getting templates..." });
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
            this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: device.name + " deleted!" });
            this.$store.dispatch("getDevices");
          }
        })
        .catch(e => {
          console.log(e);
          this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: "Error deleting " + device.name });
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
.provision-payload {
  font-size: 0.8em;
  background: rgba(255,255,255,0.06);
  border-radius: 6px;
  padding: 10px;
  color: #ccc;
  margin: 0;
}
</style>
