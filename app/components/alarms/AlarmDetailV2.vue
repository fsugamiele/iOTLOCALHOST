<template>
  <!-- spec_detalle_alarma_v2 + propuesta Alarmas (2026-11) — una pantalla para todas las alarmas.
       Encabezado · Qué está pasando + Qué hacer · Gráfico · Por qué saltó · Contexto.
       Datos: GET /api/alarms/:id/detail (bloque v2). Sin términos del backend en pantalla. -->
  <div class="ad2">
    <p v-if="loading && !detail" class="ad2-hint">Cargando la alarma…</p>
    <div v-else-if="error" class="ad2-card">
      <p class="mb-2">{{ notFound ? 'No encontramos esta alarma o no tenés acceso.' : 'No se pudo cargar la alarma.' }}</p>
      <button type="button" class="ad2-btn sec" @click="cargar">Reintentar</button>
    </div>

    <template v-else-if="alarm">
      <!-- ═══ ENCABEZADO: gravedad · título · hace cuánto · un solo botón ═══ -->
      <header class="ad2-head">
        <div class="ad2-head__l">
          <nav class="ad2-crumb" aria-label="Ubicación">
            <nuxt-link to="/alarmas">Alarmas</nuxt-link><span aria-hidden="true">/</span>
            <nuxt-link v-if="v2.site" :to="'/sites/' + encodeURIComponent(v2.site.siteCode)">{{ sitioTxt }}</nuxt-link><span v-else>{{ sitioTxt }}</span>
            <span aria-hidden="true">/</span><span>{{ v2.perSite ? 'Todo el sitio' : (alarm.deviceName || alarm.dId) }}</span>
          </nav>
          <div class="ad2-tit">
            <span class="ad2-sev" :class="'ad2-sev--' + sev">
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16">
                <path v-if="sev === 'critical'" d="M8 1.5 15.5 14.5H0.5z" fill="currentColor"></path>
                <path v-else-if="sev === 'warning'" d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill="none" stroke="currentColor" stroke-width="2"></path>
                <circle v-else cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"></circle>
              </svg>{{ sevTxt }}
            </span>
            <h1 class="ad2-title">{{ alarm.label || 'Alarma' }}</h1>
          </div>
          <p class="ad2-sub">{{ estadoLinea }}</p>
        </div>
        <div class="ad2-head__r">
          <nuxt-link v-if="v2.site" class="ad2-btn sec" :to="'/sites/' + encodeURIComponent(v2.site.siteCode)">Ver el sitio</nuxt-link>
          <button v-if="canService && abierta" type="button" class="ad2-btn sec" :disabled="busy" @click="registrarService">Registrar service</button>
          <button v-if="puedeTomar" type="button" class="ad2-btn pri" :disabled="busy" @click="tomar">{{ esperaConfirmacion ? 'Confirmar y cerrar' : 'Tomar' }}</button>
          <span v-else-if="abierta && tomadaPor" class="ad2-tomada">Tomada por {{ tomadaPor }}</span>
        </div>
      </header>

      <div class="ad2-row ad2-row--stretch">
        <!-- ═══ QUÉ ESTÁ PASANDO ═══ -->
        <section class="ad2-card ad2-grow" aria-labelledby="ad2-s1">
          <div class="ad2-cab">
            <span class="ad2-q">{{ abierta ? 'Qué está pasando' : 'Qué pasó' }}</span>
            <h2 id="ad2-s1" class="ad2-h2 ad2-h2--g">{{ titular }}</h2>
            <p v-if="bajada" class="ad2-hint mb-0">{{ bajada }}</p>
          </div>
          <div class="ad2-kpis">
            <div v-for="k in kpis" :key="k.k" class="ad2-kpi" :class="{ fuerte: k.fuerte }">
              <span class="ad2-kpi__l">{{ k.lab }}</span>
              <b>{{ k.val }}</b>
              <span class="ad2-hint">{{ k.det }}</span>
            </div>
          </div>
          <span v-if="abierta" class="ad2-hint">Valores en vivo · se actualiza solo cada 15 s · última lectura {{ hace(ultimaLectura) }}</span>
        </section>

        <!-- ═══ QUÉ HACER ═══ -->
        <section class="ad2-card ad2-side" aria-labelledby="ad2-s3">
          <div class="ad2-cab">
            <span class="ad2-q">{{ abierta ? 'Qué hacer ahora' : 'Qué se hizo' }}</span>
            <h2 v-if="regla && regla.recommendation" id="ad2-s3" class="ad2-h2">{{ recomendacion }}</h2>
            <h2 v-else id="ad2-s3" class="ad2-h2">{{ pasos.length ? 'Seguí estos pasos' : 'Sin recomendación cargada' }}</h2>
          </div>
          <template v-if="pasos.length">
            <div class="ad2-pasos">
              <label v-for="p in pasos" :key="p.i" class="ad2-paso" :class="{ hecho: p.hecho }">
                <input type="checkbox" :checked="p.hecho" :disabled="!abierta || pasoBusy === p.i" @change="tildar(p.i, $event.target.checked)">
                <span>{{ p.txt }}<small v-if="p.hecho" class="ad2-hint d-block">{{ p.quien }}</small></span>
              </label>
            </div>
            <div class="ad2-avance">
              <span class="ad2-barras" role="img" :aria-label="avanceTxt"><i v-for="p in pasos" :key="'b' + p.i" :class="{ on: p.hecho }"></i></span>
              <span class="ad2-hint">{{ avanceTxt }}</span>
            </div>
          </template>
          <p v-else-if="!(regla && regla.recommendation)" class="ad2-hint mb-0">Se puede agregar desde el editor de reglas.</p>
          <div v-for="f in codigosFalla.filter(x => x.causes.length)" :key="'fcc' + f.dId + f.code" class="ad2-fc">
            <b>Causas posibles del código {{ f.code }} (manual del fabricante)</b>
            <ol class="ad2-fc__l"><li v-for="(c, i) in f.causes.slice(0, 8)" :key="i">{{ c }}</li></ol>
          </div>
          <p class="ad2-cierra"><b>{{ abierta ? 'Cuándo se cierra: ' : 'Cómo se cerró: ' }}</b>{{ cierreTxt }}<span v-if="abierta" class="ad2-hint d-block">Si deja de llegar un dato, no se cierra a ciegas: espera a que vuelva.</span></p>
        </section>
      </div>

      <!-- ═══ GRÁFICO ═══ -->
      <section class="ad2-card" aria-labelledby="ad2-s2g">
        <div class="ad2-charth">
          <div class="ad2-cab">
            <span class="ad2-q">{{ abierta ? 'Cómo llegó hasta acá' : 'Cómo fue' }} · {{ ventanaTxt }}</span>
            <h2 id="ad2-s2g" class="ad2-h2">{{ graficoTitulo }}</h2>
          </div>
          <div class="ad2-ctrls">
            <div v-if="series.length > 1" class="ad2-seg" role="group" aria-label="Medición del gráfico">
              <button v-for="(s, i) in series" :key="s.k" type="button" :class="{ on: serieIdx === i }" :aria-pressed="serieIdx === i ? 'true' : 'false'" @click="elegirSerie(i)">{{ s.tab }}</button>
            </div>
            <div class="ad2-seg" role="group" aria-label="Período del gráfico">
              <button type="button" :class="{ on: win === 'episodio' }" :aria-pressed="win === 'episodio' ? 'true' : 'false'" @click="elegirWin('episodio')">Esta alarma</button>
              <button type="button" :class="{ on: win === '24h' }" :aria-pressed="win === '24h' ? 'true' : 'false'" @click="elegirWin('24h')">24 horas</button>
            </div>
          </div>
        </div>
        <alarm-trend-chart v-if="series.length" :series="series" :idx="serieIdx" :from="v2.from" :until="v2.until" :now-ms="nowMs" :abierta="abierta"
          :fired-at="firedAt" :resolved-at="alarm.resolvedAt || null" :forecast="proyeccion" :events="eventosGrafico" :bucket-ms="v2.bucketMs || 60000" :file-name="archivo" />
        <p v-else class="ad2-hint mb-0">No hay lecturas guardadas de estas mediciones en ese período.</p>
      </section>

      <!-- ═══ POR QUÉ SALTÓ ═══ -->
      <section class="ad2-card" aria-labelledby="ad2-s2">
        <div class="ad2-cab">
          <span class="ad2-q">Por qué saltó</span>
          <h2 id="ad2-s2" class="ad2-h2">{{ porQueTitulo }}</h2>
        </div>
        <div class="ad2-tscroll">
          <table class="ad2-tabla">
            <thead><tr><th scope="col">Condición</th><th scope="col">Al avisar ({{ hora(firedAt, true) }})</th><th v-if="abierta" scope="col">Ahora</th><th v-if="abierta" scope="col">Estado</th></tr></thead>
            <tbody>
              <tr v-for="c in condiciones" :key="c.k">
                <td>{{ c.txt }}<span v-if="c.equipo" class="ad2-hint d-block">{{ c.equipo }}</span></td>
                <td>{{ c.antes }}</td>
                <td v-if="abierta">{{ c.ahora }}</td>
                <td v-if="abierta"><span class="ad2-est" :class="c.ahoraCls">{{ c.estTxt }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- spec_perfiles_controladora (Qp5) — el código de falla con su significado (perfil de la controladora). -->
        <div v-for="f in codigosFalla" :key="'fc' + f.dId + f.code" class="ad2-fc">
          <b>Código {{ f.code }}<template v-if="f.known"> · {{ f.name }}</template></b>
          <span class="ad2-hint">{{ f.deviceName }}<template v-if="f.model"> · {{ f.model }}</template><template v-if="f.tipo"> · {{ f.tipo }}</template></span>
          <span v-if="f.logic" class="ad2-hint">Según el fabricante: {{ f.logic }}</span>
          <span v-if="!f.known" class="ad2-hint">El código no está en el diccionario de esta controladora.</span>
        </div>
      </section>

      <!-- ═══ CONTEXTO ═══ -->
      <div class="ad2-row ad2-row--stretch">
        <section class="ad2-card ad2-tercio" aria-labelledby="ad2-c1">
          <h2 id="ad2-c1" class="ad2-h3">{{ abierta ? 'Qué pasó en el sitio' : 'Qué pasaba en el sitio' }}</h2>
          <ol class="ad2-tl">
            <li v-for="(e, i) in timeline" :key="'t' + i" :class="{ actual: e.actual }">
              <span class="ad2-tl__h">{{ hora(e.ts, true) }}</span>
              <span>{{ e.txt }}<span class="ad2-hint d-block">{{ e.sub }}</span></span>
            </li>
          </ol>
          <template v-if="ctx.abiertas.length">
            <b class="ad2-sep">Otras alarmas abiertas del sitio</b>
            <ul class="ad2-otras">
              <li v-for="o in ctx.abiertas" :key="String(o.notificationId)">
                <nuxt-link :to="'/alarmas/' + o.notificationId">{{ o.label || 'Alarma' }}</nuxt-link>
                <span class="ad2-hint d-block">{{ sevLabel(o.severity) }} · hace {{ dur(Math.round((nowMs - o.firedAt) / 1000)) }}</span>
              </li>
            </ul>
          </template>
        </section>

        <section class="ad2-card ad2-tercio" aria-labelledby="ad2-c2">
          <h2 id="ad2-c2" class="ad2-h3">Equipos del sitio {{ abierta ? 'ahora' : '(estado actual)' }}</h2>
          <ul class="ad2-eqs">
            <li v-for="q in equipos" :key="q.dId">
              <span>{{ q.uso }}<span class="ad2-hint d-block">{{ q.name }}{{ q.esEste ? ' · el de esta alarma' : '' }}</span></span>
              <span class="ad2-eq__v"><b :class="q.cls">{{ q.est }}</b><span class="ad2-hint d-block">{{ q.det }}</span></span>
            </li>
          </ul>
        </section>

        <section class="ad2-card ad2-tercio" aria-labelledby="ad2-c3">
          <h2 id="ad2-c3" class="ad2-h3">{{ antecedentesTitulo }}</h2>
          <div class="ad2-dias-w">
            <div class="ad2-dias" role="img" :aria-label="diasAria">
              <i v-for="d in dias30" :key="d.k" :class="{ on: d.n > 0 }" :title="d.titulo"></i>
            </div>
            <div class="ad2-dias__e"><span>{{ dias30[0].fecha }}</span><span>hoy</span></div>
          </div>
          <p class="mb-0">{{ antecedentesTxt }}</p>
        </section>
      </div>

      <p class="ad2-pie">
        <span v-if="textoFicha">{{ textoFicha }}.</span>
        <nuxt-link v-if="packId" :to="'/rulepacks/' + encodeURIComponent(packId)">Ver la regla</nuxt-link>
      </p>
    </template>
  </div>
</template>

<script>
import { ruleToModel, opsFor } from '@/components/rules/ruleModelV2.js';
import { formatDuration } from '@/utils/format';
import { usoEquipo, valor as valorTxt, diaMes } from '@/utils/alarmWords';
import AlarmTrendChart from '@/components/alarms/AlarmTrendChart.vue';

const SEV = { info: 'Informativa', warning: 'Advertencia', critical: 'Crítica' };
const ESTADO = { si: ['se cumple', 'mal'], no: ['no se cumple', 'ok'], jun: ['juntando lecturas', 'gris'], sin: ['sin dato', 'gris'] };
const CIERRE = {
  'resolve-by-condition': 'sola, al normalizarse', 'resolve-by-setpoint-recovered': 'sola, al volver el límite del equipo',
  'resolve-by-ack': 'con la confirmación del operador', 'resolve-by-service': 'al registrar el service', 'resolve-by-edit': 'al editar la regla', 'resolve-by-cleanup': 'por limpieza manual (llevaba muchas horas abierta)',
};
const ETAPA = { E2: 'Observando', E3: 'En alarma', E4: 'Recuperándose', E5: 'Sin datos', E6: 'Esperando confirmación' };
const METRICA = {
  slope: 'cambia por minuto', projection: 'llega al valor en', acceleration: 'cambia de ritmo', ratio: 'relación', divergence: 'diferencia',
  dutyCycle: '% del tiempo en uso', cumulativeSince: 'bajó en total', flatline: 'cambió', staleness: 'sin reportar', variance: 'oscilación',
  accumulator: 'horas de uso', stepJump: 'salto', baseline: 'se aparta de lo habitual',
};

export default {
  name: 'AlarmDetailV2',
  components: { AlarmTrendChart },
  head() { return { title: (this.alarm && this.alarm.label) || 'Detalle de alarma' }; },
  data() {
    return { detail: null, loading: false, error: false, notFound: false, busy: false, pasoBusy: null, serieIdx: 0, nowMs: Date.now(), packId: null, win: 'episodio' };
  },
  computed: {
    alarm() { return this.detail && this.detail.alarm; },
    v2() { return (this.detail && this.detail.v2) || { conditions: [], live: [], series: [], context: { timeline: [], equipos: [], abiertas: [], anterior: null }, stepsDone: [] }; },
    ctx() { return this.v2.context || { timeline: [], equipos: [], abiertas: [], anterior: null }; },
    regla() { return this.v2.rule || null; },
    sev() { return (this.alarm && this.alarm.severity) || 'info'; },
    sevTxt() { return SEV[this.sev] || 'Alarma'; },
    abierta() { return !!this.alarm && this.alarm.state !== 'resolved'; },
    firedAt() { return this.alarm ? (this.alarm.firedAt != null ? this.alarm.firedAt : this.alarm.time) : null; },
    edadSeg() { return this.firedAt ? Math.max(0, Math.round((this.nowMs - this.firedAt) / 1000)) : 0; },
    sitioTxt() { const s = this.v2.site; if (!s) return this.alarm.siteId || 'Sitio'; return s.nombre && s.nombre !== s.siteCode ? `${s.siteCode} · ${s.nombre}` : s.siteCode; },
    tomadaPor() { return this.v2.ackBy || (this.alarm && this.alarm.acknowledgedBy) || null; },
    tomadaAt() { return this.v2.ackAt || (this.alarm && this.alarm.ackAt) || null; },
    fsm() { return this.detail && this.detail.fsm; },
    esperaConfirmacion() { return !!(this.fsm && this.fsm.step === 'E6'); },
    puedeTomar() { return this.abierta && (!this.tomadaPor || this.esperaConfirmacion); },
    canService() { return !!(this.detail && this.detail.rule && this.detail.rule.canService); },
    etapaTxt() { return this.abierta && this.fsm && ETAPA[this.fsm.step] && this.fsm.step !== 'E3' ? ETAPA[this.fsm.step] : ''; },
    modelo() { try { return this.regla ? ruleToModel(this.regla, { deviceType: this.regla.deviceType }) : null; } catch (e) { return null; } },
    union() { return this.regla && this.regla.crossExpr && this.regla.crossExpr.op === 'OR' ? 'alguna' : 'todas'; },

    estadoLinea() {
      const quien = this.tomadaPor ? `la tomó ${this.tomadaPor}${this.tomadaAt ? ' a las ' + this.hora(this.tomadaAt, true) : ''}` : (this.abierta ? 'nadie la tomó todavía' : 'nadie la tomó');
      if (this.abierta) return `Abierta hace ${this.dur(this.edadSeg)}, desde las ${this.cuandoFue(this.firedAt)} · ${quien}${this.etapaTxt ? ' · ' + this.etapaTxt.toLowerCase() : ''}`;
      return `Cerrada · saltó el ${this.fecha(this.firedAt)} a las ${this.hora(this.firedAt, true)} y duró ${this.dur(this.alarm.durationSec)} · ${quien}`;
    },

    // ── 1 · Qué está pasando ──
    titular() {
      if (this.regla && this.regla.meaning) return String(this.regla.meaning).replace(/\{umbral\}/g, this.umbralTxtGeneral);
      const r = this.recomendacion; const m = r ? r.match(/^.*?[.!?](\s|$)/) : null; const p = m ? m[0].trim() : r;
      return p || (this.alarm && this.alarm.label) || 'Alarma';
    },
    bajada() {
      if (!this.abierta) return `Saltó el ${this.fecha(this.firedAt)} y estuvo abierta ${this.dur(this.alarm.durationSec)}.`;
      const eta = this.eta;
      if (eta != null) return `Si sigue así, llega al límite en aproximadamente ${this.dur(eta * 60)}.`;
      if (this.autonomia) return `Con lo que queda, la autonomía estimada es de ${this.dur(Math.round(this.autonomia.hours * 3600))}.`;
      return `Saltó a las ${this.hora(this.firedAt, true)} y sigue abierta.`;
    },
    eta() { const f = this.detail && this.detail.forecast; return f && typeof f.etaMinutes === 'number' ? f.etaMinutes : null; },
    autonomia() { const a = this.detail && this.detail.autonomy; return a && typeof a.hours === 'number' ? a : null; },
    kpis() {
      const out = [];
      if (!this.abierta) {
        const ant = this.cierreModo;
        out.push({ k: 'dur', lab: 'Duró', val: this.dur(this.alarm.durationSec), det: `de ${this.hora(this.firedAt, true)} a ${this.hora(this.alarm.resolvedAt, true)}`, fuerte: true });
        out.push({ k: 'cierre', lab: 'Cómo se cerró', val: ant ? ant.charAt(0).toUpperCase() + ant.slice(1) : '—', det: '' });
        out.push({ k: 'quien', lab: 'Quién la tomó', val: this.tomadaPor || 'Nadie', det: this.tomadaAt ? this.hora(this.tomadaAt, true) : '' });
        if (this.pasos.length) out.push({ k: 'pasos', lab: 'Pasos hechos', val: `${this.pasos.filter(p => p.hecho).length} de ${this.pasos.length}`, det: '' });
        return out;
      }
      if (this.eta != null) out.push({ k: 'eta', lab: 'Llega al límite en', val: this.dur(this.eta * 60), det: 'al ritmo actual', fuerte: true });
      else if (this.autonomia) out.push({ k: 'aut', lab: 'Autonomía estimada', val: this.dur(Math.round(this.autonomia.hours * 3600)), det: 'con lo que queda', fuerte: true });
      else out.push({ k: 'edad', lab: 'En alarma hace', val: this.dur(this.edadSeg), det: `desde las ${this.hora(this.firedAt, true)}`, fuerte: true });
      for (const l of (this.v2.live || []).slice(0, 3)) {
        out.push({ k: l.dId + l.variable, lab: `${this.varNombre(l)}${(this.v2.live || []).length > 1 ? ' · ' + this.nombreUso(l.dId, l.deviceType, l.deviceName) : ''}`, val: this.valor(l.value, l), det: l.time ? 'leído ' + this.hace(l.time) : 'sin lectura' });
      }
      return out;
    },
    ultimaLectura() { const ts = (this.v2.live || []).map(l => l.time).filter(Boolean); return ts.length ? Math.max(...ts) : null; },

    codigosFalla() {
      const T = { warning: 'advertencia', shutdown: 'parada', event: 'evento', configurable: 'advertencia o parada (configurable)' };
      return ((this.v2 && this.v2.faultCodes) || []).map(f => ({ ...f, causes: f.causes || [], tipo: f.type ? T[f.type] || f.type : null }));
    },
    // ── 2 · Por qué saltó ──
    porQueTitulo() {
      const n = this.condiciones.length, esp = (this.regla && this.regla.graceSec) || 0;
      const t = esp ? ` durante ${this.dur(esp)} seguidos` : '';
      if (n <= 1) return `Se cumplió la condición de la regla${t}`;
      return this.union === 'alguna' ? `Se cumplió alguna de las ${n} condiciones de la regla${t}` : `Se cumplieron las ${n} condiciones de la regla${t}`;
    },
    condiciones() {
      const conds = (this.modelo && this.modelo.conds) || [];
      return (this.v2.conditions || []).map((c, i) => {
        const mc = conds[i] || null;
        const a = c.atFire || {}, n = c.now;
        const antes = a.value != null ? this.valor(a.value, c.meta, mc) : (ESTADO[a.state] || ESTADO.si)[0];
        const ahoraSt = n ? n.state : null;
        const est = ahoraSt ? (ESTADO[ahoraSt] || ESTADO.sin) : null;
        const ahoraTxt = n && n.value != null ? this.valor(n.value, c.meta, mc) : this.liveDe(c);
        const eq = (c.dIds || []).map(id => this.nombreUso(id, c.deviceType)).filter(Boolean);
        const estTxt = est ? est[0].charAt(0).toUpperCase() + est[0].slice(1) : '—';
        return { k: (c.leafId || 'L') + i, txt: this.frase(c, mc), equipo: [...new Set(eq)].join(' · '), antes, ahora: ahoraTxt, estTxt, ahoraCls: est ? est[1] : 'gris' };
      });
    },
    series() {
      // Solo mediciones con lecturas en la ventana: sin puntos la escala quedaba en ±Infinity.
      return (this.v2.series || []).filter((s) => Array.isArray(s.points) && s.points.length).map((s, i) => ({ ...s, k: s.dId + s.variable + i, tab: this.varNombre(s) + ((this.v2.series || []).length > 1 && (this.v2.series || []).some((x, j) => j !== i && x.variable === s.variable) ? ' · ' + s.deviceName : '') }));
    },
    seriePpal() { return this.series[this.serieIdx] || this.series[0] || null; },
    graficoTitulo() {
      const s = this.seriePpal; if (!s) return 'Sin lecturas en este período';
      const n = this.varNombre(s), ult = s.points[s.points.length - 1];
      const propia = s.dId === this.alarm.dId && s.variable === this.alarm.variable;
      if (this.abierta && propia && this.eta != null) return `${n}: ${valorTxt(ult.value, s)} ahora; al ritmo actual llega al límite en ${this.dur(this.eta * 60)}`;
      return `${n}: ${valorTxt(ult.value, s)} ${this.abierta ? 'ahora' : 'en la última lectura'}`;
    },
    // Estimado: solo para la medición propia de la alarma (es la que proyecta el servidor).
    proyeccion() {
      const s = this.seriePpal, f = this.detail && this.detail.forecast;
      if (!s || !this.abierta || !f || !Array.isArray(f.points) || f.points.length < 2) return null;
      return s.dId === this.alarm.dId && s.variable === this.alarm.variable ? f.points : null;
    },
    eventosGrafico() {
      const out = (this.ctx.timeline || []).filter(e => e.kind !== 'resolve' && e.kind !== 'sindatos').map(e => ({ ts: e.ts, label: e.label, severity: e.severity, actual: !!e.actual }));
      if (!out.some(e => e.actual) && this.firedAt != null) out.push({ ts: this.firedAt, label: this.alarm.label, severity: this.sev, actual: true });
      return out;
    },
    archivo() {
      const s = this.seriePpal; const d = new Date(this.firedAt || this.nowMs); const p = (n) => String(n).padStart(2, '0');
      return `alarma_${this.alarm.siteId || 'sitio'}_${s ? s.variable : 'medicion'}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    },
    ventanaTxt() {
      const h = ((this.v2.until || 0) - (this.v2.from || 0)) / 3600000;
      const t = h >= 48 ? Math.round(h / 24) + ' días' : h >= 1.5 ? Math.round(h) + ' horas' : Math.round(h * 60) + ' min';
      return `${this.abierta ? 'últimas' : 'las'} ${t}${this.abierta ? '' : ' alrededor de la alarma'}`;
    },

    // ── 3 · Cómo solucionarlo ──
    recomendacion() { return this.regla ? String(this.regla.recommendation || '').replace(/\{umbral\}/g, this.umbralTxtGeneral) : ''; },
    // {umbral}: el de la condición del límite de ficha de donde salen los textos (ej. «Cargador caído»:
    // la batería, no la red); si no, la medición propia de la regla; si no, la primera condición.
    umbralTxtGeneral() {
      const cs = this.v2.conditions || [];
      const ref = this.regla && this.regla.textos && this.regla.textos.ref;
      const c = (ref && cs.find(x => x.variable === ref.variable && (!x.deviceType || x.deviceType === ref.deviceType)))
        || (this.regla && cs.find(x => x.variable === this.regla.variable && x.atFire && typeof x.atFire.threshold === 'number'))
        || cs[0];
      const t = c && c.atFire && c.atFire.threshold;
      return typeof t === 'number' ? this.valor(t, c.meta) : 'el límite configurado';
    },
    pasos() {
      const steps = (this.regla && this.regla.steps) || [];
      const done = new Map((this.v2.stepsDone || []).map(x => [x.i, x]));
      return steps.map((txt, i) => { const d = done.get(i); return { i, txt: String(txt).replace(/\{umbral\}/g, this.umbralTxtGeneral), hecho: !!d, quien: d ? `${d.by} · ${this.hora(d.at, true)}` : '' }; });
    },
    // spec_textos_alarma_ficha (Qt3/Qt4) — de dónde salen los textos: la ficha del equipo (con su fuente).
    textoFicha() {
      const t = this.regla && this.regla.textos;
      if (!t || !['meaning', 'recommendation', 'steps'].some(k => t[k] === 'ficha')) return '';
      const src = t.source ? ` · fuente: ${t.source}` : '';
      const prov = /PROVISORIO/i.test(t.source || '') ? ' (PROVISORIO: sin manual del fabricante)' : '';
      return `Textos tomados de la ficha del equipo${src}${prov}`;
    },
    avanceTxt() {
      const n = this.pasos.filter(p => p.hecho).length;
      if (!this.abierta) return `${n} de ${this.pasos.length} pasos hechos.`;
      return n ? `${n} de ${this.pasos.length} pasos hechos · queda registrado en la alarma.` : 'Marcá cada paso a medida que lo hacés: queda registrado en la alarma.';
    },
    cierreModo() {
      // Cómo se cerró ESTA alarma: el evento de cierre del episodio (mode del resolve).
      const m = this.v2.closeMode || (this.alarm && this.alarm.kind === 'resolve' ? this.alarm.mode : null);
      return CIERRE[m] || (this.alarm && this.alarm.state === 'resolved' ? 'al normalizarse' : null);
    },
    cierreTxt() {
      if (!this.abierta) return this.cierreModo ? `Se cerró ${this.cierreModo}.` : 'Se cerró.';
      const r = this.regla || {};
      if (r.resetBehavior === 'manual') return 'Cuando se normalice, espera que el operador la confirme con "Confirmar y cerrar".';
      const c = (r.resolveGraceSec || 0) ? ` y se mantenga así ${this.dur(r.resolveGraceSec)}` : '';
      const n = this.condiciones.length;
      if (n <= 1) return `Sola, cuando deje de cumplirse la condición${c}.`;
      return this.union === 'alguna' ? `Sola, cuando ninguna de las condiciones se cumpla${c}.` : `Sola, cuando deje de cumplirse cualquiera de las condiciones${c}.`;
    },

    // ── 4 · Contexto ──
    timeline() {
      const out = (this.ctx.timeline || []).map(e => {
        const eq = this.nombreUso(e.dId, null, e.deviceName);
        if (e.kind === 'sindatos') return { ts: e.ts, txt: 'Dejó de llegar un dato', sub: eq, actual: false };
        if (e.kind === 'resolve') return { ts: e.ts, txt: `Se cerró: ${e.label || 'alarma'}`, sub: eq, actual: false };
        return { ts: e.ts, txt: e.actual ? `Esta alarma: ${e.label || ''}` : (e.label || 'Alarma'), sub: `${SEV[e.severity] || 'Alarma'} · ${e.actual && this.v2.perSite ? 'todo el sitio' : eq}`, actual: e.actual };
      });
      if (!out.some(e => e.actual)) out.push({ ts: this.firedAt, txt: `Esta alarma: ${this.alarm.label || ''}`, sub: `${this.sevTxt} · ${this.v2.perSite ? 'todo el sitio' : this.nombreUso(this.alarm.dId, null, this.alarm.deviceName || this.alarm.dId)}`, actual: true });
      return out.sort((a, b) => a.ts - b.ts);
    },
    equipos() {
      return (this.ctx.equipos || []).slice().sort((a, b) => (b.esEste - a.esEste) || String(a.name).localeCompare(String(b.name))).map(q => {
        const uso = usoEquipo(q.deviceType) || q.name;
        if (!q.reporting) return { ...q, uso, est: 'No reporta', cls: 'mal', det: q.lastSeen ? 'último dato ' + this.hace(q.lastSeen) : 'sin datos en 24 h' };
        if (q.primary && q.primary.value != null) {
          const p = q.primary;
          return { ...q, uso, est: this.valor(p.value, p), cls: '', det: p.label || String(p.variable).replace(/_/g, ' ') };
        }
        return { ...q, uso, est: 'Reporta', cls: 'ok', det: q.lastSeen ? this.hace(q.lastSeen) : '' };
      });
    },
    // Los últimos 30 días, uno por día: en cuáles saltó esta alarma (los anteriores y este).
    dias30() {
      const eps = ((this.detail && this.detail.episodes) || []).map(e => e.firedAt).concat(this.firedAt != null ? [this.firedAt] : []);
      const hoy = new Date(this.nowMs); hoy.setHours(0, 0, 0, 0);
      const out = [];
      for (let i = 29; i >= 0; i--) {
        const a = hoy.getTime() - i * 86400000, b = a + 86400000;
        const n = eps.filter(t => t >= a && t < b).length;
        out.push({ k: a, n, fecha: diaMes(a), titulo: `${diaMes(a)}: ${n ? (n === 1 ? 'saltó 1 vez' : 'saltó ' + n + ' veces') : 'sin esta alarma'}` });
      }
      return out;
    },
    diasAria() { const d = this.dias30.filter(x => x.n > 0); return d.length ? `Días con esta alarma en los últimos 30: ${d.map(x => x.fecha).join(', ')}` : 'Sin esta alarma en los últimos 30 días'; },
    antecedentesTitulo() {
      const rec = this.detail && this.detail.recurrence; const n = rec ? rec.fires30d : 0;
      if (n <= 1) return 'Primera vez en 30 días';
      return `${n} veces en 30 días`;
    },
    antecedentesTxt() {
      const rec = this.detail && this.detail.recurrence;
      const n = rec ? rec.fires30d : 0;
      const ant = this.ctx.anterior;
      const donde = this.v2.perSite ? 'en este sitio' : 'en este equipo';
      if (!ant && n <= 1) return `Es la primera vez en los últimos 30 días ${donde}.`;
      let t = `Saltó ${n} ${n === 1 ? 'vez' : 'veces'} en los últimos 30 días ${donde}.`;
      if (ant) {
        t += ` La anterior, el ${this.fecha(ant.firedAt)}`;
        if (ant.resolvedAt) t += `, duró ${this.dur(Math.round((ant.resolvedAt - ant.firedAt) / 1000))} y se cerró ${CIERRE[ant.closeMode] || 'al normalizarse'}`;
        else t += ' y no tiene cierre registrado';
        t += ant.ackBy ? ` (la tomó ${ant.ackBy}).` : '.';
      }
      return t;
    },
  },
  // keep-alive (layouts/default.vue): cada alarma es su propia instancia en caché. El id se fija al
  // crearla y los relojes se frenan al salir de la página: nunca se consulta con la ruta de OTRA
  // página (ese era el /alarms/undefined/detail).
  created() { this.alarmId = this.$route.params.id; },
  mounted() { this.cargar(); this.arrancar(); },
  activated() { if (this._yaActiva) { this.arrancar(); this.cargar(true); } this._yaActiva = true; },
  deactivated() { this.frenar(); },
  beforeDestroy() { this.frenar(); },
  methods: {
    hdr() { return { headers: { token: this.$store.state.auth.token } }; },
    arrancar() {
      this.frenar();
      this._t = setInterval(() => { this.nowMs = Date.now(); }, 1000);
      this._p = setInterval(() => { if (this.abierta && !document.hidden) this.cargar(true); }, 15000);
    },
    frenar() { clearInterval(this._t); clearInterval(this._p); this._t = this._p = null; },
    async cargar(silencioso) {
      if (!silencioso) { this.loading = true; this.error = false; this.notFound = false; }
      try {
        if (!this.alarmId) return;
        const res = await this.$axios.get(`/alarms/${encodeURIComponent(this.alarmId)}/detail${this.win === '24h' ? '?win=24h' : ''}`, this.hdr());
        if (res.data.status === 'success') {
          this.detail = res.data.data; this.nowMs = Date.now(); this.packId = (this.detail.v2 && this.detail.v2.packId) || null;
          // Medición inicial del gráfico: la propia de la alarma; si no, la primera con números.
          if (!this._serieElegida) {
            const a = this.detail.alarm, ss = this.series;
            let k = ss.findIndex(x => x.dId === a.dId && x.variable === a.variable);
            if (k < 0) k = ss.findIndex(x => x.type !== 'bool' && !(Array.isArray(x.enumValues) && x.enumValues.length) && !x.points.every(q => q.value === 0 || q.value === 1));
            this.serieIdx = k < 0 ? 0 : k;
          } else if (this.serieIdx >= this.series.length) this.serieIdx = 0;
        } else if (!silencioso) this.error = true;
      } catch (e) {
        if (!silencioso) { this.error = true; this.notFound = !!(e.response && e.response.status === 404); }
      } finally { this.loading = false; }
    },
    elegirSerie(i) { this._serieElegida = true; this.serieIdx = i; },
    elegirWin(w) { if (this.win === w) return; this.win = w; this.cargar(true); },
    // Nombre de uso del equipo (red, grupo, planta DC…); si hay dos del mismo tipo en el sitio, su nombre.
    nombreUso(dId, deviceType, respaldo) {
      const eqs = this.ctx.equipos || [];
      const q = eqs.find(e => e.dId === dId);
      const dt = (q && q.deviceType) || deviceType;
      const uso = usoEquipo(dt);
      if (!uso) return (q && q.name) || respaldo || dId || '';
      return eqs.filter(e => e.deviceType === dt).length > 1 ? ((q && q.name) || respaldo || uso) : uso;
    },
    cuandoFue(ms) { if (ms == null) return '—'; const a = new Date(ms), b = new Date(this.nowMs); return a.toDateString() === b.toDateString() ? this.hora(ms, true) : `${this.hora(ms, true)} del ${this.fecha(ms)}`; },
    async tomar() {
      if (this.busy) return; this.busy = true;
      try {
        await this.$axios.put(`/site/${encodeURIComponent(this.alarm.siteId)}/alarms/${this.alarm._id}/ack`, null, this.hdr());
        this.$notify({ type: 'success', message: this.esperaConfirmacion ? 'Confirmada: la alarma se cierra.' : 'Tomaste la alarma.' });
        await this.cargar(true); setTimeout(() => this.cargar(true), 2000);
      } catch (e) { this.$notify({ type: 'danger', message: 'No se pudo tomar la alarma.' }); } finally { this.busy = false; }
    },
    async registrarService() {
      if (this.busy) return; this.busy = true;
      try {
        await this.$axios.post(`/site/${encodeURIComponent(this.alarm.siteId)}/alarms/${this.alarm._id}/service`, null, this.hdr());
        this.$notify({ type: 'success', message: 'Service registrado: el contador vuelve a cero y la alarma se cierra.' });
        await this.cargar(true); setTimeout(() => this.cargar(true), 2000);
      } catch (e) { const m = e.response && e.response.data && e.response.data.error; this.$notify({ type: 'danger', message: m || 'No se pudo registrar el service.' }); } finally { this.busy = false; }
    },
    async tildar(i, done) {
      this.pasoBusy = i;
      try {
        const r = await this.$axios.post(`/alarms/${encodeURIComponent(this.alarmId)}/steps`, { i, done }, this.hdr());
        if (r.data && r.data.data) this.$set(this.detail.v2, 'stepsDone', r.data.data.stepsDone);
      } catch (e) { this.$notify({ type: 'danger', message: 'No se pudo registrar el paso.' }); } finally { this.pasoBusy = null; }
    },
    // ── palabras ──
    sevLabel(s) { return SEV[s] || 'Alarma'; },
    dur(sec) { return sec == null ? '—' : (formatDuration(Math.max(0, Math.round(sec))) || '—'); },
    hora(ms, corta) { if (ms == null) return '—'; const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return corta ? `${p(d.getHours())}:${p(d.getMinutes())}` : `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; },
    fecha(ms) { if (ms == null) return '—'; const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}`; },
    hace(ms) { if (!ms) return '—'; const s = Math.max(0, Math.round((this.nowMs - ms) / 1000)); return s < 60 ? `hace ${s} s` : `hace ${this.dur(s)}`; },
    varNombre(x) { return (x && (x.label || (x.meta && x.meta.label))) || String((x && x.variable) || 'medición').replace(/_/g, ' '); },
    valor(v, meta, mc) {
      if (v == null) return '—';
      const m = meta || {};
      if (Array.isArray(m.enumValues) && m.enumValues.length) {
        const e = m.enumValues.find(z => String(typeof z === 'object' ? z.value : z) === String(v));
        if (e) return typeof e === 'object' ? (e.label || e.value) : e;
      }
      if (m.type === 'bool' || typeof v === 'boolean') return (v === true || v === 1 || v === '1') ? 'sí' : 'no';
      if (typeof v !== 'number') return String(v);
      const med = mc && mc.medida;
      const n = (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100).toString().replace('.', ',');
      if (med === 'proyeccion') return `${n} h`;
      if (med === 'tendencia') return `${n}${m.unit ? ' ' + m.unit : ''}/min`;
      if (med === 'sinreporte') return `${n} min`;
      if (med === 'vida') return `${n} h`;
      if (med === 'uso') return `${n} %`;
      if (med === 'anormal') return `${n} veces lo normal`;
      return `${n}${m.unit ? ' ' + m.unit : ''}`;
    },
    liveDe(c) {
      const l = (this.v2.live || []).find(x => x.variable === c.variable && (c.dIds || []).includes(x.dId));
      return l && l.value != null ? this.valor(l.value, l) : 'sin dato';
    },
    // Frase de cada condición, en palabras (mismo vocabulario que el editor de reglas).
    frase(c, mc) {
      const v = this.varNombre(c);
      const quien = '';   // el equipo va debajo de la condición, con su nombre de uso
      const u = c.meta && c.meta.unit ? ` ${c.meta.unit}` : '';
      const thr = c.atFire && typeof c.atFire.threshold === 'number' ? c.atFire.threshold : null;
      if (mc) {
        const op = (opsFor(mc.medida, ['bool', 'categorical', 'string'].includes(c.meta && c.meta.type)).find(o => o.v === mc.op) || {}).t || '';
        const val = mc.valor !== '' ? mc.valor : (thr != null ? this.valor(thr, c.meta) : 'el límite de la ficha');
        switch (mc.medida) {
          case 'valor': {
            if (c.meta && c.meta.type === 'bool') return `${v}${quien} ${op} «${String(mc.valor) === '1' ? 'sí' : 'no'}»`;
            if (mc.valor === '') return `${v}${quien} ${op} ${val}`;
            const en = this.valor(isNaN(Number(mc.valor)) ? mc.valor : Number(mc.valor), c.meta);
            return `${v}${quien} ${op} ${en}`;
          }
          case 'limite': return `${v}${quien} ${op} el límite que informa el equipo${thr != null ? ' (' + this.valor(thr, c.meta) + ')' : ''}`;
          case 'tendencia': return `${v}${quien} ${op} ${mc.valor}${u} por minuto (últimos ${mc.ventana} min)`;
          case 'proyeccion': return `${v}${quien} vaya a llegar a ${mc.objetivo}${u} en menos de ${mc.valor} h`;
          case 'sinreporte': return `${v}${quien} lleve sin reportarse más de ${mc.valor} min`;
          case 'clavado': return `${v}${quien} quedó clavada (cambió menos de ${mc.valor}${u} en ${mc.ventana} min)`;
          case 'vida': return `${v}${quien} acumule más de ${mc.valor} h de uso`;
          case 'anormal': return `${v}${quien} ${mc.op === 'baja' ? 'baje' : 'suba'} más de lo habitual (${mc.valor} veces lo normal)`;
          default: return `${v}${quien} · ${(MEDIDA_TXT[mc.medida] || 'cómo evoluciona')} ${op} ${mc.valor}`;
        }
      }
      if (this.regla && this.regla.type === 'S' && this.regla.window) {
        const w = this.regla.window;
        return `${v}${quien} pasó ${w.count || 'N'} veces en ${w.durationSec ? this.dur(w.durationSec) : 'el período'}`;
      }
      const met = c.metric ? METRICA[c.metric] : null;
      return `${v}${quien}${met ? ' · ' + met : ''}${thr != null ? ' (límite ' + this.valor(thr, c.meta) + ')' : ''}`;
    },
  },
};
const MEDIDA_TXT = { cambio: 'cambio de ritmo', relacion: 'relación con otra medición', diferencia: 'diferencia con otra medición', uso: '% del tiempo en uso', caida: 'caída desde la última recarga', inestable: 'oscilación', salto: 'salto brusco', anormal: 'fuera de lo habitual' };
</script>

<style scoped>
/* Propuesta Alarmas (2026-11). Paleta de la plataforma (black-dashboard): claro #f5f6fa/#fff ·
   oscuro #1e1e2f/#27293d. Color solo para la gravedad, siempre con ícono y palabra. */
.ad2 { --card: #fff; --card2: #f5f6fa; --ink: #1d253b; --mut: #5f6478; --line: #e3e4ec; --acc: #00705d;
  --ok: #1f7a52; --okb: #e3f4ea; --mal: #b4232c; --malb: #fbe3e5; --atn: #8a5a00; --atnb: #fbf0d9; --gris: #5f6478; --grisb: #eef0f5;
  --serie: #00866f; --sev-crit: #d93a46; --sev-warn: #c98a00; --pri: #00bf9a; --pri-ink: #062019;
  color: var(--ink); font-size: 15px; line-height: 1.5; display: flex; flex-direction: column; gap: 20px; padding-bottom: 24px; max-width: 1240px; margin: 0 auto; }
body:not(.white-content) .ad2 { --card: #27293d; --card2: #1e1e2f; --ink: #eef0f7; --mut: #a9aec6; --line: #3b3d55; --acc: #5fe0b4;
  --ok: #7be0a8; --okb: #173b2c; --mal: #ffb3bc; --malb: #4a2530; --atn: #f8c471; --atnb: #3a3018; --gris: #c9cde0; --grisb: #34375a;
  --serie: #5fe0b4; --sev-crit: #ff9aa5; --sev-warn: #f8c471; --pri: #5fe0b4; --pri-ink: #0d1f19; }
.ad2 a { color: var(--acc); }
.ad2-card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ad2-hint { font-size: 13px; color: var(--mut); }
.ad2-cab { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ad2-q { font-size: 13px; font-weight: 600; color: var(--mut); }
.ad2-h2 { font-size: 18px; font-weight: 600; margin: 0; color: var(--ink); line-height: 1.35; }
.ad2-h2--g { font-size: 21px; }
.ad2-h3 { font-size: 16px; font-weight: 600; margin: 0; color: var(--ink); }
.ad2-row { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.ad2-row--stretch { align-items: stretch; }
.ad2-grow { flex: 999 1 560px; }
.ad2-side { flex: 1 1 360px; }
.ad2-tercio { flex: 1 1 320px; }
.ad2-sep { border-top: 1px solid var(--line); padding-top: 14px; }

.ad2-head { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: flex-end; justify-content: space-between; }
.ad2-head__l { flex: 999 1 480px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ad2-head__r { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ad2-crumb { font-size: 13px; color: var(--mut); display: flex; flex-wrap: wrap; gap: 8px; }
.ad2-tit { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; }
.ad2-title { font-size: 30px; font-weight: 700; margin: 0; line-height: 1.2; color: var(--ink); letter-spacing: -0.01em; }
.ad2-sub { margin: 0; font-size: 15px; color: var(--gris); }
.ad2-sev { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; color: var(--mut); white-space: nowrap; }
.ad2-sev--warning { color: var(--atn); } .ad2-sev--critical { color: var(--mal); }
.ad2-btn { font: inherit; font-size: 15px; font-weight: 600; border-radius: 10px; padding: 0 18px; min-height: 44px; cursor: pointer; display: inline-flex; align-items: center; text-decoration: none; }
.ad2-btn.pri { background: var(--pri); border: 1px solid var(--pri); color: var(--pri-ink); font-weight: 700; padding: 0 28px; }
.ad2 a.ad2-btn.sec, .ad2-btn.sec { background: transparent; border: 1px solid var(--line); color: var(--ink); }
.ad2-btn:disabled { opacity: .5; cursor: default; }
.ad2-tomada { min-height: 44px; padding: 0 18px; display: inline-flex; align-items: center; border-radius: 10px; border: 1px solid var(--ok); color: var(--ok); font-weight: 600; }

.ad2-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px 24px; }
.ad2-kpi { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ad2-kpi__l { font-size: 13px; color: var(--gris); }
.ad2-kpi b { font-size: 22px; line-height: 1.2; color: var(--ink); word-break: break-word; }
.ad2-kpi.fuerte b { font-size: 34px; line-height: 1.15; color: var(--mal); }

.ad2-pasos { display: flex; flex-direction: column; }
.ad2-paso { display: flex; gap: 12px; align-items: flex-start; min-height: 44px; padding: 10px 0; border-top: 1px solid var(--line); cursor: pointer; margin: 0; }
.ad2-paso input { width: 20px; height: 20px; margin: 2px 0 0; flex: 0 0 auto; accent-color: var(--pri); }
.ad2-paso.hecho > span { color: var(--mut); }
.ad2-avance { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.ad2-barras { display: inline-flex; gap: 4px; }
.ad2-barras i { width: 28px; height: 6px; border-radius: 3px; background: var(--line); display: inline-block; }
.ad2-barras i.on { background: var(--pri); }
.ad2-cierra { margin: auto 0 0; padding-top: 14px; border-top: 1px solid var(--line); font-size: 14px; }
.ad2-fc { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 10px; background: var(--card2); border: 1px solid var(--line); }
.ad2-fc__l { margin: 4px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 3px; font-size: 14px; }

.ad2-charth { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-end; justify-content: space-between; }
.ad2-charth .ad2-cab { flex: 999 1 380px; }
.ad2-ctrls { display: flex; flex-wrap: wrap; gap: 8px; }
.ad2-seg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.ad2-seg button { font: inherit; font-size: 14px; font-weight: 600; padding: 0 16px; border: 0; background: transparent; color: var(--ink); min-height: 44px; cursor: pointer; }
.ad2-seg button + button { border-left: 1px solid var(--line); }
.ad2-seg button.on { background: var(--pri); color: var(--pri-ink); }

.ad2-tscroll { overflow-x: auto; }
.ad2-tabla { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 14.5px; }
.ad2-tabla th { text-align: left; font-size: 13px; font-weight: 600; color: var(--mut); padding: 8px 16px 8px 0; white-space: nowrap; }
.ad2-tabla td { padding: 14px 16px 14px 0; border-top: 1px solid var(--line); vertical-align: top; color: var(--ink); }
.ad2-est { font-weight: 600; color: var(--gris); }
.ad2-est.mal { color: var(--mal); } .ad2-est.ok { color: var(--ok); }

.ad2-tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.ad2-tl li { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 12px; align-items: start; font-size: 14.5px; }
.ad2-tl li.actual { font-weight: 700; }
.ad2-tl li.actual .ad2-hint { font-weight: 400; }
.ad2-tl__h { font-size: 13px; color: var(--mut); font-variant-numeric: tabular-nums; padding-top: 1px; }
.ad2-tl li.actual .ad2-tl__h { color: var(--ink); }
.ad2-otras { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; font-size: 14.5px; }
.ad2-eqs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.ad2-eqs li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); font-size: 14.5px; }
.ad2-eq__v { text-align: right; }
.ad2-eq__v b { font-weight: 600; color: var(--ink); } .ad2-eq__v b.mal { color: var(--mal); } .ad2-eq__v b.ok { color: var(--ok); }
.ad2-dias-w { display: flex; flex-direction: column; gap: 6px; }
.ad2-dias { display: flex; align-items: flex-end; gap: 3px; height: 28px; }
.ad2-dias i { flex: 1 1 0; height: 10px; border-radius: 3px; background: var(--line); display: block; }
.ad2-dias i.on { height: 28px; background: var(--sev-crit); }
.ad2-dias__e { display: flex; justify-content: space-between; font-size: 12px; color: var(--mut); }
.ad2-pie { margin: 0; font-size: 13px; color: var(--mut); display: flex; flex-wrap: wrap; gap: 6px 16px; }
@media (max-width: 600px) { .ad2-title { font-size: 24px; } .ad2-card { padding: 18px 16px; } .ad2-kpi.fuerte b { font-size: 28px; } }
</style>
