<template>
  <!-- FASE 4 rediseño alarmas — consola de triaje (Modelo B). Diseño:
       docs/mockups/alarmas_definitivo.html. Datos: GET /api/alarms +
       /api/alarms/summary (FASE 2). Tiempo real: bus 'wanomi:notif'. -->
  <div class="alarmas-page">
    <!-- ===== Banda de KPIs ===== -->
    <div class="kpi-band">
      <template v-if="summaryLoading && !summary">
        <div v-for="i in 6" :key="i" class="kpi kpi-skel"></div>
      </template>
      <template v-else-if="summary">
        <div class="kpi k-crit">
          <div class="num">{{ summary.active.critical }}</div>
          <div class="lbl">Críticas activas</div>
        </div>
        <div class="kpi k-warn">
          <div class="num">{{ summary.active.warning }}</div>
          <div class="lbl">Advertencias</div>
        </div>
        <div class="kpi k-info">
          <div class="num">{{ summary.active.info }}</div>
          <div class="lbl">Informativas</div>
        </div>
        <div class="kpi k-noack">
          <div class="num">{{ summary.unacked }}</div>
          <div class="lbl">Sin ACK</div>
        </div>
        <div class="kpi k-old">
          <div class="num">
            <AgeTicker v-if="oldestUnackedSince != null" :since="oldestUnackedSince" />
            <span v-else>—</span>
          </div>
          <div class="lbl">Más vieja sin ACK</div>
        </div>
        <div class="kpi k-mttr">
          <div class="num">{{ summary.mttrSec24h != null ? formatDuration(summary.mttrSec24h) : '—' }}</div>
          <div class="lbl">MTTR 24h</div>
        </div>
      </template>
      <div v-else class="kpi kpi-error">
        <span>Error al cargar KPIs.</span>
        <button type="button" class="btn btn-sm btn-link" @click="fetchSummary">Reintentar</button>
      </div>
    </div>

    <!-- ===== Filtros ===== -->
    <div class="filters-row">
      <button
        v-for="s in ['critical', 'warning', 'info']"
        :key="s"
        type="button"
        class="chip"
        :class="{ on: sevFilter.includes(s) }"
        :data-f="s"
        @click="toggleSev(s)"
      >{{ severityLabel(s) }}</button>
      <input
        v-model.trim="search"
        type="text"
        class="form-control search-input"
        placeholder="Buscar por alarma, sitio o equipo…"
        aria-label="Buscar alarmas"
      />
    </div>

    <!-- ===== Tabla de activas ===== -->
    <div v-if="loading && !items.length" class="noc-table-skel">
      <div v-for="i in 5" :key="i" class="skel-row"></div>
    </div>

    <div v-else-if="error && !items.length" class="error-box">
      <p>No se pudieron cargar las alarmas activas.</p>
      <button type="button" class="btn btn-sm btn-primary" @click="fetchActive(false)">Reintentar</button>
    </div>

    <div v-else-if="!filteredItems.length" class="empty-box">
      <span class="big">✓</span>
      <p>{{ items.length ? 'Ninguna alarma coincide con los filtros.' : 'Sin alarmas activas. Todos los sitios operan con normalidad.' }}</p>
    </div>

    <div v-else class="table-wrap">
      <table class="noc-table">
        <thead>
          <tr>
            <th style="width:28px"></th>
            <th>Estado</th>
            <th>Severidad</th>
            <th>Sitio / Equipo</th>
            <th>Alarma</th>
            <th>Valor vs umbral</th>
            <th>Edad</th>
            <th>ACK</th>
            <th style="width:34px"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="a in filteredItems">
            <tr
              :key="a.notificationId"
              class="row-main"
              :class="{ selected: !!selected[a.notificationId] }"
            >
              <td>
                <input
                  v-if="a.state === 'active'"
                  type="checkbox"
                  :checked="!!selected[a.notificationId]"
                  :aria-label="'Seleccionar ' + (a.label || a.ruleId)"
                  @change="toggleSelect(a)"
                />
              </td>
              <td class="cell-state">
                <template v-if="a.state === 'active'">
                  <span class="pulse-dot" aria-hidden="true"></span> <span class="st-text">Activa</span>
                </template>
                <template v-else-if="a.state === 'ack'">
                  <span class="st-ack">✔</span> <span class="st-text">ACK</span>
                </template>
                <template v-else>
                  <span class="st-res">○</span> <span class="st-text">Resuelta</span>
                </template>
              </td>
              <td>
                <span class="alarm-badge" :class="'sev-badge-' + sevKey(a)">{{ severityLabel(a.severity) }}</span>
              </td>
              <td>
                <b>{{ a.siteName || a.siteId || '—' }}</b><br />
                <span class="sub">{{ a.deviceName || a.dId }}</span>
              </td>
              <td class="cell-alarm">
                <nuxt-link
                  :to="'/alarmas/' + a.notificationId"
                  class="alarm-link"
                  title="Ver detalle con gráficos y pronósticos"
                >{{ a.label || a.ruleId }} <span class="go">→</span></nuxt-link>
                <span v-if="a.childCount > 0" class="badge-cascade">+{{ a.childCount }} hijas</span>
                <span v-if="a.repeatCount > 1" class="reps">×{{ a.repeatCount }}</span>
                <br />
                <span class="sub">{{ typeSubtitle(a) }}</span>
              </td>
              <td class="cell-val">{{ valueText(a) }}</td>
              <td>
                <span class="age" :class="ageClass(a)">
                  <AgeTicker v-if="a.firedAt != null" :since="a.firedAt" />
                  <span v-else>—</span>
                </span>
              </td>
              <td>
                <button
                  v-if="a.state === 'active'"
                  type="button"
                  class="btn-ack-sm"
                  :disabled="!!ackBusy[a.notificationId]"
                  @click="ackOne(a)"
                >{{ ackBusy[a.notificationId] ? '…' : 'Reconocer' }}</button>
                <span v-else-if="a.state === 'ack'" class="ack-chip">
                  {{ a.acknowledgedBy || '—' }} · {{ formatTime(a.ackAt) }}
                </span>
                <span v-else class="sub">—</span>
              </td>
              <td>
                <button
                  type="button"
                  class="exp-btn"
                  :aria-expanded="!!expanded[a.notificationId]"
                  :aria-label="'Expandir detalle de ' + (a.label || a.ruleId)"
                  @click="toggleExpand(a)"
                >{{ expanded[a.notificationId] ? '▴' : '▾' }}</button>
              </td>
            </tr>

            <tr v-if="expanded[a.notificationId]" :key="a.notificationId + '-detail'" class="row-detail">
              <td></td>
              <td colspan="8">
                <div class="detail-grid">
                  <div>
                    <h4>Motivo</h4>
                    <p>{{ reasonLabel(a.reason) || '—' }}</p>
                    <template v-if="a.recommendation">
                      <h4 style="margin-top:8px">Recomendación</h4>
                      <p class="rec">{{ a.recommendation }}</p>
                    </template>
                    <p v-if="a.correlationParent" class="sub" style="margin-top:6px">
                      ↳ hija de la regla {{ a.correlationParent }}
                    </p>
                  </div>
                  <div>
                    <h4>Cascada ({{ a.childCount }})</h4>
                    <template v-if="a.childCount > 0">
                      <p v-if="expanded[a.notificationId].loading" class="sub">Cargando hijas…</p>
                      <p v-else-if="expanded[a.notificationId].error" class="sub">
                        Error al cargar.
                        <button type="button" class="btn btn-sm btn-link" @click="loadChildren(a)">Reintentar</button>
                      </p>
                      <template v-else>
                        <div
                          v-for="c in expanded[a.notificationId].children"
                          :key="c.notificationId"
                          class="child-line"
                        >
                          <span :class="'sev-' + sevKey(c)">{{ sevIcon(c.severity) }}</span>
                          <b> {{ c.label || c.ruleId }}</b>
                          · {{ childValueText(c) }} ·
                          <nuxt-link :to="'/alarmas/' + c.notificationId" class="alarm-link">ver →</nuxt-link>
                        </div>
                        <div v-if="!expanded[a.notificationId].children.length" class="child-line">
                          Sin hijas activas ahora.
                        </div>
                      </template>
                    </template>
                    <p v-else class="sub">Sin alarmas en cascada.</p>
                  </div>
                  <div>
                    <h4>Historial</h4>
                    <p class="hist-line">
                      <span class="f">▲ fire</span> {{ formatTime(a.firedAt) }}
                      <template v-if="a.repeatCount > 1"> · repetida ×{{ a.repeatCount }} en 24h</template>
                    </p>
                    <p style="margin-top:8px">
                      <nuxt-link :to="'/alarmas/' + a.notificationId" class="alarm-link">
                        Ver detalle completo →
                      </nuxt-link>
                    </p>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <div v-if="nextCursor" class="load-more">
        <button
          type="button"
          class="btn btn-sm btn-ghost-load"
          :disabled="loadingMore"
          @click="fetchActive(true)"
        >{{ loadingMore ? 'Cargando…' : 'Cargar más' }}</button>
      </div>
    </div>

    <!-- ===== Resueltas últimas 24h ===== -->
    <button type="button" class="res-toggle" @click="toggleResolved">
      {{ showResolved ? '▾' : '▸' }} Resueltas últimas 24 h{{ resolvedLoaded ? ' (' + resolvedItems.length + ')' : '' }}
    </button>
    <div v-if="showResolved" class="resolved-box">
      <div v-if="resolvedLoading" class="noc-table-skel">
        <div v-for="i in 3" :key="i" class="skel-row"></div>
      </div>
      <div v-else-if="resolvedError" class="error-box">
        <p>No se pudieron cargar las resueltas.</p>
        <button type="button" class="btn btn-sm btn-primary" @click="fetchResolved">Reintentar</button>
      </div>
      <p v-else-if="!resolvedItems.length" class="sub" style="padding:10px">Ninguna alarma resuelta en las últimas 24 h.</p>
      <table v-else class="noc-table">
        <tbody>
          <tr v-for="a in resolvedItems" :key="a.notificationId" class="row-main row-resolved">
            <td style="width:28px"></td>
            <td class="cell-state"><span class="st-res">✓</span> <span class="st-text">Resuelta</span></td>
            <td><span class="alarm-badge" :class="'sev-badge-' + sevKey(a)">{{ severityLabel(a.severity) }}</span></td>
            <td>
              <b>{{ a.siteName || a.siteId || '—' }}</b><br />
              <span class="sub">{{ a.deviceName || a.dId }}</span>
            </td>
            <td class="cell-alarm">
              <nuxt-link :to="'/alarmas/' + a.notificationId" class="alarm-link">
                {{ a.label || a.ruleId }} <span class="go">→</span>
              </nuxt-link>
              <br />
              <span class="sub">{{ typeSubtitle(a) }}</span>
            </td>
            <td class="cell-val">{{ valueText(a) }}</td>
            <td><span class="sub">duró {{ formatDuration(a.durationSec) || '—' }}</span></td>
            <td class="sub">{{ formatTime(a.resolvedAt) }}</td>
            <td style="width:34px"></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ===== Barra flotante de ACK masivo ===== -->
    <transition name="bulk">
      <div v-if="selectedCount > 0" class="bulk-bar">
        <span><b>{{ selectedCount }}</b> alarma{{ selectedCount === 1 ? '' : 's' }} seleccionada{{ selectedCount === 1 ? '' : 's' }}</span>
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="bulkBusy"
          @click="ackSelected"
        >{{ bulkBusy ? 'Reconociendo…' : 'Reconocer ' + selectedCount }}</button>
        <button type="button" class="btn btn-sm btn-ghost-load" :disabled="bulkBusy" @click="clearSelection">Cancelar</button>
      </div>
    </transition>
  </div>
