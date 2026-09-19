<template>
  <WidgetShell :config="config">
    <ActiveRecommendation :recommendation="top" :siteContext="hasSite" context="live" />
  </WidgetShell>
</template>

<script>
// DEC-REF-107 (Paso 5) — activeRecommendation, composición LIVE CUSTOM.
// Misma fuente que equipmentAlarms (feed del sitio GET /site/:siteCode/alarms,
// DEC-REF-43/54), pero elige UNA: la recomendación de la alarma ACTIVA más
// severa del equipo (config.dId). Refresh en cada `wanomi:notif` del sitio.
import WidgetShell          from '@/components/Widgets/WidgetShell.vue';
import ActiveRecommendation from '@/components/Widgets/ActiveRecommendation.vue';

const SEV_RANK = { critical: 3, warning: 2, info: 1 };

export default {
  name: 'ActiveRecommendationLive',
  components: { WidgetShell, ActiveRecommendation },
  props: {
    config: { type: Object, default: () => ({}) },
  },
  data() {
    return { top: null, _notifHandler: null };
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
          this.top = this.computeTop(res.data.data.alarms || []);
        }
      } catch (e) {
        // Silent — conserva el último estado conocido.
      }
    },
    computeTop(feed) {
      // Último evento por ruleId (feed viene por time desc) → activo si el
      // último no es 'resolve'. Entre activos CON recomendación, gana el de
      // mayor severidad y, a igual severidad, el más reciente.
      const latestByRule = {};
      feed.forEach((a) => {
        if (this.config.dId && a.dId !== this.config.dId) return;
        const key = a.ruleId || a.emqxRuleId || (a.variable + ':' + (a.condition || ''));
        if (!key || latestByRule[key]) return;
        latestByRule[key] = a;
      });
      const candidates = Object.keys(latestByRule)
        .map((k) => latestByRule[k])
        .filter((a) => (a.kind || 'fire') !== 'resolve' && a.recommendation);
      if (!candidates.length) return null;
      candidates.sort((a, b) => {
        const sa = SEV_RANK[a.severity] || 0;
        const sb = SEV_RANK[b.severity] || 0;
        if (sb !== sa) return sb - sa;
        return (b.time || 0) - (a.time || 0);
      });
      return candidates[0];
    },
  },
};
</script>
