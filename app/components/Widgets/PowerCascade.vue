<template>
  <div class="power-cascade">
    <template v-for="(st, i) in stages">
      <div :key="'n' + i" class="power-cascade__node" :class="'power-cascade__node--' + st.state">
        <div class="power-cascade__dot"><i class="fa" :class="st.icon"></i></div>
        <div class="power-cascade__label">{{ st.label }}</div>
        <div class="power-cascade__state">{{ st.text }}</div>
      </div>
      <div v-if="i < stages.length - 1" :key="'a' + i" class="power-cascade__arrow"
           :class="{ 'power-cascade__arrow--flow': st.state === 'ok' && stages[i + 1] && stages[i + 1].state === 'ok' }">
        <i class="fa fa-chevron-right"></i>
      </div>
    </template>
    <div v-if="!stages.length" class="power-cascade__empty">sin etapas configuradas</div>
  </div>
</template>

<script>
// DEC-REF-107 (Paso 5) — powerCascade, presentación PURA multi-fuente.
// Lee la cadena de etapas de energía (red → ATS → grupo → rectificador) como
// UN evento de sitio (pilar DEC-GTM-2). Cada etapa = una source; su estado sale
// de values[key].value (truthy=activo, falsy=inactivo, ausente=esperando). El
// ícono lo sugiere `role`; el orden es el de sources.
const ROLE_ICON = {
  mains:     'fa-bolt',
  ats:       'fa-random',
  genset:    'fa-cog',
  rectifier: 'fa-plug',
  battery:   'fa-battery-half',
};

const EDITOR_MOCK = [
  { role: 'mains',     label: 'Red',         v: 0 },
  { role: 'ats',       label: 'ATS',         v: 1 },
  { role: 'genset',    label: 'Grupo',       v: 1 },
  { role: 'rectifier', label: 'Rectificador', v: 1 },
];

export default {
  name: 'PowerCascade',
  props: {
    values:  { type: Object, default: () => ({}) },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  computed: {
    stages() {
      if (this.context === 'editor') {
        return EDITOR_MOCK.map((m) => this.toStage(m.label, m.role, m.v));
      }
      return (this.config.sources || []).map((s) => {
        const entry = this.values[s.key];
        const v = entry ? entry.value : undefined;
        return this.toStage(s.variableFullName || s.role || s.variable, s.role, v, s.activeWhen);
      });
    },
  },
  methods: {
    toStage(label, role, v, activeWhen) {
      let state = 'waiting';
      let text = '—';
      if (v !== undefined && v !== null) {
        const on = this.isActive(v, activeWhen);
        state = on ? 'ok' : 'off';
        text = on ? 'Activo' : 'Inactivo';
      }
      return { label, state, text, icon: ROLE_ICON[role] || 'fa-circle' };
    },
    // DEC-REF-113 F4 (#84) — semántica de "activo" CONFIGURABLE por fuente:
    // `activeWhen` (lista de valores que significan activo para ESTA señal)
    // manda cuando está declarada. Si no, regla genérica: los literales
    // clásicos (true/1/'on'/'ok') o CUALQUIER NÚMERO > 0 — una tensión de
    // red de 220 V ES "hay red". La regla vieja solo aceptaba los literales
    // y dejaba la cascada entera en "Inactivo" con datos reales.
    isActive(v, activeWhen) {
      if (Array.isArray(activeWhen) && activeWhen.length) {
        return activeWhen.some((a) => String(v) === String(a));
      }
      if (typeof v === 'number' && Number.isFinite(v)) return v > 0;
      return v === true || v === 1 || v === '1' || v === 'true' || v === 'on' || v === 'ok';
    },
  },
};
</script>

<style scoped>
.power-cascade {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px;
  width: 100%;
}
.power-cascade__node {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 66px;
  padding: 4px;
}
.power-cascade__dot {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1em;
  border: 2px solid currentColor;
  background: rgba(255, 255, 255, 0.04);
}
.power-cascade__label { margin-top: 5px; font-size: 0.75em; color: #c7ccd4; }
.power-cascade__state { font-size: 0.68em; opacity: 0.8; }
.power-cascade__arrow { color: #4a5160; font-size: 0.9em; }

/* DEC-REF-108 F4 (#80) — flujo vivo: la flecha entre dos etapas ACTIVAS
   pulsa y se desplaza (la corriente "circula" visualmente por la cadena).
   Sin animación entre etapas inactivas o en espera: el movimiento informa. */
.power-cascade__arrow--flow { color: #00bf9a; animation: pc-flow 1.1s ease-in-out infinite; }
@keyframes pc-flow {
  0%   { opacity: 0.35; transform: translateX(-3px); }
  50%  { opacity: 1; }
  100% { opacity: 0.35; transform: translateX(3px); }
}
.power-cascade__empty { color: #6b7280; font-style: italic; opacity: 0.7; }

.power-cascade__node--ok      { color: #00bf9a; }
.power-cascade__node--off     { color: #fd5d93; }
.power-cascade__node--waiting { color: #6b7280; }
.power-cascade__node--waiting .power-cascade__dot { border-style: dashed; }

/* DEC-REF-112 — modo claro */
.white-content .power-cascade__dot { background: rgba(0, 0, 0, 0.05); }
.white-content .power-cascade__label { color: #525f7f; }
</style>
