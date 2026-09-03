<template>
  <WidgetShell :config="config">
    <EquipmentAlarms :alarms="active" :siteContext="hasSite" context="live" />
  </WidgetShell>
</template>

<script>
// DEC-REF-98 D-3 (#73) — equipmentAlarms, composición LIVE CUSTOM.
// No es widget de variable (no hay topic MQTT): su fuente es el feed
// de alarmas DEL SITIO (GET /site/:siteCode/alarms, DEC-REF-43/54)
// filtrado por el equipo (config.dId). Activa = último evento por
// ruleId con kind !== 'resolve' (DEC-REF-59/64). Refresh en cada
// `wanomi:notif` del sitio (DEC-REF-44) — el bus lo emite el layout.
// config.siteCode lo inyecta _siteCode.liveConfig(); si la vista no es
// de sitio → siteContext=false → el presenter lo declara.
import WidgetShell      from '@/components/Widgets/WidgetShell.vue';
import EquipmentAlarms  from '@/components/Widgets/EquipmentAlarms.vue';

export default {
  name: 'EquipmentAlarmsLive',
  components: { WidgetShell, EquipmentAlarms },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  data() {
    return { active: [], _notifHandler: null };
  },
  computed: {
    hasSite() { return !!this.config.siteCode; },
  },
  mounted() {
    if (!this.hasSite) return;
    this.fetchAlarms();
    this._notifHandler = (payload) => {
      if (payload && payload.siteId && payload.siteId !== this.config.siteCode) return;
      this.fetchAlarms();
    };
    this.$nuxt.$on('wanomi:notif', this._notifHandler);
  },
  beforeDestroy() {
    if (this._notifHandler) {
      this.$nuxt.$off('wanomi:notif', this._notifHandler);
      this._notifHandler = null;
    }
  },
  methods: {
    async fetchAlarms() {
      try {
        const res = await this.$axios.get(
          '/site/' + encodeURIComponent(this.config.siteCode) + '/alarms?limit=50',
          { headers: { token: this.$store.state.auth.token } },
        );
        if (res.data && res.data.status === 'success' && res.data.data) {
          this.active = this.computeActive(res.data.data.alarms || []);
        }
      } catch (e) {
        // Silent — el widget conserva el último estado conocido.
      }
    },
    computeActive(feed) {
      // El feed viene ordenado por time desc. Primer evento visto por
      // ruleId = el más reciente → decide si la regla está activa.
      const latestByRule = {};
      feed.forEach((a) => {
        if (this.config.dId && a.dId !== this.config.dId) return;
        const key = a.ruleId || a.emqxRuleId || (a.variable + ':' + (a.condition || ''));
        if (!key || latestByRule[key]) return;
        latestByRule[key] = a;
      });
      return Object.keys(latestByRule)
        .map((k) => latestByRule[k])
        .filter((a) => (a.kind || 'fire') !== 'resolve')
        .sort((a, b) => (b.time || 0) - (a.time || 0));
    },
  },
};
</script>
