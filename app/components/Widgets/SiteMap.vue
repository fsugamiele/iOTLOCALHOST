<template>
  <div class="site-map">
    <div
      ref="plan"
      class="site-map__plan"
      :class="{ 'site-map__plan--edit': editable }"
    >
      <!-- Cerco perimetral -->
      <div class="site-map__fence"></div>
      <!-- Shelter -->
      <div class="site-map__shelter" :style="shelterStyle">
        <span class="site-map__shelter-label">shelter</span>
      </div>
      <!-- Puntos de sensores -->
      <div
        v-for="p in points"
        :key="p.key"
        class="site-map__point"
        :class="['site-map__point--' + p.state, { 'site-map__point--drag': editable }]"
        :style="{ left: p.x + '%', top: p.y + '%' }"
        :title="p.tip"
        @pointerdown="onPointDown(p, $event)"
      >
        <span class="site-map__chip"><i class="fa" :class="p.icon"></i></span>
        <span class="site-map__point-label">{{ p.label }}</span>
      </div>
      <div v-if="!points.length" class="site-map__empty">sin puntos configurados</div>
    </div>
    <div class="site-map__legend">
      <span><i class="site-map__lg site-map__lg--ok"></i> normal</span>
      <span><i class="site-map__lg site-map__lg--alert"></i> evento</span>
      <span><i class="site-map__lg site-map__lg--waiting"></i> esperando</span>
      <span v-if="editable" class="site-map__edit-hint">
        <i class="fa fa-arrows-alt"></i> arrastrá los puntos para ubicarlos
      </span>
    </div>
  </div>
</template>

<script>
// DEC-REF-108 F5 (#80) + rediseño DEC-REF-113 F6 (#84) — plano 2D del sitio.
// HTML/CSS responsive: las posiciones son % del contenedor → el plano se
// AUTOAJUSTA a cualquier tamaño de celda (antes SVG fijo 400×260). Un punto
// por fuente configurada (sources del widget, con role); la posición sale de
// source.pos (EDITABLE arrastrando el punto en el editor de plantillas) con
// fallback a la canónica por rol (geometría típica de la instalación).
//
// Convención de estados (producto): 1/true/'on' = EVENTO (puerta abierta,
// movimiento, vibración de cerco) → rojo pulsante; 0 = normal → verde;
// sin dato = esperando (gris).
const ROLE_POS = {
  door_front:           { x: 50, y: 76 },  // puerta frontal (pared inferior)
  door_rear:            { x: 50, y: 24 },  // puerta trasera (pared superior)
  door_shelter:         { x: 27, y: 50 },  // puerta lateral del shelter
  door_battery_cabinet: { x: 73, y: 50 },  // gabinete de baterías (pared opuesta)
  pir:                  { x: 50, y: 50 },  // PIR interior
  fence:                { x: 9,  y: 13 },  // vibración de cerco (esquina)
};
const ROLE_ICON = {
  door_front:           'fa-door-open',
  door_rear:            'fa-door-open',
  door_shelter:         'fa-door-open',
  door_battery_cabinet: 'fa-car-battery',
  pir:                  'fa-walking',
  fence:                'fa-bell',
};
// Shelter como % del plano (left, top, width, height).
const SHELTER = { x: 32, y: 30, w: 36, h: 40 };

const EDITOR_MOCK = [
  { key: 'm1', role: 'door_front',           label: 'Puerta frontal', v: 0 },
  { key: 'm2', role: 'door_rear',            label: 'Puerta trasera', v: 1 },
  { key: 'm3', role: 'pir',                  label: 'Movimiento',     v: 0 },
  { key: 'm4', role: 'door_battery_cabinet', label: 'Gabinete bat.',  v: 0 },
  { key: 'm5', role: 'fence',                label: 'Cerco',          v: 0 },
];

