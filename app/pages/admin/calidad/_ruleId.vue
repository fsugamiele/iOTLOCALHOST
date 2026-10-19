<template>
  <!-- DEC-REF-144 · Detalle de una regla del Supervisor de Calidad (solo
       superadmin). 4 secciones EN ORDEN (mockup inventario+detalle):
         1 · Estado de calidad   — FichaHallazgo con el hallazgo de mayor prioridad
         2 · Comportamiento      — QaHistChart (backtest) + QaTimelineChart (timeline)
         3 · Pronóstico          — QaForecastChart + note en llano + acción anticipada
         4 · Configuración/proc. — condición, umbral vs ficha, tipo, editar/revertir
       Toda la data sale de /api/qa/*; el front NO evalúa nada del motor. -->
  <div>
    <!-- Breadcrumb a /admin/calidad -->
    <div class="row">
      <div class="col-12">
        <div class="qa-crumbs">
          <nuxt-link to="/admin/calidad">Inventario</nuxt-link>
          <span class="qa-crumbs__sep">›</span>
          <span>{{ detail ? (detail.label || ruleId) : ruleId }}</span>
        </div>
      </div>
    </div>

    <!-- Estado de carga / re-chequeo /me -->
    <div class="row" v-if="!ready || loading">
      <div class="col-12">
        <card>
          <p class="text-muted mb-0">Cargando el detalle de la regla…</p>
        </card>
      </div>
    </div>

    <!-- caso raro §6.1: ruleId inexistente → 404 del detail -->
    <div class="row" v-else-if="notFound">
      <div class="col-12">
        <card>
          <div class="text-center" style="padding:18px">
            <i class="tim-icons icon-alert-circle-exc" style="font-size:2rem; color:#ff9f43"></i>
            <h4 class="mt-2 mb-1">Regla no encontrada</h4>
            <p class="text-muted mb-2">No existe una regla <code>{{ ruleId }}</code> en el inventario.</p>
            <base-button type="primary" size="sm" @click="$router.push('/admin/calidad')">
              Volver al inventario
            </base-button>
          </div>
        </card>
      </div>
    </div>

    <template v-else-if="detail">
      <!-- Cabecera: nombre + badge + estado de circulación -->
      <div class="row">
        <div class="col-12">
          <div class="qa-det-h">
            <h3 class="mb-0">{{ detail.label || ruleId }}</h3>
            <span v-if="detail.badge" class="qa-badge" :class="'b-' + detail.badge.key">
              {{ detail.badge.emoji }} {{ detail.badge.label }}
            </span>
            <span class="qa-badge qa-badge--ghost">
              {{ detail.enabled ? 'en circulación ✓' : 'fuera de circulación' }}
            </span>
          </div>
          <div class="qa-det-sub">
            <code>{{ ruleId }}</code>
            <template v-if="detail.deviceType"> · {{ detail.deviceType }}</template>
            <template v-if="detail.variable"> · dato observado: {{ detail.variable }}</template>
          </div>
        </div>
      </div>

      <!-- 1 · ESTADO DE CALIDAD -->
      <div class="row">
        <div class="col-12">
          <FichaHallazgo
            v-if="topFinding"
            :finding="topFinding"
            :badge="detail.badge"
            :show-charts="false"
            @disable-rule="onDisableRule"
            @mute-finding="onMuteFinding"
            @revert-rule="onRevertRule"
          />
          <!-- caso raro §6.2: sin findings → la regla se comporta bien -->
          <div v-else class="qa-panel">
            <div class="qa-panel__h"><b>Estado de calidad</b></div>
            <div class="text-center" style="padding:18px">
              <i class="tim-icons icon-check-2" style="font-size:2rem; color:#00bf9a"></i>
              <h4 class="mt-2 mb-1">🟢 Sin hallazgos</h4>
              <p class="text-muted mb-0">Esta regla se comporta bien.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 2 · COMPORTAMIENTO -->
      <div class="row">
        <div class="col-12">
          <div class="qa-panel">
            <div class="qa-panel__h">
              <b>Comportamiento</b>
              <span class="qa-panel__meta">distribución + línea de tiempo</span>
            </div>
            <div class="qa-behave">
              <div class="qa-behave__col">
                <div class="qa-chart-cap">
                  <b>Distribución de la medición.</b> Cada barra es cuántas veces la medición cayó en ese
                  rango; la zona roja es cuando la alarma suena.
                </div>
                <div v-if="histLoading" class="qa-chart-cap qa-dim">Calculando distribución…</div>
                <div v-else-if="histError" class="qa-chart-cap qa-noserie">{{ histError }}</div>
                <QaHistChart
                  v-else-if="hist && hist.histogram && hist.histogram.length"
                  :histogram="hist.histogram" :min="hist.min" :max="hist.max"
                  :threshold="hist.threshold" :op="hist.op" :variable="hist.variable"
                />
                <div v-else class="qa-chart-cap qa-noserie">
                  Sin serie numérica para esta regla (combina varias condiciones o sin datos).
                </div>
              </div>
              <div class="qa-behave__col">
                <div class="qa-chart-cap">
                  <b>Línea de tiempo.</b> La curva es la medición en el tiempo; las verticales son cada vez
                  que la alarma se prendió (rojo) o apagó (azul).
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
        </div>
      </div>

      <!-- 2b · PROBAR ANTES DE ACTIVAR (backtest on-demand de esta regla) -->
      <div class="row" v-if="detail.packId">
        <div class="col-12">
          <BacktestInline :pack-id="detail.packId" :rule-id="ruleId" :initial-days="7" />
        </div>
      </div>

      <!-- 3 · PRONÓSTICO -->
      <div class="row">
        <div class="col-12">
          <div class="qa-panel">
            <div class="qa-panel__h">
              <b>Pronóstico</b>
              <span class="qa-panel__meta">proyección de tendencia · NO es certeza</span>
            </div>
            <div class="qa-fore">
              <div v-if="forecastLoading" class="qa-chart-cap qa-dim">Calculando el pronóstico…</div>
              <div v-else-if="forecastError" class="qa-chart-cap qa-noserie">{{ forecastError }}</div>
              <!-- caso raro §6.3/§6.5: no aplicable → mostrar la reason, el resto vive -->
              <template v-else-if="forecast && !forecast.applicable">
                <div class="qa-fore__na">
                  <i class="tim-icons icon-sound-wave" style="color:#8a8a9a"></i>
                  <span>Sin pronóstico aplicable: {{ forecast.reason || 'esta regla no sigue una medición numérica.' }}</span>
                </div>
              </template>
              <template v-else-if="forecast">
                <QaForecastChart
                  :historical="forecast.historical || []"
                  :projection="forecast.projection || []"
                  :threshold="forecast.threshold"
                  :variable="forecast.variable"
                  :note="forecast.note"
                />
                <div class="qa-fore__note">
                  <span class="qa-fore__t">▲ Proyección</span>
                  <p class="mb-1">{{ forecast.note || 'Proyección de la tendencia reciente.' }}</p>
                  <p class="qa-fore__reco mb-0" v-if="forecastAction">
                    Acción anticipada sugerida: <b>{{ forecastAction }}</b>
                  </p>
                </div>
                <div class="qa-chart-cap qa-dim" style="margin-top:8px">
                  línea llena = medido · punteada = proyección · zona celeste = margen
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 4 · CONFIGURACIÓN Y PROCEDENCIA -->
      <div class="row">
        <div class="col-12">
          <div class="qa-panel">
            <div class="qa-panel__h"><b>Configuración y procedencia</b></div>
            <div class="qa-cfg">
              <div class="qa-kv">
                <b>Condición</b>
                <span v-if="detail.condition">
                  {{ detail.variable || 'valor' }}
                  <code>{{ opText(detail.condition.op) }} {{ detail.condition.value }}</code>
                  <template v-if="detail.condition.deadband != null"> · banda ±{{ detail.condition.deadband }}</template>
                </span>
                <span v-else>combina varias condiciones (sin umbral simple)</span>
              </div>
              <div class="qa-kv">
                <b>Umbral vs ficha</b>
                <span v-if="fichaLimit">
                  ficha sugiere {{ opText(fichaLimit.op) }} {{ fichaLimit.value
                  }}<template v-if="fichaLimit.unit"> {{ fichaLimit.unit }}</template>
                  · este sitio usa
                  <template v-if="detail.condition">{{ opText(detail.condition.op) }} {{ detail.condition.value }}</template>
                  <template v-else>—</template>
                </span>
                <span v-else>sin nominal de ficha para esta variable</span>
              </div>
              <div class="qa-kv">
                <b>Tipo</b>
                <span>{{ typeLabel(detail.type) }}</span>
              </div>
              <div class="qa-kv" v-if="detail.fichaNominal && detail.fichaNominal.factoryRange">
                <b>Rango de fábrica</b>
                <span>{{ factoryRangeText(detail.fichaNominal.factoryRange) }}</span>
              </div>
              <div class="qa-cfg__acts">
                <base-button type="primary" size="sm" :disabled="!detail.packId" @click="onOpenEditor">
                  Abrir en el editor
                </base-button>
                <base-button
                  type="default" size="sm"
                  :disabled="revertBusy || !detail.packId"
                  @click="onRevertFromConfig"
                >
                  Revertir a la de fábrica
                </base-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import FichaHallazgo from '@/components/qa/FichaHallazgo.vue';
import QaHistChart from '@/components/qa/QaHistChart.vue';
import QaTimelineChart from '@/components/qa/QaTimelineChart.vue';
import QaForecastChart from '@/components/qa/QaForecastChart.vue';
import BacktestInline from '@/components/qa/BacktestInline.vue';

// DEC-REF-144 — página de detalle superadmin. Mismo guard que el índice:
//   middleware ['authenticated','superadmin'] + re-chequeo fresco /me (Capa 2).
// La autorización REAL vive server-side (checkAuth + isSuperadmin en qa.js).
export default {
  name: 'admin-calidad-detalle',
  middleware: ['authenticated', 'superadmin'],
  components: {
    FichaHallazgo,
    QaHistChart,
    QaTimelineChart,
    QaForecastChart,
    BacktestInline,
  },
  data() {
    return {
      loading: true,
      ready: false,     // true tras pasar el re-chequeo /me
      notFound: false,  // true si el detail devolvió 404 (regla inexistente)
      detail: null,     // GET /qa/rule/:id/detail
      // Pronóstico (sección 3).
      forecast: null,
      forecastLoading: false,
      forecastError: '',
      // Distribución (sección 2 · backtest de la regla).
      hist: null,
      histLoading: false,
      histError: '',
      // Línea de tiempo (sección 2).
      timeline: null,
      tlLoading: false,
      tlError: '',
      // Config (sección 4).
      revertBusy: false,
      // Ventanas de los charts (mismas que la ficha previa).
      histDays: 7,
      timelineHours: 48,
    };
  },
  computed: {
    // keep-alive: esta instancia es de UNA ruta; queda fija aunque la ruta global cambie
    // (si no, en segundo plano consulta con el parámetro de otra página → 404 / datos ajenos).
    ruleId() {
      if (this._paramFijo === undefined) this._paramFijo = this.$route.params.ruleId;
      return this._paramFijo;
    },
    // Hallazgo de mayor prioridad: la API ya ordena por prioridad/lastSeen, así
    // que el primero del array alcanza (el badge del detail ya es el de mayor
    // prioridad por regla — mismo criterio que /inventory).
    topFinding() {
      const fs = (this.detail && this.detail.findings) || [];
      if (!fs.length) return null;
      // Mayor prioridad (mismo orden que el badge del header) → el hallazgo mostrado
      // concuerda con el badge, en vez de tomar un findings[0] cualquiera.
      const rank = { MUERTA: 0, PERMANENTE: 1, RUIDOSA: 2, I2: 2, I3: 3, I5: 4, I6: 5, I1: 6, I4: 7 };
      const r = t => (rank[t] != null ? rank[t] : 99);
      return fs.slice().sort((a, b) => r(a.type) - r(b.type))[0];
    },
    // dId representativo para charts/forecast: el del hallazgo, si lo hay.
    dId() {
      return (this.topFinding && this.topFinding.dId) || null;
    },
    // Primer límite de la ficha para comparar contra el umbral del sitio.
    fichaLimit() {
      const fn = this.detail && this.detail.fichaNominal;
      const limits = (fn && fn.limits) || [];
      return limits.length ? limits[0] : null;
    },
    // Acción anticipada sugerida (lenguaje llano). Si el pronóstico prevé un
    // cruce, lo encuadra como "antes de que…"; si no, texto neutro.
    forecastAction() {
      const f = this.forecast;
      if (!f || !f.applicable) return '';
      const hasCross = f.crossing && f.crossing.etaHours != null;
      if (hasCross) {
        return 'verificar el equipo antes de que la medición alcance el umbral';
      }
      return '';
    },
  },
  async mounted() {
    const ok = await this.revalidateSuperadmin();
    if (!ok) return;
    this.ready = true;
    await this.loadDetail();
    this.loading = false;
    // Si la regla existe, cargar charts + pronóstico (cada uno degrada solo).
    if (this.detail && !this.notFound) {
      this.loadHistogram();
      this.loadTimeline();
      this.loadForecast();
    }
  },
  methods: {
    headers() {
      return { headers: { token: this.$store.state.auth.token } };
    },
    errMsg(e, fallback) {
      return (e.response && e.response.data && e.response.data.error) || fallback;
    },

    // Re-chequeo fresco contra DB (Capa 2, patrón admin.vue / index.vue).
    async revalidateSuperadmin() {
      try {
        const res = await this.$axios.get('/me', this.headers());
        const grants = (res.data && res.data.data && res.data.data.grants) || [];
        if (!grants.some(g => g.role === 'superadmin')) {
          this.$notify({
            type: 'warning',
            icon: 'tim-icons icon-alert-circle-exc',
            message: 'El Supervisor de Calidad es solo para superadmin.',
          });
          this.$router.push('/dashboard');
          return false;
        }
        return true;
      } catch (e) {
        this.$router.push('/login');
        return false;
      }
    },

    async loadDetail() {
      this.notFound = false;
      try {
        const res = await this.$axios.get(
          `/qa/rule/${encodeURIComponent(this.ruleId)}/detail`,
          this.headers()
        );
        this.detail = (res.data && res.data.data) || null;
        if (!this.detail) this.notFound = true;
      } catch (e) {
        if (e.response && e.response.status === 404) {
          this.notFound = true;
        } else {
          // Otro error: tratamos como no encontrada para no romper la página.
          this.notFound = true;
          this.$notify({
            type: 'danger',
            icon: 'tim-icons icon-alert-circle-exc',
            message: this.errMsg(e, 'No se pudo cargar el detalle de la regla.'),
          });
        }
      }
    },

    // Sección 2 · distribución (POST /qa/backtest de ESTA regla).
    async loadHistogram() {
      if (!this.detail || !this.detail.packId) {
        this.histError = 'Sin pack asociado: no se puede calcular la distribución.';
        return;
      }
      this.histLoading = true; this.histError = '';
      try {
        const res = await this.$axios.post(
          '/qa/backtest',
          { packId: this.detail.packId, ruleId: this.ruleId, days: this.histDays },
          this.headers()
        );
        const data = res.data || {};
        if (data.ok === false) { this.histError = data.error || 'El backtest no devolvió datos.'; return; }
        const rule = (data.rules || []).find(r => r.ruleId === this.ruleId) || (data.rules || [])[0];
        if (!rule || !rule.distribution || !rule.distribution.histogram || !rule.distribution.histogram.length) {
          this.hist = null; return;
        }
        const d = rule.distribution;
        this.hist = { histogram: d.histogram, min: d.min, max: d.max, threshold: rule.threshold, op: rule.op || null, variable: d.var || '' };
      } catch (e) {
        this.histError = this.errMsg(e, 'No se pudo calcular la distribución (worker de calidad).');
      } finally {
        this.histLoading = false;
      }
    },

    // Sección 2 · línea de tiempo (GET /qa/rule/:id/timeline).
    async loadTimeline() {
      this.tlLoading = true; this.tlError = '';
      try {
        const params = { hours: this.timelineHours };
        if (this.dId) params.dId = this.dId;
        const res = await this.$axios.get(
          `/qa/rule/${encodeURIComponent(this.ruleId)}/timeline`,
          { ...this.headers(), params }
        );
        const data = (res.data && res.data.data) || {};
        this.timeline = {
          telemetry: Array.isArray(data.telemetry) ? data.telemetry : [],
          events: Array.isArray(data.events) ? data.events : [],
          hours: data.hours || this.timelineHours,
          variable: data.variable || '',
        };
      } catch (e) {
        this.tlError = this.errMsg(e, 'No se pudo cargar la línea de tiempo.');
      } finally {
        this.tlLoading = false;
      }
    },

    // Sección 3 · pronóstico (GET /qa/rule/:id/forecast).
    async loadForecast() {
      this.forecastLoading = true; this.forecastError = '';
      try {
        const params = {};
        if (this.dId) params.dId = this.dId;
        const res = await this.$axios.get(
          `/qa/rule/${encodeURIComponent(this.ruleId)}/forecast`,
          { ...this.headers(), params }
        );
        this.forecast = (res.data && res.data.data) || null;
      } catch (e) {
        this.forecastError = this.errMsg(e, 'No se pudo calcular el pronóstico.');
      } finally {
        this.forecastLoading = false;
      }
    },

    // ── Texto llano ──────────────────────────────────────────────────────
    opText(op) {
      return { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠' }[op] || op || '';
    },
    typeLabel(t) {
      const map = {
        N: 'numérica (umbral sobre una medición)',
        B: 'booleana (estado sostenido)',
        cross: 'cruzada (combina condiciones)',
        M: 'multi-estado / código de falla',
      };
      return map[t] || t || '—';
    },
    factoryRangeText(r) {
      if (!r || typeof r !== 'object') return String(r);
      const min = r.min == null ? '−∞' : r.min;
      const max = r.max == null ? '∞' : r.max;
      return `entre ${min} y ${max}`;
    },

    // ── Acciones (FichaHallazgo las emite; patrón del índice previo) ───────
    async onDisableRule({ packId, ruleId, done }) {
      try {
        await this.$axios.patch(
          `/rulepacks/${encodeURIComponent(packId)}/rules/${encodeURIComponent(ruleId)}/enabled`,
          { enabled: false },
          this.headers()
        );
        this.notifyOk('Regla sacada de circulación. El motor edge recargó.');
        await this.loadDetail();
      } catch (e) {
        this.notifyErr('No se pudo sacar la regla de circulación.');
      } finally {
        if (done) done();
      }
    },
    async onMuteFinding({ id, done }) {
      try {
        await this.$axios.patch(
          `/qa/findings/${encodeURIComponent(id)}/status`,
          { status: 'muted' },
          this.headers()
        );
        this.notifyOk('Hallazgo silenciado.');
        await this.loadDetail();
      } catch (e) {
        this.notifyErr('No se pudo silenciar el hallazgo.');
      } finally {
        if (done) done();
      }
    },
    async onRevertRule({ packId, ruleId, done }) {
      try {
        await this.$axios.post(
          `/rulepacks/${encodeURIComponent(packId)}/rules/${encodeURIComponent(ruleId)}/revert`,
          {},
          this.headers()
        );
        this.notifyOk('Regla revertida a su definición original. El motor edge recargó.');
        await this.loadDetail();
      } catch (e) {
        const msg = e.response && e.response.status === 404
          ? 'No hay definición original guardada para revertir.'
          : 'No se pudo revertir la regla.';
        this.notifyErr(msg);
      } finally {
        if (done) done();
      }
    },

    // ── Acciones de la sección 4 (config/procedencia) ─────────────────────
    onOpenEditor() {
      if (!this.detail || !this.detail.packId) return;
      this.$router.push(`/rulepacks/${encodeURIComponent(this.detail.packId)}`);
    },
    onRevertFromConfig() {
      if (!this.detail || !this.detail.packId) return;
      this.revertBusy = true;
      this.onRevertRule({
        packId: this.detail.packId,
        ruleId: this.ruleId,
        done: () => { this.revertBusy = false; },
      });
    },

    notifyOk(message) {
      this.$notify({ type: 'success', icon: 'tim-icons icon-check-2', message });
    },
    notifyErr(message) {
      this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message });
    },
  },
};
</script>

<style scoped>
.qa-crumbs { font-size: 12.5px; opacity: 0.75; margin-bottom: 10px; }
.qa-crumbs a { color: #00bf9a; text-decoration: none; }
.qa-crumbs__sep { margin: 0 6px; opacity: 0.6; }

.qa-det-h { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 4px; }
.qa-det-h h3 { font-size: 22px; }
.qa-det-sub {
  font-size: 13px; opacity: 0.7; margin-bottom: 18px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
}

.qa-badge {
  font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px;
  display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
}
.qa-badge--ghost { background: transparent; border: 1px solid rgba(255, 255, 255, 0.18); opacity: 0.8; }
.b-ok { background: rgba(31, 138, 91, 0.15); color: #1f8a5b; }
.b-dead { background: rgba(180, 35, 44, 0.15); color: #ec250d; }
.b-perm { background: rgba(122, 62, 168, 0.16); color: #8b46c0; }
.b-noisy { background: rgba(168, 106, 0, 0.18); color: #ff9f43; }
.b-flap { background: rgba(168, 106, 0, 0.18); color: #ff9f43; }
.b-zombie { background: rgba(122, 62, 168, 0.14); color: #a06cd0; }
.b-mismatch { background: rgba(43, 100, 166, 0.16); color: #2b64a6; }
.b-nodata { background: rgba(43, 100, 166, 0.15); color: #7fb0ec; }
.b-cross { background: rgba(180, 35, 44, 0.15); color: #ec250d; }
.b-real { background: rgba(122, 62, 168, 0.18); color: #c79cf0; }

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

/* Apilados a ancho completo (no 2 columnas): cada gráfico tiene todo el ancho de
   la tarjeta → se ven todos los datos y los ejes no quedan comprimidos. */
