<template>
  <!-- DEC-REF-141 · Ficha de hallazgo AUTOEXPLICATIVA: izquierda = el caso en
       lenguaje de operador (Problema → Qué pasa → Por qué importa → Cómo resolverlo)
       + acciones; derecha = gráficos ECharts (distribución + línea de tiempo) como
       evidencia, cada uno con su "cómo leerlo". El detalle técnico va colapsado. -->
  <div class="qa-panel" v-if="finding">
    <div class="qa-panel__h">
      <b>Hallazgo</b>
      <span class="qa-panel__meta">
        severidad {{ finding.severity === 'hard' ? 'alta' : 'baja' }}
        · visto {{ relativeTime(finding.lastSeen) }}
      </span>
    </div>

    <div class="qa-finding" :class="{ 'qa-finding--solo': !showCharts }">
      <!-- Izquierda: el caso explicado -->
      <div class="qa-finding__l">
        <h4 class="qa-problema">{{ badgeEmoji }} {{ headline }}</h4>

        <div class="qa-sec">
          <span class="qa-sec__t">Qué pasa</span>
          <p>{{ finding.suggestedAction || headline }}</p>
        </div>
        <div class="qa-sec">
          <span class="qa-sec__t">Por qué importa</span>
          <p>{{ impacto }}</p>
        </div>
        <div class="qa-sec qa-sec--fix">
          <span class="qa-sec__t">Cómo resolverlo</span>
          <p>{{ comoResolver }}</p>
        </div>

        <div class="qa-act">
          <base-button type="danger" size="sm" :disabled="busy || !finding.packId || !finding.ruleId" @click="onDisable">
            Sacar de circulación
          </base-button>
          <base-button type="primary" size="sm" :disabled="!finding.packId" @click="onOpenEditor">
            Abrir editor
          </base-button>
          <base-button type="secondary" size="sm" :disabled="busy" @click="onMute">
            Silenciar
          </base-button>
          <base-button
            v-if="finding.packId && finding.ruleId"
            type="default" size="sm" :disabled="busy" @click="onRevert"
          >
            Revertir a la original
          </base-button>
        </div>

        <!-- Detalle técnico: colapsado por defecto, para quien quiera los números crudos -->
        <div class="qa-tech">
          <a href="#" class="qa-tech__toggle" @click.prevent="showTech = !showTech">
            <i class="tim-icons" :class="showTech ? 'icon-minimal-up' : 'icon-minimal-down'"></i>
            {{ showTech ? 'Ocultar' : 'Ver' }} detalle técnico
          </a>
          <div v-if="showTech" class="qa-tech__body">
            <div class="qa-kv"><b>Tipo</b> <span>{{ typeLabel }}</span></div>
            <div class="qa-kv" v-if="finding.ruleId"><b>Regla</b> <span><code>{{ finding.ruleId }}</code></span></div>
            <div class="qa-kv" v-if="finding.dId"><b>Equipo</b> <span><code>{{ finding.dId }}</code></span></div>
            <div class="qa-kv"><b>Estado</b> <span>{{ statusLabel(finding.status) }}</span></div>
            <div v-for="(kv, i) in evidenceRows" :key="i" class="qa-kv">
              <b>{{ kv.k }}</b> <span>{{ kv.v }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Derecha: gráficos (evidencia). Se ocultan en el detalle de regla
           (showCharts=false), donde los gráficos viven en su propia sección
           "Comportamiento" → evita duplicarlos y la columna vacía. -->
      <div class="qa-finding__r" v-if="showCharts">
        <div class="qa-chart-cap">
          <b>Distribución de la medición.</b> Cada barra es cuántas veces la medición cayó en ese rango;
          la zona roja es cuando la alarma suena.
        </div>
        <div v-if="histLoading" class="qa-chart-cap qa-dim">Calculando distribución…</div>
        <div v-else-if="histError" class="qa-chart-cap qa-noserie">{{ histError }}</div>
        <QaHistChart
          v-else-if="hist && hist.histogram && hist.histogram.length"
          :histogram="hist.histogram" :min="hist.min" :max="hist.max"
          :threshold="hist.threshold" :op="hist.op" :variable="hist.variable"
        />
        <div v-else class="qa-chart-cap qa-noserie">Sin serie numérica para esta regla (combina varias condiciones o sin datos).</div>

        <div class="qa-chart-cap" style="margin-top:14px">
          <b>Línea de tiempo.</b> La curva es la medición en el tiempo; las verticales son cada vez que la
          alarma se prendió (rojo) o apagó (azul).
        </div>
        <div v-if="tlLoading" class="qa-chart-cap qa-dim">Cargando línea de tiempo…</div>
        <div v-else-if="tlError" class="qa-chart-cap qa-noserie">{{ tlError }}</div>
        <QaTimelineChart
          v-else-if="timeline && (timeline.telemetry.length || timeline.events.length)"
          :telemetry="timeline.telemetry" :events="timeline.events"
          :threshold="hist ? hist.threshold : null" :variable="timeline.variable" :hours="timeline.hours"
        />
        <div v-else class="qa-chart-cap qa-noserie">Sin mediciones ni eventos en la ventana.</div>
      </div>
    </div>
  </div>
</template>

<script>
import QaHistChart from './QaHistChart.vue';
import QaTimelineChart from './QaTimelineChart.vue';

export default {
  name: 'QaFichaHallazgo',
  components: { QaHistChart, QaTimelineChart },
  props: {
    finding: { type: Object, default: null },
    badge: { type: Object, default: null },
    timelineHours: { type: Number, default: 48 },
    histDays: { type: Number, default: 7 },
    // false → oculta la columna de gráficos (modo detalle de regla: los gráficos
    // viven en la sección "Comportamiento" aparte, no se duplican acá).
    showCharts: { type: Boolean, default: true },
  },
  data() {
    return {
      busy: false,
      showTech: false,
      // Histograma (backtest de la regla): datos CRUDOS que recibe QaHistChart.
      histLoading: false,
      histError: '',
      hist: null,  // { histogram, min, max, threshold, op, variable }
      // Línea de tiempo: datos CRUDOS que recibe QaTimelineChart.
      tlLoading: false,
      tlError: '',
      timeline: null,  // { telemetry, events, hours, variable }
    };
  },
  computed: {
    badgeEmoji() { return (this.badge && this.badge.emoji) || '⚠️'; },
    headline() {
      const map = {
        PERMANENTE: 'Esta alarma está encendida casi todo el tiempo',
        MUERTA: 'Esta regla no puede dispararse nunca',
        RUIDOSA: 'Esta alarma grita de más',
        I2: 'Esta alarma se repite sin cerrarse',
        I3: 'Esta alarma se prende y apaga sin parar',
        I5: 'Alarma encendida con la medición ya normal',
        I6: 'El valor de la alarma no coincide con la medición',
        I1: 'La alarma se cierra en el equipo equivocado',
        I4: 'Llegó un cierre sin alarma abierta',
        I7: 'Un cálculo no coincide con los datos',
        I8: 'Valor físicamente imposible',
        I13: 'La regla cambió respecto de la original',
        INGESTA: 'Un dato dejó de llegar',
      };
      const t = this.finding && this.finding.type;
      return map[t] || 'Hallazgo del supervisor de calidad';
    },
    typeLabel() {
      const map = {
        I1: 'Se cierra el equipo equivocado', I2: 'Alarma repetida', I3: 'Alarma que parpadea',
        I4: 'Cierre sin alarma abierta', I5: 'Alarma colgada', I6: 'Valor ≠ medición',
        I7: 'Cálculo desviado', I8: 'Valor imposible', I13: 'Cambió vs la original',
        MUERTA: 'Nunca dispara', PERMANENTE: 'Encendida casi siempre', RUIDOSA: 'Ruidosa',
        INGESTA: 'Dato que no llega',
      };
      const t = this.finding && this.finding.type;
      return map[t] || t || '—';
    },
    impacto() {
      const map = {
        I1: 'El equipo que falla queda sin cierre y el que no falla figura resuelto: el NOC pierde el rastro del problema real.',
        I2: 'Llegan muchos avisos repetidos de lo mismo y saturan al operador.',
        I3: 'La alarma se prende y apaga sin parar: ese ruido tapa las alarmas que sí importan.',
        I4: 'Llegan cierres que no corresponden a ninguna alarma: la señal es inconsistente.',
        I5: 'Queda una alarma encendida que ya no es real y confunde al operador.',
        I6: 'La alarma muestra un número que no es el medido: no se puede confiar en el valor.',
        I7: 'Un cálculo (autonomía/consumo) no coincide con los datos: se decide sobre un número equivocado.',
        I8: 'Un sensor informa un valor físicamente imposible: ese dato no es confiable.',
        I13: 'La regla ya no es la original: alguien la editó y puede no comportarse como se validó.',
        MUERTA: 'La alarma nunca se activa: da una falsa sensación de cobertura.',
        PERMANENTE: 'Suena casi todo el tiempo: no distingue un problema real de la operación normal.',
        RUIDOSA: 'Dispara muchas veces por día y satura al operador.',
        INGESTA: 'Dejó de llegar un dato: quedamos ciegos sobre esa medición.',
      };
      const t = this.finding && this.finding.type;
      return map[t] || 'Puede afectar la confianza en las alarmas.';
    },
    comoResolver() {
      const map = {
        I1: 'Revisar la lógica de cierre del motor. Mientras tanto, se puede sacar la regla de circulación.',
        I2: 'Revisar por qué no cierra entre un aviso y otro, o sumar un tiempo de espera entre avisos.',
        I3: 'Agregar una banda de tolerancia para que no reaccione al ruido de la medición.',
        I4: 'Revisar por qué el motor emite cierres sin una alarma abierta.',
        I5: 'Revisar la lógica de cierre: falta que la alarma se apague cuando el valor vuelve a lo normal.',
        I6: 'Revisar qué valor está publicando el motor en el aviso.',
        I7: 'Revisar la fórmula del cálculo en el motor para ese equipo.',
        I8: 'Revisar el sensor o el signo de la lectura.',
        I13: 'Si el cambio fue a propósito, guardar la versión actual como original; si no, Revertir a la original.',
        MUERTA: 'Revisar el umbral (puede estar fuera de rango) o si la condición es alcanzable. Probá con “Probar antes de activar”.',
        PERMANENTE: 'Ajustar el umbral para que avise solo ante un problema real, no en operación normal.',
        RUIDOSA: 'Subir el umbral o agregar una banda de tolerancia.',
        INGESTA: 'Revisar la conexión del equipo o si dejó de publicar esa medición.',
      };
      const t = this.finding && this.finding.type;
      return map[t] || 'Revisar la regla en el editor.';
    },
    // Evidencia cruda traducida (va en el detalle técnico colapsado).
    evidenceRows() {
      const ev = this.finding && this.finding.evidence;
      if (!ev || typeof ev !== 'object') return [];
      const out = [];
      for (const k of Object.keys(ev)) {
        const raw = ev[k];
        if (raw == null) continue;
        if (k === 'provisorio' && raw === true) { out.push({ k: 'Rango', v: 'provisorio (en calibración)' }); continue; }
        const v = this.formatEvidenceValue(k, raw);
        if (v === '' || v == null) continue;
        out.push({ k: this.evidenceLabel(k), v });
      }
      return out;
    },
  },
  watch: {
    finding: {
      immediate: true,
      handler(f) {
        this.resetCharts();
        if (f && f.ruleId) { this.loadTimeline(); this.loadHistogram(); }
      },
    },
  },
  methods: {
    headers() { return { headers: { token: this.$store.state.auth.token } }; },
    resetCharts() {
      this.hist = null; this.histError = '';
      this.timeline = null; this.tlError = '';
    },
    statusLabel(s) { return { open: 'vigente', ack: 'visto', muted: 'silenciado', resolved: 'resuelto' }[s] || s; },
    relativeTime(ts) {
      if (!ts) return '—';
      const t = new Date(ts).getTime();
      if (!Number.isFinite(t)) return '—';
      const min = Math.floor((Date.now() - t) / 60000);
      if (min < 60) return `hace ${Math.max(min, 1)} min`;
      const hs = Math.floor(min / 60);
      if (hs < 24) return `hace ${hs} h`;
      const d = Math.floor(hs / 24);
      return d === 1 ? 'ayer' : `hace ${d} d`;
    },

    // ── Evidencia en español (detalle técnico) ───────────────────────────
    evidenceLabel(k) {
      const map = {
        resolveDId: 'Equipo que cerró', resolveTime: 'Momento del cierre',
        fireAbiertoDId: 'Equipo que seguía en alarma', fireAbiertoTime: 'Alarma abierta desde',
        fireAbiertoDesde: 'Alarma abierta desde', ventanaH: 'Ventana analizada (h)',
        firesPreviosEnVentana: 'Disparos previos en la ventana', nFires: 'Cantidad de disparos',
        primerFire: 'Primer disparo', ultimoFire: 'Último disparo', ventanaMs: 'Duración de la racha',
        ciclosRapidos: 'Ciclos prende-apaga', periodoMedioSec: 'Período medio (s)',
        umbralFlapSec: 'Umbral de parpadeo (s)', variable: 'Variable', valueFire: 'Valor del disparo',
        valueData: 'Valor medido', delta: 'Diferencia', deltaRel: 'Diferencia relativa',
        fireTime: 'Momento del disparo', dataTime: 'Momento de la medición', dtMs: 'Distancia temporal',
        tolRel: 'Tolerancia relativa', tolTimeMs: 'Tolerancia temporal', ultimoValor: 'Último valor medido',
        ultimoTime: 'Última medición', umbral: 'Umbral', despejadoDesde: 'Despejada desde',
        minutosDespejado: 'Minutos ya despejada', umbralZombieMin: 'Umbral de alarma colgada (min)',
        recompute: 'Recalculado', publicado: 'Publicado por el motor', formula: 'Fórmula', insumos: 'Insumos',
        valor: 'Valor', rango: 'Rango esperado', ts: 'Momento', packId: 'Pack',
        camposDivergentes: 'Campos que cambiaron', diff: 'Diferencias', verdict: 'Veredicto',
        episodes: 'Episodios', evals: 'Evaluaciones', windowDays: 'Ventana analizada (días)',
        distribution: 'Distribución', pctInCondition: '% del tiempo en condición', perDay: 'Por día',
        lastSeen: 'Último dato recibido', cadenciaMs: 'Cada cuánto llega', gapMs: 'Hace cuánto no llega',
      };
      return map[k] || this.humanize(k);
    },
    humanize(k) {
      const s = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
      return s ? s.charAt(0).toUpperCase() + s.slice(1) : k;
    },
    formatEvidenceValue(k, raw) {
      if (this.isDateKey(k) && typeof raw === 'number' && raw > 1e12) return new Date(raw).toLocaleString('es-AR');
      if (/Ms$/.test(k) && typeof raw === 'number') return this.fmtDuration(raw);
      if (typeof raw === 'number') return Number(raw).toLocaleString('es-AR', { maximumFractionDigits: 4 });
      if (typeof raw === 'object') return this.fmtObject(k, raw);
      return String(raw);
    },
    isDateKey(k) { return /(Time|Desde|lastSeen|firstSeen)$/.test(k) || k === 'ts'; },
    fmtDuration(ms) {
      const s = Math.round(ms / 1000);
      if (s < 90) return `${s} s`;
      const m = Math.round(s / 60);
      if (m < 90) return `${m} min`;
      return `${(m / 60).toFixed(1)} h`;
    },
    fmtObject(k, obj) {
      if (Array.isArray(obj)) {
        return obj.map(it => (it && typeof it === 'object' && 'campo' in it)
          ? `${it.campo}: ${this.compact(it.deFabrica)} → ${this.compact(it.actual)}`
          : this.compact(it)).join(' · ');
      }
      if (k === 'umbral' && obj.op != null) return `${this.opText(obj.op)} ${this.compact(obj.value)}`;
      if (k === 'rango') {
        const min = obj.min == null ? '−∞' : this.compact(obj.min);
        const max = obj.max == null ? '∞' : this.compact(obj.max);
        return `entre ${min} y ${max}`;
      }
      return Object.keys(obj).map(kk => `${this.humanize(kk)}: ${this.compact(obj[kk])}`).join(' · ');
    },
    compact(v) {
      if (v == null) return '—';
      if (typeof v === 'number') return Number(v).toLocaleString('es-AR', { maximumFractionDigits: 4 });
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    },
    opText(op) { return { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠' }[op] || op; },

    // ── Carga de datos (igual que antes; ahora se guardan CRUDOS) ─────────
    async loadTimeline() {
      const f = this.finding;
      if (!f || !f.ruleId) return;
      this.tlLoading = true; this.tlError = '';
      try {
        const params = { hours: this.timelineHours };
        if (f.dId) params.dId = f.dId;
        const res = await this.$axios.get(`/qa/rule/${encodeURIComponent(f.ruleId)}/timeline`, { ...this.headers(), params });
        const data = (res.data && res.data.data) || {};
        this.timeline = {
          telemetry: Array.isArray(data.telemetry) ? data.telemetry : [],
          events: Array.isArray(data.events) ? data.events : [],
          hours: data.hours || this.timelineHours,
          variable: data.variable || '',
        };
      } catch (e) {
        this.tlError = (e.response && e.response.data && e.response.data.error) || 'No se pudo cargar la línea de tiempo.';
      } finally {
        this.tlLoading = false;
      }
    },
    async loadHistogram() {
      const f = this.finding;
      if (!f || !f.ruleId || !f.packId) {
        this.histError = 'Sin pack asociado: no se puede calcular la distribución.';
        return;
      }
      this.histLoading = true; this.histError = '';
      try {
        const res = await this.$axios.post('/qa/backtest', { packId: f.packId, ruleId: f.ruleId, days: this.histDays }, this.headers());
        const data = res.data || {};
        if (data.ok === false) { this.histError = data.error || 'El backtest no devolvió datos.'; return; }
        const rule = (data.rules || []).find(r => r.ruleId === f.ruleId) || (data.rules || [])[0];
        if (!rule || !rule.distribution || !rule.distribution.histogram || !rule.distribution.histogram.length) { this.hist = null; return; }
        const d = rule.distribution;
        this.hist = { histogram: d.histogram, min: d.min, max: d.max, threshold: rule.threshold, op: rule.op || null, variable: d.var || '' };
      } catch (e) {
        this.histError = (e.response && e.response.data && e.response.data.error) || 'No se pudo calcular la distribución (worker de calidad).';
      } finally {
        this.histLoading = false;
      }
    },

    // ── Acciones (emiten al padre, que posee el token y recarga) ──────────
    onDisable() { this.busy = true; this.$emit('disable-rule', { packId: this.finding.packId, ruleId: this.finding.ruleId, done: () => { this.busy = false; } }); },
    onMute() { this.busy = true; this.$emit('mute-finding', { id: this.finding._id, done: () => { this.busy = false; } }); },
    onRevert() { this.busy = true; this.$emit('revert-rule', { packId: this.finding.packId, ruleId: this.finding.ruleId, done: () => { this.busy = false; } }); },
    onOpenEditor() { this.$router.push(`/rulepacks/${encodeURIComponent(this.finding.packId)}`); },
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
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 15px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.qa-panel__meta { font-size: 12.5px; opacity: 0.65; }
.qa-finding { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 0; }
.qa-finding--solo { grid-template-columns: 1fr; }
.qa-finding--solo .qa-finding__l { border-right: 0; }
.qa-finding__l { padding: 16px 18px; border-right: 1px solid rgba(255, 255, 255, 0.1); }
.qa-finding__r { padding: 16px 18px; background: rgba(0, 191, 154, 0.04); }
.qa-problema { margin: 0 0 14px; font-size: 17px; line-height: 1.3; }
.qa-sec { margin-bottom: 12px; }
.qa-sec__t {
  display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
  font-weight: 600; color: #00bf9a; margin-bottom: 3px;
}
.qa-sec p { margin: 0; font-size: 13.5px; line-height: 1.45; }
.qa-sec--fix p { font-weight: 500; }
.qa-act { margin: 16px 0 6px; display: flex; gap: 8px; flex-wrap: wrap; }
.qa-tech { margin-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 8px; }
.qa-tech__toggle { font-size: 12.5px; opacity: 0.75; cursor: pointer; }
.qa-tech__toggle i { font-size: 12px; margin-right: 4px; }
.qa-tech__body { margin-top: 8px; }
.qa-kv { font-size: 12.5px; margin: 4px 0; display: flex; gap: 8px; }
.qa-kv b { min-width: 150px; opacity: 0.6; font-weight: 500; }
.qa-chart-cap { font-size: 12px; opacity: 0.75; margin: 2px 0 6px; line-height: 1.4; }
.qa-chart-cap b { opacity: 1; }
.qa-noserie { font-style: italic; opacity: 0.6; }
.qa-dim { opacity: 0.5; }

.white-content .qa-panel { background: #fff; border-color: rgba(0, 0, 0, 0.09); }
.white-content .qa-panel__h { border-color: rgba(0, 0, 0, 0.08); }
.white-content .qa-finding__l { border-color: rgba(0, 0, 0, 0.08); }
.white-content .qa-tech { border-color: rgba(0, 0, 0, 0.08); }

@media (max-width: 900px) {
  .qa-finding { grid-template-columns: 1fr; }
  .qa-finding__l { border-right: 0; border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
}
</style>
