<template>
  <div class="notif-drawer-root">
    <div
      class="nd-backdrop"
      :class="{ show: value }"
      aria-hidden="true"
      @click="close"
    ></div>

    <aside
      class="notif-drawer"
      :class="{ show: value }"
      role="dialog"
      aria-modal="true"
      aria-label="Centro de Notificaciones"
    >
      <header class="nd-head">
        <div class="nd-head-top">
          <h3 class="nd-title">Centro de Notificaciones</h3>
          <button
            type="button"
            class="nd-close"
            aria-label="Cerrar centro de notificaciones"
            @click="close"
          >×</button>
        </div>
        <div class="nd-counters">
          <span class="nd-counter"><b class="sev-critical">{{ counters.activas }}</b>Activas</span>
          <span class="nd-counter"><b class="sev-info">{{ counters.ack }}</b>Reconocidas</span>
          <span class="nd-counter"><b class="sev-resolved">{{ counters.resueltasHoy }}</b>Resueltas hoy</span>
        </div>
      </header>

      <div class="nd-filters">
        <button
          v-for="s in severityChips"
          :key="s.key"
          type="button"
          class="nd-chip"
          :class="chipClass(s.key)"
          :aria-pressed="sevFilter.includes(s.key)"
          @click="toggleSev(s.key)"
        >{{ s.label }}</button>
        <button
          type="button"
          class="nd-chip"
          :class="noAckChipClass"
          :aria-pressed="onlyUnacked"
          @click="onlyUnacked = !onlyUnacked"
        >Solo sin reconocer</button>
      </div>

      <div class="nd-body">
        <div v-if="loading && !items.length" class="text-muted text-center p-3">
          Cargando alarmas…
        </div>
        <div v-else-if="!siteGroups.length" class="nd-empty sev-resolved">
          <template v-if="!items.length">✓ Sin alarmas activas</template>
          <template v-else>Sin alarmas con estos filtros</template>
        </div>
        <div v-for="g in siteGroups" :key="g.siteId" class="nd-site-group">
          <button
            type="button"
            class="nd-site-header"
            :class="{ closed: isCollapsed(g.siteId) }"
            :aria-expanded="!isCollapsed(g.siteId)"
            @click="toggleSite(g.siteId)"
          >
            <span class="nd-caret" aria-hidden="true">▾</span>
            <span class="nd-site-name">{{ g.siteName || g.siteId }}</span>
            <span class="nd-site-counts">
              <b v-if="g.counts.critical" class="sev-critical">{{ g.counts.critical }} crít.</b>
              <b v-if="g.counts.warning" class="sev-warning">{{ g.counts.warning }} adv.</b>
              <b v-if="g.counts.info" class="sev-info">{{ g.counts.info }} info</b>
            </span>
          </button>
          <div v-show="!isCollapsed(g.siteId)" class="nd-site-cards">
            <alarm-card
              v-for="node in g.nodes"
              :key="node.alarm._id"
              :alarm="node.alarm"
              :children="node.children"
              :repeat-count="node.alarm.repeatCount"
              density="list"
              @ack="onAck"
              @detail="onDetail"
            />
          </div>
        </div>
      </div>

      <footer class="nd-foot">
        <nuxt-link to="/alarmas" class="nd-foot-link" @click.native="close">
          Ir a la página Alarmas →
        </nuxt-link>
      </footer>
    </aside>
  </div>
</template>

<script>
// FASE 3 rediseño alarmas — Centro de Notificaciones (Modelo A).
// Drawer lateral derecho: alarmas ACTIVAS agrupadas por sitio, con
// filtros por severidad y "solo sin reconocer". Los ítems de
// GET /api/alarms ya vienen deduplicados por episodio (ruleId×dId) con
// repeatCount/childCount; la cascada se deriva localmente con
// buildCascadeNodes (el endpoint no trae los hijos). Fetch al abrir +
// refresco ante wanomi:notif solo si está abierto (debounce por la race
// MQTT/Mongo, mismo criterio que el dashboard).
import AlarmCard from '@/components/alarms/AlarmCard.vue';
import { apiAlarmToCard, buildCascadeNodes } from '@/utils/alarmTree';

