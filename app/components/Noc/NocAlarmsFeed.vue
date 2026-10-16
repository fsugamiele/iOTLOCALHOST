<template>
  <!-- Feed de alertas recientes del Panel (split de NocRecentAlarms — Panel
       personalizable: el feed y el histograma son widgets independientes). -->
  <div class="noc-alarms-feed">
    <div v-if="!recentAlarms || recentAlarms.length === 0" class="text-muted text-center p-3">
      Sin alertas recientes.
    </div>
    <ul v-else class="noc-alarms-list">
      <li
        v-for="a in itemsOrdered"
        :key="a._id"
        class="noc-alarm-item"
        :class="[
          'rail-' + railVariant(a),
          a.isCascade ? 'noc-alarm-cascade' : ''
        ]"
      >
        <div class="alarm-content">
          <!-- Línea 1 · label + badge -->
          <div class="alarm-line-1">
            <span
              v-if="a.isCascade"
              class="cascade-icon text-muted"
              aria-hidden="true"
              title="Consecuencia de otra alarma"
            >↳</span>
            <span
              class="alarm-label"
              :class="a.resolved ? 'label-secondary' : 'label-primary'"
            >{{ a.label || a.ruleId }}</span>
            <span v-if="a.resolved" class="noc-badge noc-badge-success ml-1">
              Resuelto<span
                v-if="a.durationSec !== null"
                class="badge-duration"
              > · {{ formatDuration(a.durationSec) }}</span>
            </span>
            <span
              v-else
              :class="['noc-badge', 'noc-badge-' + badgeVariant(a.severity), 'ml-1']"
            >{{ severityLabel(a.severity) }}</span>
          </div>

          <!-- Línea 2 · subtítulo de tipo (D/C/S/cross) -->
          <div v-if="typeSubtitle(a.type)" class="alarm-line-2 text-muted">
            {{ typeSubtitle(a.type) }}
          </div>

          <!-- Línea 3 · metadatos + reason (append muted) -->
          <div class="alarm-line-3 text-muted">
            <span class="alarm-site">{{ a.siteCode }}<span v-if="a.siteName"> · {{ a.siteName }}</span></span>
            <span class="alarm-time"> · {{ timeMetaLabel(a) }}</span>
            <span v-if="reasonSuffix(a)" class="alarm-reason"> · {{ reasonSuffix(a) }}</span>
          </div>

          <!-- Línea 4 · recomendación (DEC-REF-100 D-4) -->
          <div v-if="a.recommendation" class="alarm-line-4 alarm-rec">
            → {{ a.recommendation }}
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script>
// F1.b (DEC-REF-81 iv · DEC-REF-82 ii) — tarjeta de alertas con estado
// resuelto, tipo de alarma en criollo y cascada agrupada. Diseño CERRADO
// por Franco. Split del componente NocRecentAlarms (feed + histograma).
// FASE 1 rediseño: los vocabularios (SEVERITY/TYPE/REASON) y la lógica de
// cascada viven en @/utils (fuente única compartida con AlarmCard).
import { SEVERITY_LABELS, TYPE_LABELS, REASON_LABELS } from '@/utils/alarmLabels';
import { buildAlarmTree } from '@/utils/alarmTree';

