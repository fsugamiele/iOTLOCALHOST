<template>
  <!-- DEC-REF-141 · "Probar contra historial" (mockup 1:1): dispara POST
       /api/qa/backtest (proxy al worker, DEC-REF-140) y muestra el veredicto
       + histograma SVG de la distribución, con su línea de umbral.
       No evalúa nada en el front: el worker devuelve el JSON estructurado y
       acá solo se dibuja. -->
  <div class="qa-panel">
    <div class="qa-panel__h">
      <b>Probar antes de activar</b>
      <span class="qa-panel__meta">corre la regla contra {{ days }} días reales</span>
    </div>

    <div class="qa-backtest">
      <div class="qa-backtest__ctl">
        <div class="qa-backtest__desc">
          <span v-if="ruleId">Regla <code>{{ ruleId }}</code></span>
          <span v-else>Pack completo <code>{{ packId }}</code></span>
          · se corre contra el historial antes de confiar en ella.
        </div>
        <div class="qa-backtest__actions">
          <label class="qa-backtest__days">
            Días
            <input type="number" min="1" :max="maxDays" v-model.number="days" class="qa-days-input">
          </label>
          <base-button
            type="primary"
            size="sm"
            :disabled="loading || !packId"
            @click="runBacktest"
          >
            <i class="fa" :class="loading ? 'fa-spinner fa-spin' : 'fa-play'" style="margin-right:6px"></i>
            Probar contra historial
          </base-button>
        </div>
      </div>

      <!-- Error amable (worker caído / timeout / pack inexistente) — caso raro §3 -->
      <div v-if="error" class="qa-backtest__err">
        {{ error }}
      </div>

      <!-- Veredicto + histograma por regla probada -->
      <div v-else-if="results.length" class="qa-backtest__results">
        <div v-for="r in results" :key="r.ruleId" class="qa-verdict-block">
          <div class="qa-verdict" :class="verdictLevel(r.verdict)">
            {{ r.verdict }}
            <div class="qa-verdict__sub">
              {{ r.episodes }} episodio(s) · {{ formatPerDay(r.perDay) }}/día
              <template v-if="r.pctInCondition != null">
                · {{ r.pctInCondition.toFixed(0) }}% del tiempo en condición
              </template>
            </div>
          </div>

          <!-- Histograma de la distribución (si la regla tiene variable numérica). -->
          <div v-if="r.distribution && r.distribution.histogram && r.distribution.histogram.length" class="qa-hist-wrap">
            <div class="qa-chart-cap">
              <b>Distribución de {{ r.distribution.var }}.</b> Cada barra = cuántas lecturas cayeron en ese rango;
              la zona roja es cuando la alarma suena.
            </div>
            <QaHistChart
              :histogram="r.distribution.histogram" :min="r.distribution.min" :max="r.distribution.max"
              :threshold="r.threshold" :op="r.op" :variable="r.distribution.var"
            />
          </div>
          <div v-else class="qa-chart-cap qa-noserie">
            Sin serie numérica superponible para esta regla (cross/M o sin datos).
          </div>
        </div>
      </div>

      <div v-else class="qa-backtest__hint">
        Tocá "Probar contra historial" para correr la regla contra los últimos días.
      </div>
    </div>
  </div>
</template>

<script>
import QaHistChart from './QaHistChart.vue';

