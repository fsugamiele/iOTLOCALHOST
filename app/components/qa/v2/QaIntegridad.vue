<template>
  <!-- spec_supervisor_confiabilidad_v2 (R4) — integridad del motor (R3): por control, cuántos hallazgos
       están abiertos y cuántos se cerraron solos, con su criterio y las acciones de cada hallazgo. -->
  <div class="qv-stack">
    <div class="qv-card">
      <h3 class="qv-h">Integridad del motor</h3>
      <p class="qv-note">Controles independientes del motor: reconstruyen cada episodio (aviso → cierre) desde la base y verifican que el motor y la consola cuenten la misma historia. Un hallazgo se cierra solo cuando deja de aparecer dos corridas seguidas; si vuelve, se reabre.</p>
      <div v-if="error" class="qv-empty">{{ error }}</div>
    </div>
    <div class="qv-grid qv-g2">
      <div v-for="g in grupos" :key="g.type" class="qv-card">
        <div class="qv-row qv-between">
          <h4 class="qv-h4">{{ g.nombre }} <span class="qv-mut qv-small qv-num">{{ g.type }}</span></h4>
          <span class="qv-pill" :class="g.abiertos.length ? (g.duro ? 'qv-pill--mal' : 'qv-pill--atn') : 'qv-pill--ok'">{{ g.abiertos.length ? `${g.abiertos.length} abierto(s)` : 'Sin hallazgos abiertos' }}</span>
        </div>
        <div class="qv-nums">
          <div><span class="qv-mut qv-small">Abiertos</span><b class="qv-num">{{ g.abiertos.length }}</b></div>
          <div><span class="qv-mut qv-small">Se cerraron solos</span><b class="qv-num">{{ g.auto }}</b></div>
          <div><span class="qv-mut qv-small">Cerrados a mano</span><b class="qv-num">{{ g.mano }}</b></div>
          <div><span class="qv-mut qv-small">Silenciados</span><b class="qv-num">{{ g.mudos }}</b></div>
        </div>
        <div class="qv-math">{{ g.criterio }}</div>
        <div v-for="f in g.abiertos.slice(0, 4)" :key="f._id" class="qv-hallazgo">
          <p class="qv-small"><b>{{ f.ruleId || f.variable || '—' }}</b><span v-if="f.dId" class="qv-mut"> · {{ f.dId }}</span> · visto {{ f.count }} vez/veces · último {{ fecha(f.lastSeen) }}</p>
          <p class="qv-small qv-mut">{{ f.suggestedAction }}</p>
          <div class="qv-row">
            <button v-if="f.type === 'I13' && f.ruleId" type="button" class="qv-btn" @click="aceptar(f)">Aceptar como referencia</button>
            <button type="button" class="qv-btn qv-btn--sec" @click="estado(f, 'resolved')">Marcar resuelto</button>
            <button type="button" class="qv-btn qv-btn--sec" @click="estado(f, 'muted')">Silenciar</button>
          </div>
        </div>
        <p v-if="g.abiertos.length > 4" class="qv-small qv-mut">y {{ g.abiertos.length - 4 }} más.</p>
      </div>
    </div>
  </div>
</template>
<script>
import { fecha, CONTROLES } from './qaFormat';
export default {
  name: 'QaIntegridad',
  props: { findings: { type: Array, default: () => [] }, error: { type: String, default: '' } },
  computed: {
    grupos() {
      const by = new Map();
      for (const f of this.findings) (by.get(f.type) || by.set(f.type, []).get(f.type)).push(f);
      const orden = Object.keys(CONTROLES);
      return [...by.entries()].map(([type, fs]) => ({
        type, nombre: (CONTROLES[type] || {}).nombre || type, criterio: (CONTROLES[type] || {}).criterio || '',
        duro: fs.some((f) => f.severity === 'hard'),
        abiertos: fs.filter((f) => f.status === 'open' || f.status === 'ack'),
        auto: fs.filter((f) => f.status === 'resolved' && f.resolvedBy === 'auto').length,
        mano: fs.filter((f) => f.status === 'resolved' && f.resolvedBy !== 'auto').length,
        mudos: fs.filter((f) => f.status === 'muted').length,
      })).sort((a, b) => (b.abiertos.length > 0) - (a.abiertos.length > 0) || orden.indexOf(a.type) - orden.indexOf(b.type));
    },
  },
  methods: {
    fecha,
    hdr() { return { headers: { token: this.$store.state.auth.token } }; },
    async estado(f, status) {
      try { await this.$axios.patch(`/qa/findings/${f._id}/status`, { status }, this.hdr()); this.$emit('cambio'); }
      catch (e) { this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: 'No se pudo cambiar el hallazgo.' }); }
    },
    async aceptar(f) {
      if (!window.confirm(`La versión actual de ${f.ruleId} pasa a ser la referencia. Los cambios ya no se reportan como deriva. ¿Aceptar?`)) return;
      try { await this.$axios.post(`/qa/rule/${encodeURIComponent(f.ruleId)}/accept-reference`, {}, this.hdr()); this.$emit('cambio'); this.$notify({ type: 'success', icon: 'tim-icons icon-check-2', message: 'Versión aceptada como referencia.' }); }
      catch (e) { this.$notify({ type: 'danger', icon: 'tim-icons icon-alert-circle-exc', message: 'No se pudo aceptar la referencia.' }); }
    },
  },
};
</script>