export default {
  name: 'NocAlarmsFeed',
  props: {
    recentAlarms: { type: Array, default: () => [] },
  },
  computed: {
    // (F1.b) — cascada agrupada; lógica extraída a @/utils/alarmTree
    // (misma recursión, mismas redes de seguridad C2).
    itemsOrdered() {
      return buildAlarmTree(this.recentAlarms);
    },
  },
  methods: {
    badgeVariant(severity) {
      if (severity === 'critical') return 'danger';
      if (severity === 'warning')  return 'warning';
      return 'info';
    },
    // (F1.b) — color del riel: resuelto gana sobre severity.
    railVariant(a) {
      if (a.resolved) return 'success';
      return this.badgeVariant(a.severity);
    },
    severityLabel(severity) { return SEVERITY_LABELS[severity] || severity; },
    typeSubtitle(type)      { return TYPE_LABELS[type] || null; },
    messageLabel(msg)       { return REASON_LABELS[msg] || msg; },
    // F1.b (C1) — appendear el reason al final de línea 3 SOLO si difiere
    // del label de la regla.
    reasonSuffix(a) {
      if (!a.message) return null;
      const label = this.messageLabel(a.message);
      if (!label || label === a.label) return null;
      return label;
    },

    // (F1.b) — función única de duración. Usada en el badge "Resuelto"
    // y en "activa hace N" (línea 3, fires abiertos).
    formatDuration(sec) {
      if (sec == null) return null;
      if (sec < 60)        return sec + ' s';
      if (sec < 3600) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return s ? `${m} min ${s} s` : `${m} min`;
      }
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return m ? `${h} h ${m} min` : `${h} h`;
    },

    // HH:MM:SS local (evita fugas de TZ en la comparación fire→resolve).
    formatTime(ms) {
      if (ms == null) return '';
      const d = new Date(ms);
      const p = n => (n < 10 ? '0' + n : '' + n);
      return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    },

    // Línea 3 · metadatos de tiempo:
    //   resolved  → "HH:MM:SS → HH:MM:SS"
    //   !resolved → "HH:MM:SS · activa hace N"
    timeMetaLabel(a) {
      if (a.resolved) {
        const start = a.firedAt != null ? this.formatTime(a.firedAt) : '—';
        const end   = a.resolvedAt != null ? this.formatTime(a.resolvedAt) : this.formatTime(a.time);
        return `${start} → ${end}`;
      }
      const anchor = a.firedAt != null ? a.firedAt : a.time;
      const startLabel = this.formatTime(anchor);
      const elapsedSec = Math.max(0, Math.floor((Date.now() - anchor) / 1000));
      const elapsedLabel = this.formatDuration(elapsedSec);
      return elapsedLabel ? `${startLabel} · activa hace ${elapsedLabel}` : startLabel;
    },
  },
};
</script>

<style scoped>
.noc-alarms-feed { height: 100%; }
/* La lista llena el widget y scrollea dentro (autoajustable a la grilla). */
.noc-alarms-list { list-style: none; padding: 0; margin: 0; height: 100%; overflow-y: auto; }

/* Ítem con riel vertical izquierdo (3px, altura completa). */
.noc-alarm-item  {
  position: relative;
  padding: 0.55em 0.75em 0.55em 1.1em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  border-left: 3px solid transparent;
}
.noc-alarm-item:last-child { border-bottom: none; }

.noc-alarm-item.rail-success { border-left-color: #639922; }
.noc-alarm-item.rail-danger  { border-left-color: #E24B4A; }
.noc-alarm-item.rail-warning { border-left-color: #EF9F27; }
.noc-alarm-item.rail-info    { border-left-color: #3aa2ff; }

/* Cascada: fondo surface-1 + indent extra. */
.noc-alarm-item.noc-alarm-cascade {
  background: rgba(255, 255, 255, 0.035);
  padding-left: calc(1.1em + 24px);
}
.cascade-icon {
  display: inline-block;
  margin-right: 0.4em;
  font-size: 0.95em;
  opacity: 0.7;
}

.alarm-content   { display: flex; flex-direction: column; gap: 2px; }
.alarm-line-1    { display: flex; align-items: center; gap: 0.4em; flex-wrap: wrap; }
.alarm-label     { font-size: 14px; font-weight: 500; }
.alarm-label.label-secondary { opacity: 0.7; }
.alarm-line-2    { font-size: 12px; opacity: 0.85; }
.alarm-line-3    { font-size: 12px; display: flex; gap: 0.35em; flex-wrap: wrap; }
.alarm-rec       { font-size: 12px; font-style: italic; color: #9aa0b4; margin-top: 2px; }
.alarm-site      { font-weight: 500; opacity: 0.9; }

/* Badges — DEC-REF-27. */
.noc-badge {
  display: inline-block;
  padding: 0.25em 0.55em;
  border-radius: 0.35em;
  font-size: 0.72em;
  font-weight: 600;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1.15;
}
.noc-badge-danger  { background: #E24B4A; }
.noc-badge-warning { background: #EF9F27; color: #333; }
.noc-badge-success { background: #639922; }
.noc-badge-info    { background: #3aa2ff; }
.badge-duration    {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0.85;
}
</style>
