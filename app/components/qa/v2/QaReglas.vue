<template>
  <!-- spec_supervisor_confiabilidad_v2 (R4) — calidad de las reglas (R2): veredicto, por qué, cálculo y
       qué cambiar; «Aplicar cambio» lo guarda por la API del pack, igual que el editor. -->
  <div class="qv-stack">
    <div class="qv-card">
      <div class="qv-row qv-between">
        <h3 class="qv-h">Calidad de las reglas</h3>
        <span class="qv-mut qv-small" v-if="rq">corrida {{ fechaLarga(rq.computedAt) }} · {{ rq.days }} días · {{ (rq.rows || 0).toLocaleString('es-AR') }} lecturas</span>
      </div>
      <p class="qv-note">Cada veredicto sale de reproducir los últimos {{ rq ? rq.days : 30 }} días con el motor completo (espera, histéresis y cierre) y cuenta avisos reales. Cada cambio propuesto se volvió a reproducir: se informa cuántos avisos quedan y si se pierde alguna falla real (episodios de más de 10 min).</p>
      <div v-if="!rq" class="qv-empty">{{ error || 'Todavía no hay cálculo de calidad de reglas. Corre todas las noches o con «Recalcular».' }}</div>
      <div v-else class="qv-chips">
        <button v-for="c in chips" :key="c.k" type="button" class="qv-chip" :aria-pressed="filtro === c.k ? 'true' : 'false'" @click="filtro = c.k">{{ c.txt }}</button>
      </div>
      <div class="qv-row"><button type="button" class="qv-btn qv-btn--sec" :disabled="recalculando" @click="$emit('recalcular')">{{ recalculando ? 'Recalculando… (≈ 25 min)' : 'Recalcular ahora' }}</button></div>
    </div>
    <!-- spec_textos_alarma_ficha T6 — reglas críticas / de advertencia sin textos (después de la herencia). -->
    <div class="qv-card" v-if="txt">
      <div class="qv-row qv-between">
        <h3 class="qv-h">Textos de las alarmas</h3>
        <span class="qv-mut qv-small">{{ txt.revisadas }} reglas críticas y de advertencia revisadas</span>
      </div>
      <p v-if="!txt.faltan.length" class="qv-small qv-ok-txt">✓ Todas tienen «Qué significa», «Qué hacer» y «Pasos a seguir» (propios o de la ficha).</p>
      <template v-else>
        <p class="qv-note">{{ txt.faltan.length }} regla(s) sin algún texto: el operador no va a tener la guía completa en el detalle de la alarma.</p>
        <div v-for="f in txt.faltan" :key="'tx' + f.ruleId" class="qv-row qv-between" style="border-top:1px solid #e2e8f0;padding:6px 0">
          <span class="qv-small"><b>{{ f.label }}</b> · {{ sevTxt(f.severity) }} · <span class="qv-num">{{ f.ruleId }}</span><br>falta: {{ f.faltan.join(', ') }}</span>
          <button type="button" class="qv-btn qv-btn--sec" @click="editor(f)">Completar en el editor</button>
        </div>
      </template>
    </div>
    <article v-for="r in visibles" :key="r.ruleId" class="qv-rule">
      <div class="qv-rule__stripe" :class="'qv-' + V(r).cls"></div>
      <div class="qv-rule__body">
        <div>
          <div class="qv-row"><b>{{ r.label }}</b> <span class="qv-pill" :class="'qv-pill--' + V(r).cls">{{ V(r).txt }}</span></div>
          <span class="qv-mut qv-small">{{ sevTxt(r.severity) }} · <span class="qv-num">{{ r.ruleId }}</span></span>
          <span class="qv-small qv-num">{{ r.avisos || 0 }} avisos · {{ fmt(r.porDia, 2) }}/día · {{ r.parpadeos || 0 }} parpadeos</span>
        </div>
        <div><span class="qv-eyebrow">Por qué</span><p class="qv-small">{{ r.porque }}</p></div>
        <div><span class="qv-eyebrow">Cálculo</span><div class="qv-math">{{ r.calculo || '—' }}</div></div>
        <div>
          <span class="qv-eyebrow">Qué cambiar</span>
          <p class="qv-small qv-todo">{{ r.cambio }}</p>
          <div class="qv-row" style="margin-top:6px">
            <button v-if="aplicable(r)" type="button" class="qv-btn" :disabled="aplicando === r.ruleId" @click="aplicar(r)">{{ aplicando === r.ruleId ? 'Aplicando…' : 'Aplicar cambio' }}</button>
            <button type="button" class="qv-btn qv-btn--sec" @click="editor(r)">Ver en el editor</button>
          </div>
          <p v-if="aplicadas[r.ruleId]" class="qv-small qv-ok-txt">✓ Aplicado. La próxima corrida lo confirma con datos reales.</p>
        </div>
      </div>
    </article>
  </div>
