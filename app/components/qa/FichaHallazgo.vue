<template>
  <!-- DEC-REF-141 · Ficha de hallazgo (mockup 1:1): columna izquierda con la
       evidencia inspeccionable (el "por qué") + acciones a un clic; columna
       derecha con histograma de distribución (del backtest de la regla) + línea
       de tiempo de eventos/telemetría (GET /api/qa/rule/:ruleId/timeline).
       Principio de diseño: mostrar el dato, no solo el veredicto. -->
  <div class="qa-panel" v-if="finding">
    <div class="qa-panel__h">
      <b>Hallazgo · {{ title }}</b>
      <span class="qa-panel__meta">
        severidad {{ finding.severity === 'hard' ? 'alta' : 'baja' }}
        · visto {{ relativeTime(finding.lastSeen) }}
      </span>
    </div>

    <div class="qa-finding">
      <!-- Izquierda: evidencia + acciones -->
      <div class="qa-finding__l">
        <h4>{{ badgeEmoji }} {{ headline }}</h4>
        <p class="qa-why" v-if="finding.suggestedAction">{{ finding.suggestedAction }}</p>

        <!-- Evidencia: se listan los pares clave/valor del objeto `evidence`
             (su forma la define cada check; acá se presenta tal cual, sin
             interpretar). -->
        <div v-if="evidenceRows.length">
          <div v-for="(kv, i) in evidenceRows" :key="i" class="qa-kv">
            <b>{{ kv.k }}</b> <span>{{ kv.v }}</span>
          </div>
        </div>
        <p v-else class="qa-why">Este hallazgo no trae evidencia numérica asociada.</p>

        <div class="qa-kv"><b>Tipo</b> <span>{{ finding.type }}</span></div>
        <div class="qa-kv" v-if="finding.ruleId"><b>Regla</b> <span><code>{{ finding.ruleId }}</code></span></div>
        <div class="qa-kv" v-if="finding.dId"><b>Dispositivo</b> <span><code>{{ finding.dId }}</code></span></div>
        <div class="qa-kv"><b>Estado</b> <span>{{ statusLabel(finding.status) }}</span></div>

        <div class="qa-act">
          <base-button type="danger" size="sm" :disabled="busy || !finding.packId || !finding.ruleId" @click="onDisable">
            Sacar de circulación
          </base-button>
          <base-button type="primary" size="sm" :disabled="!finding.packId" @click="onOpenEditor">
            Abrir editor con los datos
          </base-button>
          <base-button type="secondary" size="sm" :disabled="busy" @click="onMute">
            Silenciar hallazgo
          </base-button>
          <base-button
            v-if="finding.packId && finding.ruleId"
            type="default" size="sm" :disabled="busy" @click="onRevert"
          >
            Revertir a la original
          </base-button>
        </div>
      </div>

      <!-- Derecha: gráficos -->
      <div class="qa-finding__r">
        <!-- Histograma: viene del backtest on-demand de ESTA regla. -->
        <div class="qa-chart-cap">
          Distribución de la variable (backtest {{ histDays }} d) · la zona roja es "en alarma"
        </div>
        <div v-if="histLoading" class="qa-chart-cap qa-dim">Calculando distribución…</div>
        <div v-else-if="histError" class="qa-chart-cap qa-noserie">{{ histError }}</div>
        <svg v-else-if="histBars.length" viewBox="0 0 300 120" width="100%" height="120" class="qa-chart">
          <g>
            <rect
              v-for="(b, i) in histBars"
              :key="i"
              :x="b.x" :y="b.y" :width="b.w" :height="b.h"
              :fill="b.inAlarm ? 'rgba(236,37,13,0.65)' : '#00bf9a'"
            />
          </g>
          <template v-if="histThresholdX != null">
            <line :x1="histThresholdX" y1="4" :x2="histThresholdX" y2="100" stroke="#ec250d" stroke-width="2" stroke-dasharray="4 3"/>
            <text :x="histThresholdX - 2" y="14" text-anchor="end" font-size="10" fill="#ec250d" font-family="JetBrains Mono">
              umbral {{ histThreshold }}
            </text>
          </template>
          <text x="4" y="115" font-size="9" fill="#9a9a9a" font-family="JetBrains Mono">{{ fmtAxis(histMin) }}</text>
          <text x="296" y="115" text-anchor="end" font-size="9" fill="#9a9a9a" font-family="JetBrains Mono">{{ fmtAxis(histMax) }}</text>
        </svg>
        <div v-else class="qa-chart-cap qa-noserie">Sin serie numérica para esta regla (cross/M o sin datos).</div>

        <!-- Línea de tiempo: fires/resolves de la regla (y telemetría si la hay). -->
        <div class="qa-chart-cap" style="margin-top:12px">
          Línea de tiempo ({{ timelineHours }} h) · se ve la repetición
        </div>
        <div v-if="tlLoading" class="qa-chart-cap qa-dim">Cargando línea de tiempo…</div>
        <div v-else-if="tlError" class="qa-chart-cap qa-noserie">{{ tlError }}</div>
        <svg v-else-if="timelineEvents.length" viewBox="0 0 300 24" width="100%" height="24" class="qa-chart">
          <line x1="0" y1="12" x2="300" y2="12" stroke="rgba(150,150,150,0.5)" stroke-width="1"/>
          <g>
            <rect
              v-for="(ev, i) in timelineMarks"
              :key="i"
              :x="ev.x" y="5" width="2" height="14"
              :fill="ev.kind === 'resolve' ? '#2b64a6' : '#ec250d'"
            />
          </g>
        </svg>
        <div v-else class="qa-chart-cap qa-noserie">Sin eventos en la ventana.</div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'QaFichaHallazgo',
  props: {
    // finding = un elemento de GET /api/qa/findings (type, severity, ruleId,
    // packId, dId, variable, evidence, suggestedAction, firstSeen, lastSeen,
    // count, status). `badge` opcional (viene del inventario) para el emoji.
    finding: { type: Object, default: null },
    badge: { type: Object, default: null },
    timelineHours: { type: Number, default: 24 },
    histDays: { type: Number, default: 30 },
  },
  data() {
    return {
      busy: false,
      // Histograma (backtest de la regla del hallazgo)
      histLoading: false,
      histError: '',
      histBars: [],
      histThreshold: null,
      histThresholdX: null,
      histMin: null,
      histMax: null,
      // Timeline
      tlLoading: false,
      tlError: '',
      timelineEvents: [],
      timelineMarks: [],
    };
  },
  computed: {
    title() {
      if (!this.finding) return '';
      return this.finding.ruleId || this.finding.type || 'hallazgo';
    },
    badgeEmoji() {
      return (this.badge && this.badge.emoji) || '⚠️';
    },
    headline() {
      // Titular legible por tipo de hallazgo (los más comunes del mockup).
      const t = this.finding && this.finding.type;
      const map = {
        PERMANENTE: 'Esta alarma está encendida casi todo el tiempo',
        MUERTA: 'Esta regla no puede dispararse nunca',
        RUIDOSA: 'Esta alarma grita de más',
        I2: 'Esta alarma grita de más',
        I3: 'Esta alarma se prende y apaga sin parar',
        I5: 'Alarma zombie: abierta con la condición ya despejada',
        I6: 'El valor de la alarma no coincide con la telemetría',
        I1: 'Se cierra con el equipo equivocado',
      };
      return map[t] || 'Hallazgo del supervisor de calidad';
    },
    // Aplana el objeto `evidence` (Mixed) a filas clave/valor presentables.
    evidenceRows() {
      const ev = this.finding && this.finding.evidence;
      if (!ev || typeof ev !== 'object') return [];
      const out = [];
      for (const k of Object.keys(ev)) {
        const raw = ev[k];
        let v;
        if (raw == null) continue;
        if (typeof raw === 'object') v = JSON.stringify(raw);
        else if (typeof raw === 'number') v = Number(raw).toLocaleString('es-AR');
        else v = String(raw);
        out.push({ k, v });
      }
      return out;
    },
  },
  watch: {
    // Al cambiar el hallazgo seleccionado, recargar sus dos gráficos.
    finding: {
      immediate: true,
      handler(f) {
        this.resetCharts();
        if (f && f.ruleId) {
          this.loadTimeline();
          this.loadHistogram();
        }
      },
    },
  },
  methods: {
    headers() {
      return { headers: { token: this.$store.state.auth.token } };
    },
    resetCharts() {
      this.histBars = [];
      this.histError = '';
      this.histThreshold = null;
      this.histThresholdX = null;
      this.histMin = this.histMax = null;
      this.timelineEvents = [];
      this.timelineMarks = [];
      this.tlError = '';
    },
    statusLabel(s) {
      return { open: 'vigente', ack: 'visto', muted: 'silenciado', resolved: 'resuelto' }[s] || s;
    },
    fmtAxis(v) { return v == null ? '' : Number(v).toFixed(1); },
    relativeTime(ts) {
      if (!ts) return '—';
      const t = new Date(ts).getTime();
      if (!Number.isFinite(t)) return '—';
      const diff = Date.now() - t;
      const min = Math.floor(diff / 60000);
      if (min < 60) return `hace ${Math.max(min, 1)} min`;
      const hs = Math.floor(min / 60);
      if (hs < 24) return `hace ${hs} h`;
      const d = Math.floor(hs / 24);
      return d === 1 ? 'ayer' : `hace ${d} d`;
    },

    // ── Línea de tiempo: GET /api/qa/rule/:ruleId/timeline?dId&hours ──────
    async loadTimeline() {
      const f = this.finding;
      if (!f || !f.ruleId) return;
      this.tlLoading = true;
      this.tlError = '';
      try {
        const params = { hours: this.timelineHours };
        if (f.dId) params.dId = f.dId;
        const res = await this.$axios.get(
          `/qa/rule/${encodeURIComponent(f.ruleId)}/timeline`,
          { ...this.headers(), params }
        );
        const data = (res.data && res.data.data) || {};
        this.timelineEvents = Array.isArray(data.events) ? data.events : [];
        this.timelineMarks = this.buildTimelineMarks(this.timelineEvents, data.hours || this.timelineHours);
      } catch (e) {
        // caso raro §3/§4: worker/datos ausentes → mensaje amable, sin romper.
        const msg = (e.response && e.response.data && e.response.data.error) || 'No se pudo cargar la línea de tiempo.';
        this.tlError = String(msg);
      } finally {
        this.tlLoading = false;
      }
    },
    // Convierte timestamps de eventos a marcas X dentro del viewBox (300 ancho).
    buildTimelineMarks(events, hours) {
      if (!events.length) return [];
      const now = Date.now();
      const span = (hours || 24) * 3600 * 1000;
      const start = now - span;
      return events.map(ev => {
        const t = new Date(ev.time).getTime();
        const frac = Math.min(1, Math.max(0, (t - start) / span));
        return { x: +(frac * 298 + 1).toFixed(1), kind: ev.kind || 'fire' };
      });
    },

    // ── Histograma: POST /api/qa/backtest de la regla del hallazgo ───────
    async loadHistogram() {
      const f = this.finding;
      if (!f || !f.ruleId || !f.packId) {
        // Sin packId no se puede correr el backtest de la regla puntual.
        this.histError = 'Sin pack asociado: no se puede calcular la distribución.';
        return;
      }
      this.histLoading = true;
      this.histError = '';
      try {
        const res = await this.$axios.post(
          '/qa/backtest',
          { packId: f.packId, ruleId: f.ruleId, days: this.histDays },
          this.headers()
        );
        const data = res.data || {};
        if (data.ok === false) {
          this.histError = data.error || 'El backtest no devolvió datos.';
          return;
        }
        const rule = (data.rules || []).find(r => r.ruleId === f.ruleId) || (data.rules || [])[0];
        if (!rule || !rule.distribution || !rule.distribution.histogram || !rule.distribution.histogram.length) {
          this.histBars = [];  // cae al "sin serie" del template
          return;
        }
        this.buildHistogram(rule);
      } catch (e) {
        const msg = (e.response && e.response.data && e.response.data.error) || 'No se pudo calcular la distribución (worker de calidad).';
        this.histError = String(msg);
      } finally {
        this.histLoading = false;
      }
    },
    buildHistogram(rule) {
      const d = rule.distribution;
      const bins = d.histogram;
      this.histMin = d.min;
      this.histMax = d.max;
      this.histThreshold = rule.threshold;
      const maxCount = Math.max(...bins.map(b => b.count), 1);
      const W = 300, H = 100, gap = 2;
      const bw = W / bins.length;
      const th = rule.threshold;
      this.histBars = bins.map((b, i) => {
        const h = Math.round((b.count / maxCount) * H);
        return {
          x: +(i * bw + gap / 2).toFixed(1),
          y: +(H - h).toFixed(1),
          w: +(bw - gap).toFixed(1),
          h,
          inAlarm: th != null && b.to >= th,
        };
      });
      // Línea de umbral interpolada.
      if (th != null && d.max > d.min && th >= d.min && th <= d.max) {
        this.histThresholdX = +(((th - d.min) / (d.max - d.min)) * 300).toFixed(1);
      } else {
        this.histThresholdX = null;
      }
    },

    // ── Acciones (a endpoints reales) ────────────────────────────────────
    // Todas emiten al padre (que posee el token y recarga tras éxito/fallo),
    // menos "abrir editor" que es navegación pura.
    onDisable() {
      this.busy = true;
      this.$emit('disable-rule', {
        packId: this.finding.packId,
        ruleId: this.finding.ruleId,
        done: () => { this.busy = false; },
      });
    },
    onMute() {
      this.busy = true;
      this.$emit('mute-finding', {
        id: this.finding._id,
        done: () => { this.busy = false; },
      });
    },
    onRevert() {
      this.busy = true;
      this.$emit('revert-rule', {
        packId: this.finding.packId,
        ruleId: this.finding.ruleId,
        done: () => { this.busy = false; },
      });
    },
    onOpenEditor() {
      // Link al editor existente del pack (DEC-REF-141 §4).
      this.$router.push(`/rulepacks/${encodeURIComponent(this.finding.packId)}`);
    },
  },
};
</script>

