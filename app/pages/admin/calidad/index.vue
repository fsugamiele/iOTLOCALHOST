<template>
  <!-- spec_supervisor_confiabilidad_v2 (R4) — SUPERVISOR DE CALIDAD v2 (solo superadmin).
       Pestañas: Resumen · Confiabilidad por equipo · Calidad de las reglas · Integridad del motor · Datos · Método.
       Todo sale de /api/qa/* precalculado por el worker (R1–R3); el front no calcula indicadores, solo dibuja.
       Gráficos en SVG propio con guardas: un valor no finito no se dibuja y sin datos hay estado vacío. -->
  <div class="qav2">
    <header class="qv-head">
      <div>
        <div class="qv-eyebrow">Supervisor de calidad · sitio {{ rel ? rel.siteCode : '—' }}</div>
        <h2 class="qv-h1">Confiabilidad y calidad de alarmas</h2>
        <p class="qv-mut qv-small" v-if="rel">Ventana: últimos {{ Math.round(rel.window.T / 24) }} días · calculado {{ fechaLarga(rel.computedAt) }} · {{ (rel.equipos || []).length }} equipos · intervalos de confianza al {{ Math.round((rel.config.confidence || 0.9) * 100) }} %</p>
      </div>
      <div class="qv-row">
        <span v-if="cfg && cfg.provisorio" class="qv-pill qv-pill--atn" title="SLA y meta de disponibilidad pendientes de confirmación con Claro">Metas provisorias</span>
        <button type="button" class="qv-btn qv-btn--sec" :disabled="recalcRel" @click="recalcularRel">{{ recalcRel ? 'Recalculando…' : 'Recalcular indicadores' }}</button>
      </div>
    </header>

    <nav class="qv-tabs" role="tablist" aria-label="Secciones">
      <button v-for="t in TABS" :key="t.k" type="button" role="tab" :aria-selected="tab === t.k ? 'true' : 'false'" @click="ir(t.k)">{{ t.txt }}</button>
    </nav>

    <div v-if="!ready" class="qv-card"><p class="qv-mut">{{ loading ? 'Cargando…' : 'Sin acceso o sin datos.' }}</p></div>

    <!-- ═══════════ RESUMEN ═══════════ -->
    <section v-else-if="tab === 'resumen'" class="qv-stack">
      <div v-if="relError" class="qv-empty">{{ relError }}</div>
      <template v-else-if="rel">
        <div class="qv-verdict">
          <div v-for="(v, i) in veredicto" :key="i"><span class="qv-sig" :class="'qv-' + v.cls"></span><p><b>{{ v.titulo }}</b><br><span class="qv-mut qv-small">{{ v.texto }}</span></p></div>
        </div>
        <div class="qv-kpis">
          <div v-for="k in kpis" :key="k.lab" class="qv-kpi">
            <span class="qv-kpi__lab">{{ k.lab }}</span>
            <span class="qv-kpi__val qv-num">{{ k.val }}</span>
            <span class="qv-kpi__ci">{{ k.ci || '&nbsp;' }}</span>
            <div class="qv-row"><span v-if="k.conf" class="qv-conf" :class="'qv-conf--' + k.conf">confianza {{ k.conf }}</span><span class="qv-mut qv-small">{{ k.pie }}</span></div>
          </div>
        </div>
        <div class="qv-grid qv-g2">
          <div class="qv-card">
            <div class="qv-row qv-between"><h3 class="qv-h">Disponibilidad en la ventana</h3><span class="qv-mut qv-small">cada fila es un equipo</span></div>
            <QaGantt :filas="ganttFilas" :t0="rel.window.t0" :t1="rel.window.t1" />
            <div class="qv-legend"><span><i class="qv-up"></i>En servicio</span><span><i class="qv-falla"></i>Falla del equipo</span><span><i class="qv-red"></i>Sin red</span><span><i class="qv-sitio"></i>Sitio sin energía</span></div>
          </div>
          <div class="qv-card">
            <div class="qv-row qv-between"><h3 class="qv-h">Carga de alarmas al operador</h3><span class="qv-mut qv-small">ISA-18.2 · últimos {{ rel.isa.dias }} días</span></div>
            <div class="qv-grid qv-g3">
              <div><span class="qv-kpi__lab">Avisos por hora</span><div class="qv-kpi__val qv-num" style="font-size:20px">{{ fmt(rel.isa.por_hora, 2) }}</div><span class="qv-pill" :class="rel.isa.por_hora <= cfgv('isaRateTarget', 6) ? 'qv-pill--ok' : 'qv-pill--atn'">meta ≤ {{ cfgv('isaRateTarget', 6) }}</span></div>
              <div><span class="qv-kpi__lab">Tiempo en inundación</span><div class="qv-kpi__val qv-num" style="font-size:20px">{{ pct(rel.isa.flood_pct, 2) }}</div><span class="qv-pill" :class="rel.isa.flood_pct < cfgv('floodPctTarget', 1) ? 'qv-pill--ok' : 'qv-pill--atn'">meta &lt; {{ cfgv('floodPctTarget', 1) }} %</span></div>
              <div><span class="qv-kpi__lab">Parpadeos · permanentes</span><div class="qv-kpi__val qv-num" style="font-size:20px">{{ rel.isa.chattering }} · {{ rel.isa.stale }}</div><span class="qv-pill" :class="rel.isa.chattering + rel.isa.stale ? 'qv-pill--atn' : 'qv-pill--ok'">meta 0</span></div>
            </div>
            <QaBarras :valores="rel.isa.horas || []" :meta="cfgv('isaRateTarget', 6)" />
            <p class="qv-note">Barras: avisos por hora (máximo {{ rel.isa.max10 }} en 10 min). Punteada: meta de ISA-18.2. Las {{ (rel.isa.topReglas || []).length }} reglas más activas aportan el {{ fmt(rel.isa.top10, 0) }} % de los avisos.</p>
          </div>
        </div>
        <div class="qv-card">
          <div class="qv-row qv-between"><h3 class="qv-h">Qué cambiar primero</h3><button type="button" class="qv-btn qv-btn--sec" @click="ir('reglas')">Ver todas las reglas</button></div>
          <div v-if="!primero.length" class="qv-mut qv-small">{{ rq ? 'Nada urgente: ninguna regla con cambio pendiente.' : 'Todavía no hay cálculo de calidad de reglas.' }}</div>
          <div v-for="r in primero" :key="r.ruleId" class="qv-row qv-between qv-sep">
            <div style="min-width:0;flex:1 1 320px"><b>{{ r.label }}</b> <span class="qv-pill" :class="'qv-pill--' + VER(r).cls">{{ VER(r).txt }}</span><p class="qv-small qv-mut">{{ r.cambio }}</p></div>
            <button type="button" class="qv-btn qv-btn--sec" @click="ir('reglas')">Ver cálculo</button>
          </div>
        </div>
      </template>
    </section>

    <!-- ═══════════ CONFIABILIDAD ═══════════ -->
    <section v-else-if="tab === 'confiabilidad'" class="qv-stack">
      <div v-if="!rel" class="qv-empty">{{ relError || 'Sin cálculo de confiabilidad.' }}</div>
      <template v-else>
        <div class="qv-card">
          <div class="qv-row qv-between"><h3 class="qv-h">Indicadores por equipo</h3><span class="qv-mut qv-small">Tocá una fila para ver sus curvas</span></div>
          <div class="qv-tbl"><table>
            <thead><tr><th>Equipo</th><th class="r">Fallas</th><th class="r">MTBF [IC]</th><th class="r">λ /1000 h</th><th class="r">MTTR</th><th class="r">Respuesta</th><th class="r">Ai</th><th class="r">Ao</th><th class="r">R(24 h)</th><th class="r">M({{ sla }} h)</th><th>Confianza</th></tr></thead>
            <tbody>
              <tr v-for="(e, i) in rel.equipos" :key="e.dId" tabindex="0" :class="{ sel: i === sel }" @click="sel = i" @keydown.enter="sel = i">
                <td><b>{{ e.nombre }}</b><br><span class="qv-mut qv-small">{{ e.modelo }}</span></td>
                <td class="r qv-num">{{ e.n }}</td>
                <td class="r qv-num">{{ e.n ? `${horas(e.mtbf)} ` : `≥ ${fmt(e.mtbf_lo, 0)} h` }}<span v-if="e.n" class="qv-mut">[{{ fmt(e.mtbf_lo, 0) }}–{{ fmt(e.mtbf_hi, 0) }}]</span></td>
                <td class="r qv-num">{{ e.n ? fmt(e.lam, 2) : (fin(e.mtbf_lo) ? `≤ ${fmt(1000 / e.mtbf_lo, 2)}` : '—') }}</td>
                <td class="r qv-num">{{ horas(e.mttr) }}<span v-if="e.n" class="qv-mut qv-small"> ({{ e.nReconocidas }}/{{ e.n }})</span></td>
                <td class="r qv-num">{{ horas(e.mrt) }}</td>
                <td class="r qv-num">{{ pct(e.Ai) }}</td>
                <td class="r qv-num">{{ pct(e.Ao) }}</td>
                <td class="r qv-num">{{ e.n ? pct(e.R24, 1) : (fin(e.mtbf_lo) ? '≥ ' + pct(100 * Math.exp(-24 / e.mtbf_lo), 1) : '—') }}</td>
                <td class="r qv-num">{{ pct(e.M4, 1) }}</td>
                <td><span class="qv-conf" :class="'qv-conf--' + e.conf">{{ e.conf }}</span><span v-if="e.n" class="qv-conf" :class="'qv-conf--' + e.confMttr" title="Confianza del MTTR, la respuesta y M(t): sale solo de las fallas reconocidas">MTTR {{ e.confMttr }}</span></td>
              </tr>
            </tbody>
          </table></div>
          <p class="qv-note">Falla = alarma crítica clasificada como «falla del equipo». Ai: solo reparación activa · Ao: todo el tiempo fuera de servicio, incluida la respuesta. Exposición y tiempo fuera de servicio se cuentan con la plataforma recibiendo datos. MTTR y respuesta salen solo de las fallas reconocidas (entre paréntesis, cuántas de cuántas). Sin fallas no hay MTBF puntual: se informa el mínimo garantizado. La disponibilidad técnica (Aa) necesita ventanas de mantenimiento con duración: todavía no se registran.</p>
        </div>
        <div class="qv-grid qv-g2" v-if="eq">
          <div class="qv-card">
            <div class="qv-row qv-between"><h3 class="qv-h">Confiabilidad R(t) · {{ eq.nombre }}</h3><span class="qv-mut qv-small">{{ eq.n ? `MTBF ${horas(eq.mtbf)}` : 'sin fallas: cota inferior' }}</span></div>
            <QaLinea :xs="curvaR.xs" :ys="curvaR.ys" :lo="curvaR.lo" :hi="curvaR.hi" :x-max="720" x-label="horas de misión" :marker="168" marker-label="7 días" aria="Curva de confiabilidad" />
            <p class="qv-note">{{ notaR }}</p>
          </div>
          <div class="qv-card">
            <div class="qv-row qv-between"><h3 class="qv-h">Mantenibilidad M(t)</h3><span class="qv-mut qv-small">SLA de reparación: {{ sla }} h</span></div>
            <QaLinea v-if="fin(eq.mttr)" :xs="curvaM.xs" :ys="curvaM.ys" :x-max="12" x-label="horas desde el reconocimiento" :marker="sla" :marker-label="`SLA ${sla} h`" aria="Curva de mantenibilidad" />
            <div v-else class="qv-empty">Sin reparaciones reconocidas en la ventana: no hay datos para estimar la mantenibilidad de este equipo.</div>
            <p class="qv-note" v-if="fin(eq.mttr)">Con MTTR {{ horas(eq.mttr) }} (sobre {{ eq.nReconocidas }} reparación/es reconocida/s), el {{ pct(eq.M4, 1) }} de las reparaciones termina dentro del SLA.</p>
          </div>
        </div>
        <div class="qv-card" v-if="eq">
          <h3 class="qv-h">Fallas de {{ eq.nombre }}</h3>
          <div class="qv-tbl"><table>
            <thead><tr><th>Inicio</th><th>Causa (reglas)</th><th class="r">Respuesta</th><th class="r">Reparación</th><th class="r">Fuera de servicio</th><th></th></tr></thead>
            <tbody>
              <tr v-if="!(eq.fallas || []).length"><td colspan="6" class="qv-mut">Sin fallas en la ventana.</td></tr>
              <tr v-for="(f, i) in fallasRev" :key="i">
                <td class="qv-num">{{ fecha(f.start) }}</td><td>{{ (f.causas || []).join(' + ') }}</td>
                <td class="r qv-num">{{ f.resp == null ? 'sin reconocer' : horas(f.resp) }}</td><td class="r qv-num">{{ horas(f.rep) }}</td><td class="r qv-num">{{ horas(f.fuera) }}</td>
                <td class="qv-small qv-mut">{{ f.censurada ? 'abierta' : '' }}{{ f.reconstruida ? ' reconstruida' : '' }}</td>
              </tr>
            </tbody>
          </table></div>
        </div>
      </template>
    </section>

    <!-- ═══════════ REGLAS ═══════════ -->
    <section v-else-if="tab === 'reglas'" class="qv-stack">
      <QaReglas :rq="rq" :error="rqError" :recalculando="recalcRq" @recalcular="recalcularRq" />
      <details class="qv-card">
        <summary class="qv-h">Encender / apagar reglas y packs</summary>
        <div v-if="inventoryError" class="qv-empty">{{ inventoryError }}</div>
        <InventarioReglas v-else :inventory="inventory" @toggle-rule="onToggleRule" @toggle-pack="onTogglePack" />
      </details>
    </section>

    <!-- ═══════════ INTEGRIDAD ═══════════ -->
    <section v-else-if="tab === 'integridad'">
      <QaIntegridad :findings="findings" :error="findingsError" @cambio="loadFindings" />
    </section>

    <!-- ═══════════ DATOS ═══════════ -->
    <section v-else-if="tab === 'datos'" class="qv-stack">
      <div v-if="!rel" class="qv-empty">{{ relError || 'Sin cálculo.' }}</div>
      <div v-else class="qv-card">
        <h3 class="qv-h">Completitud de los datos</h3>
        <p class="qv-note">Completitud = ventanas de 5 min con al menos una lectura ÷ ventanas con la plataforma recibiendo datos. La plataforma estuvo sin datos el {{ pct(rel.sitio && rel.sitio.plataforma ? rel.sitio.plataforma.sinDatosPct : null, 1) }} de la ventana: ese tiempo no cuenta como falla ni baja la completitud. Con menos de {{ cfgv('completitudMin', 95) }} % los indicadores del equipo bajan su confianza.</p>
        <div class="qv-chips"><button type="button" class="qv-chip" :aria-pressed="soloBajos ? 'true' : 'false'" @click="soloBajos = !soloBajos">Solo por debajo de {{ cfgv('completitudMin', 95) }} %</button></div>
        <div class="qv-tbl"><table>
          <thead><tr><th>Equipo · medición</th><th class="r">Lecturas</th><th>Completitud</th><th class="r">Huecos</th><th>Nota</th></tr></thead>
          <tbody>
            <tr v-if="!datosVisibles.length"><td colspan="5" class="qv-mut">Ninguna medición por debajo del mínimo.</td></tr>
            <tr v-for="d in datosVisibles" :key="d.dId + d.variable">
              <td>{{ d.equipo }} · <span class="qv-num">{{ d.variable }}</span></td>
              <td class="r qv-num">{{ (d.lecturas || 0).toLocaleString('es-AR') }}</td>
              <td><div class="qv-row" style="flex-wrap:nowrap"><div class="qv-prog"><i :style="{ width: Math.min(100, d.completitud || 0) + '%' }"></i></div><span class="qv-num qv-small">{{ pct(d.completitud, 1) }}</span></div></td>
              <td class="r qv-num">{{ d.huecos }}</td>
              <td><span v-if="d.intermitente" class="qv-pill qv-pill--info">intermitente por diseño</span></td>
            </tr>
          </tbody>
        </table></div>
        <div v-if="(rel.notas || []).length" class="qv-math" style="margin-top:12px">{{ rel.notas.join('\n') }}</div>
      </div>
    </section>

    <!-- ═══════════ MÉTODO ═══════════ -->
    <section v-else-if="tab === 'metodo'" class="qv-stack">
      <div class="qv-card"><h3 class="qv-h">Cómo se calcula cada indicador</h3><p class="qv-note">Falla = episodio (aviso → cierre) de una regla crítica clasificada como «falla del equipo»; episodios superpuestos del mismo equipo son una sola falla, y un nuevo aviso de la misma regla antes de {{ cfgv('mergeGapMin', 30) }} min del cierre es la misma falla. Distribución exponencial (tasa constante); con 10 o más fallas se estima además β de Crow-AMSAA (proceso de Weibull para equipos reparables).</p></div>
      <div class="qv-defs">
        <div v-for="m in METODO" :key="m.t" class="qv-card"><h4 class="qv-h4">{{ m.t }}</h4><div class="qv-formula">{{ m.f }}</div><p v-if="m.n" class="qv-note">{{ m.n }}</p></div>
      </div>
      <div class="qv-card" v-if="cfgEdit">
        <h3 class="qv-h">Parámetros del supervisor</h3>
        <p class="qv-note">El SLA y la meta de disponibilidad son provisorios hasta que Claro confirme sus SLA. Los cambios valen desde el próximo cálculo.</p>
        <div class="qv-form">
          <label v-for="c in CFG" :key="c.k"><span>{{ c.lab }}</span><input v-model.number="cfgEdit[c.k]" type="number" :step="c.step || 1" class="qv-in"></label>
          <label class="qv-check"><input v-model="cfgEdit.provisorio" type="checkbox"> Metas provisorias</label>
        </div>
        <button type="button" class="qv-btn" :disabled="guardandoCfg" @click="guardarCfg">{{ guardandoCfg ? 'Guardando…' : 'Guardar parámetros' }}</button>
      </div>
    </section>
  </div>
</template>

<script>
import InventarioReglas from '@/components/qa/InventarioReglas.vue';
import QaLinea from '@/components/qa/v2/QaLinea.vue';
import QaGantt from '@/components/qa/v2/QaGantt.vue';
import QaBarras from '@/components/qa/v2/QaBarras.vue';
import QaReglas from '@/components/qa/v2/QaReglas.vue';
import QaIntegridad from '@/components/qa/v2/QaIntegridad.vue';
import { fin, fmt, pct, horas, fecha, fechaLarga, VEREDICTOS } from '@/components/qa/v2/qaFormat';

const TABS = [
  { k: 'resumen', txt: 'Resumen' }, { k: 'confiabilidad', txt: 'Confiabilidad por equipo' }, { k: 'reglas', txt: 'Calidad de las reglas' },
  { k: 'integridad', txt: 'Integridad del motor' }, { k: 'datos', txt: 'Datos' }, { k: 'metodo', txt: 'Método' },
];
const METODO = [
  { t: 'Tiempos', f: 'TO   = T − Σ fuera de servicio\nTTR  = cierre − reconocimiento   (reparación activa)\nTRES = reconocimiento − aviso    (respuesta)\nTDT  = cierre − aviso            (fuera de servicio)', n: 'T y los tiempos fuera de servicio se cuentan con la plataforma recibiendo datos.' },
  { t: 'MTBF, tasa de falla e intervalo', f: 'MTBF = TO / n          λ = n / TO\nIC (ensayo truncado por tiempo):\nMTBF_inf = 2·TO / χ²(1−α/2 ; 2n+2)\nMTBF_sup = 2·TO / χ²(α/2 ; 2n)\nn = 0  →  MTBF ≥ 2·TO / χ²(1−α/2 ; 2)' },
  { t: 'Confiabilidad y mantenibilidad', f: 'R(t) = e^(−λ·t)          prob. de operar t horas sin falla\nM(t) = 1 − e^(−t / MTTR)  prob. de reparar antes de t\nBanda de R(t): λ en los extremos del IC del MTBF' },
  { t: 'Disponibilidades', f: 'Ai = MTBF / (MTBF + MTTR)\nAa = MTBM / (MTBM + M̄)   correctivo + preventivo\nAo = TO / T              incluye la respuesta', n: 'Aa queda sin valor hasta registrar ventanas de mantenimiento con duración.' },
  { t: 'Confianza del indicador', f: 'Alta   n ≥ 5  y completitud ≥ 95 %\nMedia  n ≥ 2  y completitud ≥ 95 %\nBaja   el resto\nMTTR/M(t): n = fallas reconocidas', n: 'Con confianza baja el número va con su intervalo y no se usa para comparar equipos.' },
  { t: 'Carga de alarmas (ISA-18.2 / EEMUA 191)', f: 'Tasa       = avisos / hora            meta ≤ 6\nInundación = % de 10 min con > 10 avisos  meta < 1 %\nParpadeo   = ≥ 3 avisos del par en 60 s   meta 0\nPermanente = abierta > 24 h               meta 0' },
  { t: 'Recomendaciones de ajuste', f: 'Espera     > p95 de las excursiones < 10 min + 30 s\nHistéresis ≥ 2·σ_ruido\nσ_ruido    = 1,4826 · mediana|Δ| / √2\nSe reproduce la regla con el cambio:\navisos antes → después, fallas > 10 min perdidas', n: 'La histéresis solo se propone en comparaciones mayor/menor sobre mediciones continuas.' },
  { t: 'Veredictos de las reglas', f: 'Avisa de más   > 1 aviso/día, parpadeo, o ≥ 30 % de\n               episodios cortos (con ≥ 5 episodios)\nNo evalúa      sin lecturas o sin historia suficiente\nUmbral a revisar  número propio a > 10 σ de lo\n               observado, o fuera de la escala de la ficha\nProtección     sin avisos y alcanzable\nInalcanzable   fuera de la escala por > 50 % de su amplitud' },
];
const CFG = [
  { k: 'windowDays', lab: 'Ventana (días)' }, { k: 'confidence', lab: 'Nivel de confianza (0–1)', step: 0.01 },
  { k: 'slaRepairH', lab: 'SLA de reparación (h)', step: 0.5 }, { k: 'aoTarget', lab: 'Meta Ao (%)', step: 0.1 },
  { k: 'mergeGapMin', lab: 'Rebote = misma falla (min)' }, { k: 'completitudMin', lab: 'Completitud mínima (%)' },
];

export default {
  name: 'admin-calidad-index',
  middleware: ['authenticated', 'superadmin'],
  components: { InventarioReglas, QaLinea, QaGantt, QaBarras, QaReglas, QaIntegridad },
  data() {
    return {
      TABS, METODO, CFG, tab: 'resumen', loading: true, ready: false, sel: 0, soloBajos: true,
      rel: null, relError: '', rq: null, rqError: '', findings: [], findingsError: '', inventory: [], inventoryError: '',
      cfg: null, cfgEdit: null, guardandoCfg: false, recalcRel: false, recalcRq: false,
    };
  },
  computed: {
    sla() { return this.cfgv('slaRepairH', 4); },
    eq() { return this.rel && this.rel.equipos ? this.rel.equipos[this.sel] : null; },
    veredicto() {
      const out = [];
      const s = this.rel && this.rel.sitio;
      if (s && s.carga) out.push({ cls: s.carga.Ao >= this.cfgv('aoTarget', 99.5) ? 'ok' : 'atn', titulo: `El sitio tuvo energía en la carga el ${pct(s.carga.Ao, 2)} del tiempo`, texto: `${s.carga.caidas} caída(s) · ${horas(s.carga.downH)} sin energía${s.red ? ` · red: ${s.red.n} corte(s), ${horas(s.red.horas)} sin red` : ''}.` });
      if (this.rq) {
        const c = (k) => this.rq.reglas.filter((r) => r.veredicto === k).length;
        const n = this.rq.reglas.filter((r) => !['sana', 'proteccion'].includes(r.veredicto)).length;
        out.push({ cls: n ? 'atn' : 'ok', titulo: n ? `${n} regla(s) a atender` : 'Las reglas están sanas', texto: `${c('avisa_de_mas')} avisan de más · ${c('no_evalua')} no pueden evaluar · ${c('umbral_revisar') + c('inalcanzable')} con umbral a revisar · ${c('sana') + c('proteccion')} sanas o protecciones.` });
      }
      const abiertos = this.findings.filter((f) => f.status === 'open' && f.severity === 'hard');
      const auto = this.findings.filter((f) => f.status === 'resolved' && f.resolvedBy === 'auto').length;
      out.push({ cls: abiertos.length ? 'mal' : 'ok', titulo: abiertos.length ? `${abiertos.length} inconsistencia(s) del motor abiertas` : 'El motor cuenta bien los episodios', texto: `${auto} hallazgo(s) se cerraron solos al dejar de aparecer.` });
      return out;
    },
    kpis() {
      const a = (this.rel && this.rel.agg) || {};
      const n = a.n || 0;
      return [
        { lab: 'Disponibilidad operacional Ao (parque)', val: pct(a.Ao, 2), ci: `meta ≥ ${fmt(this.cfgv('aoTarget', 99.5), 2)} %`, conf: a.conf, pie: `${(this.rel.equipos || []).length} equipos` },
        { lab: 'Disponibilidad intrínseca Ai', val: pct(a.Ai, 2), ci: 'solo reparación activa', conf: a.confMttr, pie: `${a.nReconocidas || 0} de ${n} reconocidas` },
        { lab: 'MTBF del parque', val: n ? horas(a.mtbf) : (fin(a.mtbf_lo) ? `≥ ${fmt(a.mtbf_lo, 0)} h` : '—'), ci: n ? `IC: ${fmt(a.mtbf_lo, 0)} – ${fmt(a.mtbf_hi, 0)} h` : 'sin fallas: cota inferior', conf: a.conf, pie: `n = ${n}` },
        { lab: 'Tasa de falla λ (por 1000 h)', val: n ? fmt(a.lam, 2) : '—', ci: n ? `≈ ${fmt(a.lam * 0.72, 1)} fallas por mes` : '', conf: a.conf, pie: 'parque' },
        { lab: 'MTTR (reparación activa)', val: horas(a.mttr), ci: `respuesta ${horas(a.mrt)} · fuera de servicio ${horas(a.mdt)}`, conf: a.confMttr, pie: `${a.nReconocidas || 0} de ${n}` },
        { lab: `Mantenibilidad M(${this.sla} h)`, val: pct(a.M4, 1), ci: 'prob. de reparar dentro del SLA', conf: a.confMttr, pie: '1 − e^(−SLA/MTTR)' },
      ];
    },
    ganttFilas() {
      if (!this.rel) return [];
      const filas = (this.rel.equipos || []).map((e) => ({ nombre: e.nombre, tramos: (e.fallas || []).map((f) => ({ s: f.start, e: f.end, tipo: 'falla', title: `${(f.causas || []).join(' + ')} · ${horas(f.fuera)} fuera de servicio` })) }));
      const s = this.rel.sitio || {};
      if (s.red) filas.push({ nombre: 'Red (energía de la distribuidora)', tramos: (s.red.cortes || []).map((c) => ({ s: c.start, e: c.end, tipo: 'red', title: `${(c.causas || []).join(' + ')} · ${horas(c.fuera)}` })) });
      if (s.carga) filas.push({ nombre: 'Sitio (carga con energía)', tramos: (s.carga.detalle || []).map((c) => ({ s: c.desde, e: c.hasta, tipo: 'sitio', title: 'Sitio sin energía en la carga' })) });
      return filas;
    },
    primero() {
      if (!this.rq) return [];
      return this.rq.reglas.filter((r) => (r.veredicto === 'avisa_de_mas' && r.propuesta && r.propuesta.despues != null && (r.propuesta.graceSec || r.propuesta.deadband)) || ['no_evalua', 'inalcanzable', 'umbral_revisar'].includes(r.veredicto))
        .sort((a, b) => (b.avisos || 0) - (a.avisos || 0)).slice(0, 6);
    },
    curvaR() {
      const e = this.eq; const xs = Array.from({ length: 61 }, (_, i) => i * 12);
      if (!e || !fin(e.mtbf_lo)) return { xs, ys: [], lo: null, hi: null };
      const lp = e.n && fin(e.mtbf) ? 1 / e.mtbf : null, lhi = 1 / e.mtbf_lo, llo = fin(e.mtbf_hi) ? 1 / e.mtbf_hi : 0;
      return { xs, ys: xs.map((t) => 100 * Math.exp(-(lp != null ? lp : lhi) * t)), lo: xs.map((t) => 100 * Math.exp(-lhi * t)), hi: xs.map((t) => 100 * Math.exp(-llo * t)) };
    },
    notaR() {
      const e = this.eq; if (!e || !fin(e.mtbf_lo)) return '';
      const r7 = 100 * Math.exp(-168 / (e.n && fin(e.mtbf) ? e.mtbf : e.mtbf_lo));
      return e.n ? `Probabilidad de operar 7 días seguidos sin falla: ${pct(r7, 1)} (banda: intervalo de confianza).` : `Sin fallas en la ventana: la probabilidad de 7 días sin falla es de al menos ${pct(r7, 1)}.`;
    },
    curvaM() {
      const e = this.eq; const xs = Array.from({ length: 49 }, (_, i) => i * 0.25);
      return { xs, ys: e && fin(e.mttr) && e.mttr > 0 ? xs.map((t) => 100 * (1 - Math.exp(-t / e.mttr))) : [] };
    },
    fallasRev() { return this.eq && this.eq.fallas ? this.eq.fallas.slice().reverse() : []; },
    datosVisibles() {
      const d = (this.rel && this.rel.datos) || [];
      return this.soloBajos ? d.filter((x) => !x.intermitente && x.completitud != null && x.completitud < this.cfgv('completitudMin', 95)) : d;
    },
  },
  watch: { $route() { const h = (this.$route.hash || '').slice(1); if (TABS.some((t) => t.k === h)) this.tab = h; } },
  async mounted() {
    const h = (this.$route.hash || '').slice(1); if (TABS.some((t) => t.k === h)) this.tab = h;
    if (!(await this.revalidateSuperadmin())) return;
    this.ready = true;
    await Promise.all([this.loadRel(), this.loadRq(), this.loadFindings(), this.loadInventory(), this.loadCfg()]);
    this.loading = false;
  },
  methods: {
    fin, fmt, pct, horas, fecha, fechaLarga,
    VER(r) { return VEREDICTOS[r.veredicto] || { txt: r.veredicto, cls: 'info' }; },
    cfgv(k, d) { const v = this.cfg && this.cfg[k]; return typeof v === 'number' && isFinite(v) ? v : d; },
    ir(k) { this.tab = k; this.$router.replace({ hash: '#' + k }).catch(() => {}); window.scrollTo({ top: 0 }); },
    headers() { return { headers: { token: this.$store.state.auth.token } }; },
    err(e, d) { return (e.response && e.response.data && e.response.data.error) || d; },
    async revalidateSuperadmin() {
      try {
        const res = await this.$axios.get('/me', this.headers());
        const grants = (res.data && res.data.data && res.data.data.grants) || [];
        if (!grants.some((g) => g.role === 'superadmin')) { this.$router.push('/dashboard'); return false; }
        return true;
      } catch (e) { this.$router.push('/login'); return false; }
    },
    async loadRel() { try { this.rel = (await this.$axios.get('/qa/reliability', this.headers())).data.data; this.relError = ''; } catch (e) { this.rel = null; this.relError = this.err(e, 'No se pudo cargar la confiabilidad.'); } },
    async loadRq() { try { this.rq = (await this.$axios.get('/qa/rule-quality', this.headers())).data.data; this.rqError = ''; } catch (e) { this.rq = null; this.rqError = this.err(e, 'No se pudo cargar la calidad de las reglas.'); } },
    async loadFindings() { try { this.findings = (await this.$axios.get('/qa/findings?limit=200', this.headers())).data.data || []; this.findingsError = ''; } catch (e) { this.findings = []; this.findingsError = this.err(e, 'No se pudieron cargar los hallazgos.'); } },
    async loadInventory() { try { this.inventory = (await this.$axios.get('/qa/inventory', this.headers())).data.data || []; this.inventoryError = ''; } catch (e) { this.inventory = []; this.inventoryError = this.err(e, 'No se pudo cargar el inventario.'); } },
    async loadCfg() { try { this.cfg = (await this.$axios.get('/qa/config', this.headers())).data.data; this.cfgEdit = { ...this.cfg }; } catch (e) { this.cfg = null; } },
    async guardarCfg() {
      this.guardandoCfg = true;
      try {
        const body = {}; for (const c of CFG) body[c.k] = this.cfgEdit[c.k]; body.provisorio = !!this.cfgEdit.provisorio;
        this.cfg = (await this.$axios.put('/qa/config', body, this.headers())).data.data; this.cfgEdit = { ...this.cfg };
        this.$notify({ type: 'success', icon: 'tim-icons icon-check-2', message: 'Parámetros guardados. Valen desde el próximo cálculo.' });
      } catch (e) { this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: this.err(e, 'No se pudieron guardar los parámetros.') }); }
      finally { this.guardandoCfg = false; }
    },
    async recalcularRel() {
      this.recalcRel = true;
      try { await this.$axios.post('/qa/reliability/recompute', {}, this.headers()); await this.loadRel(); }
      catch (e) { this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: this.err(e, 'No se pudo recalcular.') }); }
      finally { this.recalcRel = false; }
    },
    async recalcularRq() {
      this.recalcRq = true;
      try { await this.$axios.post('/qa/rule-quality/recompute', {}, this.headers()); this.$notify({ type: 'info', icon: 'tim-icons icon-time-alarm', message: 'Reproduciendo 30 días con el motor: tarda unos 25 min. Volvé a abrir la pestaña después.' }); }
      catch (e) { this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: this.err(e, 'No se pudo iniciar el cálculo.') }); this.recalcRq = false; }
    },
    async onToggleRule({ packId, ruleId, enabled, done }) {
      try { await this.$axios.patch(`/rulepacks/${encodeURIComponent(packId)}/rules/${encodeURIComponent(ruleId)}/enabled`, { enabled }, this.headers()); }
      catch (e) { this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: 'No se pudo cambiar el estado de la regla.' }); }
      finally { await this.loadInventory(); if (done) done(); }
    },
    async onTogglePack({ packId, enabled, done }) {
      try { await this.$axios.patch(`/rulepacks/${encodeURIComponent(packId)}/enabled`, { enabled }, this.headers()); }
      catch (e) { this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: 'No se pudo cambiar el estado del pack.' }); }
      finally { await this.loadInventory(); if (done) done(); }
    },
  },
};
</script>

<style>
/* spec_supervisor_confiabilidad_v2 (R4) — estilos del supervisor v2. Tokens en .qav2 (tema oscuro de la
   plataforma) y redefinidos para body.white-content (tema claro). Sin scoped: los usan los subcomponentes qv-*. */
