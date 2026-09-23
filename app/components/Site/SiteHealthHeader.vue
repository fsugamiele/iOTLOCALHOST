<template>
  <card class="health-header" :class="{ 'hh--light': isLight }">
    <div class="hh-grid">
      <!-- 1 · Semáforo global del sitio -->
      <div class="hh-block">
        <span class="hh-dot" :style="{ background: statusColor }"></span>
        <div>
          <div class="hh-caption">Estado del sitio</div>
          <div class="hh-value" :style="{ color: statusColor }">{{ statusLabel }}</div>
        </div>
      </div>

      <!-- 2 · Fuente de alimentación activa (data-driven: aparece solo si el
             sitio tiene un equipo con variable transfer_state en su template;
             label/color salen del enumValues del propio widget, nada hardcodeado) -->
      <div class="hh-block" v-if="transfer">
        <i class="fa fa-bolt hh-icon" :style="{ color: transferColor }"></i>
        <div>
          <div class="hh-caption">Alimentación activa</div>
          <div class="hh-value" :style="{ color: transferColor }">{{ transferLabel }}</div>
          <div class="hh-sub">{{ transfer.device.name }}</div>
        </div>
      </div>

      <!-- 3 · Alarma prioritaria con acción recomendada -->
      <div class="hh-block hh-alarm" v-if="priorityAlarm" :style="{ borderLeftColor: alarmColor }">
        <div class="hh-alarm-body">
          <div class="hh-caption">
            <span class="hh-chip" :style="{ background: alarmColor }">
              {{ priorityAlarm.severity === 'critical' ? 'Urgente' : 'Atención' }}
            </span>
            Alarma prioritaria
          </div>
          <div class="hh-alarm-label">{{ priorityAlarm.label || priorityAlarm.message }}</div>
          <div class="hh-alarm-rec" v-if="priorityAlarm.recommendation">
            <i class="fa fa-wrench" style="margin-right:6px"></i>{{ priorityAlarm.recommendation }}
          </div>
        </div>
      </div>
      <div class="hh-block" v-else>
        <i class="fa fa-check-circle hh-icon" :style="{ color: STATUS_COLOR.ok }"></i>
        <div>
          <div class="hh-caption">Alarmas</div>
          <div class="hh-value" :style="{ color: STATUS_COLOR.ok }">Sin alarmas activas</div>
        </div>
      </div>
    </div>
  </card>
</template>

<script>
// F1 (#80) — Header de salud del sitio (DEC-REF-108).
// Tres bloques: semáforo global (prop status, misma fuente que el pin del
// mapa) · fuente de alimentación activa (transfer_state vivo por MQTT +
// siembra /get-last-data, patrón LiveValue) · alarma prioritaria con
// recomendación (reuse de /dashboard/noc?phase=vivo, episodios activos
// correlacionados por regla×site — misma fuente que el Panel NOC).
// Theme-aware: observer sobre body.white-content (patrón dashboard.vue).
const STATUS_COLOR = {
  critical: '#E24B4A',
  warning:  '#EF9F27',
  ok:       '#639922',
};
const STATUS_LABEL = {
  critical: 'Urgencia',
  warning:  'Atención',
  ok:       'Normal',
};

