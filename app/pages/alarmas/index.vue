<template>
  <!-- Propuesta Alarmas (2026-11) — la bandeja del día del cell owner.
       Una frase arriba dice cómo está todo · tres bandejas (Sin tomar · En curso · Resueltas hoy) ·
       agrupado por sitio · cada alarma dice qué pasa y qué hacer sin desplegar · las relacionadas
       se pliegan bajo la principal · un solo verbo: «Tomar». Color solo para la gravedad.
       Datos: GET /api/alarms (ya acotado por los grants del usuario) y /api/alarms/summary. -->
  <div class="al">
    <header class="al-cab">
      <span class="al-fecha">Alarmas · {{ fechaTxt }}</span>
      <h1 class="al-titulo">{{ titular }}</h1>
      <p v-if="bajada" class="al-bajada">{{ bajada }}</p>
    </header>

    <div class="al-bandejas" role="group" aria-label="Bandejas de alarmas">
      <button v-for="b in bandejas" :key="b.k" type="button" class="al-bandeja" :class="{ on: tab === b.k }" :aria-pressed="tab === b.k ? 'true' : 'false'" @click="irA(b.k)">
        <span class="al-bandeja__n">{{ b.n }}</span>
        <span class="al-bandeja__t">{{ b.t }}</span>
        <span class="al-bandeja__d">{{ b.d }}</span>
      </button>
    </div>

    <div class="al-filtros">
      <template v-if="sitios.length > 1">
        <label for="al-f-sitio">Sitio</label>
        <select id="al-f-sitio" v-model="fSitio">
          <option value="">Todos los sitios ({{ sitios.length }})</option>
          <option v-for="s in sitios" :key="s.code" :value="s.code">{{ s.txt }}</option>
        </select>
      </template>
      <label for="al-f-grav">Gravedad</label>
      <select id="al-f-grav" v-model="fGrav">
        <option value="">Todas</option>
        <option value="critical">Críticas</option>
        <option value="warning">Advertencias</option>
        <option value="info">Informativas</option>
      </select>
      <label for="al-f-buscar" class="al-filtros__der">Buscar</label>
      <input id="al-f-buscar" v-model.trim="buscar" type="search" placeholder="Alarma, sitio o equipo">
    </div>

    <div v-if="error" class="al-aviso" role="alert">
      <span>No se pudieron cargar las alarmas.</span>
      <button type="button" class="al-btn sec" @click="fetchAll">Reintentar</button>
    </div>
    <p v-else-if="loading && !cargado" class="al-hint">Cargando las alarmas…</p>

    <!-- ═══ SIN TOMAR · EN CURSO ═══ -->
    <template v-else-if="tab !== 'res'">
      <p v-if="!grupos.length" class="al-vacio">{{ vacioTxt }}</p>
      <section v-for="g in grupos" :key="g.code" class="al-sitio" :aria-label="'Sitio ' + g.code">
        <div class="al-sitio__cab">
          <h2><nuxt-link :to="'/sites/' + encodeURIComponent(g.code)">{{ g.titulo }}</nuxt-link></h2>
          <span>{{ g.situacion }}</span>
        </div>

        <article v-for="a in g.items" :key="a.notificationId" class="al-card">
          <div class="al-card__l">
            <div class="al-card__t">
              <span class="al-sev" :class="'al-sev--' + a.sev">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16">
                  <path v-if="a.sev === 'critical'" d="M8 1.5 15.5 14.5H0.5z" fill="currentColor"></path>
                  <path v-else-if="a.sev === 'warning'" d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill="none" stroke="currentColor" stroke-width="2"></path>
                  <circle v-else cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"></circle>
                </svg>{{ a.sevTxt }}
              </span>
              <h3>{{ a.label || 'Alarma' }}</h3>
            </div>
            <p v-if="a.queEs">{{ a.queEs }}</p>
            <p v-if="a.queHacer"><b>Qué hacer:</b> {{ a.queHacer }}</p>
            <p class="al-dato">{{ a.dato }}<template v-if="a.dato"> · </template><span :class="{ 'al-espera': a.esperaMucho }">{{ a.edadTxt }}</span><template v-if="a.repeatCount > 1"> · saltó {{ a.repeatCount }} veces en 24 h</template></p>
            <div v-if="a.state === 'ack'" class="al-curso">
              <span class="al-tomada">Tomada por {{ a.acknowledgedBy || 'un operador' }}<template v-if="a.ackAt"> · {{ cuando(a.ackAt) }}</template></span>
              <template v-if="a.stepsTotal">
                <span>{{ a.stepsDoneCount }} de {{ a.stepsTotal }} pasos hechos</span>
                <span class="al-barras" role="img" :aria-label="a.stepsDoneCount + ' de ' + a.stepsTotal + ' pasos hechos'"><i v-for="n in a.stepsTotal" :key="n" :class="{ on: n <= a.stepsDoneCount }"></i></span>
              </template>
            </div>
            <template v-if="a.hijas.length">
              <button type="button" class="al-rel" :aria-expanded="abiertas[a.notificationId] ? 'true' : 'false'" @click="plegar(a)">
                {{ abiertas[a.notificationId] ? 'Ocultar' : 'Ver' }} {{ a.hijas.length === 1 ? 'la alarma relacionada' : 'las ' + a.hijas.length + ' alarmas relacionadas' }}
              </button>
              <ul v-if="abiertas[a.notificationId]" class="al-hijas">
                <li v-for="h in a.hijas" :key="h.notificationId">
                  <nuxt-link :to="'/alarmas/' + h.notificationId">{{ h.label || 'Alarma' }}</nuxt-link>
                  · {{ h.sevTxt.toLowerCase() }} · {{ h.edadTxt }}<template v-if="h.state === 'ack'"> · tomada</template>
                </li>
              </ul>
            </template>
          </div>
          <div class="al-card__r">
            <button v-if="a.state === 'active'" type="button" class="al-btn pri" :disabled="!!ackBusy[a.notificationId]" @click="tomar(a)">Tomar</button>
            <nuxt-link v-if="a.state === 'ack' && a.stepsTotal > a.stepsDoneCount" class="al-btn pri" :to="'/alarmas/' + a.notificationId">Seguir con los pasos</nuxt-link>
            <nuxt-link v-else class="al-btn sec" :to="'/alarmas/' + a.notificationId">Ver detalle</nuxt-link>
          </div>
        </article>
      </section>
      <div v-if="nextCursor" class="al-mas"><button type="button" class="al-btn sec" :disabled="loadingMore" @click="fetchActive(true)">Cargar más alarmas</button></div>
    </template>

    <!-- ═══ RESUELTAS HOY ═══ -->
    <template v-else>
      <div v-if="resError" class="al-aviso" role="alert"><span>No se pudieron cargar las resueltas.</span><button type="button" class="al-btn sec" @click="fetchResolved">Reintentar</button></div>
      <p v-else-if="resLoading && !resCargado" class="al-hint">Cargando las resueltas…</p>
      <p v-else-if="!gruposRes.length" class="al-vacio">Hoy no se cerró ninguna alarma{{ hayFiltro ? ' con ese filtro' : '' }}.</p>
      <section v-for="g in gruposRes" :key="g.code" class="al-sitio" :aria-label="'Sitio ' + g.code">
        <div class="al-sitio__cab">
          <h2><nuxt-link :to="'/sites/' + encodeURIComponent(g.code)">{{ g.titulo }}</nuxt-link></h2>
          <span>{{ g.items.length === 1 ? '1 alarma cerrada hoy' : g.items.length + ' alarmas cerradas hoy' }}</span>
        </div>
        <div class="al-tabla">
          <table>
            <thead><tr><th scope="col">Alarma</th><th scope="col">Gravedad</th><th scope="col">Empezó</th><th scope="col">Duró</th><th scope="col">Cómo se cerró</th></tr></thead>
            <tbody>
              <tr v-for="a in g.items" :key="a.notificationId">
                <td><nuxt-link :to="'/alarmas/' + a.notificationId">{{ a.label || 'Alarma' }}</nuxt-link><span v-if="a.repeatCount > 1" class="al-hint"> · {{ a.repeatCount }} veces en 24 h</span></td>
                <td><span class="al-sev" :class="'al-sev--' + a.sev">{{ a.sevTxt }}</span></td>
                <td>{{ a.firedAt ? cuando(a.firedAt) : '—' }}</td>
                <td>{{ a.durationSec != null ? lapso(a.durationSec) : '—' }}</td>
                <td class="al-hint">{{ a.cierre }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script>
import { valor, varNombre, conUmbral, cuando, lapso, usoEquipo, SEV_TXT, sevKey, cierreTxt } from '@/utils/alarmWords';

const REFRESH_MS = 60000;
const RANGO = { critical: 0, warning: 1, info: 2 };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export default {
  name: 'AlarmasConsola',
  middleware: 'authenticated',
  head() { return { title: 'Alarmas' }; },
  data() {
    return {
      tab: 'sin', items: [], nextCursor: null, loading: false, loadingMore: false, error: false, cargado: false,
      summary: null, resItems: [], resLoading: false, resError: false, resCargado: false,
      fSitio: '', fGrav: '', buscar: '', abiertas: {}, ackBusy: {}, nowMs: Date.now(),
    };
  },
  computed: {
    fechaTxt() { const d = new Date(this.nowMs); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}, ${cuando(this.nowMs, this.nowMs)}`; },
    hayFiltro() { return !!(this.fSitio || this.fGrav || this.buscar); },
    // Cada alarma abierta, con sus palabras; las relacionadas cuelgan de su principal.
    vistas() {
      const all = this.items.map(a => this.vista(a));
      const porSitio = new Map();
      all.forEach(a => { const k = a.siteId || ''; if (!porSitio.has(k)) porSitio.set(k, []); porSitio.get(k).push(a); });
      const out = [];
      for (const lista of porSitio.values()) {
        const reglas = new Set(lista.map(a => a.ruleId));
        for (const a of lista) {
          if (a.correlationParent && a.correlationParent !== a.ruleId && reglas.has(a.correlationParent)) continue;   // va plegada bajo su principal
          a.hijas = lista.filter(h => h !== a && h.correlationParent === a.ruleId);
          out.push(a);
        }
      }
      return out;
    },
    sinTomar() { return this.vistas.filter(a => a.state === 'active'); },
    enCurso() { return this.vistas.filter(a => a.state === 'ack'); },
    resHoy() {
      const d = new Date(this.nowMs); d.setHours(0, 0, 0, 0);
      return this.resItems.filter(a => a.resolvedAt != null && a.resolvedAt >= d.getTime()).map(a => this.vista(a));
    },
    bandejas() {
      const nRes = this.resCargado ? this.resHoy.length : (this.summary ? this.summary.resolvedToday : '—');
      return [
        { k: 'sin', n: this.cargado ? this.sinTomar.length : '—', t: 'Sin tomar', d: 'Nadie se ocupó todavía' },
        { k: 'curso', n: this.cargado ? this.enCurso.length : '—', t: 'En curso', d: 'Alguien ya la tomó y sigue abierta' },
        { k: 'res', n: nRes, t: 'Resueltas hoy', d: 'Se cerraron desde las 00:00' },
      ];
    },
    titular() {
      if (!this.cargado) return 'Alarmas';
      const n = this.sinTomar.length, c = this.enCurso.length;
      if (n === 1) return '1 alarma espera que alguien la tome';
      if (n > 1) return `${n} alarmas esperan que alguien las tome`;
      if (c === 1) return 'La única alarma abierta ya está tomada';
      if (c > 1) return `Las ${c} alarmas abiertas ya están tomadas`;
      return 'No hay alarmas abiertas';
    },
    bajada() {
      if (!this.cargado) return '';
      const abiertas = this.sinTomar.concat(this.enCurso);
      if (!abiertas.length) return this.summary && this.summary.resolvedToday ? `Hoy se cerraron ${this.summary.resolvedToday}.` : 'Todo en orden.';
      const ns = new Set(abiertas.map(a => a.siteId)).size;
      let t = ns === 1 ? '1 sitio afectado' : `${ns} sitios afectados`;
      const viejo = this.sinTomar.reduce((m, a) => (a.firedAt != null && (m == null || a.firedAt < m) ? a.firedAt : m), null);
      if (viejo != null) t += ` · la más antigua espera hace ${lapso((this.nowMs - viejo) / 1000)}`;
      return t;
    },
    sitios() {
      const m = new Map();
      this.items.concat(this.resItems).forEach(a => { if (a.siteId && !m.has(a.siteId)) m.set(a.siteId, this.sitioTitulo(a)); });
      return [...m.entries()].map(([code, txt]) => ({ code, txt })).sort((a, b) => a.code.localeCompare(b.code));
    },
    grupos() { return this.agrupar(this.filtrar(this.tab === 'sin' ? this.sinTomar : this.enCurso), true); },
    gruposRes() { return this.agrupar(this.filtrar(this.resHoy), false); },
    vacioTxt() {
      if (this.hayFiltro) return 'No hay alarmas con ese filtro.';
      return this.tab === 'sin' ? 'No hay alarmas esperando: todo lo abierto ya está tomado o no hay nada abierto.' : 'No hay alarmas en curso.';
    },
  },
  mounted() {
    this.fetchAll();
    this._timer = setInterval(() => { if (!document.hidden) { this.fetchSummary(); this.fetchActive(false); if (this.tab === 'res') this.fetchResolved(); } }, REFRESH_MS);
    this._reloj = setInterval(() => { this.nowMs = Date.now(); }, 15000);
    this._notifHandler = () => { this.fetchSummary(); this.fetchActive(false); if (this.resCargado) this.fetchResolved(); };
    this.$nuxt.$on('wanomi:notif', this._notifHandler);
  },
  activated() {
    // keep-alive: al volver, refrescar solo si el dato envejeció.
    if (this._lastFetch && Date.now() - this._lastFetch < 30000) return;
    this.fetchSummary(); this.fetchActive(false);
  },
  beforeDestroy() {
    clearInterval(this._timer); clearInterval(this._reloj);
    if (this._notifHandler) this.$nuxt.$off('wanomi:notif', this._notifHandler);
  },
  methods: {
    lapso,
    cuando(ms) { return cuando(ms, this.nowMs); },
    headers() { return { headers: { token: this.$store.state.auth.token } }; },
    sitioTitulo(a) { return a.siteName && a.siteName !== a.siteId ? `${a.siteId} · ${a.siteName}` : (a.siteId || 'Sin sitio'); },
    // Una alarma en palabras: gravedad, qué es, qué hacer, el dato y hace cuánto.
    vista(a) {
      const sev = sevKey(a.severity);
      const seg = a.firedAt != null ? Math.max(0, (this.nowMs - a.firedAt) / 1000) : null;
      const donde = a.perSite ? 'Todo el sitio' : (usoEquipo(a.deviceType) || a.deviceName || a.dId || '');
      let dato = donde;
      if (!a.perSite && a.variable && a.value != null) {
        const m = a.varMeta || {};
        const lim = typeof a.thresholdUsed === 'number' ? ` (límite ${valor(a.thresholdUsed, m)})` : '';
        dato += `${dato ? ' · ' : ''}${varNombre({ label: m.label, variable: a.variable }).toLowerCase()} ${valor(a.value, m)} al avisar${lim}`;
      }
      const edadTxt = seg == null ? '' : (a.state === 'active' && seg > 3600 ? `espera hace ${lapso(seg)}` : `saltó hace ${lapso(seg)}`);
      return { ...a, sev, sevTxt: SEV_TXT[sev], hijas: [], dato, edadTxt, esperaMucho: a.state === 'active' && seg != null && seg > 3600,
        queEs: a.meaning ? conUmbral(a.meaning, a.umbral) : '', queHacer: a.recommendation ? conUmbral(a.recommendation, a.umbral) : '',
        cierre: a.state === 'resolved' ? cierreTxt(a.mode) : '' };
    },
    filtrar(lista) {
      const q = this.buscar.toLowerCase();
      return lista.filter(a => (!this.fSitio || a.siteId === this.fSitio) && (!this.fGrav || a.sev === this.fGrav)
        && (!q || [a.label, a.siteId, a.siteName, a.deviceName, a.dato].some(x => String(x || '').toLowerCase().includes(q))));
    },
    // Por sitio: primero el sitio con lo más grave y lo más viejo; adentro, igual.
    agrupar(lista, conSituacion) {
      const m = new Map();
      lista.forEach(a => { const k = a.siteId || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(a); });
      const orden = (a, b) => (RANGO[a.sev] - RANGO[b.sev]) || ((a.firedAt || 0) - (b.firedAt || 0));
      const ordenRes = (a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0);
      const out = [...m.entries()].map(([code, items]) => {
        items.sort(conSituacion ? orden : ordenRes);
        return { code: code || 'sin-sitio', titulo: this.sitioTitulo(items[0]), items, situacion: conSituacion ? this.situacion(code) : '' };
      });
      return out.sort((a, b) => (conSituacion ? orden(a.items[0], b.items[0]) : ordenRes(a.items[0], b.items[0])));
    },
    // Situación del sitio en una línea, con lo que hoy sabe la lista: cuántas abiertas y de qué gravedad.
    situacion(code) {
      const del = this.items.filter(a => (a.siteId || '') === code);
      const n = { critical: 0, warning: 0, info: 0 };
      del.forEach(a => { n[sevKey(a.severity)]++; });
      const partes = [];
      if (n.critical) partes.push(n.critical === 1 ? '1 crítica' : `${n.critical} críticas`);
      if (n.warning) partes.push(n.warning === 1 ? '1 advertencia' : `${n.warning} advertencias`);
      if (n.info) partes.push(n.info === 1 ? '1 informativa' : `${n.info} informativas`);
      const sinT = del.filter(a => a.state === 'active').length;
      return `${del.length === 1 ? '1 alarma abierta' : del.length + ' alarmas abiertas'}: ${partes.join(', ')}${sinT ? ` · ${sinT} sin tomar` : ' · todas tomadas'}`;
    },
    irA(k) { this.tab = k; if (k === 'res' && !this.resCargado && !this.resLoading) this.fetchResolved(); },
    plegar(a) { if (this.abiertas[a.notificationId]) this.$delete(this.abiertas, a.notificationId); else this.$set(this.abiertas, a.notificationId, true); },

    async fetchAll() {
      this._lastFetch = Date.now();
      await Promise.all([this.fetchSummary(), this.fetchActive(false)]);
    },
    async fetchSummary() {
      try {
        const res = await this.$axios.get('/alarms/summary', this.headers());
        if (res.data.status === 'success') this.summary = res.data.data;
      } catch (e) { console.error('alarms summary', e); }
    },
    async fetchActive(more) {
      if (more) this.loadingMore = true; else this.loading = true;
      try {
        let url = '/alarms?status=active&limit=200';
        if (more && this.nextCursor) url += '&before=' + encodeURIComponent(this.nextCursor);
        const res = await this.$axios.get(url, this.headers());
        if (res.data.status === 'success') {
          const d = res.data.data;
          this.items = more ? this.items.concat(d.items) : d.items;
          this.nextCursor = d.nextCursor || null;
          this.cargado = true; this.error = false; this.nowMs = Date.now();
        } else if (!this.cargado) this.error = true;
      } catch (e) {
        console.error('alarms active', e);
        if (!this.cargado) this.error = true;
      } finally { this.loading = false; this.loadingMore = false; }
    },
    async fetchResolved() {
      this.resLoading = true;
      try {
        const res = await this.$axios.get('/alarms?status=resolved&limit=200', this.headers());
        if (res.data.status === 'success') { this.resItems = res.data.data.items; this.resCargado = true; this.resError = false; }
        else if (!this.resCargado) this.resError = true;
      } catch (e) {
        console.error('alarms resolved', e);
        if (!this.resCargado) this.resError = true;
      } finally { this.resLoading = false; }
    },
    async tomar(a) {
      if (this.ackBusy[a.notificationId]) return;
      this.$set(this.ackBusy, a.notificationId, true);
      try {
        await this.$axios.put(`/site/${encodeURIComponent(a.siteId)}/alarms/${a.notificationId}/ack`, null, this.headers());
        this.$notify({ type: 'success', message: `Tomaste la alarma: ${a.label || 'alarma'}` });
      } catch (e) {
        console.error('ack', e);
        this.$notify({ type: 'danger', message: `No se pudo tomar la alarma: ${a.label || 'alarma'}` });
      } finally {
        this.$delete(this.ackBusy, a.notificationId);
        this.fetchSummary(); this.fetchActive(false);
      }
    },
  },
};
</script>

<style scoped>
/* Misma paleta que el detalle (AlarmDetailV2): claro #f5f6fa/#fff · oscuro #1e1e2f/#27293d. */
.al { --card: #fff; --card2: #f5f6fa; --ink: #1d253b; --mut: #5f6478; --line: #e3e4ec; --acc: #00705d; --gris: #3d4359;
  --ok: #1f7a52; --mal: #b4232c; --atn: #8a5a00; --pri: #00bf9a; --pri-ink: #062019; --sel: #eef7f4;
  color: var(--ink); font-size: 15px; line-height: 1.5; display: flex; flex-direction: column; gap: 24px; padding-bottom: 32px; max-width: 1240px; margin: 0 auto; }
body:not(.white-content) .al { --card: #27293d; --card2: #1e1e2f; --ink: #eef0f7; --mut: #a9aec6; --line: #3b3d55; --acc: #8fc2ff; --gris: #c9cde0;
  --ok: #7be0a8; --mal: #ff9aa5; --atn: #f8c471; --pri: #5fe0b4; --pri-ink: #0d1f19; --sel: #33365a; }
.al a { color: var(--acc); }
.al p { margin: 0; }
.al-hint { font-size: 13px; color: var(--mut); }
.al-cab { display: flex; flex-direction: column; gap: 6px; }
.al-fecha { font-size: 13px; font-weight: 500; color: var(--mut); }
.al-titulo { margin: 0; font-size: 30px; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em; color: var(--ink); }
.al-bajada { font-size: 15px; color: var(--gris); }

.al-bandejas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.al-bandeja { text-align: left; font: inherit; cursor: pointer; border-radius: 12px; padding: 16px 18px; min-height: 84px; display: flex; flex-direction: column; gap: 2px;
  color: var(--ink); background: var(--card); border: 2px solid var(--line); }
.al-bandeja.on { background: var(--sel); border-color: var(--pri); }
.al-bandeja__n { font-size: 28px; font-weight: 700; line-height: 1.1; }
.al-bandeja__t { font-size: 15px; font-weight: 600; }
.al-bandeja__d { font-size: 13px; color: var(--gris); }

.al-filtros { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.al-filtros label { font-size: 13px; color: var(--gris); margin: 0; }
.al-filtros__der { margin-left: auto !important; }
.al-filtros select, .al-filtros input { font: inherit; height: 44px; padding: 0 12px; border-radius: 10px; background: var(--card); color: var(--ink); border: 1px solid var(--line); box-sizing: border-box; }
.al-filtros input { width: 260px; max-width: 100%; }

.al-sitio { display: flex; flex-direction: column; gap: 10px; }
.al-sitio__cab { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; }
.al-sitio__cab h2 { margin: 0; font-size: 18px; font-weight: 700; }
.al-sitio__cab h2 a { color: var(--ink); }
.al-sitio__cab span { font-size: 14px; color: var(--gris); }
.al-card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: flex-start; }
.al-card__l { flex: 999 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.al-card__r { flex: 1 1 200px; display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
.al-card__t { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.al-card__t h3 { margin: 0; font-size: 17px; font-weight: 600; color: var(--ink); }
.al-card p b { font-weight: 600; }
.al-dato { font-size: 13px; color: var(--mut); }
.al-espera { color: var(--ink); font-weight: 600; }
.al-sev { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--mut); white-space: nowrap; }
.al-sev--critical { color: var(--mal); } .al-sev--warning { color: var(--atn); }
.al-curso { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 13px; color: var(--gris); }
.al-tomada { font-weight: 600; color: var(--ok); }
.al-barras { display: inline-flex; gap: 4px; }
.al-barras i { width: 28px; height: 6px; border-radius: 3px; background: var(--line); display: inline-block; }
.al-barras i.on { background: var(--pri); }
.al-rel { align-self: flex-start; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; min-height: 44px; padding: 0 12px; margin: -4px 0 -4px -12px; border: 0; border-radius: 8px; background: transparent; color: var(--acc); }
.al-hijas { margin: 0; padding: 0 0 0 18px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--gris); }
.al-btn { font: inherit; font-size: 15px; font-weight: 600; min-height: 44px; padding: 0 18px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; text-decoration: none; }
.al-btn.pri, .al a.al-btn.pri { font-weight: 700; border: 0; background: var(--pri); color: var(--pri-ink); }
.al-btn.sec, .al a.al-btn.sec { background: transparent; border: 1px solid var(--line); color: var(--ink); }
.al-btn:disabled { opacity: .5; cursor: default; }
.al-vacio { padding: 28px 20px; border: 1px dashed var(--line); border-radius: 12px; color: var(--gris); text-align: center; }
.al-aviso { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border: 1px solid var(--mal); border-radius: 12px; color: var(--ink); }
.al-mas { display: flex; justify-content: center; }
.al-tabla { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow-x: auto; }
.al-tabla table { width: 100%; min-width: 720px; border-collapse: collapse; font-size: 14.5px; }
.al-tabla th { text-align: left; color: var(--mut); font-size: 13px; font-weight: 600; padding: 12px 20px; }
.al-tabla td { padding: 14px 20px; border-top: 1px solid var(--line); color: var(--ink); }
@media (max-width: 600px) {
  .al-titulo { font-size: 24px; }
  .al-bandeja { padding: 12px; min-height: 64px; } .al-bandeja__d { display: none; } .al-bandeja__n { font-size: 22px; }
  .al-filtros__der { margin-left: 0 !important; } .al-filtros input, .al-filtros select { width: 100%; }
  .al-card { padding: 16px; }
}
</style>
