<template>
  <article
    class="alarm-card"
    :class="['sev-rail-' + sevKey, 'alarm-card--' + density]"
    :aria-label="ariaLabel"
  >
    <!-- Cabecera común: icono + label + badges (triple canal: color+icono+texto) -->
    <div class="alarm-card-head">
      <span class="alarm-sev-icon" :class="'sev-' + sevKey" aria-hidden="true">{{ sevIcon }}</span>
      <span class="alarm-label">{{ alarm.label || alarm.ruleId }}</span>
      <span class="alarm-badge" :class="'sev-badge-' + sevKey">{{ badgeText }}</span>
      <span class="alarm-badge alarm-badge-status" :class="statusClass">{{ statusText }}</span>
      <span v-if="repeatCount > 1" class="alarm-badge alarm-badge-repeat" :title="repeatCount + ' repeticiones'">×{{ repeatCount }}</span>
    </div>

    <!-- Línea de contexto común -->
    <div class="alarm-context text-muted">
      <span v-if="siteText">{{ siteText }}</span>
      <span v-if="alarm.deviceName"> · {{ alarm.deviceName }}</span>
      <template v-if="!isResolved">
        · <AgeTicker :since="alarm.time" prefix="activa hace " />
      </template>
    </div>

    <template v-if="density !== 'compact'">
      <div v-if="typeText" class="alarm-line text-muted">{{ typeText }}</div>

      <div v-if="valueVsThreshold" class="alarm-line alarm-value">
        {{ valueVsThreshold }}
      </div>

      <div v-if="alarm.recommendation" class="alarm-line alarm-rec">
        → {{ alarm.recommendation }}
      </div>

      <div v-if="density === 'full' && reasonText" class="alarm-line text-muted">
        Motivo: {{ reasonText }}
      </div>

      <div v-if="density === 'full'" class="alarm-line alarm-tech text-muted">
        <span v-if="alarm.thresholdUsed != null">Umbral usado: {{ alarm.thresholdUsed }}{{ alarm.unit || '' }}</span>
        <span v-if="alarm.mode"> · modo: {{ alarm.mode }}</span>
        <span> · disparada: {{ formatDateTime(alarm.time) }}</span>
        <span v-if="alarm.ackAt"> · ACK: {{ formatDateTime(alarm.ackAt) }}</span>
      </div>

      <slot name="extra" />

      <div class="alarm-actions">
        <button
          v-if="showAck"
          type="button"
          class="btn btn-sm btn-success"
          :aria-label="'Reconocer alarma ' + (alarm.label || alarm.ruleId)"
          @click="$emit('ack', alarm)"
        >Reconocer</button>
        <button
          type="button"
          class="btn btn-sm btn-link alarm-detail-link"
          :aria-label="'Ver detalle de ' + (alarm.label || alarm.ruleId)"
          @click="$emit('detail', alarm)"
        >Ver detalle →</button>
        <button
          v-if="children.length"
          type="button"
          class="btn btn-sm btn-link alarm-cascade-toggle"
          :aria-expanded="childrenOpen"
          :aria-label="(childrenOpen ? 'Ocultar' : 'Mostrar') + ' ' + children.length + ' alarmas en cascada'"
          @click="toggleChildren"
        >↳ {{ children.length }} en cascada <span aria-hidden="true">{{ childrenOpen ? '▾' : '▸' }}</span></button>
      </div>

      <div v-if="children.length && childrenOpen" class="alarm-children">
        <AlarmCard
          v-for="c in children"
          :key="c._id"
          :alarm="c"
          density="compact"
          @ack="$emit('ack', $event)"
          @detail="$emit('detail', $event)"
        />
      </div>
    </template>
  </article>
</template>

<script>
import AgeTicker from '@/components/alarms/AgeTicker.vue';
import { SEVERITY_LABELS, REASON_LABELS, typeLabelForMode } from '@/utils/alarmLabels';

