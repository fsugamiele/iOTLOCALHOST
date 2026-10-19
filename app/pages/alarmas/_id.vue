<template>
  <!-- spec_detalle_alarma_v2 — detalle de alarma: qué pasa · por qué · cómo se soluciona · contexto.
       El detalle anterior queda como respaldo en ?vista=anterior. -->
  <div>
    <alarm-detail-v1 v-if="anterior" />
    <alarm-detail-v2 v-else />
    <p class="text-right small mt-2 mb-0">
      <nuxt-link v-if="!anterior" :to="{ query: { vista: 'anterior' } }" class="text-muted">Ver el detalle anterior</nuxt-link>
      <nuxt-link v-else :to="{ query: {} }" class="text-muted">Ver el detalle nuevo</nuxt-link>
    </p>
  </div>
</template>

<script>
import AlarmDetailV1 from '@/components/alarms/AlarmDetailV1.vue';
import AlarmDetailV2 from '@/components/alarms/AlarmDetailV2.vue';

export default {
  name: 'AlarmaDetalle',
  middleware: 'authenticated',
  components: { AlarmDetailV1, AlarmDetailV2 },
  // keep-alive: solo se mira la ruta cuando es la de ESTA alarma (en segundo plano no cambia nada).
  data() { return { miPath: this.$route.path, anterior: this.$route.query.vista === 'anterior' }; },
  watch: { $route(to) { if (to.path === this.miPath) this.anterior = to.query.vista === 'anterior'; } },
};
</script>
