<template>
  <span class="live-value">
    <!-- Sin valor todavía -->
    <template v-if="!hasValue">
      <!-- Broker conectado → esperando este dato (spinner) -->
      <i v-if="mqttConnected" class="tim-icons icon-refresh-01 live-value__spin" title="Esperando dato"></i>
      <!-- Broker caído → sin señal (no va a llegar) -->
      <i v-else class="tim-icons icon-simple-remove live-value__nosignal" title="Sin señal MQTT"></i>
    </template>
    <!-- Valor recibido -->
    <template v-else>
      <template v-if="isNumeric">{{ display }}<small v-if="unit" class="ml-1 text-muted">{{ unit }}</small></template>
      <template v-else-if="isBool">{{ boolLabel }}</template>
      <template v-else>{{ value }}</template>
    </template>
  </span>
</template>

<script>
export default {
  name: 'LiveValue',
  props: ['config'],
  // config = { userId, dId, variable, variableType, variableFullName, unit }
  data() {
    return { value: null, topic: '' };
  },
  computed: {
    hasValue() { return this.value !== null; },
    isNumeric() { return this.config.variableType === 'float' || this.config.variableType === 'int'; },
    isBool() { return this.config.variableType === 'bool'; },
    mqttConnected() { return this.$store.state.mqttConnected; },
    unit() { return this.config.unit || ''; },
    // Formato por tipo: int = entero, float = 2 decimales. El template no trae
    // decimalPlaces (shape de 4 campos) → regla fija por tipo, no inventada por variable.
    display() {
      const n = Number(this.value);
      if (Number.isNaN(n)) return this.value;
      return this.config.variableType === 'int' ? String(Math.round(n)) : n.toFixed(2);
    },
    boolLabel() {
      const v = this.value;
      return (v === true || v === 1 || v === '1' || v === 'true') ? 'Activo' : 'Inactivo';
    },
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
