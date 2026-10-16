<template>
  <!-- FASE 4 rediseño alarmas — detalle /alarmas/:id (gráficos, pronóstico,
       recurrencia, variables hermanas, autonomía, cascada, metadatos).
       Diseño: docs/mockups/alarmas_definitivo.html. Datos: GET
       /api/alarms/:id/detail (FASE 2). El violeta #a55eea es SOLO pronóstico. -->
  <div class="alarma-detalle">
    <!-- Breadcrumb + volver -->
    <div class="crumb-row">
      <nuxt-link to="/alarmas" class="alarm-link">Alarmas</nuxt-link>
      <span class="crumb-sep">›</span>
      <b>{{ alarm ? (alarm.label || alarm.ruleId) : '…' }}</b>
      <button type="button" class="btn btn-sm btn-ghost-det" @click="$router.push('/alarmas')">
        ← Volver a Alarmas
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading && !detail" class="det-skel">
      <div class="skel-block" style="height:130px"></div>
      <div class="skel-block" style="height:380px"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="error-box">
      <p>{{ errorMsg }}</p>
      <button type="button" class="btn btn-sm btn-primary" @click="fetchDetail">Reintentar</button>
    </div>

    <template v-else-if="alarm">
      <!-- ===== Strip header ===== -->
      <div class="det-strip">
        <div class="row1">
          <span class="alarm-badge strip-sev" :class="'sev-badge-' + sevKey">
            {{ severityLabel(alarm.severity).toUpperCase() }}
          </span>
          <span class="d-label">{{ alarm.label || alarm.ruleId }}</span>
          <span v-if="alarm.state === 'active'" class="badge-state b-live">
            <span class="pulse-dot" aria-hidden="true"></span> Activa
          </span>
          <span v-else-if="alarm.state === 'ack'" class="badge-state b-ack">
            ✔ ACK por {{ alarm.acknowledgedBy || '—' }} · {{ formatTime(alarm.ackAt) }}
          </span>
          <span v-else class="badge-state b-resolved">
            ✓ Resuelta · duró {{ formatDuration(alarm.durationSec) || '—' }}
          </span>
          <!-- spec_grafcet_g1b — regla de cierre manual: normalizada, espera confirmación (E6). -->
          <span v-if="fsmWaiting" class="badge-state b-wait" title="El valor volvió a lo normal, pero esta alarma se cierra solo cuando alguien la confirma">
            ⏳ Normalizada · falta confirmar
          </span>
          <span v-else-if="manualClose && alarm.state !== 'resolved'" class="badge-state b-manual" title="Esta regla no se cierra sola: requiere confirmación (o el service)">
            Cierre manual
          </span>
        </div>
        <div class="d-sub">
          {{ alarm.siteName || alarm.siteId || '—' }} · {{ alarm.deviceName || alarm.dId }}
          · {{ alarm.variableFullName || alarm.variable || '—' }}
          <template v-if="typeSubtitle"> · {{ typeSubtitle }}</template>
        </div>
        <div class="row2">
          <div class="big-val">
            <span class="v" :style="{ color: sevColor }">{{ valueText }}</span>
            <span class="vs">
              vs umbral <b>{{ effThreshold != null ? effThreshold + (alarm.unit || '') : '—' }}</b>
            </span>
          </div>
          <div v-if="alarm.state !== 'resolved' && alarm.firedAt != null">
            <div class="d-clock" :style="{ color: alarm.state === 'active' ? '#fd5d93' : 'inherit' }">
              <AgeTicker :since="alarm.firedAt" />
            </div>
            <div class="d-clock-lbl">Tiempo en alarma</div>
          </div>
          <div class="d-actions">
            <button
              v-if="alarm.state === 'active'"
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="ackBusy"
              @click="ack"
            >{{ ackBusy ? 'Reconociendo…' : (fsmWaiting ? 'Confirmar y cerrar' : 'Reconocer') }}</button>
            <!-- spec_grafcet_g1b (Q6 · Qb4) — vida útil: el service pone el contador en 0 y cierra. -->
            <button
              v-if="canService && alarm.state !== 'resolved'"
              type="button"
              class="btn btn-sm btn-success"
              :disabled="serviceBusy"
              @click="registerService"
            >{{ serviceBusy ? 'Registrando…' : 'Registrar service' }}</button>
          </div>
        </div>
        <div v-if="alarm.recommendation" class="callout">
          <b>Recomendación operativa</b>
          <span>{{ alarm.recommendation }}</span>
        </div>
      </div>

      <!-- ===== ⑤ Autonomía (solo si hay dato del edge-engine) ===== -->
      <div v-if="autonomy" class="auto-card">
        <div>
          <div class="a-big">~{{ autonomy.hours }} h</div>
          <div class="a-item">Autonomía restante</div>
        </div>
        <div v-if="autonomy.liters != null" class="a-item"><b>{{ autonomy.liters }} L</b>combustible restante</div>
        <div v-if="autonomy.lph != null" class="a-item"><b>{{ autonomy.lph }} L/h</b>consumo actual</div>
        <span class="src-badge">● {{ autonomySourceLabel }}</span>
      </div>

      <!-- ===== ① Gráfico hero ===== -->
      <div class="det-card">
        <h4><span class="num-chip">①</span> {{ alarm.variableFullName || alarm.variable }} — contexto del disparo</h4>
        <AlarmHeroChart
          v-if="telemetry.length"
          :telemetry="telemetry"
          :threshold="effThreshold"
          :unit="alarm.unit || ''"
          :severity="alarm.severity"
          :alarm-value="currentVal"
          :fired-at="alarm.firedAt"
          :resolved-at="alarm.resolvedAt"
          :ack-at="alarm.ackAt"
          :now-ms="nowMs"
          :forecast="forecast"
          :episodes="detail.episodes || []"
          :is-light="isLight"
        />
        <div v-else class="forecast-empty">
          <b>Sin telemetría</b> de la variable en la ventana del episodio.
        </div>
        <div class="legend-note">
          ▲ fire · ▼ resolve · pin ACK · línea punteada = umbral · bandas = episodios previos (30d)
          <template v-if="forecast"> · <span class="sev-forecast">┅ violeta = pronóstico (nunca datos medidos)</span><template v-if="forecast.quality === 'low'"> · baja confianza (R²={{ forecast.r2 }})</template> · zona azul = ventana proyectada</template>
        </div>
        <div v-if="detail.telemetryDownsampled" class="honest-note">
          Serie remuestreada para visualización (muchas lecturas en la ventana).
        </div>
      </div>

      <!-- ===== ② Pronóstico + ③ Recurrencia ===== -->
      <div class="det-row">
        <div class="det-card">
          <h4><span class="num-chip">②</span> Pronóstico +2h</h4>
          <div v-if="forecast && forecast.etaMinutes != null">
            <div class="forecast-num">
              <span class="trend-ico">{{ forecast.slopePerMin > 0 ? '↗' : '↘' }}</span>
              <span class="big">~{{ etaText }}</span>
              <span class="forecast-desc">para alcanzar el umbral · estimación lineal</span>
            </div>
            <div class="honest-note">
              ⚠ cálculo basado en las últimas {{ forecast.n }} lecturas, puede no cumplirse.
            </div>
          </div>
          <div v-else-if="forecast">
            <div class="forecast-empty">
              ∅ <b>Tendencia sin convergencia al umbral</b> en el horizonte de proyección.
            </div>
            <div class="honest-note">
              ⚠ cálculo basado en las últimas {{ forecast.n }} lecturas, puede no cumplirse.
              <template v-if="forecast.quality === 'low'">Baja confianza (R²={{ forecast.r2 }}) — la línea violeta del gráfico es orientativa.</template>
            </div>
          </div>
          <div v-else class="forecast-empty">
            ∅ <b>Sin estimación</b> (datos insuficientes o variable no continua).
          </div>
        </div>

        <div class="det-card">
          <h4><span class="num-chip">③</span> Recurrencia 30d</h4>
          <AlarmRecurrenceChart
            v-if="recurrence && recurrence.weekly && recurrence.weekly.some(n => n > 0)"
            :weekly="recurrence.weekly"
            :color="sevColor"
            :is-light="isLight"
          />
          <div v-else class="forecast-empty" style="padding:14px">
            Sin fires de esta regla en los últimos 30 días.
          </div>
          <div class="rec-chips">
            <span class="chip-rec">↻ Recurrente: {{ recurrence ? recurrence.fires30d : 0 }}×/30d</span>
            <span class="chip-rec">MTBF {{ recurrence && recurrence.mtbfHours != null ? recurrence.mtbfHours + ' h' : '—' }}</span>
            <span class="chip-rec">Duración media {{ recurrence && recurrence.avgDurationMin != null ? recurrence.avgDurationMin + ' min' : '—' }}</span>
          </div>
          <div v-if="recurrence && recurrence.fires30d < 3" class="honest-note">
            Pocos episodios para estadística confiable.
          </div>
        </div>
      </div>

      <!-- ===== ④ Variables hermanas ===== -->
      <div v-if="siblings.length" class="det-card">
        <h4><span class="num-chip">④</span> Variables hermanas — {{ alarm.deviceName || alarm.dId }}</h4>
        <div class="spark-row">
          <div v-for="s in siblings" :key="s.variable" class="spark">
            <div class="s-name">
              <span>{{ s.variableFullName || s.variable }}</span>
              <b>{{ siblingLast(s) }}</b>
            </div>
            <AlarmSparkline :points="s.points" :threshold="s.threshold" :is-light="isLight" />
          </div>
        </div>
      </div>

      <!-- ===== ⑥ Cascada ===== -->
      <div v-if="children.length" class="det-card">
        <h4><span class="num-chip">⑥</span> Cascada — {{ children.length }} hija{{ children.length === 1 ? '' : 's' }} de esta alarma</h4>
        <div
          v-for="c in children"
          :key="c.notificationId"
          class="child-click"
          role="link"
          tabindex="0"
          :title="'Ver detalle de ' + (c.label || c.ruleId)"
          @click="goChild(c)"
          @keydown.enter="goChild(c)"
        >
          <AlarmCard :alarm="childAlarm(c)" density="compact" />
        </div>
      </div>

      <!-- ===== ⑦ Metadatos colapsables ===== -->
      <div class="det-card">
        <button
          type="button"
          class="collapse-head"
          :class="{ closed: !metaOpen }"
          :aria-expanded="metaOpen"
          @click="metaOpen = !metaOpen"
        >
          <span class="caret">▼</span><span class="num-chip">⑦</span> Metadatos y auditoría
        </button>
        <template v-if="metaOpen">
          <div class="meta-grid">
            <div class="kv"><span>ruleId</span><span>{{ alarm.ruleId || '—' }}</span></div>
            <div class="kv"><span>Modo</span><span>{{ alarm.mode || '—' }}</span></div>
            <div class="kv"><span>Reason crudo</span><span>{{ alarm.reason || '—' }}</span></div>
            <div class="kv"><span>Disparo</span><span>{{ formatDateTime(alarm.firedAt) }}</span></div>
            <div class="kv"><span>Resolución</span><span>{{ alarm.resolvedAt != null ? formatDateTime(alarm.resolvedAt) : '—' }}</span></div>
            <div class="kv"><span>Auditoría ACK</span><span>{{ alarm.ackAt != null ? 'ACK por ' + (alarm.acknowledgedBy || '—') + ' · ' + formatDateTime(alarm.ackAt) : 'sin reconocer' }}</span></div>
            <div class="kv"><span>notificationId</span><span>{{ alarm._id }}</span></div>
            <div class="kv"><span>Umbral usado</span><span>{{ alarm.thresholdUsed != null ? alarm.thresholdUsed + (alarm.unit || '') : '—' }}</span></div>
          </div>
          <pre class="raw-json">{{ rawJson }}</pre>
        </template>
      </div>
    </template>
  </div>