const SEV_RANK = { critical: 0, warning: 1, info: 2 };

export default {
  name: 'NotificationsDrawer',
  components: { AlarmCard },
  props: {
    value: { type: Boolean, default: false },
  },
  data() {
    return {
      loading: false,
      items: [],
      summary: null,
      sevFilter: [],
      onlyUnacked: false,
      collapsed: {},
      _notifHandler: null,
      _refreshTimer: null,
    };
  },
  computed: {
    severityChips() {
      return [
        { key: 'critical', label: 'Crítica' },
        { key: 'warning',  label: 'Advertencia' },
        { key: 'info',     label: 'Info' },
      ];
    },
    noAckChipClass() {
      return this.onlyUnacked ? ['nd-chip-on', 'sev-bg-resolved', 'sev-resolved'] : [];
    },
    counters() {
      const s = this.summary;
      if (s && s.active) {
        return {
          activas: s.active.total,
          ack: Math.max(0, s.active.total - (s.unacked || 0)),
          resueltasHoy: s.resolvedToday != null ? s.resolvedToday : '—',
        };
      }
      return {
        activas: this.items.length,
        ack: this.items.filter(i => i.ackAt).length,
        resueltasHoy: '—',
      };
    },
    filteredItems() {
      return this.items.filter(i => {
        if (this.sevFilter.length && !this.sevFilter.includes(i.severity)) return false;
        if (this.onlyUnacked && i.ackAt) return false;
        return true;
      });
    },
    siteGroups() {
      const nodes = buildCascadeNodes(this.filteredItems);
      const sites = new Map();
      nodes.forEach(n => {
        const sid = n.alarm.siteId || 'sin-sitio';
        if (!sites.has(sid)) {
          sites.set(sid, {
            siteId: sid,
            siteName: n.alarm.siteName,
            nodes: [],
            counts: { critical: 0, warning: 0, info: 0 },
            worst: 3,
          });
        }
        const g = sites.get(sid);
        g.nodes.push(n);
        const sev = SEV_RANK[n.alarm.severity] !== undefined ? n.alarm.severity : 'info';
        g.counts[sev] += 1;
        if (SEV_RANK[sev] < g.worst) g.worst = SEV_RANK[sev];
      });
      // Peor severidad primero; a igualdad, el sitio con más alarmas.
      return Array.from(sites.values())
        .sort((a, b) => a.worst - b.worst || b.nodes.length - a.nodes.length);
    },
  },
  watch: {
    value(open) {
      if (typeof document === 'undefined') return;
      if (open) {
        this.fetchAll();
        document.addEventListener('keydown', this.onKeydown);
      } else {
        document.removeEventListener('keydown', this.onKeydown);
      }
    },
  },
  mounted() {
    this._notifHandler = () => {
      if (!this.value) return;
      if (this._refreshTimer) clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => {
        this._refreshTimer = null;
        this.fetchAll();
      }, 1200);
    };
    this.$nuxt.$on('wanomi:notif', this._notifHandler);
  },
  beforeDestroy() {
    if (this._notifHandler) {
      this.$nuxt.$off('wanomi:notif', this._notifHandler);
      this._notifHandler = null;
    }
    if (this._refreshTimer) { clearTimeout(this._refreshTimer); this._refreshTimer = null; }
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.onKeydown);
    }
  },
  methods: {
    close() {
      this.$emit('input', false);
    },
    onKeydown(e) {
      if (e.key === 'Escape') this.close();
    },
    toggleSev(key) {
      const i = this.sevFilter.indexOf(key);
      if (i === -1) this.sevFilter.push(key);
      else this.sevFilter.splice(i, 1);
    },
    chipClass(key) {
      return this.sevFilter.includes(key)
        ? ['nd-chip-on', 'sev-bg-' + key, 'sev-' + key]
        : [];
    },
    toggleSite(siteId) {
      this.$set(this.collapsed, siteId, !this.collapsed[siteId]);
    },
    isCollapsed(siteId) {
      return !!this.collapsed[siteId];
    },
    async fetchAll() {
      this.loading = true;
      const headers = { headers: { token: this.$store.state.auth.token } };
      try {
        const [ra, rs] = await Promise.all([
          this.$axios.get('/alarms?status=active', headers),
          this.$axios.get('/alarms/summary', headers),
        ]);
        if (ra.data && ra.data.status === 'success' && ra.data.data) {
          this.items = (ra.data.data.items || []).map(apiAlarmToCard);
        }
        if (rs.data && rs.data.status === 'success') {
          this.summary = rs.data.data;
        }
      } catch (e) {
        console.warn('[NotifDrawer] fetch error:', e.message || e);
      } finally {
        this.loading = false;
      }
    },
    // ACK optimista: se marca local al instante y se revierte si el PUT
    // falla (el endpoint es idempotente, reintentar es seguro).
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
        if (this.summary && this.summary.unacked > 0) {
          this.summary = { ...this.summary, unacked: this.summary.unacked - 1 };
        }
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
        console.warn('[NotifDrawer] ack error:', e.message || e);
      }
    },
    onDetail(alarm) {
      this.close();
      this.$router.push('/alarmas/' + alarm.notificationId);
    },
  },
};
</script>

