<template>
  <span class="multi-live-value">
    <component :is="presenter" :values="values" :config="config" context="live" />
  </span>
</template>

<script>
// DEC-REF-107 (Paso 3) — MULTI-FUENTE. Espejo N-ario de LiveValue: se suscribe
// a un topic por cada `config.sources[i].variable` (mismo userId/dId) y entrega
// al presenter un mapa `values[key] = { value, time }`. Los presenters
// multi-fuente (powerCascade, dcPlant) leen ese mapa; cada fuente faltante la
// muestran como "esperando" por su cuenta (no bloquea a las demás).
export default {
  name: 'MultiLiveValue',
  props: {
    config:    { type: Object, required: true },
    presenter: { type: [Object, Function], required: true },
  },
  data() {
    // values reactivo; topics/handlers fuera de data() (no reactivos).
    return { values: {} };
  },
  computed: {
    // Firma de identidad: owner + device + el set de variables. Cualquier
    // cambio re-suscribe todo (mismo criterio que topicKey de LiveValue).
    sourcesSig() {
      const vars = (this.config.sources || []).map((s) => s && s.variable).join(',');
      return (this.config.userId || '') + '/' + (this.config.dId || '') + '/' + vars;
    },
  },
  watch: {
    sourcesSig() {
      this.unsubscribeAll();
      this.values = {};
      this.subscribeAll();
    },
  },
  mounted() {
    this._topics = {};
    this._handlers = {};
    this.subscribeAll();
  },
  beforeDestroy() {
    this.unsubscribeAll();
  },
  methods: {
    subscribeAll() {
      const { userId, dId } = this.config;
      if (!userId || !dId) return;
      (this.config.sources || []).forEach((s) => {
        if (!s || !s.variable || !s.key) return;
        const topic = userId + '/' + dId + '/' + s.variable;
        const handler = (data) => this.onData(s.key, data);
        this._topics[s.key] = topic;
        this._handlers[s.key] = handler;
        this.$nuxt.$on(topic + '/sdata', handler);
        this.seed(s);
      });
    },
    unsubscribeAll() {
      Object.keys(this._topics || {}).forEach((key) => {
        this.$nuxt.$off(this._topics[key] + '/sdata', this._handlers[key]);
      });
      this._topics = {};
      this._handlers = {};
    },
    onData(key, data) {
      try {
        this.$set(this.values, key, {
          value: data.value,
          time: Number.isFinite(data.time) ? data.time : Date.now(),
        });
      } catch (e) { console.log(e); }
    },
    // Siembra por historial (ventana 15 min), igual criterio que LiveValue.
    async seed(s) {
      const sigAtStart = this.sourcesSig;
      try {
        const res = await this.$axios.get('/get-last-data', {
          headers: { token: this.$store.state.auth.token },
          params: { dId: this.config.dId, variable: s.variable, chartTimeAgo: 15 },
        });
        // Anti-race: si cambió la firma o ya llegó un publish real, no tocar.
        if (this.sourcesSig !== sigAtStart) return;
        if (this.values[s.key]) return;
        if (res.data && res.data.status === 'success' && Array.isArray(res.data.data) && res.data.data.length > 0) {
          const last = res.data.data[res.data.data.length - 1];
          this.$set(this.values, s.key, {
            value: last.value,
            time: Number.isFinite(last.time) ? last.time : Date.now(),
          });
        }
      } catch (e) {
        // Silencioso: sin siembra la fuente queda "esperando" hasta el publish.
      }
    },
  },
};
</script>