.qav2 {
  --qv-card: #27293d; --qv-card2: #2e3048; --qv-ink: #e9ebf5; --qv-mut: #9ea3c0; --qv-line: #3a3d58;
  --qv-acc: #00bf9a; --qv-acc-ink: #062019; --qv-acc-soft: rgba(0, 191, 154, .16);
  --qv-ok: #3ddc97; --qv-okb: rgba(61, 220, 151, .14); --qv-atn: #f2c94c; --qv-atnb: rgba(242, 201, 76, .16);
  --qv-mal: #ff6b78; --qv-malb: rgba(255, 107, 120, .15); --qv-info: #6fb1f2; --qv-infob: rgba(111, 177, 242, .15);
  --qv-grid: rgba(233, 235, 245, .08); --qv-band: rgba(0, 191, 154, .18);
  color: var(--qv-ink); display: flex; flex-direction: column; gap: 16px; padding-bottom: 32px;
}
body.white-content .qav2 {
  --qv-card: #fff; --qv-card2: #f0f2f7; --qv-ink: #1d2233; --qv-mut: #5f6680; --qv-line: #dfe3ec;
  --qv-acc: #00a585; --qv-acc-ink: #fff; --qv-acc-soft: rgba(0, 165, 133, .12);
  --qv-ok: #0f8a5f; --qv-okb: rgba(15, 138, 95, .12); --qv-atn: #a26f00; --qv-atnb: rgba(232, 183, 48, .18);
  --qv-mal: #c22d3a; --qv-malb: rgba(217, 58, 70, .12); --qv-info: #2f6fb0; --qv-infob: rgba(59, 130, 196, .13);
  --qv-grid: rgba(29, 34, 51, .08); --qv-band: rgba(0, 165, 133, .14);
}
.qav2 .qv-stack { display: flex; flex-direction: column; gap: 16px; }
.qav2 .qv-head { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-end; justify-content: space-between; }
.qav2 .qv-h1 { margin: 0; font-size: 22px; font-weight: 700; color: var(--qv-ink); }
.qav2 .qv-h { margin: 0; font-size: 16px; font-weight: 600; color: var(--qv-ink); }
.qav2 .qv-h4 { margin: 0; font-size: 14px; font-weight: 600; color: var(--qv-ink); }
.qav2 p { margin: 0; color: inherit; }
.qav2 .qv-num { font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; }
.qav2 .qv-mut { color: var(--qv-mut); }
.qav2 .qv-small { font-size: 12.5px; }
.qav2 .qv-note { font-size: 12.5px; color: var(--qv-mut); max-width: 80ch; }
.qav2 .qv-eyebrow { font-size: 11.5px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--qv-acc); }
.qav2 .qv-row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.qav2 .qv-between { justify-content: space-between; }
.qav2 .qv-sep { border-bottom: 1px solid var(--qv-line); padding-bottom: 10px; }
.qav2 .qv-card { background: var(--qv-card); border: 1px solid var(--qv-line); border-radius: 12px; padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.qav2 .qv-grid { display: grid; gap: 16px; }
.qav2 .qv-g2 { grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); }
.qav2 .qv-g3 { grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); }
.qav2 .qv-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--qv-line); overflow-x: auto; }
.qav2 .qv-tabs button { font: inherit; font-weight: 600; font-size: 13.5px; color: var(--qv-mut); background: none; border: 0; border-bottom: 3px solid transparent; padding: 10px 14px; cursor: pointer; white-space: nowrap; }
.qav2 .qv-tabs button[aria-selected="true"] { color: var(--qv-ink); border-bottom-color: var(--qv-acc); }
.qav2 button:focus-visible, .qav2 tr[tabindex]:focus-visible { outline: 2px solid var(--qv-acc); outline-offset: 2px; }
.qav2 .qv-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--qv-card2); color: var(--qv-mut); white-space: nowrap; }
.qav2 .qv-pill--ok { background: var(--qv-okb); color: var(--qv-ok); } .qav2 .qv-pill--atn { background: var(--qv-atnb); color: var(--qv-atn); }
.qav2 .qv-pill--mal { background: var(--qv-malb); color: var(--qv-mal); } .qav2 .qv-pill--info { background: var(--qv-infob); color: var(--qv-info); }
.qav2 .qv-verdict { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); border: 1px solid var(--qv-line); border-radius: 12px; background: var(--qv-card); overflow: hidden; }
.qav2 .qv-verdict > div { padding: 14px 18px; display: flex; gap: 12px; align-items: flex-start; border-right: 1px solid var(--qv-line); }
.qav2 .qv-verdict > div:last-child { border-right: 0; }
.qav2 .qv-sig { flex: 0 0 auto; width: 10px; height: 10px; border-radius: 50%; margin-top: 6px; }
.qav2 .qv-sig.qv-ok { background: var(--qv-ok); } .qav2 .qv-sig.qv-atn { background: var(--qv-atn); } .qav2 .qv-sig.qv-mal { background: var(--qv-mal); }
.qav2 .qv-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 12px; }
.qav2 .qv-kpi { background: var(--qv-card); border: 1px solid var(--qv-line); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.qav2 .qv-kpi__lab { font-size: 12.5px; color: var(--qv-mut); font-weight: 500; }
.qav2 .qv-kpi__val { font-size: 24px; font-weight: 600; line-height: 1.15; color: var(--qv-ink); }
.qav2 .qv-kpi__ci { font-size: 12px; color: var(--qv-mut); }
.qav2 .qv-conf { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; margin-right: 4px; }
.qav2 .qv-conf--alta { background: var(--qv-okb); color: var(--qv-ok); } .qav2 .qv-conf--media { background: var(--qv-atnb); color: var(--qv-atn); } .qav2 .qv-conf--baja { background: var(--qv-malb); color: var(--qv-mal); }
.qav2 .qv-tbl { overflow-x: auto; border: 1px solid var(--qv-line); border-radius: 10px; }
.qav2 table { border-collapse: collapse; width: 100%; font-size: 13px; color: var(--qv-ink); }
.qav2 th, .qav2 td { padding: 9px 12px; text-align: left; border-bottom: 1px solid var(--qv-line); white-space: nowrap; }
.qav2 th { font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--qv-mut); background: var(--qv-card2); }
.qav2 td.r, .qav2 th.r { text-align: right; }
.qav2 tbody tr:last-child td { border-bottom: 0; }
.qav2 tr[tabindex] { cursor: pointer; }
.qav2 tr[tabindex]:hover td, .qav2 tr.sel td { background: var(--qv-acc-soft); }
.qav2 .qv-prog { height: 6px; width: 90px; border-radius: 3px; background: var(--qv-card2); overflow: hidden; }
.qav2 .qv-prog > i { display: block; height: 100%; background: var(--qv-acc); }
.qav2 svg { display: block; width: 100%; height: auto; }
.qav2 line.qv-gl { stroke: var(--qv-grid); stroke-width: 1; }
.qav2 .qv-axis { fill: var(--qv-mut); font: 11px "IBM Plex Mono", ui-monospace, monospace; }
.qav2 .qv-lab { fill: var(--qv-ink); font-size: 12px; }
.qav2 .qv-line { fill: none; stroke: var(--qv-acc); stroke-width: 2.2; }
.qav2 .qv-band { fill: var(--qv-band); }
.qav2 .qv-mark { stroke: var(--qv-mal); stroke-width: 1.5; stroke-dasharray: 4 4; }
.qav2 .qv-limit { stroke: var(--qv-atn); stroke-width: 1.5; stroke-dasharray: 5 4; }
.qav2 rect.qv-up { fill: var(--qv-okb); } .qav2 rect.qv-falla { fill: var(--qv-mal); } .qav2 rect.qv-red { fill: var(--qv-info); } .qav2 rect.qv-sitio { fill: var(--qv-atn); }
.qav2 rect.qv-bar { fill: var(--qv-acc); } .qav2 rect.qv-bar--alta { fill: var(--qv-atn); }
.qav2 .qv-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--qv-mut); }
.qav2 .qv-legend i { display: inline-block; width: 12px; height: 8px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
.qav2 .qv-legend i.qv-up { background: var(--qv-okb); } .qav2 .qv-legend i.qv-falla { background: var(--qv-mal); } .qav2 .qv-legend i.qv-red { background: var(--qv-info); } .qav2 .qv-legend i.qv-sitio { background: var(--qv-atn); }
.qav2 .qv-empty { display: grid; place-items: center; min-height: 120px; border: 1px dashed var(--qv-line); border-radius: 10px; color: var(--qv-mut); text-align: center; padding: 16px; font-size: 13px; }
.qav2 .qv-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.qav2 .qv-chip { font: inherit; font-size: 12.5px; font-weight: 600; border: 1px solid var(--qv-line); background: var(--qv-card); color: var(--qv-mut); border-radius: 999px; padding: 5px 12px; cursor: pointer; }
.qav2 .qv-chip[aria-pressed="true"] { background: var(--qv-acc); color: var(--qv-acc-ink); border-color: var(--qv-acc); }
.qav2 .qv-rule { border: 1px solid var(--qv-line); border-radius: 12px; background: var(--qv-card); display: grid; grid-template-columns: 6px 1fr; overflow: hidden; }
.qav2 .qv-rule__stripe.qv-ok { background: var(--qv-ok); } .qav2 .qv-rule__stripe.qv-atn { background: var(--qv-atn); } .qav2 .qv-rule__stripe.qv-mal { background: var(--qv-mal); } .qav2 .qv-rule__stripe.qv-info { background: var(--qv-info); }
.qav2 .qv-rule__body { padding: 14px 18px; display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); min-width: 0; }
.qav2 .qv-rule__body > div { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.qav2 .qv-math, .qav2 .qv-formula { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12.5px; background: var(--qv-card2); border-radius: 8px; padding: 8px 10px; white-space: pre-wrap; word-break: break-word; color: var(--qv-ink); }
.qav2 .qv-formula { white-space: pre-wrap; font-size: 12px; }
.qav2 .qv-todo { border-left: 3px solid var(--qv-acc); padding-left: 10px; }
.qav2 .qv-ok-txt { color: var(--qv-ok); }
.qav2 .qv-btn { font: inherit; font-size: 13px; font-weight: 600; border-radius: 999px; padding: 7px 14px; cursor: pointer; border: 1px solid var(--qv-acc); background: var(--qv-acc); color: var(--qv-acc-ink); }
.qav2 .qv-btn--sec { background: transparent; color: var(--qv-ink); border-color: var(--qv-line); }
.qav2 .qv-btn:disabled { opacity: .6; cursor: default; }
.qav2 .qv-nums { display: flex; gap: 18px; flex-wrap: wrap; }
.qav2 .qv-nums b { font-size: 20px; display: block; color: var(--qv-ink); }
.qav2 .qv-hallazgo { border-top: 1px solid var(--qv-line); padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.qav2 .qv-defs { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 12px; }
.qav2 .qv-card > .qv-btn { align-self: flex-start; }
.qav2 .qv-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 12px; }
.qav2 .qv-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--qv-mut); }
.qav2 .qv-in { background: var(--qv-card2); border: 1px solid var(--qv-line); border-radius: 8px; color: var(--qv-ink); padding: 7px 10px; font: inherit; }
.qav2 .qv-check { flex-direction: row !important; align-items: center; }
.qav2 details > summary { cursor: pointer; }
@media (max-width: 560px) { .qav2 .qv-kpi__val { font-size: 21px; } .qav2 .qv-verdict > div { border-right: 0; border-bottom: 1px solid var(--qv-line); } }
</style>
