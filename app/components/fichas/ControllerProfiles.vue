<template>
  <!-- spec_perfiles_controladora — Controladoras de una ficha: los MODELOS concretos de ese tipo de
       equipo (umbrales del fabricante, mediciones que no tiene, códigos de falla, requisitos de
       instalación). Lectura para todos; alta / edición / borrado solo superadmin. -->
  <div class="cp">
    <p class="text-muted cp-intro">
      La ficha define qué mide un <b>{{ sheet.manufacturer || sheet.deviceType }}</b>. Cada controladora es un modelo concreto:
      ajusta los umbrales al manual de ese modelo, marca las mediciones que no tiene y da significado a sus códigos de falla.
      Cada equipo usa su controladora; sin controladora, usa la ficha.
    </p>

    <p v-if="loading" class="text-muted">Cargando…</p>
    <template v-else-if="!form">
      <div v-for="p in perfiles" :key="p.profileId" class="cp-item">
        <div class="cp-item__t">
          <b>{{ p.manufacturer }} {{ p.model }}</b>
          <span class="text-muted">{{ (p.variants || []).join(' · ') }}</span>
          <span class="cp-chips">
            <span class="badge badge-info">{{ (p.limits || []).length }} umbrales</span>
            <span class="badge badge-secondary">{{ p.faultCount != null ? p.faultCount : '…' }} códigos de falla</span>
            <span v-if="(p.unavailable || []).length" class="badge badge-warning">sin {{ p.unavailable.join(', ') }}</span>
            <span class="badge badge-default">{{ p.devices != null ? p.devices : '…' }} equipo(s)</span>
          </span>
        </div>
        <div>
          <base-button type="info" size="sm" @click="abrir(p.profileId)">{{ isSuperadmin ? 'Ver / editar' : 'Ver' }}</base-button>
        </div>
      </div>
      <p v-if="!perfiles.length" class="text-muted">Esta ficha todavía no tiene controladoras cargadas: sus equipos usan los umbrales genéricos.</p>
      <base-button v-if="isSuperadmin" type="primary" size="sm" @click="nuevo">+ Nueva controladora</base-button>
    </template>

    <!-- ── Detalle / edición ── -->
    <template v-else>
      <div class="cp-row">
        <div class="cp-fld"><label>Identificador</label>
          <base-input v-model="form.profileId" :disabled="!esNuevo || !isSuperadmin" placeholder="ej. cummins-pcc1302" /></div>
        <div class="cp-fld"><label>Fabricante</label><base-input v-model="form.manufacturer" :disabled="!isSuperadmin" /></div>
        <div class="cp-fld cp-fld--w"><label>Modelo</label><base-input v-model="form.model" :disabled="!isSuperadmin" /></div>
      </div>
      <div class="cp-row">
        <div class="cp-fld cp-fld--w"><label>Variantes / pantallas (separadas por coma)</label>
          <base-input v-model="form.variantesTxt" :disabled="!isSuperadmin" placeholder="HMI211, PowerCommand 1.1" /></div>
        <div class="cp-fld cp-fld--w"><label>Documento del fabricante</label><base-input v-model="form.source" :disabled="!isSuperadmin" /></div>
      </div>

      <h5 class="cp-h">Mediciones que este modelo NO tiene</h5>
      <p class="text-muted cp-small">Las reglas que usan estas mediciones no aplican en los equipos con esta controladora.</p>
      <div class="cp-vars">
        <label v-for="v in sheet.variables || []" :key="v.name" class="cp-var">
          <input type="checkbox" :value="v.name" v-model="form.unavailable" :disabled="!isSuperadmin"> {{ v.label || v.name }}
        </label>
      </div>

      <h5 class="cp-h">Umbrales del fabricante</h5>
      <p class="text-muted cp-small">Reemplazan a los de la ficha en los equipos con esta controladora. Cada umbral lleva su fuente (manual, código, decisión).</p>
      <div v-for="(l, i) in form.limits" :key="i" class="cp-lim">
        <select v-model="l.variable" class="form-control" :disabled="!isSuperadmin">
          <option v-for="v in conLimites" :key="v.name" :value="v.name">{{ v.label || v.name }}</option>
        </select>
        <select v-model="l.kind" class="form-control" :disabled="!isSuperadmin"><option value="warning">aviso</option><option value="trip">crítico</option></select>
        <select v-model="l.op" class="form-control" :disabled="!isSuperadmin"><option value="lt">menor que</option><option value="lte">menor o igual</option><option value="gt">mayor que</option><option value="gte">mayor o igual</option></select>
        <input v-model="l.value" class="form-control" type="number" step="any" :disabled="!isSuperadmin" :placeholder="unidad(l.variable)">
        <input v-model="l.source" class="form-control cp-src" :disabled="!isSuperadmin" placeholder="fuente (obligatoria)">
        <span class="text-muted cp-small">ficha: {{ deFicha(l) }}</span>
        <base-button v-if="isSuperadmin" type="danger" size="sm" icon @click="form.limits.splice(i, 1)"><i class="tim-icons icon-trash-simple"></i></base-button>
      </div>
      <base-button v-if="isSuperadmin" type="secondary" size="sm" @click="form.limits.push({ variable: (conLimites[0] || {}).name || '', kind: 'trip', op: 'lt', value: '', source: '' })">+ Umbral</base-button>

      <h5 class="cp-h">Requisitos de instalación</h5>
      <textarea v-model="form.installTxt" class="form-control cp-ta" rows="4" :disabled="!isSuperadmin" placeholder="Uno por línea"></textarea>

      <h5 class="cp-h">Códigos de falla ({{ form.faultCodes.length }})</h5>
      <p class="text-muted cp-small">Dan nombre, tipo y causas posibles al detalle de la alarma. Se cargan desde un archivo JSON (lista de {code, name, type, logic, causes}).</p>
      <div class="cp-row">
        <base-input v-model="buscarCodigo" placeholder="Buscar código o texto" class="cp-fld cp-fld--w" />
        <template v-if="isSuperadmin">
          <base-button type="info" size="sm" @click="$refs.jsonCodes.click()">Importar JSON</base-button>
          <input ref="jsonCodes" type="file" accept="application/json" style="display:none" @change="importarCodigos">
        </template>
      </div>
      <div class="cp-codes">
        <div v-for="f in codigosFiltrados" :key="f.code" class="cp-code">
          <b>{{ f.code }}</b> · {{ f.name }} <span class="badge" :class="f.type === 'shutdown' ? 'badge-danger' : 'badge-warning'">{{ TIPO[f.type] || f.type }}</span>
          <div v-if="f.logic" class="text-muted cp-small">{{ f.logic }}</div>
        </div>
        <p v-if="!codigosFiltrados.length" class="text-muted cp-small">Sin códigos.</p>
      </div>

      <h5 class="cp-h">Notas</h5>
      <textarea v-model="form.notes" class="form-control cp-ta" rows="2" :disabled="!isSuperadmin"></textarea>

      <p v-if="error" class="text-danger mt-2">{{ error }}</p>
      <div class="cp-actions">
        <base-button type="secondary" size="sm" @click="cerrar">Volver</base-button>
        <template v-if="isSuperadmin">
          <base-button v-if="!esNuevo" type="danger" size="sm" @click="borrar" :disabled="guardando">Borrar</base-button>
          <base-button type="primary" size="sm" @click="guardar" :disabled="guardando || !puedeGuardar">{{ guardando ? 'Guardando…' : 'Guardar controladora' }}</base-button>
        </template>
      </div>
    </template>
  </div>