</template>
<script>
import { fmt, fechaLarga, VEREDICTOS } from './qaFormat';
export default {
  name: 'QaReglas',
  props: { rq: { type: Object, default: null }, error: { type: String, default: '' }, recalculando: { type: Boolean, default: false } },
  data: () => ({ filtro: 'atender', aplicando: null, aplicadas: {}, txt: null }),
  async mounted() {
    try {
      const r = await this.$axios.get('/qa/rule-texts', { headers: { token: this.$store.state.auth.token } });
      this.txt = (r.data && r.data.data) || null;
    } catch (e) { this.txt = null; }
  },
  computed: {
    reglas() { return (this.rq && this.rq.reglas) || []; },
    chips() {
      const n = (k) => this.reglas.filter((r) => r.veredicto === k).length;
      const atender = this.reglas.filter((r) => !['sana', 'proteccion'].includes(r.veredicto)).length;
      return [{ k: 'atender', txt: `A atender (${atender})` }, { k: 'todas', txt: `Todas (${this.reglas.length})` },
        ...Object.keys(VEREDICTOS).map((k) => ({ k, txt: `${VEREDICTOS[k].txt} (${n(k)})` }))];
    },
    visibles() {
      if (this.filtro === 'todas') return this.reglas;
      if (this.filtro === 'atender') return this.reglas.filter((r) => !['sana', 'proteccion'].includes(r.veredicto));
      return this.reglas.filter((r) => r.veredicto === this.filtro);
    },
  },
  methods: {
    fmt, fechaLarga,
    V(r) { return VEREDICTOS[r.veredicto] || { txt: r.veredicto, cls: 'info' }; },
    sevTxt(s) { return { critical: 'Crítica', warning: 'Advertencia', info: 'Informativa' }[s] || s; },
    aplicable(r) { const p = r.propuesta; return !!(r.veredicto === 'avisa_de_mas' && p && (p.graceSec || p.deadband) && p.despues != null && !this.aplicadas[r.ruleId]); },
    hdr() { return { headers: { token: this.$store.state.auth.token } }; },
    async pack(r) { const res = await this.$axios.get(`/rulepacks/${encodeURIComponent(r.packId)}`, this.hdr()); return res.data && res.data.data; },
    async editor(r) {
      try {
        const p = await this.pack(r); const i = p ? p.rules.findIndex((x) => x.ruleId === r.ruleId) : -1;
        this.$router.push({ path: `/rulepacks/${encodeURIComponent(r.packId)}`, query: i >= 0 ? { regla: String(i) } : {} });
      } catch (e) { this.$router.push(`/rulepacks/${encodeURIComponent(r.packId)}`); }
    },
    async aplicar(r) {
      const p = r.propuesta; const cambios = [];
      if (p.graceSec) cambios.push(`espera ${r.graceSec || 0} s → ${p.graceSec} s`);
      if (p.deadband) cambios.push(`histéresis → ${p.deadband}`);
      const aviso = p.perdidas ? `\n\n⚠ Con este cambio se perderían ${p.perdidas} falla(s) real(es) de más de 10 min en los últimos ${this.rq.days} días.` : '';
      if (!window.confirm(`«${r.label}»: ${cambios.join(' y ')}.\nAvisos en ${this.rq.days} días: ${p.antes} → ${p.despues}.${aviso}\n\nGuardar la regla cierra sus alarmas abiertas. ¿Aplicar?`)) return;
      this.aplicando = r.ruleId;
      try {
        const pk = await this.pack(r);
        const i = pk ? pk.rules.findIndex((x) => x.ruleId === r.ruleId) : -1;
        if (i < 0) throw new Error('La regla ya no está en el pack.');
        const cur = pk.rules[i];
        if ((Number(cur.graceSec) || 0) !== (r.graceSec || 0)) throw new Error(`La regla cambió desde la corrida (espera actual ${cur.graceSec || 0} s). Revisala en el editor.`);
        const rules = pk.rules.map((x) => JSON.parse(JSON.stringify(x)));
        if (p.graceSec) rules[i].graceSec = p.graceSec;
        if (p.deadband && cur.type === 'D') rules[i].condition = { ...(rules[i].condition || {}), deadband: p.deadband };
        await this.$axios.put(`/rulepacks/${encodeURIComponent(pk.packId)}`, { rulepack: { packId: pk.packId, deviceType: pk.deviceType, version: (pk.version || 1) + 1, description: pk.description || '', canary: !!pk.canary, rules } }, this.hdr());
        this.$set(this.aplicadas, r.ruleId, true);
        this.$notify({ type: 'success', icon: 'tim-icons icon-check-2', message: `«${r.label}» actualizada. El motor recargó la regla.` });
      } catch (e) {
        this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: (e.response && e.response.data && e.response.data.error) || e.message || 'No se pudo aplicar el cambio.' });
      } finally { this.aplicando = null; }
    },
  },
};
</script>
