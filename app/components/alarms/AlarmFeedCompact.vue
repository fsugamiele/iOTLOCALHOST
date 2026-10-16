<template>
  <div class="alarm-feed-compact">
    <div v-if="loading && !items.length" class="text-muted text-center p-3">
      Cargando alarmas…
    </div>
    <div v-else-if="!cards.length" class="afc-empty sev-resolved">
      ✓ Sin alarmas activas
    </div>
    <template v-else>
      <div
        v-for="c in cards"
        :key="c._id"
        class="afc-row"
        role="button"
        tabindex="0"
        :aria-label="'Ver detalle de ' + (c.label || c.ruleId)"
        @click="goDetail(c)"
        @keydown.enter="goDetail(c)"
      >
        <alarm-card
          :alarm="c"
          :repeat-count="c.repeatCount"
          density="compact"
          class="afc-card"
        />
        <button
          v-if="!c.ackAt"
          type="button"
          class="btn btn-sm btn-success afc-ack"
          :aria-label="'Reconocer alarma ' + (c.label || c.ruleId)"
          @click.stop="onAck(c)"
        >Reconocer</button>
      </div>
    </template>
    <div v-if="!loading || items.length" class="afc-foot">
      <nuxt-link to="/alarmas" class="afc-more">{{ footerText }}</nuxt-link>
    </div>
  </div>
</template>

<script>
// FASE 5 rediseño alarmas — widget compacto del Panel (Modelo C).
// Reemplaza a NocAlarmsFeed dentro del widget 'alarms-feed' del
// dashboard: fetch propio (GET /alarms?status=active&limit=6), hasta 5
// tarjetas AlarmCard compact + footer "+N más →" hacia /alarmas.
// Los ítems ya vienen deduplicados por episodio (ruleId×dId) con
// repeatCount — no hace falta groupRepeats. El total para "+N más" sale
// de /alarms/summary (el count de /alarms es el de la página, no el
// universo). Refresco event-driven ante wanomi:notif con doble pasada
// 1s/4s (race MQTT/Mongo, mismo patrón R8 del dashboard); suscripción
// pausada en keep-alive sleep (activated/deactivated).
import AlarmCard from '@/components/alarms/AlarmCard.vue';
import { apiAlarmToCard } from '@/utils/alarmTree';

const MAX_CARDS = 5;

export default {
  name: 'AlarmFeedCompact',
  components: { AlarmCard },
  data() {
    return {
      loading: false,
      items: [],
      totalActive: null,
      _notifHandler: null,
      _fastTimer: null,
      _slowTimer: null,
    };
  },
  computed: {
    cards() {
      return this.items.slice(0, MAX_CARDS);
    },
    moreCount() {
      const total = this.totalActive != null ? this.totalActive : this.items.length;
      return Math.max(0, total - this.cards.length);
    },
    footerText() {
      return this.moreCount > 0 ? `+${this.moreCount} más →` : 'Ver todas →';
    },
  },
  mounted() {
    this.fetchAll();
    this.subscribeBus();
  },
  activated() {
    this.subscribeBus();
    this.fetchAll();
  },
  deactivated() {
    this.unsubscribeBus();
  },
  beforeDestroy() {
    this.unsubscribeBus();
  },
  methods: {
    subscribeBus() {
      if (this._notifHandler) return;
      this._notifHandler = () => {
        if (this._fastTimer) clearTimeout(this._fastTimer);
        if (this._slowTimer) clearTimeout(this._slowTimer);
        this._fastTimer = setTimeout(() => { this._fastTimer = null; this.fetchAll(); }, 1000);
        this._slowTimer = setTimeout(() => { this._slowTimer = null; this.fetchAll(); }, 4000);
      };
      this.$nuxt.$on('wanomi:notif', this._notifHandler);
    },
    unsubscribeBus() {
      if (this._notifHandler) {
        this.$nuxt.$off('wanomi:notif', this._notifHandler);
        this._notifHandler = null;
      }
      if (this._fastTimer) { clearTimeout(this._fastTimer); this._fastTimer = null; }
      if (this._slowTimer) { clearTimeout(this._slowTimer); this._slowTimer = null; }
    },
    async fetchAll() {
      this.loading = true;
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        const [ra, rs] = await Promise.all([
          this.$axios.get('/alarms?status=active&limit=6', headers),
          this.$axios.get('/alarms/summary', headers),
        ]);
        if (ra.data && ra.data.status === 'success' && ra.data.data) {
          this.items = (ra.data.data.items || []).map(apiAlarmToCard);
        }
        if (rs.data && rs.data.status === 'success' && rs.data.data && rs.data.data.active) {
          this.totalActive = rs.data.data.active.total;
        }
      } catch (e) {
        console.warn('[AlarmFeedCompact] fetch error:', e.message || e);
      } finally {
        this.loading = false;
      }
    },
    // ACK inline optimista (endpoint idempotente; se revierte si falla).
    async onAck(alarm) {
      if (!alarm || !alarm.siteId || !alarm.notificationId) return;
      const userData = (this.$store.state.auth && this.$store.state.auth.userData) || {};
      const idx = this.items.findIndex(i => i._id === alarm._id);
      const prev = idx !== -1 ? this.items[idx] : null;
      if (idx !== -1 && !prev.ackAt) {
        this.$set(this.items, idx, {
          ...prev,
          ackAt: Date.now(),
          acknowledgedBy: userData.name || 'operador',
        });
      }
      try {
        await this.$axios.put(
          '/site/' + encodeURIComponent(alarm.siteId)
            + '/alarms/' + encodeURIComponent(alarm.notificationId) + '/ack',
          {},
          { headers: { token: this.$store.state.auth.token } },
        );
      } catch (e) {
        if (idx !== -1 && prev) this.$set(this.items, idx, prev);
        console.warn('[AlarmFeedCompact] ack error:', e.message || e);
      }
    },
    goDetail(alarm) {
      this.$router.push('/alarmas/' + alarm.notificationId);
    },
  },
};
</script>

<style scoped>
.alarm-feed-compact {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.afc-row {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  border-radius: 0.35em;
}
.afc-row:hover {
  background: rgba(255, 255, 255, 0.04);
}
body.white-content .afc-row:hover {
  background: rgba(0, 0, 0, 0.03);
}
.afc-card {
  flex: 1;
  min-width: 0;
}
.afc-ack {
  flex: 0 0 auto;
  padding: 1px 8px;
  font-size: 11px;
  margin-right: 2px;
}
.afc-empty {
  text-align: center;
  padding: 24px 12px;
  font-size: 13px;
}
.afc-foot {
  margin-top: auto;
  text-align: center;
  padding: 6px 0 2px;
  font-size: 12.5px;
}
</style>