<style scoped>
.nd-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 22, 0.55);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
  z-index: 1080;
}
.nd-backdrop.show { opacity: 1; pointer-events: auto; }

.notif-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  max-width: 92vw;
  background: #27293d;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: -16px 0 40px rgba(0, 0, 0, 0.45);
  z-index: 1085;
  transform: translateX(105%);
  transition: transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1);
  display: flex;
  flex-direction: column;
}
body.white-content .notif-drawer {
  background: #ffffff;
  border-left-color: rgba(0, 0, 0, 0.08);
  box-shadow: -16px 0 40px rgba(0, 0, 0, 0.18);
}
.notif-drawer.show { transform: none; }

.nd-head {
  padding: 14px 16px 11px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
body.white-content .nd-head { border-bottom-color: rgba(0, 0, 0, 0.08); }
.nd-head-top { display: flex; align-items: center; justify-content: space-between; }
.nd-title { font-size: 15px; margin: 0; }
.nd-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 20px;
  line-height: 1;
  padding: 2px 8px;
  cursor: pointer;
}
body.white-content .nd-close { color: rgba(0, 0, 0, 0.5); }
.nd-close:hover { color: inherit; }

.nd-counters { display: flex; gap: 18px; margin-top: 8px; font-size: 11.5px; }
.nd-counter b { font-size: 16px; display: block; }

.nd-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
body.white-content .nd-filters { border-bottom-color: rgba(0, 0, 0, 0.08); }
.nd-chip {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  padding: 4px 11px;
  border-radius: 999px;
  transition: all 0.15s;
  cursor: pointer;
}
body.white-content .nd-chip {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.15);
  color: rgba(0, 0, 0, 0.55);
}
.nd-chip-on { border-color: currentColor; }

.nd-body { flex: 1; overflow-y: auto; padding: 12px 14px; }

.nd-empty { text-align: center; padding: 44px 20px; font-size: 14px; }

.nd-site-group { margin-bottom: 14px; }
.nd-site-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 12px;
  color: inherit;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  text-align: left;
  cursor: pointer;
}
body.white-content .nd-site-header {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
}
.nd-site-header:hover { border-color: rgba(255, 255, 255, 0.25); }
body.white-content .nd-site-header:hover { border-color: rgba(0, 0, 0, 0.25); }
.nd-caret { transition: transform 0.18s; opacity: 0.7; }
.nd-site-header.closed .nd-caret { transform: rotate(-90deg); }
.nd-site-counts {
  margin-left: auto;
  font-size: 10.5px;
  font-weight: 400;
  display: flex;
  gap: 8px;
}

.nd-foot {
  padding: 11px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  text-align: center;
  font-size: 12.5px;
}
body.white-content .nd-foot { border-top-color: rgba(0, 0, 0, 0.08); }
</style>
