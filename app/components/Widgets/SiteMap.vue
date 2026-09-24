<template>
  <div class="site-map">
    <svg :viewBox="`0 0 ${W} ${H}`" class="site-map__svg" role="img">
      <!-- Perímetro (cerco) -->
      <rect :x="14" :y="14" :width="W - 28" :height="H - 28" class="site-map__fence" rx="6" />
      <!-- Shelter -->
      <rect :x="S.x" :y="S.y" :width="S.w" :height="S.h" class="site-map__shelter" rx="4" />
      <text :x="S.x + S.w / 2" :y="S.y + S.h / 2" class="site-map__shelter-label" text-anchor="middle">shelter</text>

      <!-- Puntos de sensores -->
      <g v-for="p in points" :key="p.key">
        <circle v-if="p.state === 'alert'" :cx="p.x" :cy="p.y" r="12" class="site-map__pulse" />
        <circle :cx="p.x" :cy="p.y" r="7" class="site-map__dot" :class="'site-map__dot--' + p.state" />
        <text :x="p.x" :y="p.y + 20" class="site-map__label" text-anchor="middle">{{ p.label }}</text>
      </g>
    </svg>
    <div v-if="!points.length" class="site-map__empty">sin puntos configurados</div>
    <div class="site-map__legend">
      <span><i class="site-map__lg site-map__lg--ok"></i> normal</span>
      <span><i class="site-map__lg site-map__lg--alert"></i> evento</span>
      <span><i class="site-map__lg site-map__lg--waiting"></i> esperando</span>
    </div>
  </div>
</template>

<script>
// DEC-REF-108 F5 (#80) — siteMap: plano 2D fijo del sitio (shelter + cerco)
// con un punto por fuente configurada (sources del widget, con role).
// Multi-fuente vía MultiLiveValue (mismo andamiaje que powerCascade/dcPlant).
//
// Convención de estados (producto): 1/true/'on' = EVENTO (puerta abierta,
// movimiento, vibración de cerco) → rojo pulsante; 0 = normal → verde;
// sin dato = esperando (gris). La posición del punto la fija el ROLE
// (mapa canónico del shelter — no es por sitio, es la geometría del tipo
// de instalación; roles desconocidos caen en grilla de fallback).
const W = 400, H = 260;
const SHELTER = { x: 120, y: 75, w: 160, h: 120 };

const ROLE_POS = {
  door_front:           { x: 200, y: 195 },  // puerta frontal (pared inferior)
  door_rear:            { x: 200, y: 75 },   // puerta trasera (pared superior)
  door_shelter:         { x: 120, y: 135 },  // puerta lateral del shelter
  door_battery_cabinet: { x: 280, y: 135 },  // gabinete de baterías (pared opuesta)
  pir:                  { x: 200, y: 135 },  // PIR interior
  fence:                { x: 40,  y: 40 },   // vibración de cerco (esquina)
};

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
  data() { return { W, H, S: SHELTER }; },
  computed: {
    points() {
      const src = this.context === 'editor' ? EDITOR_MOCK : (this.config.sources || []);
      let fallback = 0;
      return src
        .filter(s => s && (s.key || s.variable))
        .map((s) => {
          const entry = this.context === 'editor' ? { value: s.v } : this.values[s.key];
          const v = entry ? entry.value : undefined;
          let state = 'waiting';
          if (v !== undefined && v !== null) {
            const alert = v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
            state = alert ? 'alert' : 'ok';
          }
          const pos = ROLE_POS[s.role] || { x: 60 + (fallback++ % 6) * 55, y: 228 };
          return {
            key: s.key || s.variable,
            x: pos.x,
            y: pos.y,
            label: s.variableFullName || s.label || s.role || s.variable,
            state,
          };
        });
    },
  },
};
</script>

<style scoped>
.site-map { width: 100%; }
.site-map__svg { width: 100%; height: auto; display: block; }
.site-map__fence {
  fill: none;
  stroke: #4a5160;
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
}
.site-map__shelter {
  fill: rgba(255, 255, 255, 0.05);
  stroke: #6b7280;
  stroke-width: 2;
}
.white-content .site-map__shelter { fill: rgba(0, 0, 0, 0.04); }
.site-map__shelter-label { fill: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
.site-map__label { fill: #9aa0b4; font-size: 10.5px; }
.white-content .site-map__label { fill: #525f7f; }
.site-map__dot { stroke: rgba(0, 0, 0, 0.35); stroke-width: 1; }
.site-map__dot--ok      { fill: #00bf9a; }
.site-map__dot--alert   { fill: #fd5d93; }
.site-map__dot--waiting { fill: #6b7280; }
/* Pulso del punto en evento (anillo expansivo) */
.site-map__pulse {
  fill: none;
  stroke: #fd5d93;
  stroke-width: 2;
  opacity: 0.8;
  transform-origin: center;
  animation: sm-pulse 1.4s ease-out infinite;
}
@keyframes sm-pulse {
  0%   { opacity: 0.8; }
  100% { opacity: 0; }
}
.site-map__empty { color: #6b7280; font-style: italic; opacity: 0.7; text-align: center; padding: 12px 0; }
.site-map__legend {
  display: flex; gap: 14px; justify-content: center;
  font-size: 0.72em; color: #6b7280; margin-top: 2px;
}
.site-map__lg {
  display: inline-block; width: 9px; height: 9px; border-radius: 50%;
  margin-right: 4px; vertical-align: baseline;
}
.site-map__lg--ok      { background: #00bf9a; }
.site-map__lg--alert   { background: #fd5d93; }
.site-map__lg--waiting { background: #6b7280; }
</style>