// Componente unificado de alarma (FASE 1 rediseño). Sin llamadas HTTP:
// los padres ejecutan ack/detalle. Densidades: compact (widget), list
// (drawer/consola), full (detalle).
export default {
  name: 'AlarmCard',
  components: { AgeTicker },
  props: {
    alarm:       { type: Object, required: true },
    density:     { type: String, default: 'list', validator: v => ['compact', 'list', 'full'].includes(v) },
    repeatCount: { type: Number, default: 0 },
    children:    { type: Array, default: () => [] },
  },
  data() {
    return { childrenOpen: false };
  },
  computed: {
    isResolved() { return this.alarm.kind === 'resolve'; },
    // Resuelto gana sobre severity (mismo criterio que railVariant del NOC).
    sevKey() {
      if (this.isResolved) return 'resolved';
      return ['critical', 'warning', 'info'].includes(this.alarm.severity) ? this.alarm.severity : 'info';
    },
    sevIcon() {
      return { critical: '▲', warning: '●', info: 'ℹ', resolved: '✓' }[this.sevKey];
    },
    badgeText() {
      if (this.isResolved) return 'Resuelta';
      return SEVERITY_LABELS[this.alarm.severity] || this.alarm.severity || 'Alarma';
    },
    statusClass() {
      if (this.isResolved) return 'alarm-status-resolved';
      if (this.alarm.ackAt) return 'alarm-status-ack';
      return 'alarm-status-active alarm-pulse';
    },
    statusText() {
      if (this.isResolved) return 'Resuelta';
      if (this.alarm.ackAt) {
        const who = this.alarm.acknowledgedBy ? this.alarm.acknowledgedBy : '—';
        return `ACK por ${who} · ${this.formatTime(this.alarm.ackAt)}`;
      }
      return 'Activa';
    },
    siteText() {
      const code = this.alarm.siteCode || '';
      const name = this.alarm.siteName || '';
      if (code && name) return `${code} · ${name}`;
      return code || name || null;
    },
    typeText() { return typeLabelForMode(this.alarm.mode); },
    reasonText() {
      if (!this.alarm.reason) return null;
      return REASON_LABELS[this.alarm.reason] || this.alarm.reason;
    },
    valueVsThreshold() {
      const unit = this.alarm.unit || '';
      if (this.alarm.value == null || this.alarm.thresholdUsed == null) return null;
      return `${this.alarm.variableFullName || this.alarm.variable || 'Valor'}: ${this.alarm.value}${unit} / ${this.alarm.thresholdUsed}${unit}`;
    },
    showAck() { return !this.isResolved && !this.alarm.ackAt; },
    ariaLabel() {
      return `Alarma ${this.badgeText}: ${this.alarm.label || this.alarm.ruleId}`;
    },
  },
  methods: {
    toggleChildren() {
      this.childrenOpen = !this.childrenOpen;
      this.$emit('toggle-children', { alarm: this.alarm, open: this.childrenOpen });
    },
    formatTime(ms) {
      if (ms == null) return '';
      const d = new Date(ms);
      const p = n => (n < 10 ? '0' + n : '' + n);
      return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    },
    formatDateTime(ms) {
      if (ms == null) return '—';
      const d = new Date(ms);
      const p = n => (n < 10 ? '0' + n : '' + n);
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${this.formatTime(ms)}`;
    },
  },
};
</script>

<style scoped>
.alarm-card {
  position: relative;
  padding: 0.6em 0.85em;
  border-radius: 0.35em;
  background: rgba(255, 255, 255, 0.03);
  margin-bottom: 0.4em;
}
body.white-content .alarm-card { background: rgba(0, 0, 0, 0.03); }

.alarm-card--compact { padding: 0.35em 0.6em; }

.alarm-card-head {
  display: flex;
  align-items: center;
  gap: 0.45em;
  flex-wrap: wrap;
}
.alarm-sev-icon { font-size: 0.95em; line-height: 1; }
.alarm-label { font-size: 14px; font-weight: 500; }
.alarm-card--compact .alarm-label { font-size: 13px; }

.alarm-badge {
  display: inline-block;
  padding: 0.2em 0.55em;
  border-radius: 0.35em;
  font-size: 0.72em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1.15;
}
.alarm-badge-status {
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  text-transform: none;
}
body.white-content .alarm-badge-status { background: rgba(0, 0, 0, 0.08); }
.alarm-status-resolved { opacity: 0.85; }
.alarm-badge-repeat {
  background: rgba(255, 255, 255, 0.18);
  color: inherit;
}
body.white-content .alarm-badge-repeat { background: rgba(0, 0, 0, 0.12); }

/* Pulso sutil en el badge "Activa" (alarma viva sin ACK). */
.alarm-pulse { animation: alarm-pulse 2s ease-in-out infinite; }
@keyframes alarm-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) {
  .alarm-pulse { animation: none; }
}

.alarm-context { font-size: 12px; margin-top: 2px; }
.alarm-line { font-size: 12px; margin-top: 2px; }
.alarm-value { font-variant-numeric: tabular-nums; }
.alarm-rec { font-style: italic; opacity: 0.85; }
.alarm-tech { font-size: 11px; }

.alarm-actions {
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin-top: 0.45em;
}
.alarm-detail-link,
.alarm-cascade-toggle { padding: 0; font-size: 12px; }

.alarm-children {
  margin-top: 0.5em;
  margin-left: 1.2em;
  padding-left: 0.8em;
  border-left: 1px dashed rgba(255, 255, 255, 0.15);
}
body.white-content .alarm-children { border-left-color: rgba(0, 0, 0, 0.15); }
.alarm-children .alarm-card:last-child { margin-bottom: 0; }
</style>
