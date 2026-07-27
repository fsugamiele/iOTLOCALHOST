<template>
  <span class="live-value">
    <!-- Sin valor todavía → estado MQTT-específico (DEC-REF-76-A iv "esperando") -->
    <template v-if="!hasValue">
      <i v-if="mqttConnected" class="tim-icons icon-refresh-01 live-value__spin" title="Esperando dato"></i>
      <i v-else class="tim-icons icon-simple-remove live-value__nosignal" title="Sin señal MQTT"></i>
    </template>
    <!-- Valor recibido → delega presentación en el componente presentacional
         puro pasado por prop (DEC-REF-76-A vi). Default: ValueStatus. -->
    <template v-else>
      <component :is="presenter" :value="value" :config="config" context="live" />
    </template>
  </span>
</template>

<script>
// DEC-REF-76 (i) + DEC-REF-76-A (vi) — LiveValue = fuente MQTT + wrapper
// GENÉRICO del molde para los 12 widgets del catálogo. Rol exclusivo:
// suscripción/desuscripción MQTT y los dos estados MQTT-específicos
// ("esperando dato" / "sin señal MQTT"). La presentación del dato la
// resuelve el componente presentacional puro pasado por prop `presenter`.
// Contrato de props con _siteCode.vue.liveConfig() intacto.
import ValueStatus from '@/components/Widgets/ValueStatus.vue';

export default {
  name: 'LiveValue',
  components: { ValueStatus },
  props: {
    config:    { type: Object, required: true },
    presenter: { type: [Object, Function], default: () => ValueStatus },
  },
  // config = { userId, dId, variable, variableType, variableFullName, unit, ... }
  data() {
    return { value: null, topic: '' };
  },
  computed: {
    hasValue() { return this.value !== null; },
    mqttConnected() { return this.$store.state.mqttConnected; },
    // FASE 1 · UN computed que combina la tripleta de identidad de la fuente.
    // Cualquier cambio (nuevo device, nueva variable, nuevo owner) dispara UN
    // solo tick del watcher. Dos watchers separados (dId + variable) darían
    // dos disparos al cambiar de equipo con la misma variable.
    topicKey() {
      return (this.config.userId || '') + '/' +
             (this.config.dId    || '') + '/' +
             (this.config.variable || '');
    },
  },
  watch: {
    // FASE 1 · orden NO NEGOCIABLE:
    //   $off del topic viejo → this.value = null → recomponer topic → $on
    // value=null ANTES de suscribir: si no, el número viejo queda en pantalla
    // hasta el primer publish nuevo (hasta 2 min de mentira al cambiar equipo).
    topicKey() {
      if (this.topic) this.$nuxt.$off(this.topic + '/sdata', this.onData);
      this.value = null;
      this.topic = '';
      if (this.config.userId && this.config.dId && this.config.variable) {
        this.topic = this.topicKey;
        this.$nuxt.$on(this.topic + '/sdata', this.onData);
        this.seedLastValue();
      }
    },
  },
  mounted() {
    if (!this.config.userId || !this.config.dId || !this.config.variable) return;
    this.topic = this.topicKey;
    this.$nuxt.$on(this.topic + '/sdata', this.onData);
    this.seedLastValue();
  },
  beforeDestroy() {
    if (this.topic) this.$nuxt.$off(this.topic + '/sdata', this.onData);
  },
  methods: {
    onData(data) {
      try { this.value = data.value; } catch (e) { console.log(e); }
    },
    // BACKLOG-UI-7 · siembra al montar con el último valor histórico si el
    // publish MQTT todavía no llegó. Ventana 15 min: cubre la cadencia máxima
    // (120s del template SEC) con margen. Si el equipo no publicó en 15 min,
    // el dato está viejo — mostrar "esperando" es la respuesta honesta
    // (evita pintar como vivo lo que no lo es; el widget de frescura
    // DEC-REF-74 §8 lo declararía igual).
    async seedLastValue() {
      const topicAtStart = this.topic;
      try {
        const res = await this.$axios.get('/get-last-data', {
          headers: { token: this.$store.state.auth.token },
          params:  { dId: this.config.dId, variable: this.config.variable, chartTimeAgo: 15 },
        });
        // Guardas anti-race: si mientras la request estaba en vuelo (a) el
        // topic cambió por watcher, o (b) llegó un publish real → NO tocar.
        if (this.topic !== topicAtStart) return;
        if (this.value !== null) return;
        if (res.data && res.data.status === 'success' && Array.isArray(res.data.data) && res.data.data.length > 0) {
          this.value = res.data.data[res.data.data.length - 1].value;
        }
      } catch (e) {
        // Fallback silencioso: sin siembra el widget queda en "esperando".
        // Degradación aceptable, no es error operativo.
      }
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
