<template>
  <span class="live-value">
    <!-- Sin valor todavía → estado MQTT-específico -->
    <template v-if="!hasValue">
      <i v-if="mqttConnected" class="tim-icons icon-refresh-01 live-value__spin" title="Esperando dato"></i>
      <i v-else class="tim-icons icon-simple-remove live-value__nosignal" title="Sin señal MQTT"></i>
    </template>
    <!-- Valor recibido → delega presentación en ValueStatus (DEC-REF-76 i) -->
    <template v-else>
      <ValueStatus :value="value" :config="config" />
    </template>
  </span>
</template>

<script>
// DEC-REF-76 (i) — LiveValue es la fuente MQTT + wrapper. La presentación
// del dato la resuelve ValueStatus.vue (componente puro, sin bus). Rol
// exclusivo de LiveValue: suscripción/desuscripción MQTT y estados
// MQTT-específicos ("esperando dato" / "sin señal MQTT").
// Contrato de props con _siteCode.vue.liveConfig() intacto.
import ValueStatus from '@/components/Widgets/ValueStatus.vue';

export default {
  name: 'LiveValue',
  components: { ValueStatus },
  props: ['config'],
  // config = { userId, dId, variable, variableType, variableFullName, unit }
  data() {
    return { value: null, topic: '' };
  },
  computed: {
    hasValue() { return this.value !== null; },
    mqttConnected() { return this.$store.state.mqttConnected; },
  },
  mounted() {
    if (!this.config.userId || !this.config.dId || !this.config.variable) return;
    this.topic = this.config.userId + '/' + this.config.dId + '/' + this.config.variable;
    this.$nuxt.$on(this.topic + '/sdata', this.onData);
  },
  beforeDestroy() {
    if (this.topic) this.$nuxt.$off(this.topic + '/sdata', this.onData);
  },
  methods: {
    onData(data) {
      try { this.value = data.value; } catch (e) { console.log(e); }
    },
  },
};
</script>

<style scoped>
.live-value__spin {
  display: inline-block;
  opacity: 0.35;
  animation: live-value-spin 1s linear infinite;
}
.live-value__nosignal {
  opacity: 0.35;
}
@keyframes live-value-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