</template>

<script>
import AgeTicker from '@/components/alarms/AgeTicker.vue';
import { SEVERITY_LABELS, REASON_LABELS, typeLabelForMode } from '@/utils/alarmLabels';
import { formatDuration, formatTime } from '@/utils/format';
import { ticker } from '@/utils/ticker';

const REFRESH_SUMMARY_MS = 60000;

export default {
  name: 'AlarmasConsola',
  middleware: 'authenticated',
  components: { AgeTicker },
  data() {
    return {
      summary: null,
      summaryLoading: false,
      summaryError: false,
      items: [],
      nextCursor: null,
      loading: false,
      loadingMore: false,
      error: false,
      sevFilter: [],
      search: '',
      selected: {},
      expanded: {},
      ackBusy: {},
      bulkBusy: false,
      showResolved: false,
      resolvedItems: [],
      resolvedLoading: false,
      resolvedError: false,
      resolvedLoaded: false,
      _summaryTimer: null,
      _notifHandler: null,
    };
  },
  computed: {
    nowMs() { return ticker.now; },
    selectedCount() { return Object.keys(this.selected).length; },
    oldestUnackedSince() {
      if (!this.summary || this.summary.oldestUnackedAgeMs == null) return null;
      return this.summary.now - this.summary.oldestUnackedAgeMs;
    },
    filteredItems() {
      let list = this.items;
      if (this.sevFilter.length) {
        list = list.filter(a => this.sevFilter.includes(a.severity));
      }
      if (this.search) {
        const q = this.search.toLowerCase();
        list = list.filter(a =>
          (a.label || '').toLowerCase().includes(q) ||
          (a.siteName || '').toLowerCase().includes(q) ||
          (a.deviceName || '').toLowerCase().includes(q));
      }
      return list;
    },
  },
  mounted() {
    this.fetchAll();
    this._summaryTimer = setInterval(this.fetchSummary, REFRESH_SUMMARY_MS);
    this._notifHandler = () => { this.fetchSummary(); this.fetchActive(false); };
    this.$nuxt.$on('wanomi:notif', this._notifHandler);
  },
  activated() {
    // keep-alive: al volver a la pestaña, refrescar solo si el dato envejeció
    // (en el primer montaje, activated corre junto a mounted → sin duplicar).
    if (this._lastFetch && Date.now() - this._lastFetch < 30000) return;
    this.fetchSummary();
    this.fetchActive(false);
  },
  beforeDestroy() {
    if (this._summaryTimer) { clearInterval(this._summaryTimer); this._summaryTimer = null; }
    if (this._notifHandler) this.$nuxt.$off('wanomi:notif', this._notifHandler);
  },
  methods: {
    formatDuration,
    formatTime,
    headers() {
      return { headers: { token: this.$store.state.auth.token } };
    },
    severityLabel(s) { return SEVERITY_LABELS[s] || s; },
    sevKey(a) {
      return ['critical', 'warning', 'info'].includes(a.severity) ? a.severity : 'info';
    },
    sevIcon(s) {
      return { critical: '▲', warning: '●', info: 'ℹ' }[s] || 'ℹ';
    },
    reasonLabel(r) { return r ? (REASON_LABELS[r] || r) : null; },
    typeSubtitle(a) {
      const t = typeLabelForMode(a.mode);
      return t ? `${t} · regla ${a.ruleId || ''}` : (a.ruleId || '');
    },
    valueText(a) {
      const unit = a.unit || '';
      if (a.value == null || a.thresholdUsed == null) return '—';
      return `${a.value} ${unit} / ${a.thresholdUsed} ${unit}`.replace(/\s+/g, ' ').trim();
    },
    childValueText(c) {
      const unit = c.unit || '';
      if (c.value == null || c.thresholdUsed == null) return c.value != null ? `${c.value} ${unit}`.trim() : '—';
      return `${c.value} ${unit} / ${c.thresholdUsed} ${unit}`.replace(/\s+/g, ' ').trim();
    },
    // Semáforo de edad: <15 min neutro, 15–60 ámbar, >60 rojo si sigue sin ACK.
    ageClass(a) {
      if (a.firedAt == null) return 'age-ok';
      const min = (this.nowMs - a.firedAt) / 60000;
      if (min > 60 && a.state === 'active') return 'age-crit';
      if (min >= 15) return 'age-warn';
      return 'age-ok';
    },
    toggleSev(s) {
      const i = this.sevFilter.indexOf(s);
      if (i >= 0) this.sevFilter.splice(i, 1);
      else this.sevFilter.push(s);
    },
    toggleSelect(a) {
      if (this.selected[a.notificationId]) this.$delete(this.selected, a.notificationId);
      else this.$set(this.selected, a.notificationId, a);
    },
    clearSelection() { this.selected = {}; },

    async fetchAll() {
      this._lastFetch = Date.now();
      await Promise.all([this.fetchSummary(), this.fetchActive(false)]);
    },
    async fetchSummary() {
      this.summaryLoading = true;
      this.summaryError = false;
      try {
        const res = await this.$axios.get('/alarms/summary', this.headers());
        if (res.data.status === 'success') this.summary = res.data.data;
        else this.summaryError = true;
      } catch (e) {
        console.error('alarms summary', e);
        this.summaryError = true;
      } finally {
        this.summaryLoading = false;
      }
    },
    async fetchActive(more) {
      if (more) this.loadingMore = true;
      else this.loading = true;
      this.error = false;
      try {
        let url = '/alarms?status=active&limit=200';
        if (more && this.nextCursor) url += '&before=' + encodeURIComponent(this.nextCursor);
        const res = await this.$axios.get(url, this.headers());
        if (res.data.status === 'success') {
          const d = res.data.data;
          if (more) this.items = this.items.concat(d.items);
          else {
            this.items = d.items;
            // Depurar selección/expansión de ítems que ya no están.
            const ids = new Set(d.items.map(i => i.notificationId));
            Object.keys(this.selected).forEach(id => { if (!ids.has(id)) this.$delete(this.selected, id); });
          }
          this.nextCursor = d.nextCursor || null;
        } else {
          this.error = true;
        }
      } catch (e) {
        console.error('alarms active', e);
        this.error = true;
      } finally {
        this.loading = false;
        this.loadingMore = false;
      }
    },
    async fetchResolved() {
      this.resolvedLoading = true;
      this.resolvedError = false;
      try {
        const res = await this.$axios.get('/alarms?status=resolved&limit=50', this.headers());
        if (res.data.status === 'success') {
          this.resolvedItems = res.data.data.items;
          this.resolvedLoaded = true;
        } else {
          this.resolvedError = true;
        }
      } catch (e) {
        console.error('alarms resolved', e);
        this.resolvedError = true;
      } finally {
        this.resolvedLoading = false;
      }
    },
    toggleResolved() {
      this.showResolved = !this.showResolved;
      if (this.showResolved && !this.resolvedLoaded && !this.resolvedLoading) this.fetchResolved();
    },
    toggleExpand(a) {
      if (this.expanded[a.notificationId]) {
        this.$delete(this.expanded, a.notificationId);
        return;
      }
      this.$set(this.expanded, a.notificationId, { children: [], loading: false, error: false });
      if (a.childCount > 0) this.loadChildren(a);
    },
    async loadChildren(a) {
      const slot = this.expanded[a.notificationId];
      if (!slot) return;
      slot.loading = true;
      slot.error = false;
      try {
        const res = await this.$axios.get(`/alarms/${a.notificationId}/detail`, this.headers());
        if (res.data.status === 'success') slot.children = res.data.data.children || [];
        else slot.error = true;
      } catch (e) {
        console.error('alarm children', e);
        slot.error = true;
      } finally {
        slot.loading = false;
      }
    },
    async ackOne(a) {
      if (this.ackBusy[a.notificationId]) return;
      this.$set(this.ackBusy, a.notificationId, true);
      try {
        await this.$axios.put(
          `/site/${encodeURIComponent(a.siteId)}/alarms/${a.notificationId}/ack`,
          null,
          this.headers()
        );
        this.$notify({ type: 'success', message: `Reconocida: ${a.label || a.ruleId}` });
      } catch (e) {
        console.error('ack', e);
        this.$notify({ type: 'danger', message: `No se pudo reconocer ${a.label || a.ruleId}` });
      } finally {
        this.$delete(this.ackBusy, a.notificationId);
        this.fetchSummary();
        this.fetchActive(false);
      }
    },
    async ackSelected() {
      const list = Object.values(this.selected).filter(a => a.state === 'active');
      if (!list.length || this.bulkBusy) return;
      this.bulkBusy = true;
      const results = await Promise.allSettled(list.map(a =>
        this.$axios.put(
          `/site/${encodeURIComponent(a.siteId)}/alarms/${a.notificationId}/ack`,
          null,
          this.headers()
        )
      ));
      this.bulkBusy = false;
      const failed = results.filter(r => r.status === 'rejected').length;
      const ok = results.length - failed;
      if (failed === 0) {
        this.$notify({ type: 'success', message: `${ok} alarma${ok === 1 ? '' : 's'} reconocida${ok === 1 ? '' : 's'}.` });
        this.clearSelection();
      } else {
        this.$notify({
          type: 'warning',
          message: `${ok} reconocidas, ${failed} con error — reintente las que siguen activas.`,
        });
      }
      this.fetchSummary();
      this.fetchActive(false);
    },
  },
};
</script>

