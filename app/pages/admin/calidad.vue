<template>
  <!-- DEC-REF-141 · Supervisor de Calidad — pantalla del administrador (solo
       superadmin). Reproduce el mockup 1:1: semáforo de tiles, inventario de
       reglas con interruptor, ficha de hallazgo (evidencia + gráficos),
       backtest inline y digest semanal.
       Toda la data sale de /api/qa/* (DEC-REF-140); las acciones pegan a los
       endpoints reales del interruptor (121), revert (137) y mute (140). El
       front NO evalúa ni calcula nada del motor. -->
  <div>
    <div class="row">
      <div class="col-12">
        <h2 class="title">
          Supervisor de Calidad
          <small class="text-muted ml-2">— salud del motor de reglas</small>
        </h2>
      </div>
    </div>

    <!-- ¿Para qué sirve? Tarjeta de contexto en lenguaje de negocio (sin
         tecnicismos). El supervisor es independiente del motor y lo ve solo
         el equipo Wanomi, no el operador del NOC. -->
    <div class="row">
      <div class="col-12">
        <card class="qa-intro">
          <p class="mb-2">
            El Supervisor de Calidad revisa que las alarmas <b>no mientan</b>: que no
            se repitan de más, que no se queden mudas y que no se cierren con el
            equipo equivocado.
          </p>
          <p class="mb-0 text-muted">
            Trabaja <b>por su cuenta</b>, independiente del motor de reglas, para no
            heredar sus errores. Es una herramienta interna del equipo Wanomi: el
            operador del NOC no la ve.
          </p>
        </card>
      </div>
    </div>

    <!-- Estado de carga / sin-datos global -->
    <div class="row" v-if="!ready">
      <div class="col-12">
        <card>
          <p v-if="loading" class="text-muted">Cargando el estado del motor…</p>
          <p v-else class="text-muted">
            Sin acceso o sin datos. Si el problema persiste, revisá que el worker de calidad esté vivo.
          </p>
        </card>
      </div>
    </div>

    <template v-else>
      <!-- Cabecera con pastilla de estado general -->
      <div class="row">
        <div class="col-12">
          <div class="qa-headrow">
            <h4 class="mb-0">Salud del motor de reglas</h4>
            <span class="qa-pill" :class="healthPill.cls">● {{ healthPill.text }}</span>
          </div>
        </div>
      </div>

      <!-- Error amable del overview (worker/colecciones) sin tumbar la página -->
      <div class="row" v-if="overviewError">
        <div class="col-12">
          <div class="alert alert-warning">{{ overviewError }}</div>
        </div>
      </div>

      <!-- SEMÁFORO -->
      <div class="row">
        <div class="col-12">
          <Semaforo :overview="overview" />
        </div>
      </div>

      <!-- INVENTARIO -->
      <div class="row">
        <div class="col-12">
          <div v-if="inventoryError" class="alert alert-warning">{{ inventoryError }}</div>
          <InventarioReglas
            v-else
            :inventory="inventory"
            @toggle-rule="onToggleRule"
            @toggle-pack="onTogglePack"
          />
        </div>
      </div>

      <!-- FICHA DE HALLAZGO -->
      <div class="row">
        <div class="col-12">
          <div v-if="findingsError" class="alert alert-warning">{{ findingsError }}</div>
          <template v-else-if="findings.length">
            <!-- Selector de hallazgo cuando hay más de uno -->
            <div v-if="findings.length > 1" class="qa-finding-nav">
              <label class="text-muted" style="font-size:12px; margin-right:8px">Hallazgo:</label>
              <el-select v-model="selectedFindingId" size="small" class="select-primary" style="min-width:320px">
                <el-option
                  v-for="f in findings"
                  :key="f._id"
                  :value="f._id"
                  :label="findingOptionLabel(f)"
                />
              </el-select>
            </div>
            <FichaHallazgo
              :finding="selectedFinding"
              :badge="selectedFindingBadge"
              @disable-rule="onDisableRule"
              @mute-finding="onMuteFinding"
              @revert-rule="onRevertRule"
            />
          </template>
          <!-- caso raro §2: sin findings → motor sano -->
          <div v-else class="qa-panel-ok">
            <card>
              <div class="text-center" style="padding:18px">
                <i class="tim-icons icon-check-2" style="font-size:2rem; color:#00bf9a"></i>
                <h4 class="mt-2 mb-1">Motor sano</h4>
                <p class="text-muted mb-0">El supervisor no encontró hallazgos abiertos.</p>
              </div>
            </card>
          </div>
        </div>
      </div>

      <!-- BACKTEST INLINE -->
      <div class="row" v-if="backtestPackId">
        <div class="col-12">
          <BacktestInline
            :pack-id="backtestPackId"
            :rule-id="backtestRuleId"
            :initial-days="7"
          />
        </div>
      </div>

      <!-- DIGEST SEMANAL -->
      <div class="row">
        <div class="col-12">
          <div class="qa-panel">
            <div class="qa-panel__h">
              <b>Resumen semanal</b>
              <span class="qa-panel__meta">se envía al equipo Wanomi, no al operador</span>
            </div>
            <ul class="qa-digest" v-if="digest.length">
              <li v-for="(line, i) in digest" :key="i">{{ line }}</li>
            </ul>
            <p v-else class="qa-digest qa-digest--empty text-muted">
              Sin novedades esta semana: ningún hallazgo abierto.
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import { Select, Option } from 'element-ui';
import Semaforo from '@/components/qa/Semaforo.vue';
import InventarioReglas from '@/components/qa/InventarioReglas.vue';
import FichaHallazgo from '@/components/qa/FichaHallazgo.vue';
import BacktestInline from '@/components/qa/BacktestInline.vue';

// DEC-REF-141 — página superadmin. Patrón de admin.vue / rulepacks:
//   - middleware ['authenticated','superadmin'] (guard de UX, DEC-REF-62.b)
//   - re-chequeo fresco GET /me en el mount (Capa 2): si el rol se revocó,
//     no renderiza datos y redirige. La autorización REAL vive server-side en
//     la API 140 (checkAuth + isSuperadmin); esto es defensa en profundidad.
export default {
  name: 'admin-calidad',
  middleware: ['authenticated', 'superadmin'],
  components: {
    [Select.name]: Select,
    [Option.name]: Option,
    Semaforo,
    InventarioReglas,
    FichaHallazgo,
    BacktestInline,
  },
  data() {
    return {
      loading: true,
      ready: false,  // true tras pasar el re-chequeo /me
      overview: null,
      inventory: [],
      findings: [],
      selectedFindingId: null,
      // Errores por panel (no tumban la página; cada uno degrada en su lugar).
      overviewError: '',
      inventoryError: '',
      findingsError: '',
    };
  },
  computed: {
    digest() {
      return (this.overview && this.overview.digest) || [];
    },
    // Pastilla de estado general derivada del overview.
    healthPill() {
      const o = this.overview || {};
      const criticos = (o.deadRules || 0) + (o.permanentRules || 0);
      if (criticos > 0) return { cls: 'red', text: `Atención: ${criticos} problema(s) crítico(s)` };
      if ((o.flappingRules || 0) > 0) return { cls: 'amber', text: `${o.flappingRules} regla(s) a revisar` };
      return { cls: 'green', text: 'Sin problemas críticos' };
    },
    selectedFinding() {
      if (!this.findings.length) return null;
      return this.findings.find(f => f._id === this.selectedFindingId) || this.findings[0];
    },
    // Badge del hallazgo seleccionado, buscado en el inventario por ruleId
    // (el inventario ya trae el badge de mayor prioridad por regla).
    selectedFindingBadge() {
      const f = this.selectedFinding;
      if (!f || !f.ruleId) return null;
      const inv = this.inventory.find(r => r.ruleId === f.ruleId);
      return inv ? inv.badge : null;
    },
    // El backtest inline apunta a la regla del hallazgo seleccionado (si tiene
    // pack/regla); si no, no se muestra el panel.
    backtestPackId() {
      const f = this.selectedFinding;
      return (f && f.packId) || '';
    },
    backtestRuleId() {
      const f = this.selectedFinding;
      return (f && f.ruleId) || null;
    },
  },
  async mounted() {
    const ok = await this.revalidateSuperadmin();
    if (!ok) return;
    this.ready = true;
    await this.loadAll();
    this.loading = false;
  },
  methods: {
    headers() {
      return { headers: { token: this.$store.state.auth.token } };
    },

    // Re-chequeo fresco contra DB (Capa 2, patrón admin.vue / _packId.vue).
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
        // el middleware authenticated ya maneja el 401; acá no renderizamos datos.
        this.$router.push('/login');
        return false;
      }
    },

    // Carga los tres paneles de lectura en paralelo. Cada uno maneja su propio
    // error (si el worker/colección falla, el panel degrada y el resto vive —
    // caso raro §3).
    async loadAll() {
      await Promise.all([this.loadOverview(), this.loadInventory(), this.loadFindings()]);
    },

    async loadOverview() {
      this.overviewError = '';
      try {
        const res = await this.$axios.get('/qa/overview', this.headers());
        this.overview = (res.data && res.data.data) || null;
      } catch (e) {
        this.overview = null;
        this.overviewError = this.errMsg(e, 'No se pudo cargar el semáforo del motor.');
      }
    },

    async loadInventory() {
      this.inventoryError = '';
      try {
        const res = await this.$axios.get('/qa/inventory', this.headers());
        this.inventory = (res.data && res.data.data) || [];
      } catch (e) {
        this.inventory = [];
        this.inventoryError = this.errMsg(e, 'No se pudo cargar el inventario de reglas.');
      }
    },

    async loadFindings() {
      this.findingsError = '';
      try {
        // Solo los hallazgos vigentes (open) para la ficha, orden lastSeen desc
        // (lo da la API). Mantiene la selección actual si sigue presente.
        const res = await this.$axios.get('/qa/findings', { ...this.headers(), params: { status: 'open' } });
        this.findings = (res.data && res.data.data) || [];
        if (this.findings.length) {
          const still = this.findings.some(f => f._id === this.selectedFindingId);
          if (!still) this.selectedFindingId = this.findings[0]._id;
        } else {
          this.selectedFindingId = null;
        }
      } catch (e) {
        this.findings = [];
        this.selectedFindingId = null;
        this.findingsError = this.errMsg(e, 'No se pudieron cargar los hallazgos.');
      }
    },

    errMsg(e, fallback) {
      return (e.response && e.response.data && e.response.data.error) || fallback;
    },

    // Etiqueta llana del tipo de hallazgo (nada de I1/MUERTA crudos a la vista).
    findingTypeLabel(type) {
      const map = {
        I1: 'Se cierra el equipo equivocado',
        I2: 'Alarma repetida (grita de más)',
        I3: 'Alarma que parpadea',
        I4: 'Cierre sin alarma abierta',
        I5: 'Alarma colgada (zombie)',
        I6: 'El valor no coincide con la medición',
        I7: 'Cálculo desviado',
        I8: 'Valor físicamente imposible',
        I13: 'La regla cambió vs la original',
        MUERTA: 'Nunca puede dispararse',
        PERMANENTE: 'Encendida casi siempre',
        RUIDOSA: 'Ruidosa (dispara de más)',
        INGESTA: 'Un dato dejó de llegar',
      };
      return map[type] || type;
    },
    // Opción del selector en lenguaje llano: <etiqueta> · <nombre lindo> (<equipo>).
    // El "nombre lindo" sale del inventario (label); si no está, el ruleId.
    findingOptionLabel(f) {
      const inv = this.inventory.find(r => r.ruleId === f.ruleId);
      const nombre = (inv && inv.label) || f.ruleId || f.packId || 's/regla';
      const equipo = f.dId || 'pack';
      return `${this.findingTypeLabel(f.type)} · ${nombre} (${equipo})`;
    },

    // ── Acciones del inventario (interruptor, DEC-REF-121) ───────────────
    async onToggleRule({ packId, ruleId, enabled, done }) {
      try {
        await this.$axios.patch(
          `/rulepacks/${encodeURIComponent(packId)}/rules/${encodeURIComponent(ruleId)}/enabled`,
          { enabled },
          this.headers()
        );
        this.notifyOk(`Regla ${enabled ? 'puesta en' : 'sacada de'} circulación. El motor edge recargó.`);
        await this.loadInventory();
      } catch (e) {
        this.notifyErr('No se pudo cambiar el estado de la regla.');
        await this.loadInventory();  // re-sincroniza el checkbox con el estado real
      } finally {
        if (done) done();
      }
    },

    async onTogglePack({ packId, enabled, done }) {
      try {
        await this.$axios.patch(
          `/rulepacks/${encodeURIComponent(packId)}/enabled`,
          { enabled },
          this.headers()
        );
        this.notifyOk(`Pack ${enabled ? 'puesto en' : 'sacado de'} circulación. El motor edge recargó.`);
        await this.loadInventory();
      } catch (e) {
        this.notifyErr('No se pudo cambiar el estado del pack.');
        await this.loadInventory();
      } finally {
        if (done) done();
      }
    },

    // ── Acciones de la ficha ─────────────────────────────────────────────
    // "Sacar de circulación" = el mismo PATCH del interruptor sobre la regla
    // del hallazgo (DEC-REF-141 §4), no pasa por el editor (vía quirúrgica).
    async onDisableRule({ packId, ruleId, done }) {
      try {
        await this.$axios.patch(
          `/rulepacks/${encodeURIComponent(packId)}/rules/${encodeURIComponent(ruleId)}/enabled`,
          { enabled: false },
          this.headers()
        );
        this.notifyOk('Regla sacada de circulación. El motor edge recargó.');
        await this.loadInventory();
      } catch (e) {
        this.notifyErr('No se pudo sacar la regla de circulación.');
      } finally {
        if (done) done();
      }
    },

    // "Silenciar hallazgo" = PATCH /api/qa/findings/:id/status {status:'muted'}
    async onMuteFinding({ id, done }) {
      try {
        await this.$axios.patch(
          `/qa/findings/${encodeURIComponent(id)}/status`,
          { status: 'muted' },
          this.headers()
        );
        this.notifyOk('Hallazgo silenciado.');
        await this.loadFindings();
        await this.loadOverview();  // el digest/semáforo cuentan findings abiertos
      } catch (e) {
        this.notifyErr('No se pudo silenciar el hallazgo.');
      } finally {
        if (done) done();
      }
    },

    // "Revertir a la original" = POST /rulepacks/:packId/rules/:ruleId/revert (137)
    async onRevertRule({ packId, ruleId, done }) {
      try {
        await this.$axios.post(
          `/rulepacks/${encodeURIComponent(packId)}/rules/${encodeURIComponent(ruleId)}/revert`,
          {},
          this.headers()
        );
        this.notifyOk('Regla revertida a su definición original. El motor edge recargó.');
        await this.loadInventory();
      } catch (e) {
        // 404 = no hay snapshot que revertir.
        const msg = e.response && e.response.status === 404
          ? 'No hay definición original guardada para revertir.'
          : 'No se pudo revertir la regla.';
        this.notifyErr(msg);
      } finally {
        if (done) done();
      }
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
.qa-headrow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.qa-pill {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid currentColor;
  font-weight: 600;
}
.qa-pill.red { color: #ec250d; }
.qa-pill.amber { color: #ff9f43; }
.qa-pill.green { color: #00bf9a; }

.qa-finding-nav { margin-bottom: 10px; display: flex; align-items: center; }

.qa-intro { border-left: 4px solid #00bf9a; }
.qa-intro p { font-size: 14px; line-height: 1.55; }

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
.qa-digest { margin: 14px 20px; }
.qa-digest li { margin-bottom: 7px; }
.qa-digest--empty { margin: 14px 20px; }

.white-content .qa-panel { background: #fff; border-color: rgba(0, 0, 0, 0.09); }
.white-content .qa-panel__h { border-color: rgba(0, 0, 0, 0.08); }
</style>