export default {
  name: 'QaBacktestInline',
  components: { QaHistChart },
  props: {
    packId: { type: String, default: '' },
    ruleId: { type: String, default: null },  // null = backtest de todo el pack
    initialDays: { type: Number, default: 30 },
    maxDays: { type: Number, default: 90 },
  },
  data() {
    return {
      days: this.initialDays,
      loading: false,
      error: '',
      results: [],  // rules[] del JSON del worker (verdict, episodes, perDay, distribution, threshold)
    };
  },
  methods: {
    headers() {
      return { headers: { token: this.$store.state.auth.token } };
    },
    // POST /api/qa/backtest → el baseURL de axios ya prefija /api, así que la
    // ruta en código es '/qa/backtest' (patrón del repo: /rulepacks, /me…).
    async runBacktest() {
      if (!this.packId || this.loading) return;
      this.loading = true;
      this.error = '';
      this.results = [];
      try {
        const body = { packId: this.packId, days: this.days };
        if (this.ruleId) body.ruleId = this.ruleId;
        const res = await this.$axios.post('/qa/backtest', body, this.headers());
        const data = res.data || {};
        if (data.ok === false) {
          this.error = data.error || 'El backtest no pudo completarse.';
          return;
        }
        this.results = Array.isArray(data.rules) ? data.rules : [];
        if (!this.results.length) {
          this.error = 'El worker no devolvió ninguna regla para probar.';
        }
      } catch (e) {
        // 502/504 del proxy (worker caído/timeout) u otro error → mensaje amable.
        const msg = (e.response && e.response.data && e.response.data.error)
          || 'No se pudo contactar al worker de calidad.';
        this.error = String(msg);
      } finally {
        this.loading = false;
      }
    },
    verdictLevel(verdict) {
      const v = String(verdict || '');
      if (v.includes('🔴') || v.includes('🟣')) return 'crit';
      if (v.includes('🟡')) return 'warn';
      if (v.includes('🟢')) return 'ok';
      return 'neutral';
    },
    formatPerDay(n) {
      if (n == null) return '0';
      return Number(n).toFixed(1);
    },
    fmtAxis(v) {
      if (v == null) return '';
      return Number(v).toFixed(1);
    },
    // Conteo máximo de un bin (referencia del eje Y del histograma).
    maxCount(r) {
      const bins = (r.distribution && r.distribution.histogram) || [];
      if (!bins.length) return '0';
      return Number(Math.max(...bins.map(b => b.count), 0)).toLocaleString('es-AR');
    },
    // Barras del histograma escaladas al viewBox 300x100. inAlarm = el bin cae
    // del lado "en condición" respecto del umbral (se marca rojo como el mockup).
    histBars(r) {
      const bins = (r.distribution && r.distribution.histogram) || [];
      if (!bins.length) return [];
      const maxCount = Math.max(...bins.map(b => b.count), 1);
      const W = 300, H = 100, gap = 2;
      const bw = W / bins.length;
      const th = r.threshold;
      const op = r.op || null;
      return bins.map((b, i) => {
        const h = Math.round((b.count / maxCount) * H);
        return {
          x: +(i * bw + gap / 2).toFixed(1),
          y: +(H - h).toFixed(1),
          w: +(bw - gap).toFixed(1),
          h,
          inAlarm: this.binInAlarm(b, th, op),
        };
      });
    },
    // Lado "en alarma" según el OPERADOR real de la regla (lo devuelve el
    // worker en r.op). Si el umbral cae fuera de [min,max], el lado que
    // corresponde pinta TODO el rango (todas o ninguna barra), de modo que la
    // zona roja nunca "desaparece" sin explicación. op null (cross/M) → sin zona.
    binInAlarm(bin, threshold, op) {
      if (threshold == null || op == null) return false;
      switch (op) {
        case 'gt':
        case 'gte':
          return bin.to > threshold;
        case 'lt':
        case 'lte':
          return bin.from < threshold;
        case 'eq':
        case 'neq':
          return bin.from <= threshold && bin.to >= threshold;
        default:
          return false;
      }
    },
    // Posición X de la línea de umbral dentro del viewBox, interpolada entre
    // min y max de la distribución. Null si no hay umbral o rango nulo.
    thresholdLine(r) {
      const d = r.distribution;
      if (!d || r.threshold == null) return null;
      const min = d.min, max = d.max;
      if (!(max > min)) return null;
      const t = Number(r.threshold);
      if (t < min || t > max) return null;
      const x = ((t - min) / (max - min)) * 300;
      return { x: +x.toFixed(1) };
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
.qa-backtest { padding: 16px 18px; }
.qa-backtest__ctl {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.qa-backtest__desc { font-size: 13.5px; opacity: 0.85; flex: 1; min-width: 220px; }
.qa-backtest__actions { display: flex; align-items: flex-end; gap: 12px; }
.qa-backtest__days { font-size: 12px; opacity: 0.7; display: flex; flex-direction: column; gap: 4px; }
.qa-days-input {
  width: 70px; padding: 6px 8px; border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15); background: transparent; color: inherit;
}
.qa-backtest__err {
  padding: 12px 14px; border-radius: 8px;
  background: rgba(236, 37, 13, 0.12); color: #ec250d;
  border: 1px solid rgba(236, 37, 13, 0.35); font-size: 13.5px;
}
.qa-backtest__hint, .qa-backtest__results { font-size: 13.5px; }
.qa-verdict-block { margin-bottom: 18px; }
.qa-verdict-block:last-child { margin-bottom: 0; }
.qa-verdict {
  font-weight: 700; font-size: 15px; line-height: 1.3;
  padding: 10px 14px; border-radius: 10px; display: inline-block;
}
.qa-verdict.crit { background: rgba(236, 37, 13, 0.12); color: #ec250d; border: 1px solid rgba(236, 37, 13, 0.35); }
.qa-verdict.warn { background: rgba(255, 159, 67, 0.14); color: #ff9f43; border: 1px solid rgba(255, 159, 67, 0.35); }
.qa-verdict.ok { background: rgba(0, 191, 154, 0.14); color: #00bf9a; border: 1px solid rgba(0, 191, 154, 0.35); }
.qa-verdict.neutral { background: rgba(255, 255, 255, 0.06); }
.qa-verdict__sub { font-weight: 400; font-size: 12.5px; margin-top: 4px; opacity: 0.85; }
.qa-hist-wrap { margin-top: 12px; }
.qa-chart-cap { font-size: 12px; opacity: 0.65; margin: 2px 0 8px; }
.qa-noserie { margin-top: 12px; font-style: italic; }
.qa-hist { display: block; }

.white-content .qa-panel { background: #fff; border-color: rgba(0, 0, 0, 0.09); }
.white-content .qa-panel__h { border-color: rgba(0, 0, 0, 0.08); }
.white-content .qa-days-input { border-color: rgba(0, 0, 0, 0.15); }
</style>