export default {
  name: 'SiteMap',
  props: {
    values:  { type: Object, default: () => ({}) },
    config:  { type: Object, default: () => ({}) },
    context: { type: String, default: 'live' },
  },
  computed: {
    editable() { return this.context === 'editor'; },
    shelterStyle() {
      return { left: SHELTER.x + '%', top: SHELTER.y + '%', width: SHELTER.w + '%', height: SHELTER.h + '%' };
    },
    points() {
      // Editor con fuentes cargadas → se previsualizan y editan LAS REALES;
      // editor sin fuentes → mock de muestra (no editable, no persiste).
      const hasSources = Array.isArray(this.config.sources) && this.config.sources.length > 0;
      const src = hasSources ? this.config.sources : (this.editable ? EDITOR_MOCK : []);
      let fallback = 0;
      return src
        .filter((s) => s && (s.key || s.variable))
        .map((s) => {
          const entry = (!hasSources && this.editable) ? { value: s.v } : this.values[s.key];
          const v = entry ? entry.value : undefined;
          let state = 'waiting';
          if (v !== undefined && v !== null) {
            const alert = v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
            state = alert ? 'alert' : 'ok';
          }
          const canonical = ROLE_POS[s.role] || { x: 8 + (fallback++ % 5) * 18, y: 90 };
          const pos = (s.pos && Number.isFinite(s.pos.x) && Number.isFinite(s.pos.y)) ? s.pos : canonical;
          const label = s.variableFullName || s.label || s.role || s.variable;
          return {
            key: s.key || s.variable,
            x: pos.x,
            y: pos.y,
            label,
            state,
            icon: ROLE_ICON[s.role] || 'fa-circle',
            tip: label + ' — ' + (state === 'alert' ? 'EVENTO' : state === 'ok' ? 'normal' : 'esperando dato'),
            source: hasSources ? s : null,
          };
        });
    },
  },
  methods: {
    // DEC-REF-113 F6 (#84) — edición visual: arrastrar el punto escribe
    // source.pos en % (mismo patrón de mutación del WidgetConfigForm: se
    // escribe sobre el config borrador y persiste al guardar el template).
    onPointDown(p, ev) {
      if (!this.editable || !p.source) return;
      ev.preventDefault();
      const plan = this.$refs.plan;
      if (!plan) return;
      const rect = plan.getBoundingClientRect();
      const move = (e) => {
        const x = Math.min(95, Math.max(3, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.min(90, Math.max(5, ((e.clientY - rect.top) / rect.height) * 100));
        this.$set(p.source, 'pos', { x: Math.round(x), y: Math.round(y) });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
  },
};
</script>

<style scoped>
.site-map { width: 100%; }
/* Plano responsive: alto proporcional al ancho de la celda (autoajuste). */
.site-map__plan {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  min-height: 170px;
  border-radius: 10px;
  overflow: hidden;
  background:
    linear-gradient(rgba(110, 118, 140, 0.10) 1px, transparent 1px),
    linear-gradient(90deg, rgba(110, 118, 140, 0.10) 1px, transparent 1px),
    radial-gradient(ellipse at 50% 40%, rgba(29, 140, 248, 0.08), transparent 70%);
  background-size: 10% 12.5%, 10% 12.5%, 100% 100%;
  border: 1px solid rgba(110, 118, 140, 0.25);
}
.site-map__plan--edit { cursor: grab; }
.site-map__fence {
  position: absolute;
  inset: 4%;
  border: 2px dashed #4a5160;
  border-radius: 8px;
  pointer-events: none;
}
.site-map__shelter {
  position: absolute;
  border: 2px solid #6b7280;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.white-content .site-map__shelter { background: rgba(0, 0, 0, 0.04); }
.site-map__shelter-label {
  color: #6b7280;
  font-size: 0.62em;
  text-transform: uppercase;
  letter-spacing: 2px;
}
.site-map__point {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 2;
  touch-action: none;
}
.site-map__point--drag { cursor: grab; }
.site-map__point--drag:active { cursor: grabbing; }
.site-map__chip {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85em;
  border: 2px solid currentColor;
  background: rgba(20, 22, 34, 0.85);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}
.white-content .site-map__chip { background: rgba(255, 255, 255, 0.92); }
.site-map__point-label {
  margin-top: 3px;
  font-size: 0.58em;
  line-height: 1;
  white-space: nowrap;
  color: #c7ccd4;
  background: rgba(20, 22, 34, 0.72);
  padding: 2px 6px;
  border-radius: 8px;
}
.white-content .site-map__point-label { color: #2b3553; background: rgba(255, 255, 255, 0.82); }
.site-map__point--ok      { color: #00bf9a; }
.site-map__point--alert   { color: #fd5d93; }
.site-map__point--waiting { color: #6b7280; }
.site-map__point--waiting .site-map__chip { border-style: dashed; }
/* Pulso del punto en evento (anillo expansivo sobre el chip) */
.site-map__point--alert .site-map__chip { animation: sm-pulse 1.4s ease-out infinite; }
@keyframes sm-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(253, 93, 147, 0.55); }
  100% { box-shadow: 0 0 0 14px rgba(253, 93, 147, 0); }
}
.site-map__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-style: italic;
  opacity: 0.8;
}
.site-map__legend {
  display: flex;
  gap: 14px;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  font-size: 0.68em;
  color: #6b7280;
  margin-top: 6px;
}
.site-map__edit-hint { color: #1d8cf8; }
.site-map__lg {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: 4px;
}
.site-map__lg--ok      { background: #00bf9a; }
.site-map__lg--alert   { background: #fd5d93; }
.site-map__lg--waiting { background: #6b7280; }
</style>
