<template>
  <WidgetShell :config="config">
    <template v-if="value === null">
      <i v-if="mqttConnected" class="tim-icons icon-refresh-01 pa-spin" title="Esperando dato"></i>
      <i v-else class="tim-icons icon-simple-remove pa-nosignal" title="Sin señal MQTT"></i>
    </template>
    <ProjectedAutonomy
      v-else
      :value="value"
      :source="source"
      :lph="lph"
      :liters="liters"
      :fuel="fuel"
      :config="config"
      context="live"
    />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) → #88 (Franco) — projectedAutonomy vuelve a ser widget de
// PRIMERA CLASE (reversa parcial de DEC-REF-114): la autonomía dejó de ser "1
// valor" y hoy el edge publica 4 hermanas (autonomy_source/lph/liters + fuel_level).
// Un render numérico genérico solo transporta el valor primario → Live DEDICADO
// que suscribe las 5 variables y alimenta al presenter PURO ProjectedAutonomy por
// props. Mismo patrón MQTT que LiveValue (seed histórico + $on/$off por topic).
import WidgetShell       from '@/components/Widgets/WidgetShell.vue';
import ProjectedAutonomy from '@/components/Widgets/ProjectedAutonomy.vue';

// Hermanas de nombre fijo que publica el edge (autonomy.js) → campo del presenter.
// El valor primario (horas) es config.variable (normalmente autonomy_hours).
const SIBLINGS = { autonomy_source: 'source', autonomy_lph: 'lph', autonomy_liters: 'liters', fuel_level: 'fuel' };

export default {
  name: 'ProjectedAutonomyLive',
  components: { WidgetShell, ProjectedAutonomy },
  props: { config: { type: Object, default: () => ({}) } },
  data() {
    return { value: null, time: null, source: null, lph: null, liters: null, fuel: null, _subs: [] };
  },
  computed: {
    mqttConnected() { return this.$store.state.mqttConnected; },
    // Tripleta de identidad de la fuente (mismo criterio que LiveValue): un solo
    // tick del watcher al cambiar equipo/variable/owner.
    topicKey() {
      return (this.config.userId || '') + '/' + (this.config.dId || '') + '/' + (this.config.variable || '');
    },
  },
  watch: {
    topicKey() {
      this.unsub();
      this.value = this.time = this.source = this.lph = this.liters = this.fuel = null;
      this.sub();
    },
  },
  mounted() { this.sub(); },
  beforeDestroy() { this.unsub(); },
  methods: {
    sub() {
      const { userId, dId, variable } = this.config;
      if (!userId || !dId) return;
      this._subs = [];
      // Valor primario (horas).
      if (variable) {
        const t = `${userId}/${dId}/${variable}/sdata`;
        const h = (d) => { this.value = d.value; this.time = Number.isFinite(d.time) ? d.time : Date.now(); };
        this.$nuxt.$on(t, h);
        this._subs.push({ t, h });
        this.seed(variable, 'value');
      }
      // Hermanas del widget enriquecido.
      for (const v of Object.keys(SIBLINGS)) {
        const field = SIBLINGS[v];
        const t = `${userId}/${dId}/${v}/sdata`;
        const h = (d) => { this[field] = d.value; };
        this.$nuxt.$on(t, h);
        this._subs.push({ t, h });
        this.seed(v, field);
      }
    },
    unsub() {
      for (const s of (this._subs || [])) this.$nuxt.$off(s.t, s.h);
      this._subs = [];
    },
    // Siembra histórica (ventana 15 min) idéntica a LiveValue: si el publish MQTT
    // todavía no llegó, el widget arranca con el último valor persistido.
    async seed(variable, field) {
      try {
        const res = await this.$axios.get('/get-last-data', {
          headers: { token: this.$store.state.auth.token },
          params: { dId: this.config.dId, variable, chartTimeAgo: 15 },
        });
        if (this[field] !== null) return;  // llegó un publish vivo mientras esperaba
        if (res.data && res.data.status === 'success' && Array.isArray(res.data.data) && res.data.data.length) {
          this[field] = res.data.data[res.data.data.length - 1].value;
        }
      } catch (e) { /* siembra silenciosa: sin histórico queda en "esperando" */ }
    },
  },
};
</script>

<style scoped>
.pa-spin { display: inline-block; opacity: 0.35; animation: pa-spin 1s linear infinite; }
.pa-nosignal { opacity: 0.35; }
@keyframes pa-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
