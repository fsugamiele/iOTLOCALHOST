<template>
  <!-- DEC-REF-141 · Semáforo del Supervisor de Calidad (mockup 1:1): 4 tiles con
       score + sparkline SVG a mano. Los datos vienen de GET /api/qa/overview
       (prop `overview`); este componente NO hace fetch ni calcula nada del
       motor: solo presenta lo que la API 140 ya derivó. -->
  <div class="qa-tiles">
    <div
      v-for="(t, i) in tiles"
      :key="i"
      class="qa-tile"
      :class="t.level"
    >
      <div class="qa-tile__lab">{{ t.label }}</div>
      <div class="qa-tile__val">{{ t.display }}</div>
      <div class="qa-tile__tgt">{{ t.target }}</div>
      <!-- Sparkline: polyline SVG construida desde la serie real (si la hay).
           Sin serie → línea plana al valor, para no inventar tendencia. -->
      <svg class="qa-spark" viewBox="0 0 120 22" preserveAspectRatio="none">
        <polyline
          fill="none"
          :stroke="t.stroke"
          stroke-width="2"
          :points="sparkPoints(t.spark)"
        />
      </svg>
    </div>
  </div>
</template>

<script>
export default {
  name: 'QaSemaforo',
  props: {
    // overview = data de GET /api/qa/overview (crossClosePct, firesPerDay,
    // flappingRules, deadRules, permanentRules, openFindingsByType, ...).
    overview: { type: Object, default: null },
  },
  computed: {
    tiles() {
      const o = this.overview || {};
      const crit = 'var(--qa-crit)';
      const warn = 'var(--qa-warn)';
      const ok = 'var(--qa-ok)';

      // Nivel visual por tile: refleja la gravedad del número contra su objetivo.
      const lvlCross = (o.crossClosePct || 0) > 0 ? 'bad' : 'ok';
      const lvlFires = (o.firesPerDay || 0) >= 5 ? 'bad' : ((o.firesPerDay || 0) > 1 ? 'warn' : 'ok');
      const lvlFlap = (o.flappingRules || 0) > 0 ? 'warn' : 'ok';
      const lvlDead = (o.deadRules || 0) > 0 ? 'bad' : 'ok';

      return [
        {
          label: 'Alarmas cerradas con el equipo equivocado',
          display: `${o.crossClosePct != null ? o.crossClosePct : 0}%`,
          target: 'objetivo: 0%',
          level: lvlCross,
          stroke: lvlCross === 'bad' ? crit : ok,
          spark: null,
        },
        {
          label: 'Alarmas por día',
          display: o.firesPerDay != null ? String(o.firesPerDay) : '0',
          target: 'objetivo: < 5',
          level: lvlFires,
          stroke: lvlFires === 'bad' ? crit : (lvlFires === 'warn' ? warn : ok),
          spark: null,
        },
        {
          label: 'Reglas que parpadean',
          display: o.flappingRules != null ? String(o.flappingRules) : '0',
          target: 'objetivo: 0',
          level: lvlFlap,
          stroke: lvlFlap === 'warn' ? warn : ok,
          spark: null,
        },
        {
          label: 'Reglas que nunca pueden dispararse',
          display: o.deadRules != null ? String(o.deadRules) : '0',
          target: 'objetivo: 0',
          level: lvlDead,
          stroke: lvlDead === 'bad' ? crit : ok,
          spark: null,
        },
      ];
    },
  },
  methods: {
    // Construye los `points` de la sparkline desde una serie numérica real.
    // Sin serie (la API 140 no expone histórico del semáforo) → línea plana
    // horizontal: honesta, no simula una tendencia que no tenemos.
    sparkPoints(serie) {
      const W = 120, H = 22, pad = 3;
      if (!Array.isArray(serie) || serie.length < 2) {
        const y = H / 2;
        return `0,${y} ${W},${y}`;
      }
      const min = Math.min(...serie);
      const max = Math.max(...serie);
      const span = max - min || 1;
      const step = W / (serie.length - 1);
      return serie
        .map((v, i) => {
          const x = +(i * step).toFixed(1);
          const y = +(H - pad - ((v - min) / span) * (H - 2 * pad)).toFixed(1);
          return `${x},${y}`;
        })
        .join(' ');
    },
  },
};
</script>

<style scoped>
/* DEC-REF-141 — tiles del semáforo. Tema Wanomi teal; variables de color
   locales que se re-mapean en modo claro/oscuro (espejo del mockup, pero
   consistente con la app, no copiando su CSS literal). */
.qa-tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 22px;
}
.qa-tile {
  --qa-crit: #ec250d;
  --qa-warn: #ff9f43;
  --qa-ok: #00bf9a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 14px 15px;
  background: rgba(255, 255, 255, 0.03);
}
.qa-tile__lab {
  font-size: 12.5px;
  opacity: 0.75;
}
.qa-tile__val {
  font-weight: 700;
  font-size: 30px;
  line-height: 1;
  margin: 6px 0 2px;
}
.qa-tile__tgt {
  font-size: 12px;
  opacity: 0.6;
}
.qa-tile.bad {
  border-color: rgba(236, 37, 13, 0.45);
}
.qa-tile.bad .qa-tile__val {
  color: var(--qa-crit);
}
.qa-tile.warn .qa-tile__val {
  color: var(--qa-warn);
}
.qa-tile.ok .qa-tile__val {
  color: var(--qa-ok);
}
.qa-spark {
  height: 22px;
  width: 100%;
  margin-top: 8px;
}

/* Modo claro (body.white-content, DEC-REF-112) */
.white-content .qa-tile {
  background: #fff;
  border-color: rgba(0, 0, 0, 0.09);
}
.white-content .qa-tile__lab,
.white-content .qa-tile__tgt {
  color: #55706b;
  opacity: 1;
}

@media (max-width: 900px) {
  .qa-tiles { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 620px) {
  .qa-tiles { grid-template-columns: 1fr; }
}
</style>