<style scoped>
.qa-panel {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  margin-bottom: 18px;
  overflow: hidden;
}
.qa-panel__h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.qa-panel__meta { font-size: 12.5px; opacity: 0.65; }
.qa-finding {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 0;
}
.qa-finding__l { padding: 16px 18px; border-right: 1px solid rgba(255, 255, 255, 0.1); }
.qa-finding__r { padding: 16px 18px; background: rgba(0, 191, 154, 0.04); }
.qa-finding h4 { margin: 0 0 6px; font-size: 16px; }
.qa-why { opacity: 0.7; font-size: 13.5px; margin: 0 0 12px; }
.qa-kv { font-size: 13px; margin: 4px 0; display: flex; gap: 8px; }
.qa-kv b { min-width: 130px; opacity: 0.6; font-weight: 500; }
.qa-act { margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; }
.qa-chart-cap { font-size: 12px; opacity: 0.65; margin: 2px 0 8px; }
.qa-noserie { font-style: italic; }
.qa-dim { opacity: 0.5; }
.qa-chart { display: block; }

.white-content .qa-panel { background: #fff; border-color: rgba(0, 0, 0, 0.09); }
.white-content .qa-panel__h { border-color: rgba(0, 0, 0, 0.08); }
.white-content .qa-finding__l { border-color: rgba(0, 0, 0, 0.08); }

@media (max-width: 900px) {
  .qa-finding { grid-template-columns: 1fr; }
  .qa-finding__l { border-right: 0; border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
}
</style>
