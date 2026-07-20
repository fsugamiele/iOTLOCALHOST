<template>
  <footer class="footer">
    <div class="container-fluid text-center">
      <span class="text-muted small">Wanomi · v{{ version }}</span>
    </div>
  </footer>
</template>
<script>
// DEC-REF-70 (e) · #50 — footer mínimo. Se lee la versión de
// package.json en build (no hardcodear).
import pkg from '../../package.json';

export default {
  data() {
    return {
      version: pkg.version
    };
  }
};
</script>
