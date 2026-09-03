<template>
  <WidgetShell :config="config">
    <!-- Sin valor todavía → estados MQTT-específicos (DEC-REF-76-A iv) -->
    <template v-if="!hasValue">
      <i v-if="mqttConnected" class="tim-icons icon-refresh-01 boolean-dwell-live__spin" title="Esperando dato"></i>
      <i v-else class="tim-icons icon-simple-remove boolean-dwell-live__nosignal" title="Sin señal MQTT"></i>
    </template>
    <template v-else>
      <BooleanDwell
        :value="value"
        :dwellSince="dwellSince"
        :windowHours="windowHours"
        context="live"
      />
    </template>
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — booleanDwell, composición LIVE CUSTOM.
// LiveValue no alcanza: el widget necesita DESDE CUÁNDO está en el estado
// actual, y eso no viaja en el publish — se deriva del historial.
// Misma mecánica de fuente que LiveValue (topic watcher, seed, guardas
// anti-race) + fetch inicial de la ventana dwellWindowHours para ubicar
// el último cambio de estado:
//   se recorre la serie desde el final hasta el primer sample distinto
//   del valor actual → dwellSince = time del primer sample del tramo.
//   Si TODA la ventana tiene el mismo valor → dwellSince = null → el
//   presenter dice "al menos {ventana} en este estado" (nunca se afirma
//   una permanencia mayor a la observada).
// En stream: publish con valor distinto → dwellSince = ahora.
import WidgetShell  from '@/components/Widgets/WidgetShell.vue';
import BooleanDwell from '@/components/Widgets/BooleanDwell.vue';

export default {
  name: 'BooleanDwellLive',
  components: { WidgetShell, BooleanDwell },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  // config = { userId, dId, variable, variableFullName, dwellWindowHours, ... }
  data() {
    return { value: null, dwellSince: null, topic: '' };
  },
  computed: {
    hasValue() { return this.value !== null; },
    mqttConnected() { return this.$store.state.mqttConnected; },
    windowHours() {
      const h = Number(this.config.dwellWindowHours);
      return Number.isFinite(h) && h > 0 ? h : 24;
    },
    topicKey() {
      return (this.config.userId || '') + '/' +
             (this.config.dId    || '') + '/' +
             (this.config.variable || '');
    },
  },
  watch: {
    // Mismo orden NO NEGOCIABLE que LiveValue: $off → reset → $on → seed.
    topicKey() {
      if (this.topic) this.$nuxt.$off(this.topic + '/sdata', this.onData);
      this.value = null;
      this.dwellSince = null;
      this.topic = '';
      if (this.config.userId && this.config.dId && this.config.variable) {
        this.topic = this.topicKey;
        this.$nuxt.$on(this.topic + '/sdata', this.onData);
        this.seed();
      }
    },
  },
  mounted() {
    if (!this.config.userId || !this.config.dId || !this.config.variable) return;
    this.topic = this.topicKey;
    this.$nuxt.$on(this.topic + '/sdata', this.onData);
    this.seed();
  },
  beforeDestroy() {
    if (this.topic) this.$nuxt.$off(this.topic + '/sdata', this.onData);
  },
  methods: {
    sameState(a, b) {
      const on = (v) => v === true || v === 1 || v === '1' || v === 'true';
      return on(a) === on(b);
    },
    onData(data) {
      try {
        if (this.value !== null && !this.sameState(data.value, this.value)) {
          this.dwellSince = Number.isFinite(data.time) ? data.time : Date.now();
        }
        this.value = data.value;
        // Primer dato (seed vacío): dwellSince lo define el fetch histórico.
      } catch (e) { console.log(e); }
    },
    async seed() {
      const topicAtStart = this.topic;
      try {
        const res = await this.$axios.get('/get-small-charts-data', {
          headers: { token: this.$store.state.auth.token },
          params:  { dId: this.config.dId, variable: this.config.variable,
                     chartTimeAgo: this.windowHours * 60 },
        });
        // Guardas anti-race (mismo criterio que LiveValue.seedLastValue).
        if (this.topic !== topicAtStart) return;
        if (this.value !== null) return;
        if (res.data && res.data.status === 'success' && Array.isArray(res.data.data) && res.data.data.length > 0) {
          const series = res.data.data;
          const last = series[series.length - 1];
          this.value = last.value;
          // Buscar hacia atrás el primer sample del tramo actual.
          let since = Number.isFinite(last.time) ? last.time : null;
          for (let i = series.length - 2; i >= 0; i--) {
            if (!this.sameState(series[i].value, last.value)) break;
            if (Number.isFinite(series[i].time)) since = series[i].time;
          }
          // Si el tramo cubre TODA la ventana → no se observó el cambio →
          // null = "al menos {ventana}". Si el cambio está dentro, `since`
          // es el primer sample del tramo (el cambio ocurrió entre el
          // sample anterior y este — el primer sample del tramo es la
          // cota honesta).
          const fullWindow = series.every((s) => this.sameState(s.value, last.value));
          this.dwellSince = fullWindow ? null : since;
        }
      } catch (e) {
        // Fallback silencioso: sin historial el widget queda en "esperando".
      }
    },
  },
};
</script>

<style scoped>
.boolean-dwell-live__spin {
  display: inline-block;
  opacity: 0.35;
  animation: boolean-dwell-live-spin 1s linear infinite;
}
.boolean-dwell-live__nosignal { opacity: 0.35; }
@keyframes boolean-dwell-live-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
</style>