export default {
  name: 'SiteHealthHeader',
  props: {
    status:   { type: String, default: 'ok' },
    siteCode: { type: String, required: true },
    devices:  { type: Array,  default: () => [] },
  },
  data() {
    return {
      STATUS_COLOR,
      isLight: false,
      themeObserver: null,
      // transfer_state vivo
      topic: '',
      transferValue: null,
      // alarma prioritaria
      priorityAlarm: null,
      _notifHandler: null,
      _sdataHandler: null,
    };
  },
  computed: {
    statusColor() { return STATUS_COLOR[this.status] || STATUS_COLOR.ok; },
    statusLabel() { return STATUS_LABEL[this.status] || STATUS_LABEL.ok; },

    // Búsqueda data-driven de la fuente de alimentación. Convención canónica
    // (DEC-REF-108): la variable que indica POR DÓNDE se alimenta la carga se
    // declara en el template con enumValues (label + severidad); el header la
    // busca por nombre canónico en orden de preferencia y renderiza el enum —
    // si el valor no matchea el enum, muestra el crudo (degradación honesta).
    // gen_status (grupo: RUNNING/STARTING/STOPPED) informa la fuente real;
    // transfer_state (modo del ATS: AUTO/…) es el fallback.
    transfer() {
      const CANDIDATES = ['gen_status', 'transfer_state'];
      for (const varName of CANDIDATES) {
        for (const device of this.devices || []) {
          const widgets = device.templateWidgets || [];
          const idx = widgets.findIndex(w => w && w.variable === varName);
          if (idx >= 0) return { device, widget: widgets[idx], variable: varName };
        }
      }
      return null;
    },
    transferOwner() {
      if (!this.transfer) return null;
      const list = this.$store.state.devices || [];
      const d = list.find(x => x.dId === this.transfer.device.dId);
      return d ? d.userId : null;
    },
    transferEnum() {
      if (!this.transfer) return null;
      const vals = this.transfer.widget.enumValues || [];
      return vals.find(e => String(e.value) === String(this.transferValue)) || null;
    },
    transferLabel() {
      if (this.transferValue === null || this.transferValue === undefined) return '—';
      return (this.transferEnum && this.transferEnum.label) || String(this.transferValue);
    },
    transferColor() {
      const sev = this.transferEnum && this.transferEnum.severity;
      return STATUS_COLOR[sev] || '#1d8cf8';
    },
    alarmColor() {
      return STATUS_COLOR[(this.priorityAlarm && this.priorityAlarm.severity)] || STATUS_COLOR.warning;
    },
  },
  watch: {
    // Re-suscripción si cambian los devices (carga tardía o cambio de sitio).
    transfer: {
      immediate: true,
      handler() { this.setupTransferSubscription(); },
    },
  },
  mounted() {
    if (typeof document !== 'undefined') {
      this.isLight = document.body.classList.contains('white-content');
      this.themeObserver = new MutationObserver(() => {
        this.isLight = document.body.classList.contains('white-content');
      });
      this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    this.fetchPriorityAlarm();
    // Refresco por evento: una notif de ESTE sitio puede cambiar la alarma
    // prioritaria (fire nuevo o resolve). Debounce para colapsar ráfagas.
    this._notifHandler = (payload) => {
      if (!payload || payload.siteId !== this.siteCode) return;
      if (this._prioTimer) clearTimeout(this._prioTimer);
      this._prioTimer = setTimeout(() => {
        this._prioTimer = null;
        this.fetchPriorityAlarm();
      }, 1500);
    };
    this.$nuxt.$on('wanomi:notif', this._notifHandler);
  },
  beforeDestroy() {
    if (this.themeObserver) { this.themeObserver.disconnect(); this.themeObserver = null; }
    if (this._notifHandler) { this.$nuxt.$off('wanomi:notif', this._notifHandler); this._notifHandler = null; }
    if (this._prioTimer) { clearTimeout(this._prioTimer); this._prioTimer = null; }
    if (this.topic) this.$nuxt.$off(this.topic + '/sdata', this.onTransferData);
  },
  methods: {
    setupTransferSubscription() {
      if (this.topic) this.$nuxt.$off(this.topic + '/sdata', this.onTransferData);
      this.topic = '';
      this.transferValue = null;
      if (!this.transfer || !this.transferOwner) return;
      this.topic = this.transferOwner + '/' + this.transfer.device.dId + '/' + this.transfer.variable;
      this.$nuxt.$on(this.topic + '/sdata', this.onTransferData);
      this.seedTransferValue();
    },
    onTransferData(data) {
      try { this.transferValue = data.value; } catch (e) { console.log(e); }
    },
    // Siembra con el último valor histórico (el latido de 300 s garantiza
    // frescura ≤5 min — patrón LiveValue.seedLastValue).
    async seedTransferValue() {
      const topicAtStart = this.topic;
      try {
        const res = await this.$axios.get('/get-last-data', {
          headers: { token: this.$store.state.auth.token },
          params: { dId: this.transfer.device.dId, variable: this.transfer.variable, chartTimeAgo: 15 },
        });
        if (this.topic !== topicAtStart) return;
        if (this.transferValue !== null) return;
        if (res.data && res.data.status === 'success' && Array.isArray(res.data.data) && res.data.data.length > 0) {
          this.transferValue = res.data.data[res.data.data.length - 1].value;
        }
      } catch (e) { /* degradación silenciosa: queda "—" */ }
    },

    // Alarma prioritaria = episodio ACTIVO más severo/reciente del sitio.
    // Reusa /dashboard/noc fase viva (~120 ms, sin tramo pesado): los episodios
    // ya vienen correlacionados por (regla × sitio) con resolved/recommendation.
    async fetchPriorityAlarm() {
      try {
        const res = await this.$axios.get('/dashboard/noc?phase=vivo', {
          headers: { token: this.$store.state.auth.token },
        });
        if (!res.data || res.data.status !== 'success') return;
        const active = (res.data.data.recentAlarms || [])
          .filter(a => a.siteCode === this.siteCode && !a.resolved);
        if (!active.length) { this.priorityAlarm = null; return; }
        const rank = { critical: 0, warning: 1, info: 2 };
        active.sort((a, b) =>
          (rank[a.severity] !== undefined ? rank[a.severity] : 3) -
          (rank[b.severity] !== undefined ? rank[b.severity] : 3) ||
          (b.time - a.time)
        );
        this.priorityAlarm = active[0];
      } catch (e) {
        console.warn('[SiteHealthHeader] fetchPriorityAlarm error:', e.message || e);
      }
    },
  },
};
</script>

<style scoped>
.hh-grid {
  display: flex;
  align-items: stretch;
  gap: 24px;
  flex-wrap: wrap;
}
.hh-block {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 180px;
  flex: 1 1 0;
}
.hh-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 10px 2px rgba(255, 255, 255, 0.15);
}
.hh-icon { font-size: 26px; }
.hh-caption {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.65;
  margin-bottom: 2px;
}
.hh-value {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.15;
}
.hh-sub { font-size: 12px; opacity: 0.55; }
.hh-alarm {
  flex: 2 1 0;
  border-left: 4px solid transparent;
  padding-left: 12px;
}
.hh-alarm-label { font-size: 15px; font-weight: 600; margin: 4px 0 2px; }
.hh-alarm-rec   { font-size: 13px; opacity: 0.85; }
.hh-chip {
  display: inline-block;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 3px;
  padding: 1px 6px;
  margin-right: 6px;
  vertical-align: middle;
}
</style>
