<template>
  <span class="age-ticker">{{ prefix }}{{ formatted }}</span>
</template>

<script>
import { ticker, acquireTicker, releaseTicker, formatAgeHHMMSS } from '@/utils/ticker';

// Edad fluida de una alarma ("activa hace HH:MM:SS"), actualizada cada
// segundo por el ticker global compartido (UN intervalo para toda la app).
export default {
  name: 'AgeTicker',
  props: {
    since:  { type: Number, required: true },
    prefix: { type: String, default: '' },
  },
  computed: {
    formatted() {
      return formatAgeHHMMSS(this.since, ticker.now);
    },
  },
  created() {
    acquireTicker();
  },
  beforeDestroy() {
    releaseTicker();
  },
};
</script>

<style scoped>
.age-ticker {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
