<template>
  <card>
    <template slot="header">
      <h5 class="card-category">{{ label }}</h5>
    </template>
    <div class="widget-shell__body">
      <slot />
    </div>
  </card>
</template>

<script>
// DEC-REF-76-A (iii) — CÁSCARA reutilizable por los 12 widgets del catálogo.
// Provee <card> genérico de la plataforma + encabezado con el nombre del
// widget. NO va dentro del widget puro (evitaría doble card en site page,
// donde _siteCode ya la pone, y en los 4 legacy que se auto-encascaran).
// La composición shell + widget la aplica el componente por-tipo (p.ej.
// ValueStatusLive.vue), no el widget puro (ValueStatus.vue).
export default {
  name: 'WidgetShell',
  props: {
    config: { type: Object, required: true },
  },
  computed: {
    label() {
      return this.config.variableFullName || this.config.variable || '';
    },
  },
};
</script>

<style scoped>
.widget-shell__body {
  font-size: 1.5em;
  padding: 0.25em 0;
}
</style>
