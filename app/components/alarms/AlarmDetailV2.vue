<template>
  <!-- spec_detalle_alarma_v2 — una pantalla para todas las alarmas de todos los equipos.
       1 Qué está pasando · 2 Por qué saltó · 3 Cómo solucionarlo · 4 Contexto.
       Datos: GET /api/alarms/:id/detail (bloque v2). Sin términos del backend en pantalla. -->
  <div class="ad2">
    <p v-if="loading && !detail" class="ad2-hint">Cargando la alarma…</p>
    <div v-else-if="error" class="ad2-card">
      <p class="mb-2">{{ notFound ? 'No encontramos esta alarma o no tenés acceso.' : 'No se pudo cargar la alarma.' }}</p>
      <button type="button" class="ad2-btn sec" @click="cargar">Reintentar</button>
    </div>

    <template v-else-if="alarm">
      <!-- ═══ ENCABEZADO ═══ -->
      <header class="ad2-head" :class="'sev-' + sev">
        <div class="ad2-head__l">
          <nav class="ad2-crumb" aria-label="Ubicación">
            <nuxt-link to="/alarmas">Alarmas</nuxt-link> ›
            <nuxt-link v-if="v2.site" :to="'/sites/' + encodeURIComponent(v2.site.siteCode)">{{ sitioTxt }}</nuxt-link><span v-else>{{ sitioTxt }}</span>
            › {{ v2.perSite ? 'todo el sitio' : (alarm.deviceName || alarm.dId) }}
          </nav>
          <div class="ad2-chips">
            <span class="ad2-sev" :class="'ad2-sev--' + sev">{{ sevTxt }}</span>
            <span v-if="abierta" class="ad2-chip mal"><i class="ad2-dot"></i>Abierta hace {{ dur(edadSeg) }}</span>
            <span v-else class="ad2-chip ok"><i class="ad2-dot"></i>Cerrada · duró {{ dur(alarm.durationSec) }}</span>
            <span v-if="etapaTxt" class="ad2-chip gris">{{ etapaTxt }}</span>
            <span class="ad2-chip" :class="tomadaPor ? 'ok' : (abierta ? 'atn' : 'gris')">{{ tomadaPor ? 'Tomada por ' + tomadaPor + (tomadaAt ? ' · ' + hora(tomadaAt, true) : '') : (abierta ? 'Nadie la tomó todavía' : 'Nadie la tomó') }}</span>
          </div>
          <h1 class="ad2-title">{{ alarm.label || 'Alarma' }}</h1>
        </div>
        <div class="ad2-head__r">
          <nuxt-link v-if="v2.site" class="ad2-btn sec" :to="'/sites/' + encodeURIComponent(v2.site.siteCode)">Ver el sitio</nuxt-link>
          <nuxt-link v-if="packId" class="ad2-btn sec" :to="'/rulepacks/' + encodeURIComponent(packId)">Ver las reglas</nuxt-link>
          <button v-if="canService && abierta" type="button" class="ad2-btn sec" :disabled="busy" @click="registrarService">Registrar service</button>
          <button v-if="puedeTomar" type="button" class="ad2-btn pri" :disabled="busy" @click="tomar">{{ esperaConfirmacion ? 'Confirmar y cerrar' : 'Tomar la alarma' }}</button>
        </div>
      </header>

      <!-- ═══ 1 · QUÉ ESTÁ PASANDO ═══ -->
      <section class="ad2-card" aria-labelledby="ad2-s1">
        <p class="ad2-q">1 · {{ abierta ? 'Qué está pasando' : 'Qué pasó' }}</p>
        <h2 id="ad2-s1" class="ad2-h2">{{ titular }}</h2>
        <p v-if="bajada" class="ad2-hint mt-1 mb-0">{{ bajada }}</p>
        <div class="ad2-kpis">
          <div v-for="k in kpis" :key="k.k" class="ad2-kpi" :class="{ fuerte: k.fuerte }">
            <span class="ad2-hint">{{ k.lab }}</span>
            <b>{{ k.val }}</b>
            <span class="ad2-hint">{{ k.det }}</span>
          </div>
        </div>
        <span v-if="abierta" class="ad2-hint">Valores en vivo · se actualiza solo cada 15 s · última lectura {{ hace(ultimaLectura) }}</span>
      </section>

      <div class="ad2-row">
        <!-- ═══ 2 · POR QUÉ SALTÓ ═══ -->
        <section class="ad2-card ad2-grow" aria-labelledby="ad2-s2">
          <p class="ad2-q">2 · Por qué saltó</p>
          <h2 id="ad2-s2" class="ad2-h2">{{ porQueTitulo }}</h2>
          <ul class="ad2-conds">
            <li v-for="c in condiciones" :key="c.k">
              <span class="ad2-cond__t">{{ c.txt }}</span>
              <span class="ad2-cond__s">
                <span class="ad2-chip gris">al avisar: {{ c.antes }}</span>
                <span v-if="abierta" class="ad2-chip" :class="c.ahoraCls"><i class="ad2-dot"></i>ahora: {{ c.ahora }}</span>
              </span>
            </li>
          </ul>
          <!-- spec_perfiles_controladora (Qp5) — el código de falla con su significado (perfil de la controladora). -->
          <div v-for="f in codigosFalla" :key="'fc' + f.dId + f.code" class="ad2-fc">
            <b>Código {{ f.code }}<template v-if="f.known"> · {{ f.name }}</template></b>
            <span class="ad2-hint">{{ f.deviceName }}<template v-if="f.model"> · {{ f.model }}</template><template v-if="f.tipo"> · {{ f.tipo }}</template></span>
            <span v-if="f.logic" class="ad2-hint">Según el fabricante: {{ f.logic }}</span>
            <span v-if="!f.known" class="ad2-hint">El código no está en el diccionario de esta controladora.</span>
          </div>

          <template v-if="series.length">
            <div class="ad2-charth">
              <b>{{ ventanaTxt }}</b>
              <div v-if="series.length > 1" class="ad2-seg" role="group" aria-label="Medición del gráfico">
                <button v-for="(s, i) in series" :key="s.k" type="button" :class="{ on: serieIdx === i }" @click="serieIdx = i">{{ s.tab }}</button>
              </div>
            </div>
            <svg :viewBox="'0 0 ' + G.W + ' ' + G.H" width="100%" role="img" :aria-label="'Gráfico de ' + grafico.nombre">
              <line v-for="y in [G.T, (G.T + G.B) / 2, G.B]" :key="'g' + y" :x1="G.L" :x2="G.W - G.R" :y1="y" :y2="y" class="g-grid"></line>
              <rect v-if="grafico.bandaW > 0" :x="grafico.bandaX" :y="G.T" :width="grafico.bandaW" :height="G.B - G.T" class="g-banda"></rect>
              <template v-if="grafico.yUmbral != null">
                <line :x1="G.L" :x2="G.W - G.R" :y1="grafico.yUmbral" :y2="grafico.yUmbral" class="g-umbral"></line>
                <text :x="G.W - G.R" :y="grafico.yUmbral - 5" text-anchor="end" class="g-umbral-t">{{ grafico.umbralTxt }}</text>
              </template>
              <path v-if="grafico.proy" :d="grafico.proy" class="g-proy"></path>
              <path :d="grafico.d" class="g-serie"></path>
              <g v-if="grafico.xAviso != null">
                <line :x1="grafico.xAviso" :x2="grafico.xAviso" :y1="G.T - 6" :y2="G.B" class="g-aviso"></line>
                <text :x="grafico.xAviso" :y="G.T - 9" :text-anchor="grafico.anclaAviso" class="g-aviso-t">avisó {{ hora(firedAt, true) }}</text>
              </g>
              <g v-if="grafico.xCierre != null">
                <line :x1="grafico.xCierre" :x2="grafico.xCierre" :y1="G.T - 6" :y2="G.B" class="g-cierre"></line>
                <text :x="grafico.xCierre" :y="G.B + 26" :text-anchor="grafico.anclaCierre" class="g-cierre-t">se cerró {{ hora(alarm.resolvedAt, true) }}</text>
              </g>
              <text :x="G.L - 6" :y="G.T + 4" text-anchor="end" class="g-txt">{{ grafico.yMax }}</text>
              <text :x="G.L - 6" :y="G.B + 4" text-anchor="end" class="g-txt">{{ grafico.yMin }}</text>
              <text :x="G.L" :y="G.B + 14" class="g-txt">{{ hora(v2.from, true) }}</text>
              <text :x="G.W - G.R" :y="G.B + 14" text-anchor="end" class="g-txt">{{ abierta ? 'ahora ' + hora(nowMs, true) : hora(v2.until, true) }}</text>
            </svg>
            <span class="ad2-hint">{{ grafico.nota }}</span>
          </template>
          <p v-else class="ad2-hint mb-0">No hay lecturas guardadas de estas mediciones en ese período.</p>
        </section>

        <!-- ═══ 3 · CÓMO SOLUCIONARLO ═══ -->
        <section class="ad2-card ad2-side" aria-labelledby="ad2-s3">
          <p class="ad2-q">3 · Cómo solucionarlo</p>
          <h2 id="ad2-s3" class="ad2-h2">{{ abierta ? 'Qué hacer ahora' : 'Qué se hizo' }}</h2>
          <template v-if="pasos.length">
            <label v-for="p in pasos" :key="p.i" class="ad2-paso" :class="{ hecho: p.hecho }">
              <input type="checkbox" :checked="p.hecho" :disabled="!abierta || pasoBusy === p.i" @change="tildar(p.i, $event.target.checked)">
              <span>{{ p.txt }}<small v-if="p.hecho" class="ad2-hint d-block">{{ p.quien }}</small></span>
            </label>
            <span class="ad2-hint">{{ avanceTxt }}</span>
          </template>
          <p v-else-if="regla && regla.recommendation" class="mb-0">{{ recomendacion }}</p>
          <p v-else class="ad2-hint mb-0">Esta regla no tiene recomendación cargada. Se puede agregar desde el editor de reglas.</p>
          <div v-for="f in codigosFalla.filter(x => x.causes.length)" :key="'fcc' + f.dId + f.code" class="ad2-fc">
            <b>Causas posibles del código {{ f.code }} (manual del fabricante)</b>
            <ol class="ad2-fc__l"><li v-for="(c, i) in f.causes.slice(0, 8)" :key="i">{{ c }}</li></ol>
          </div>
          <div class="ad2-cierra">
            <b>{{ abierta ? 'Cuándo se cierra' : 'Cómo se cerró' }}</b>
            <span>{{ cierreTxt }}</span>
            <span v-if="abierta" class="ad2-hint">Si deja de llegar un dato, no se cierra a ciegas: espera a que vuelva.</span>
          </div>
        </section>
      </div>

      <!-- ═══ 4 · CONTEXTO ═══ -->
      <section class="ad2-card" aria-labelledby="ad2-s4">
        <p class="ad2-q">4 · Contexto</p>
        <h2 id="ad2-s4" class="ad2-h2">{{ abierta ? 'Qué más está pasando en el sitio' : 'Qué pasaba en el sitio' }}</h2>
        <div class="ad2-row">
          <div class="ad2-grow">
            <b>Cómo empezó <span class="ad2-hint">(todo el sitio, la hora previa al aviso)</span></b>
            <ol class="ad2-tl">
              <li v-for="(e, i) in timeline" :key="'t' + i" :class="{ actual: e.actual }">
                <span class="ad2-tl__h">{{ hora(e.ts, true) }}</span>
                <i class="ad2-tl__p" :class="'p-' + e.color" aria-hidden="true"></i>
                <span>{{ e.txt }} <span class="ad2-hint">· {{ e.equipo }}</span></span>
              </li>
            </ol>
          </div>
          <div class="ad2-grow">
            <b>Equipos del sitio {{ abierta ? 'ahora' : '(estado actual)' }}</b>
            <div class="ad2-eqs">
              <div v-for="q in equipos" :key="q.dId" class="ad2-eq" :class="{ este: q.esEste }">
                <span class="ad2-eq__n">{{ q.name }}</span>
                <span class="ad2-chip" :class="q.cls"><i class="ad2-dot"></i>{{ q.est }}</span>
                <span class="ad2-hint">{{ q.det }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="ad2-row ad2-sep">
          <div class="ad2-grow">
            <b>Antecedentes</b>
            <p class="mb-0 mt-1">{{ antecedentesTxt }}</p>
          </div>
          <div class="ad2-grow">
            <b>Otras alarmas abiertas del sitio</b>
            <ul v-if="ctx.abiertas.length" class="ad2-otras">
              <li v-for="o in ctx.abiertas" :key="String(o.notificationId)">
                <nuxt-link :to="'/alarmas/' + o.notificationId">{{ o.label || 'Alarma' }}</nuxt-link>
                <span class="ad2-hint"> · {{ sevLabel(o.severity).toLowerCase() }} · {{ o.deviceName }} · hace {{ dur(Math.round((nowMs - o.firedAt) / 1000)) }}</span>
              </li>
            </ul>
            <p v-else class="ad2-hint mb-0 mt-1">No hay otras alarmas abiertas en el sitio.</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script>
import { ruleToModel, opsFor } from '@/components/rules/ruleModelV2.js';
import { formatDuration } from '@/utils/format';

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
  head() { return { title: (this.alarm && this.alarm.label) || 'Detalle de alarma' }; },
  data() {
    return { detail: null, loading: false, error: false, notFound: false, busy: false, pasoBusy: null, serieIdx: 0, nowMs: Date.now(), packId: null,
      G: { W: 760, H: 236, L: 54, R: 12, T: 22, B: 196 } };
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

    // ── 1 · Qué está pasando ──
    titular() {
      if (this.regla && this.regla.meaning) return this.regla.meaning;
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
        out.push({ k: l.dId + l.variable, lab: `${this.varNombre(l)}${(this.v2.live || []).length > 1 ? ' · ' + l.deviceName : ''}`, val: this.valor(l.value, l), det: l.time ? 'leído ' + this.hace(l.time) : 'sin lectura' });
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
        const ahoraTxt = n && n.value != null ? this.valor(n.value, c.meta, mc) : (est ? est[0] : this.liveDe(c));
        return { k: (c.leafId || 'L') + i, txt: this.frase(c, mc), antes, ahora: ahoraTxt, ahoraCls: est ? est[1] : 'gris' };
      });
    },
    series() {
      // Solo mediciones con lecturas en la ventana: sin puntos la escala quedaba en ±Infinity.
      return (this.v2.series || []).filter((s) => Array.isArray(s.points) && s.points.length).map((s, i) => ({ ...s, k: s.dId + s.variable + i, tab: this.varNombre(s) + ((this.v2.series || []).length > 1 && (this.v2.series || []).some((x, j) => j !== i && x.variable === s.variable) ? ' · ' + s.deviceName : '') }));
    },
    ventanaTxt() { const h = ((this.v2.until || 0) - (this.v2.from || 0)) / 3600000; return `${this.abierta ? 'Últimas' : 'Las'} ${h >= 1.5 ? Math.round(h) + ' horas' : Math.round(h * 60) + ' min'}${this.abierta ? '' : ' alrededor de la alarma'}`; },
    grafico() {
      const s = this.series[this.serieIdx] || this.series[0];
      const G = this.G; if (!s) return { d: '', nombre: '' };
      const from = this.v2.from, until = this.abierta ? Math.max(this.v2.until, this.nowMs) : this.v2.until;
      const bool = s.type === 'bool' || (s.points.length && s.points.every(p => p.value === 0 || p.value === 1));
      const vals = s.points.map(p => p.value).concat(s.threshold != null && !bool ? [s.threshold] : []);
      let lo = bool ? -0.15 : Math.min(...vals), hi = bool ? 1.15 : Math.max(...vals);
      if (!bool) { const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad; }
      const X = (t) => G.L + ((t - from) / Math.max(1, until - from)) * (G.W - G.L - G.R);
      const Y = (v) => G.B - ((v - lo) / Math.max(1e-9, hi - lo)) * (G.B - G.T);
      let d = '';
      s.points.forEach((p, i) => {
        const x = X(p.time).toFixed(1), y = Y(p.value).toFixed(1);
        if (!i) d += `M${x} ${y}`; else if (bool) d += ` H${x} V${y}`; else d += ` L${x} ${y}`;
      });
      const f = this.detail.forecast;
      let proy = '';
      if (this.abierta && f && Array.isArray(f.points) && f.points.length > 1 && s.dId === this.alarm.dId && s.variable === this.alarm.variable && !bool) {
        proy = f.points.filter(p => p.time >= this.nowMs - 60000 && p.time <= until + 2 * 3600000)
          .map((p, i) => `${i ? 'L' : 'M'}${Math.min(X(p.time), G.W - G.R).toFixed(1)} ${Math.max(G.T, Math.min(G.B, Y(p.value))).toFixed(1)}`).join(' ');
      }
      const xA = this.firedAt != null ? X(this.firedAt) : null;
      const xC = !this.abierta && this.alarm.resolvedAt ? X(this.alarm.resolvedAt) : null;
      const anc = (x) => (x == null ? 'middle' : x < G.L + 50 ? 'start' : x > G.W - G.R - 50 ? 'end' : 'middle');
      const u = s.unit ? ` ${s.unit}` : '';
      const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toString().replace('.', ',');
      const finBanda = xC != null ? xC : X(until);
      const nota = bool ? 'Arriba = sí · abajo = no. La franja marca el tiempo en alarma.'
        : `La franja marca el tiempo en alarma${s.threshold != null ? '; la línea punteada amarilla es el límite de la regla' : ''}${proy ? '; la línea punteada roja es hacia dónde va al ritmo actual' : ''}.`;
      return {
        nombre: this.varNombre(s) + ' · ' + s.deviceName, d, proy,
        yUmbral: s.threshold != null && !bool && s.threshold >= lo && s.threshold <= hi ? Y(s.threshold) : null,
        umbralTxt: s.threshold != null ? `límite ${fmt(s.threshold)}${u}` : '',
        yMax: bool ? 'sí' : fmt(hi) + u, yMin: bool ? 'no' : fmt(lo) + u,
        xAviso: xA, xCierre: xC, anclaAviso: anc(xA), anclaCierre: anc(xC),
        bandaX: xA != null ? xA : 0, bandaW: xA != null ? Math.max(0, finBanda - xA) : 0, nota,
      };
    },

    // ── 3 · Cómo solucionarlo ──
    recomendacion() { return this.regla ? String(this.regla.recommendation || '').replace(/\{umbral\}/g, this.umbralTxtGeneral) : ''; },
    umbralTxtGeneral() { const c = (this.v2.conditions || [])[0]; const t = c && c.atFire && c.atFire.threshold; return typeof t === 'number' ? this.valor(t, c.meta) : 'el límite configurado'; },
    pasos() {
      const steps = (this.regla && this.regla.steps) || [];
      const done = new Map((this.v2.stepsDone || []).map(x => [x.i, x]));
      return steps.map((txt, i) => { const d = done.get(i); return { i, txt, hecho: !!d, quien: d ? `${d.by} · ${this.hora(d.at, true)}` : '' }; });
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
        if (e.kind === 'sindatos') return { ts: e.ts, txt: 'Dejó de llegar un dato', equipo: e.deviceName, color: 'gris', actual: false };
        if (e.kind === 'resolve') return { ts: e.ts, txt: `Se cerró: ${e.label || 'alarma'}`, equipo: e.deviceName, color: 'ok', actual: false };
        return { ts: e.ts, txt: e.actual ? `Esta alarma: ${e.label || ''}` : `Aviso: ${e.label || 'alarma'}`, equipo: e.deviceName, color: e.severity === 'critical' ? 'mal' : e.severity === 'warning' ? 'atn' : 'info', actual: e.actual };
      });
      if (!out.some(e => e.actual)) out.push({ ts: this.firedAt, txt: `Esta alarma: ${this.alarm.label || ''}`, equipo: this.alarm.deviceName || this.alarm.dId, color: this.sev === 'critical' ? 'mal' : 'atn', actual: true });
      return out.sort((a, b) => a.ts - b.ts);
    },
    equipos() {
      return (this.ctx.equipos || []).slice().sort((a, b) => (b.esEste - a.esEste) || String(a.name).localeCompare(String(b.name))).map(q => {
        if (!q.reporting) return { ...q, est: 'No reporta', cls: 'mal', det: q.lastSeen ? 'último dato ' + this.hace(q.lastSeen) : 'sin datos en 24 h' };
        if (q.primary && q.primary.value != null) {
          const p = q.primary;
          return { ...q, est: this.valor(p.value, p), cls: 'gris', det: (p.label || String(p.variable).replace(/_/g, ' ')) + (q.esEste ? ' · este equipo' : '') };
        }
        return { ...q, est: 'Reporta', cls: 'ok', det: (q.model || '') + (q.esEste ? (q.model ? ' · ' : '') + 'este equipo' : '') };
      });
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
        const res = await this.$axios.get(`/alarms/${encodeURIComponent(this.alarmId)}/detail`, this.hdr());
        if (res.data.status === 'success') { this.detail = res.data.data; this.nowMs = Date.now(); this.packId = (this.detail.v2 && this.detail.v2.packId) || null; } else if (!silencioso) this.error = true;
      } catch (e) {
        if (!silencioso) { this.error = true; this.notFound = !!(e.response && e.response.status === 404); }
      } finally { this.loading = false; }
    },
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
      const nombres = (c.dIds || []).map(id => { const q = (this.ctx.equipos || []).find(e => e.dId === id); return q ? q.name : null; }).filter(Boolean);
      const quien = nombres.length === 1 ? ` de ${nombres[0]}` : nombres.length > 1 ? ` de ${nombres.slice(0, -1).join(', ')} o ${nombres[nombres.length - 1]}` : '';
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
/* Paleta de la plataforma (black-dashboard): claro #f5f6fa/#fff · oscuro #1e1e2f/#27293d (Qj5). */
.ad2 { --card: #fff; --card2: #f5f6fa; --ink: #1d253b; --mut: #5f6478; --line: #e3e4ec; --acc: #00866f;
  --ok: #1f8a5b; --okb: #e3f4ea; --mal: #b4232c; --malb: #fbe3e5; --atn: #9a6400; --atnb: #fbf0d9; --gris: #5f6478; --grisb: #eef0f5;
  color: var(--ink); font-size: 15px; line-height: 1.5; display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; }
