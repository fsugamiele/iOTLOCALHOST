<template>
  <div>
    <!-- DEC-REF-70 (c) · #50 — selector de device migrado del navbar
         global. Único cliente real de $store.state.selectedDevice
         (verificado GATE 1). Misma lógica: al cambiar el select
         se hace PUT /device con `dId` para persistir el flag
         `selected:true` que consume el store en getDevices. -->
    <div class="row mb-3" v-if="$store.state.devices.length > 0">
      <div class="col-md-6 col-lg-4">
        <el-select
          class="select-success"
          placeholder="Elegí un dispositivo"
          @change="selectDevice"
          v-model="selectedDeviceIndex"
          style="width:100%"
        >
          <el-option
            v-for="(device, index) in $store.state.devices"
            :value="index"
            :label="device.name"
            :key="device._id"
          >
          </el-option>
        </el-select>
      </div>
    </div>

    <div class="row" v-if="$store.state.devices.length > 0 && $store.state.selectedDevice.template">
      <div
        v-for="(widget, index) in $store.state.selectedDevice.template.widgets"
        :key="index"
        :class="[widget.column]"
      >
        <component
          :is="resolveWidget(widget.widget)"
          :config="fixWidget(widget)"
        />
      </div>
    </div>

    <div v-else class="text-muted">
      Elegí un dispositivo para ver sus widgets…
    </div>
  </div>
</template>
<script>
import { Select, Option } from "element-ui";
import { resolveWidget } from "@/components/Widgets/resolver.js";

export default {
  middleware: ['authenticated', 'superadmin'],
  name: 'DashboardAdmin',
  components: {
    [Option.name]: Option,
    [Select.name]: Select
  },
  data() {
    return {
      selectedDeviceIndex: null,
      _selectedListener: null,
    };
  },

  mounted() {
    // Sync inicial: el store emite `selectedDeviceIndex` desde
    // getDevices() con el índice del device flageado `selected:true`.
    // Escuchamos acá (era responsabilidad del navbar antes de #50).
    this._selectedListener = (index) => {
      this.selectedDeviceIndex = index;
    };
    this.$nuxt.$on('selectedDeviceIndex', this._selectedListener);
    // Trigger si el store ya se pobló antes de que este componente
    // se monte (getDevices se dispara al login desde el layout).
    this.$store.dispatch('getDevices');
  },

  beforeDestroy() {
    if (this._selectedListener) {
      this.$nuxt.$off('selectedDeviceIndex', this._selectedListener);
      this._selectedListener = null;
    }
  },

  methods: {
    selectDevice() {
      const device = this.$store.state.devices[this.selectedDeviceIndex];
      if (!device) return;
      const axiosHeaders = { headers: { token: this.$store.state.auth.token } };
      this.$axios
        .put("/device", { dId: device.dId }, axiosHeaders)
        .then(() => this.$store.dispatch("getDevices"))
        .catch(e => { console.log(e); });
    },

    resolveWidget,

    fixWidget(widget) {
      var widgetCopy = JSON.parse(JSON.stringify(widget));
      // Guarda C5.1 · DEC-REF-75-B: los widgets migrados no persisten
      // selectedDevice/userId (decisión iii). Sin esta guarda, asignar sobre
      // undefined tira TypeError latente (R2.0/FE-5) al renderizar los 42
      // legacy vía el resolver.
      if (!widgetCopy.selectedDevice) widgetCopy.selectedDevice = {};
      widgetCopy.selectedDevice.dId  = this.$store.state.selectedDevice.dId;
      widgetCopy.selectedDevice.name = this.$store.state.selectedDevice.name;
      widgetCopy.userId              = this.$store.state.selectedDevice.userId;

      if (widget.widget == "numberchart") {
        widgetCopy.demo = false;
      }
      return widgetCopy;
    }
  }
};
</script>