.qa-behave { display: block; padding: 14px 16px; }
.qa-behave__col { min-width: 0; margin-bottom: 18px; }
.qa-behave__col:last-child { margin-bottom: 0; }

.qa-chart-cap { font-size: 12px; opacity: 0.75; margin: 2px 0 6px; line-height: 1.4; }
.qa-chart-cap b { opacity: 1; }
.qa-noserie { font-style: italic; opacity: 0.6; }
.qa-dim { opacity: 0.5; }

.qa-fore { padding: 14px 16px; }
.qa-fore__na {
  display: flex; align-items: center; gap: 8px; font-size: 13.5px;
  padding: 12px 14px; border-radius: 8px; background: rgba(127, 176, 236, 0.08);
  border: 1px solid rgba(127, 176, 236, 0.25);
}
.qa-fore__note {
  margin-top: 10px; padding: 11px 13px; border-radius: 10px;
  background: rgba(127, 176, 236, 0.08); border: 1px solid rgba(127, 176, 236, 0.3);
  font-size: 13.5px;
}
.qa-fore__t {
  display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
  font-weight: 600; color: #7fb0ec; margin-bottom: 6px;
}
.qa-fore__reco b { color: #7fb0ec; }

.qa-cfg { padding: 14px 16px; }
.qa-kv { display: flex; gap: 10px; font-size: 13px; margin: 5px 0; }
.qa-kv b { min-width: 150px; opacity: 0.6; font-weight: 500; }
.qa-cfg__acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }

.white-content .qa-panel { background: #fff; border-color: rgba(0, 0, 0, 0.09); }
.white-content .qa-panel__h { border-color: rgba(0, 0, 0, 0.08); }
.white-content .qa-badge--ghost { border-color: rgba(0, 0, 0, 0.18); }
</style>