<style lang="scss" scoped>
.alarmas-page { padding-bottom: 60px; }

/* ===== KPIs ===== */
.kpi-band {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
@media (max-width: 1100px) { .kpi-band { grid-template-columns: repeat(3, 1fr); } }
.kpi {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-left: 3px solid #344675;
  border-radius: 10px;
  padding: 12px 14px;
}
body.white-content .kpi {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
}
.kpi .num { font-size: 23px; font-weight: 700; line-height: 1.15; }
.kpi .lbl {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  opacity: 0.65;
  margin-top: 3px;
}
.k-crit { border-left-color: #fd5d93; } .k-crit .num { color: #fd5d93; }
.k-warn { border-left-color: #ff8d72; } .k-warn .num { color: #ff8d72; }
.k-info { border-left-color: #1d8cf8; } .k-info .num { color: #1d8cf8; }
.k-noack { border-left-color: #00f2c3; }
.k-noack .num { color: #00f2c3; font-size: 29px; }
.k-noack { box-shadow: inset 0 0 18px rgba(0, 242, 195, 0.08); }
.k-old { border-left-color: #ff8d72; } .k-old .num { color: #ff8d72; font-size: 20px; }
.k-mttr { border-left-color: #00bf9a; } .k-mttr .num { color: #00bf9a; }
.kpi-skel { min-height: 70px; animation: skel-pulse 1.4s ease-in-out infinite; }
.kpi-error { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; }
@keyframes skel-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

/* ===== Filtros ===== */
.filters-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.chip {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: inherit;
  opacity: 0.75;
  font-size: 11px;
  padding: 4px 11px;
  border-radius: 999px;
}
.chip:hover { opacity: 1; }
.chip.on[data-f="critical"] { background: rgba(253, 93, 147, 0.18); color: #fd5d93; border-color: #fd5d93; opacity: 1; }
.chip.on[data-f="warning"]  { background: rgba(255, 141, 114, 0.16); color: #ff8d72; border-color: #ff8d72; opacity: 1; }
.chip.on[data-f="info"]     { background: rgba(29, 140, 248, 0.16); color: #1d8cf8; border-color: #1d8cf8; opacity: 1; }
.search-input {
  max-width: 320px;
  height: 32px;
  font-size: 12px;
  margin-left: auto;
}

/* ===== Tabla NOC ===== */
.table-wrap { overflow-x: auto; }
.noc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 10px;
  overflow: hidden;
}
body.white-content .noc-table {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
}
.noc-table th {
  text-align: left;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  padding: 9px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  opacity: 0.65;
  white-space: nowrap;
}
body.white-content .noc-table th { border-bottom-color: rgba(0, 0, 0, 0.1); }
.noc-table td {
  padding: 9px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  vertical-align: middle;
}
body.white-content .noc-table td { border-bottom-color: rgba(0, 0, 0, 0.06); }
.noc-table tbody tr.row-main:hover { background: rgba(255, 255, 255, 0.025); }
body.white-content .noc-table tbody tr.row-main:hover { background: rgba(0, 0, 0, 0.02); }
.noc-table tr.selected { background: rgba(29, 140, 248, 0.07); }
.noc-table tr.row-resolved { opacity: 0.55; }

.cell-state { white-space: nowrap; }
.st-text { font-size: 11px; opacity: 0.7; }
.st-ack { color: #1d8cf8; }
.st-res { color: #00bf9a; }
.pulse-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fd5d93;
  animation: pulse-dot 1.4s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(253, 93, 147, 0.55); opacity: 1; }
  50% { box-shadow: 0 0 0 5px rgba(253, 93, 147, 0); opacity: 0.65; }
}
@media (prefers-reduced-motion: reduce) { .pulse-dot { animation: none; } }

.alarm-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
}
.badge-cascade {
  display: inline-block;
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #344675;
  color: #cfd2ee;
  margin-left: 6px;
}
.reps { color: #ff8d72; font-weight: 600; font-size: 11px; margin-left: 6px; }
.sub { font-size: 11px; opacity: 0.6; }
.cell-val { white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; }

.alarm-link { color: #00f2c3; font-weight: 600; white-space: nowrap; }
.alarm-link:hover { color: #00f2c3; text-decoration: underline; }
.alarm-link .go { opacity: 0.7; font-size: 11px; }

.age {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.age-ok { background: rgba(255, 255, 255, 0.08); opacity: 0.85; }
body.white-content .age-ok { background: rgba(0, 0, 0, 0.07); }
.age-warn { background: rgba(255, 141, 114, 0.14); color: #ff8d72; opacity: 1; }
.age-crit { background: rgba(253, 93, 147, 0.16); color: #fd5d93; opacity: 1; }

.btn-ack-sm {
  background: linear-gradient(135deg, #00c9a0, #00f2c3);
  color: #0d1526;
  border: none;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 999px;
}
.btn-ack-sm:hover { filter: brightness(1.1); }
.btn-ack-sm:disabled { opacity: 0.6; cursor: default; }
.ack-chip {
  font-size: 10.5px;
  background: rgba(29, 140, 248, 0.13);
  color: #1d8cf8;
  border: 1px solid rgba(29, 140, 248, 0.4);
  border-radius: 999px;
  padding: 2px 9px;
  white-space: nowrap;
}
.exp-btn {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.6;
  font-size: 14px;
  padding: 2px 6px;
}
.exp-btn:hover { color: #00f2c3; opacity: 1; }

/* ===== Fila expandida ===== */
.row-detail td { background: rgba(0, 0, 0, 0.18); padding: 14px 18px; }
body.white-content .row-detail td { background: rgba(0, 0, 0, 0.03); }
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  font-size: 12px;
}
@media (max-width: 1100px) { .detail-grid { grid-template-columns: 1fr; } }
.detail-grid h4 {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  opacity: 0.55;
  margin-bottom: 6px;
}
.detail-grid p { margin: 0; }
.detail-grid .rec { font-style: italic; opacity: 0.85; }
.child-line {
  padding: 3px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
}
body.white-content .child-line { border-bottom-color: rgba(0, 0, 0, 0.1); }
.child-line:last-child { border-bottom: none; }
.hist-line .f { color: #fd5d93; }

/* ===== Cargar más / resueltas / estados ===== */
.load-more { text-align: center; padding: 12px 0 4px; }
.btn-ghost-load {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: inherit;
}
body.white-content .btn-ghost-load { border-color: rgba(0, 0, 0, 0.2); }
.btn-ghost-load:hover { border-color: #00f2c3; color: #00f2c3; }

.res-toggle {
  width: 100%;
  margin-top: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: inherit;
  opacity: 0.8;
  border-radius: 8px;
  padding: 9px;
  font-size: 12.5px;
  font-weight: 600;
}
body.white-content .res-toggle { background: #ffffff; border-color: rgba(0, 0, 0, 0.1); }
.res-toggle:hover { opacity: 1; }
.resolved-box { margin-top: 8px; }

.error-box, .empty-box {
  text-align: center;
  padding: 34px 16px;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 10px;
}
body.white-content .error-box, body.white-content .empty-box { border-color: rgba(0, 0, 0, 0.15); }
.empty-box { color: #00bf9a; }
.empty-box .big { font-size: 34px; display: block; margin-bottom: 8px; }
.empty-box p { opacity: 0.7; font-size: 12.5px; }
.noc-table-skel { display: flex; flex-direction: column; gap: 8px; }
.skel-row {
  height: 44px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  animation: skel-pulse 1.4s ease-in-out infinite;
}
body.white-content .skel-row { background: rgba(0, 0, 0, 0.05); }

/* ===== Barra flotante de selección ===== */
.bulk-bar {
  position: fixed;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  background: #2b2f4a;
  border: 1px solid #00f2c3;
  border-radius: 999px;
  padding: 10px 12px 10px 22px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.5), 0 0 22px rgba(0, 242, 195, 0.15);
  z-index: 60;
  font-size: 13px;
  color: #e3e3f0;
}
.bulk-bar b { color: #00f2c3; }
.bulk-enter-active, .bulk-leave-active { transition: transform 0.25s ease, opacity 0.25s ease; }
.bulk-enter, .bulk-leave-to { transform: translateX(-50%) translateY(90px); opacity: 0; }
</style>