</template>

<script>
const TIPO = { warning: 'advertencia', shutdown: 'parada', event: 'evento', configurable: 'configurable' };
export default {
  name: 'ControllerProfiles',
  props: { sheet: { type: Object, required: true }, isSuperadmin: { type: Boolean, default: false } },
  data() { return { TIPO, loading: true, perfiles: [], form: null, esNuevo: false, guardando: false, error: '', buscarCodigo: '' }; },
  computed: {
    conLimites() { return (this.sheet.variables || []).filter((v) => ['float', 'int', 'number'].includes(v.type) || (v.limits || []).length); },
    codigosFiltrados() {
      const q = this.buscarCodigo.trim().toLowerCase();
      const all = (this.form && this.form.faultCodes) || [];
      return (q ? all.filter((f) => String(f.code).includes(q) || (f.name || '').toLowerCase().includes(q)) : all).slice(0, 120);
    },
    puedeGuardar() {
      const f = this.form;
      return f && /^[a-z0-9][a-z0-9-]*$/.test(f.profileId || '') && (f.model || '').trim() && f.limits.every((l) => l.variable && l.value !== '' && (l.source || '').trim());
    },
  },
  mounted() { this.cargar(); },
  methods: {
    hdr() { return { headers: { token: this.$store.state.auth.token } }; },
    unidad(v) { const x = (this.sheet.variables || []).find((z) => z.name === v); return (x && x.unit) || 'valor'; },
    deFicha(l) {
      const x = (this.sheet.variables || []).find((z) => z.name === l.variable);
      const dir = ['lt', 'lte'].includes(l.op) ? ['lt', 'lte'] : ['gt', 'gte'];
      const f = x && (x.limits || []).find((m) => m.kind === l.kind && dir.includes(m.op));
      return f ? `${f.value} ${x.unit || ''}` : 'sin límite';
    },
    async cargar() {
      this.loading = true;
      try {
        const r = await this.$axios.get(`/controllerprofiles?deviceType=${encodeURIComponent(this.sheet.deviceType)}`, this.hdr());
        this.perfiles = (r.data && r.data.data) || [];
        // conteo de equipos y códigos (detalle por perfil)
        for (const p of this.perfiles) {
          try { const d = await this.$axios.get(`/controllerprofiles/${encodeURIComponent(p.profileId)}`, this.hdr()); this.$set(p, 'devices', d.data.devices); this.$set(p, 'faultCount', ((d.data.data || {}).faultCodes || []).length); } catch (e) { /* sin detalle */ }
        }
      } catch (e) { this.perfiles = []; }
      this.loading = false;
    },
    aForm(p) {
      return { profileId: p.profileId || '', manufacturer: p.manufacturer || this.sheet.manufacturer || '', model: p.model || '', variantesTxt: (p.variants || []).join(', '),
        source: p.source || '', unavailable: [...(p.unavailable || [])], limits: (p.limits || []).map((l) => ({ ...l })),
        installTxt: (p.install || []).join('\n'), faultCodes: p.faultCodes || [], notes: p.notes || '' };
    },
    nuevo() { this.esNuevo = true; this.error = ''; this.form = this.aForm({}); },
    async abrir(id) {
      this.error = '';
      try { const r = await this.$axios.get(`/controllerprofiles/${encodeURIComponent(id)}`, this.hdr()); this.esNuevo = false; this.form = this.aForm(r.data.data); }
      catch (e) { this.error = 'No se pudo abrir la controladora'; }
    },
    cerrar() { this.form = null; this.cargar(); },
    importarCodigos(ev) {
      const file = ev.target.files && ev.target.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const arr = JSON.parse(rd.result);
          if (!Array.isArray(arr) || !arr.every((x) => Number.isFinite(Number(x.code)) && x.name)) throw new Error('formato');
          this.form.faultCodes = arr.map((x) => ({ code: Number(x.code), name: String(x.name), type: x.type || 'warning', logic: x.logic || '', causes: Array.isArray(x.causes) ? x.causes : [] }));
          this.error = '';
        } catch (e) { this.error = 'El archivo no es una lista válida de códigos {code, name, type, logic, causes}.'; }
      };
      rd.readAsText(file); ev.target.value = '';
    },
    async guardar() {
      const f = this.form; this.guardando = true; this.error = '';
      const profile = {
        deviceType: this.sheet.deviceType, manufacturer: f.manufacturer.trim(), model: f.model.trim(),
        variants: f.variantesTxt.split(',').map((x) => x.trim()).filter(Boolean), source: f.source.trim(),
        unavailable: f.unavailable, limits: f.limits.map((l) => ({ variable: l.variable, kind: l.kind, op: l.op, value: Number(l.value), unit: this.unidad(l.variable) === 'valor' ? '' : this.unidad(l.variable), source: l.source.trim() })),
        install: f.installTxt.split('\n').map((x) => x.trim()).filter(Boolean), faultCodes: f.faultCodes, notes: f.notes,
      };
      try {
        await this.$axios.put(`/controllerprofiles/${encodeURIComponent(f.profileId)}`, { profile }, this.hdr());
        this.$notify({ type: 'success', icon: 'tim-icons icon-check-2', message: `Controladora ${f.model} guardada: los equipos que la usan toman los cambios.` });
        this.cerrar();
      } catch (e) { this.error = (e.response && e.response.data && e.response.data.error) || 'No se pudo guardar'; }
      this.guardando = false;
    },
    async borrar() {
      this.guardando = true; this.error = '';
      try { await this.$axios.delete(`/controllerprofiles/${encodeURIComponent(this.form.profileId)}`, this.hdr()); this.cerrar(); }
      catch (e) { this.error = (e.response && e.response.data && e.response.data.error) || 'No se pudo borrar'; }
      this.guardando = false;
    },
  },
};
</script>

<style scoped>
.cp { display: flex; flex-direction: column; gap: 10px; }
.cp-intro, .cp-small { font-size: 12.5px; margin: 0; }
.cp-item { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid rgba(128, 128, 128, .3); border-radius: 10px; }
.cp-item__t { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cp-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.cp-fld { flex: 1 1 160px; min-width: 0; }
.cp-fld--w { flex: 2 1 240px; }
.cp-h { margin: 10px 0 0; font-size: 14px; font-weight: 700; }
.cp-vars { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; }
.cp-var { display: inline-flex; align-items: center; gap: 5px; margin: 0; }
.cp-lim { display: grid; grid-template-columns: 1.4fr .8fr 1fr .8fr 2fr auto auto; gap: 6px; align-items: center; }
.cp-ta { min-height: 60px; }
.cp-codes { max-height: 260px; overflow: auto; display: flex; flex-direction: column; gap: 6px; border: 1px solid rgba(128, 128, 128, .3); border-radius: 10px; padding: 8px 10px; font-size: 13px; }
.cp-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 8px; }
@media (max-width: 760px) { .cp-lim { grid-template-columns: 1fr 1fr; } }
</style>
