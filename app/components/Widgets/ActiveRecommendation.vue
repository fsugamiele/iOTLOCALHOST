<template>
  <div class="active-rec">
    <template v-if="context === 'editor'">
      <div class="active-rec__box active-rec--warning">
        <div class="active-rec__head">
          <i class="fa fa-lightbulb"></i> Acción recomendada
          <span class="active-rec__badge">warning</span>
        </div>
        <div class="active-rec__text">Enviar camión de gasoil al sitio (autonomía &lt; 6 h)</div>
        <div class="active-rec__meta">Autonomía proyectada · hace 8 min</div>
      </div>
    </template>
    <template v-else-if="!siteContext">
      <span class="active-rec__nodata">sin contexto de sitio</span>
    </template>
    <template v-else-if="!rec">
      <span class="active-rec__ok"><i class="tim-icons icon-check-2"></i> Sin acción pendiente</span>
    </template>
    <template v-else>
      <div class="active-rec__box" :class="'active-rec--' + (rec.severity || 'info')">
        <div class="active-rec__head">
          <i class="fa fa-lightbulb"></i> Acción recomendada
          <span class="active-rec__badge">{{ rec.severity || 'info' }}</span>
        </div>
        <div class="active-rec__text">{{ rec.recommendation }}</div>
        <div class="active-rec__meta">
          {{ rec.label || rec.variableFullName || rec.variable }} · hace {{ ageLabel(rec.time) }}
        </div>
      </div>
    </template>
  </div>
</template>

<script>
// DEC-REF-107 (Paso 5) — activeRecommendation, presentación PURA.
// Muestra LA acción recomendada de la alarma activa más severa del equipo. La
// recomendación ya viaja en el feed de alarmas del sitio (ruleEngine.js emite
// `recommendation` por regla — DEC-REF-100 D-4). ActiveRecommendationLive elige
// la top (severidad, luego recencia) entre las activas con recomendación.
export default {
  name: 'ActiveRecommendation',
  props: {
    recommendation: { type: Object, default: null },
    siteContext:    { type: Boolean, default: true },
    context:        { type: String, default: 'live' },
  },
  computed: {
    rec() { return this.recommendation; },
  },
  methods: {
    ageLabel(t) {
      if (!Number.isFinite(t)) return '—';
      const s = Math.max(0, Math.round((Date.now() - t) / 1000));
      if (s < 60) return s + ' s';
      const m = Math.floor(s / 60);
      if (m < 60) return m + ' min';
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return mm ? `${h} h ${mm} min` : `${h} h`;
    },
  },
};
</script>

<style scoped>
.active-rec { width: 100%; }
.active-rec__box {
  border-left: 4px solid #1d8cf8;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  padding: 10px 12px;
}
.active-rec__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75em;
  color: #9aa5b1;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.active-rec__badge {
  margin-left: auto;
  font-size: 0.85em;
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
}
.active-rec__text {
  margin-top: 6px;
  font-size: 1.05em;
  font-weight: 600;
  color: #fff;
  line-height: 1.3;
}
.active-rec__meta { margin-top: 6px; font-size: 0.75em; color: #6b7280; }

.active-rec--critical { border-left-color: #fd5d93; }
.active-rec--critical .active-rec__badge { background: rgba(253, 93, 147, 0.25); color: #fd5d93; }
.active-rec--warning  { border-left-color: #ff8d72; }
.active-rec--warning .active-rec__badge { background: rgba(255, 141, 114, 0.25); color: #ff8d72; }
.active-rec--info     { border-left-color: #1d8cf8; }

.active-rec__ok { color: #00bf9a; }
.active-rec__nodata { color: #6b7280; font-style: italic; opacity: 0.7; }
</style>