body:not(.white-content) .ad2 { --card: #27293d; --card2: #1e1e2f; --ink: #e8e8ef; --mut: #a2a5b9; --line: #3b3d55; --acc: #00f2c3;
  --ok: #7be0a8; --okb: #173b2c; --mal: #ffb3b9; --malb: #4a1d24; --atn: #f0c66e; --atnb: #3a3018; --gris: #c3c5d4; --grisb: #34364c; }
.ad2-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ad2-hint { font-size: 13px; color: var(--mut); }
.ad2-q { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--acc); margin: 0; }
.ad2-h2 { font-size: 19px; font-weight: 700; margin: 0; color: var(--ink); line-height: 1.3; }
.ad2-row { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.ad2-grow { flex: 999 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.ad2-side { flex: 1 1 340px; }
.ad2-sep { border-top: 1px solid var(--line); padding-top: 14px; }

.ad2-head { background: var(--card); border: 1px solid var(--line); border-bottom: 4px solid #3b82c4; border-radius: 14px; padding: 16px 20px; display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between; }
.ad2-head.sev-warning { border-bottom-color: #e8b730; } .ad2-head.sev-critical { border-bottom-color: #d93a46; }
.ad2-head__l { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ad2-head__r { display: flex; flex-wrap: wrap; gap: 8px; }
.ad2-crumb { font-size: 12.5px; color: var(--mut); }
.ad2-crumb a { color: var(--acc); }
.ad2-title { font-size: 26px; font-weight: 700; margin: 0; line-height: 1.2; color: var(--ink); }
.ad2-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ad2-sev { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 4px 11px; color: #fff; background: #3b82c4; }
.ad2-sev--warning { background: #e8b730; color: #2a1f00; } .ad2-sev--critical { background: #d93a46; }
.ad2-chip { font-size: 12.5px; font-weight: 600; padding: 4px 11px; border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; background: var(--grisb); color: var(--gris); }
.ad2-chip.ok { background: var(--okb); color: var(--ok); } .ad2-chip.mal { background: var(--malb); color: var(--mal); } .ad2-chip.atn { background: var(--atnb); color: var(--atn); }
.ad2-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; display: inline-block; }
.ad2-btn { font: inherit; font-size: 14px; font-weight: 600; border-radius: 999px; padding: 9px 18px; min-height: 42px; cursor: pointer; display: inline-flex; align-items: center; text-decoration: none; }
.ad2-btn.pri { background: #00bf9a; border: 1px solid #00bf9a; color: #062019; }
.ad2-btn.sec { background: transparent; border: 1px solid var(--line); color: var(--ink); }
.ad2-btn:disabled { opacity: .5; cursor: default; }

.ad2-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.ad2-kpi { background: var(--card2); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ad2-kpi b { font-size: 22px; line-height: 1.2; color: var(--ink); word-break: break-word; }
.ad2-kpi.fuerte b { color: var(--mal); }

.ad2-conds { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ad2-conds li { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 10px; background: var(--card2); border: 1px solid var(--line); }
.ad2-cond__t { flex: 1 1 300px; min-width: 0; }
.ad2-cond__s { display: flex; flex-wrap: wrap; gap: 8px; }
.ad2-charth { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.ad2-seg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
.ad2-seg button { font: inherit; font-size: 13px; font-weight: 600; padding: 7px 13px; border: 0; background: transparent; color: var(--mut); min-height: 38px; cursor: pointer; }
.ad2-seg button.on { background: #00bf9a; color: #062019; }
.g-grid { stroke: var(--line); } .g-banda { fill: #d93a46; opacity: .12; }
.g-umbral { stroke: #e8b730; stroke-dasharray: 5 4; } .g-umbral-t { fill: var(--atn); font-size: 11.5px; }
.g-serie { fill: none; stroke: #00bf9a; stroke-width: 2.5; } .g-proy { fill: none; stroke: #d93a46; stroke-width: 2; stroke-dasharray: 3 4; }
.g-aviso { stroke: #d93a46; stroke-width: 2; } .g-aviso-t { fill: var(--mal); font-size: 11.5px; }
.g-cierre { stroke: #1f8a5b; stroke-width: 2; } .g-cierre-t { fill: var(--ok); font-size: 11.5px; }
.g-txt { fill: var(--mut); font-size: 11px; }

.ad2-fc { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 10px; background: var(--card2); border: 1px solid var(--line); }
.ad2-fc__l { margin: 4px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 3px; font-size: 14px; }
.ad2-paso { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: var(--card2); border: 1px solid var(--line); cursor: pointer; margin: 0; }
.ad2-paso input { width: 20px; height: 20px; margin-top: 2px; flex: 0 0 auto; accent-color: #00bf9a; }
.ad2-paso.hecho > span { color: var(--mut); text-decoration: line-through; }
.ad2-paso.hecho small { text-decoration: none; }
.ad2-cierra { border-top: 1px solid var(--line); padding-top: 12px; display: flex; flex-direction: column; gap: 4px; }

.ad2-tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.ad2-tl li { display: grid; grid-template-columns: 46px 14px 1fr; gap: 10px; align-items: start; font-size: 14px; }
.ad2-tl li.actual { font-weight: 700; }
.ad2-tl__h { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12.5px; color: var(--mut); }
.ad2-tl__p { width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; background: var(--gris); display: inline-block; }
.ad2-tl__p.p-mal { background: #d93a46; } .ad2-tl__p.p-atn { background: #e8b730; } .ad2-tl__p.p-ok { background: #1f8a5b; } .ad2-tl__p.p-info { background: #3b82c4; }
.ad2-eqs { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.ad2-eq { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: var(--card2); border: 1px solid var(--line); min-width: 0; }
.ad2-eq.este { border-color: #00bf9a; }
.ad2-eq__n { font-size: 13px; font-weight: 600; }
.ad2-otras { margin: 4px 0 0; padding-left: 18px; font-size: 14px; }
.ad2-otras a { color: var(--acc); }
</style>