</template>

<script>
import AgeTicker from '@/components/alarms/AgeTicker.vue';
import AlarmCard from '@/components/alarms/AlarmCard.vue';
import AlarmHeroChart from '@/components/alarms/AlarmHeroChart.vue';
import AlarmRecurrenceChart from '@/components/alarms/AlarmRecurrenceChart.vue';
import AlarmSparkline from '@/components/alarms/AlarmSparkline.vue';
import { SEVERITY_LABELS, typeLabelForMode } from '@/utils/alarmLabels';
import { formatDuration, formatTime, formatDateTime } from '@/utils/format';

const SEV_COLORS = { critical: '#fd5d93', warning: '#ff8d72', info: '#1d8cf8' };
const AUTONOMY_SOURCE_LABELS = {
  metered:   'Medido por caudalímetro',
  measured:  'Medido por pendiente del tanque',
  estimated: 'Estimado por ficha',
};

export default {
  name: 'AlarmaDetalle',
  middleware: 'authenticated',
  components: { AgeTicker, AlarmCard, AlarmHeroChart, AlarmRecurrenceChart, AlarmSparkline },
  head() {
    // Título de solapa: label amigable de la regla (nunca el ruleId técnico).
    return { title: (this.alarm && this.alarm.label) || 'Detalle de alarma' };
  },
  data() {
    return {
      detail: null,
      loading: false,
      error: false,
      notFound: false,
      ackBusy: false,
      serviceBusy: false,
      metaOpen: false,
      isLight: false,
      themeObserver: null,
      _fetchedAtClient: 0,
      _notifHandler: null,
    };
  },
  computed: {
    alarm() { return this.detail ? this.detail.alarm : null; },
    // spec_grafcet_g1b — tipo de cierre de la regla y etapa del GRAFCET (alarms.js buildRuleState).
    manualClose() { return !!(this.detail && this.detail.rule && this.detail.rule.resetBehavior === 'manual'); },
    canService() { return !!(this.detail && this.detail.rule && this.detail.rule.canService); },
    fsmWaiting() { return !!(this.detail && this.detail.fsm && this.detail.fsm.step === 'E6'); },
    telemetry() { return this.detail ? (this.detail.telemetry || []) : []; },
    forecast() { return this.detail ? this.detail.forecast : null; },
    recurrence() { return this.detail ? this.detail.recurrence : null; },
    siblings() { return this.detail ? (this.detail.siblings || []) : []; },
    autonomy() { return this.detail ? this.detail.autonomy : null; },
    children() { return this.detail ? (this.detail.children || []) : []; },
    // "Ahora" = now del servidor + tiempo transcurrido desde el fetch (evita
    // el skew del reloj del browser en la markLine vertical).
    nowMs() {
      if (!this.detail) return Date.now();
      return this.detail.now + (Date.now() - this._fetchedAtClient);
    },
    sevKey() {
      return ['critical', 'warning', 'info'].includes(this.alarm.severity) ? this.alarm.severity : 'info';
    },
    sevColor() { return SEV_COLORS[this.sevKey]; },
    // Valor a mostrar: la última lectura de telemetría (currentValue del
    // endpoint); el alarm.value del evento suele ser null en resolve/cross.
    currentVal() {
      if (!this.detail) return null;
      if (this.detail.currentValue != null) return this.detail.currentValue;
      return (typeof this.alarm.value === 'number') ? this.alarm.value : null;
    },
    // Umbral efectivo (endpoint): thresholdUsed del evento/regla o del
    // forecast; null real (cross sin umbral) → "—".
    effThreshold() {
      return this.detail && typeof this.detail.threshold === 'number' ? this.detail.threshold : null;
    },
    valueText() {
      if (this.currentVal == null) return '—';
      return `${this.currentVal.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${this.alarm.unit || ''}`;
    },
    typeSubtitle() { return this.alarm ? typeLabelForMode(this.alarm.mode) : null; },
    etaText() {
      const m = this.forecast.etaMinutes;
      if (m < 90) return `${Math.round(m)} min`;
      return `${(m / 60).toFixed(1)} h`.replace('.', ',');
    },
    autonomySourceLabel() {
      return AUTONOMY_SOURCE_LABELS[this.autonomy.source] || this.autonomy.source || 'fuente desconocida';
    },
    rawJson() { return JSON.stringify(this.detail, null, 2); },
    errorMsg() {
      return this.notFound
        ? 'Alarma no encontrada (o fuera de tu alcance).'
        : 'No se pudo cargar el detalle de la alarma.';
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
    this.fetchDetail();
    this._notifHandler = () => this.fetchDetail();
    this.$nuxt.$on('wanomi:notif', this._notifHandler);
  },
  beforeDestroy() {
    if (this.themeObserver) { this.themeObserver.disconnect(); this.themeObserver = null; }
    if (this._notifHandler) this.$nuxt.$off('wanomi:notif', this._notifHandler);
  },
  methods: {
    formatDuration,
    formatTime,
    formatDateTime,
    severityLabel(s) { return SEVERITY_LABELS[s] || s; },
    headers() {
      return { headers: { token: this.$store.state.auth.token } };
    },
    siblingLast(s) {
      const pts = s.points || [];
      if (!pts.length) return '—';
      return String(pts[pts.length - 1].value) + (s.unit ? ' ' + s.unit : '');
    },
    // Mapeo hija del endpoint → objeto de alarma para AlarmCard compact.
    childAlarm(c) {
      return {
        ...c,
        kind: 'fire',
        time: c.firedAt,
        siteCode: this.alarm.siteId,
        siteName: this.alarm.siteName,
      };
    },
    goChild(c) {
      this.$router.push('/alarmas/' + c.notificationId);
    },
    async fetchDetail() {
      this.loading = true;
      this.error = false;
      this.notFound = false;
      try {
        const res = await this.$axios.get(
          `/alarms/${encodeURIComponent(this.$route.params.id)}/detail`,
          this.headers()
        );
        if (res.data.status === 'success') {
          this._fetchedAtClient = Date.now();
          this.detail = res.data.data;
          // Los charts se montan con el contenedor ya en su tamaño final;
          // el resize fuerza el ajuste si el layout cambió al renderizar.
          this.$nextTick(() => {
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
          });
        } else {
          this.error = true;
        }
      } catch (e) {
        console.error('alarm detail', e);
        this.error = true;
        this.notFound = !!(e.response && e.response.status === 404);
      } finally {
        this.loading = false;
      }
    },
    async ack() {
      if (this.ackBusy || !this.alarm || this.alarm.state !== 'active') return;
      this.ackBusy = true;
      try {
        await this.$axios.put(
          `/site/${encodeURIComponent(this.alarm.siteId)}/alarms/${this.alarm._id}/ack`,
          null,
          this.headers()
        );
        this.$notify({ type: 'success', message: this.fsmWaiting
          ? `Confirmada y cerrada: ${this.alarm.label || this.alarm.ruleId}`
          : `Reconocida: ${this.alarm.label || this.alarm.ruleId}` });
        await this.fetchDetail();
        // G1b — el cierre lo emite el edge (asíncrono): refrescar de nuevo en un momento.
        setTimeout(() => { this.fetchDetail(); }, 2000);
      } catch (e) {
        console.error('ack', e);
        this.$notify({ type: 'danger', message: 'No se pudo reconocer la alarma.' });
      } finally {
        this.ackBusy = false;
      }
    },
    // spec_grafcet_g1b (Q6) — registrar el service de mantenimiento (vida de aceite).
    async registerService() {
      if (this.serviceBusy || !this.alarm) return;
      this.serviceBusy = true;
      try {
        await this.$axios.post(
          `/site/${encodeURIComponent(this.alarm.siteId)}/alarms/${this.alarm._id}/service`,
          null,
          this.headers()
        );
        this.$notify({ type: 'success', message: 'Service registrado: el contador vuelve a cero y la alarma se cierra.' });
        await this.fetchDetail();
        setTimeout(() => { this.fetchDetail(); }, 2000);
      } catch (e) {
        console.error('service', e);
        const msg = e.response && e.response.data && e.response.data.error;
        this.$notify({ type: 'danger', message: msg || 'No se pudo registrar el service.' });
      } finally {
        this.serviceBusy = false;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.alarma-detalle { padding-bottom: 40px; }

.crumb-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.crumb-sep { opacity: 0.5; }
.alarm-link { color: #00f2c3; font-weight: 600; }
.alarm-link:hover { color: #00f2c3; text-decoration: underline; }
.btn-ghost-det {
  margin-left: auto;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: inherit;
}
body.white-content .btn-ghost-det { border-color: rgba(0, 0, 0, 0.2); }
.btn-ghost-det:hover { border-color: #00f2c3; color: #00f2c3; }

/* ===== Strip header — FIJO al scrollear (mockup: det-strip sticky).
   El navbar+tabs del layout es fixed y ocupa 118px: el strip pega debajo.
   Fondo OPACO (con alpha se vería el contenido pasar por detrás). */
.det-strip {
  position: sticky;
  top: 124px;
  z-index: 30;
  background: linear-gradient(135deg, #27293d, #2b2f4a);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 14px 20px;
  margin-bottom: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}
body.white-content .det-strip {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.12);
}
.det-strip .row1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.d-label { font-size: 17px; font-weight: 600; }
.d-sub { font-size: 12px; opacity: 0.65; margin-top: 4px; }
.det-strip .row2 { display: flex; align-items: flex-end; gap: 26px; margin-top: 12px; flex-wrap: wrap; }
.alarm-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.badge-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid;
}
.b-live { color: #fd5d93; border-color: rgba(253, 93, 147, 0.45); background: rgba(253, 93, 147, 0.12); }
.b-ack { color: #1d8cf8; border-color: rgba(29, 140, 248, 0.4); background: rgba(29, 140, 248, 0.12); }
.b-wait { color: #d98a00; border-color: rgba(255, 141, 114, 0.5); background: rgba(255, 179, 64, 0.14); }
.b-manual { color: #8898aa; border-color: rgba(136, 152, 170, 0.45); background: rgba(136, 152, 170, 0.1); }
.b-resolved { color: #00bf9a; border-color: rgba(0, 191, 154, 0.4); background: rgba(0, 191, 154, 0.12); }
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

.big-val .v { font-size: 30px; font-weight: 700; line-height: 1; }
.big-val .vs { font-size: 13px; opacity: 0.7; margin-left: 8px; }
.big-val .vs b { font-weight: 600; }
.d-clock { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.d-clock-lbl {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  opacity: 0.55;
}
.d-actions { margin-left: auto; display: flex; gap: 9px; align-items: center; }
.callout {
  margin-top: 12px;
  background: rgba(0, 242, 195, 0.06);
  border: 1px solid rgba(0, 242, 195, 0.3);
  border-left: 3px solid #00f2c3;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12.5px;
}
.callout b {
  color: #00f2c3;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  display: block;
  margin-bottom: 3px;
}
.callout span { font-style: italic; }

/* ===== Autonomía ===== */
.auto-card {
  display: flex;
  gap: 18px;
  align-items: center;
  flex-wrap: wrap;
  background: linear-gradient(135deg, rgba(29, 140, 248, 0.08), rgba(0, 242, 195, 0.05));
  border: 1px solid rgba(29, 140, 248, 0.35);
  border-radius: 10px;
  padding: 14px 18px;
  margin-bottom: 16px;
}
.auto-card .a-big { font-size: 26px; font-weight: 700; color: #1d8cf8; }
.auto-card .a-item { font-size: 11.5px; opacity: 0.7; }
.auto-card .a-item b { display: block; font-size: 15px; opacity: 1; }
.src-badge {
  margin-left: auto;
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 242, 195, 0.12);
  color: #00f2c3;
  border: 1px solid rgba(0, 242, 195, 0.4);
}

/* ===== Cards del detalle ===== */
.det-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 16px;
}
body.white-content .det-card { background: #ffffff; border-color: rgba(0, 0, 0, 0.08); }
.det-card h4 {
  font-size: 12px;
  margin: 0 0 10px;
  min-height: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.num-chip {
  background: #344675;
  color: #cfd2ee;
  border-radius: 5px;
  padding: 1px 7px;
  font-size: 10px;
}
.det-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}
@media (max-width: 1100px) { .det-row { grid-template-columns: 1fr; } }
.legend-note { font-size: 10.5px; opacity: 0.55; margin-top: 6px; }
.honest-note { font-size: 11px; opacity: 0.55; margin-top: 8px; }

/* ===== Pronóstico ===== */
.forecast-num { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; flex-wrap: wrap; }
.forecast-num .trend-ico { font-size: 20px; color: #a55eea; }
.forecast-num .big { font-size: 21px; font-weight: 700; color: #a55eea; }
.forecast-desc { font-size: 12px; opacity: 0.7; }
.forecast-empty {
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 26px;
  text-align: center;
  font-size: 12.5px;
  opacity: 0.8;
}
body.white-content .forecast-empty { border-color: rgba(0, 0, 0, 0.15); }

/* ===== Recurrencia ===== */
.rec-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.chip-rec {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 11px;
}
body.white-content .chip-rec { background: rgba(0, 0, 0, 0.04); border-color: rgba(0, 0, 0, 0.1); }

/* ===== Hermanas ===== */
.spark-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.spark {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
}
body.white-content .spark { background: rgba(0, 0, 0, 0.03); border-color: rgba(0, 0, 0, 0.08); }
.spark .s-name { font-size: 11px; opacity: 0.75; display: flex; justify-content: space-between; gap: 8px; }
.spark .s-name b { font-size: 12px; opacity: 1; }

/* ===== Metadatos ===== */
.child-click { cursor: pointer; }
.child-click:hover .alarm-card { background: rgba(0, 242, 195, 0.05); }
.collapse-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  background: none;
  border: none;
  color: inherit;
  font-size: 12.5px;
  font-weight: 600;
  padding: 0 0 4px;
  text-align: left;
}
.collapse-head .caret { transition: transform 0.18s; opacity: 0.6; }
.collapse-head.closed .caret { transform: rotate(-90deg); }
.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 26px;
  font-size: 12px;
  margin-top: 10px;
}
@media (max-width: 1100px) { .meta-grid { grid-template-columns: 1fr; } }
.meta-grid .kv {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
}
body.white-content .meta-grid .kv { border-bottom-color: rgba(0, 0, 0, 0.1); }
.meta-grid .kv span:first-child { opacity: 0.55; }
.raw-json {
  margin-top: 12px;
  font-size: 11px;
  max-height: 320px;
  overflow: auto;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  padding: 12px;
  color: inherit;
}
body.white-content .raw-json { background: rgba(0, 0, 0, 0.05); }

/* ===== Estados ===== */
.det-skel { display: flex; flex-direction: column; gap: 16px; }
.skel-block {
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  animation: skel-pulse 1.4s ease-in-out infinite;
}
body.white-content .skel-block { background: rgba(0, 0, 0, 0.05); }
@keyframes skel-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
.error-box {
  text-align: center;
  padding: 44px 16px;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 10px;
}
body.white-content .error-box { border-color: rgba(0, 0, 0, 0.15); }
</style>
