<template>
  <!-- Tabs de ventanas abiertas: cada página visitada queda como tab con
       título + botón ✕. Click navega; ✕ cierra (si era la activa, vuelve a
       la última abierta). Persisten en localStorage por usuario. -->
  <div v-if="tabs.length" class="wintabs">
    <div
      v-for="(t, idx) in tabs"
      :key="t.path"
      class="wintab"
      :class="{ 'wintab--active': t.path === $route.path }"
      draggable="true"
      :title="t.title"
      @click="go(t)"
      @dragstart="onDragStart(idx)"
      @dragover.prevent="onDragOver(idx)"
      @drop.prevent
      @dragend="onDragEnd"
    >
      <i class="wintab__ico" :class="t.icon"></i>
      <span class="wintab__title">{{ t.title }}</span>
      <button type="button" class="wintab__x" title="Cerrar" @click.stop="close(t)">
        <i class="tim-icons icon-simple-remove"></i>
      </button>
    </div>
  </div>
</template>

<script>
// Título/ícono de cada ruta — espejo de los sidebar-item del layout default.
const ROUTE_TABS = [
  { match: /^\/dashboard$/,        icon: 'tim-icons icon-laptop',        title: () => 'Panel' },
  { match: /^\/dashboard-admin/,   icon: 'tim-icons icon-laptop',        title: () => 'Panel Admin' },
  { match: /^\/sites$/,            icon: 'tim-icons icon-pin',           title: () => 'Sitios' },
  { match: /^\/sites\/([^/]+)$/,   icon: 'tim-icons icon-pin',           title: (m) => 'Sitio ' + m[1] },
  { match: /^\/history/,           icon: 'tim-icons icon-chart-bar-32',  title: () => 'Histórico' },
  { match: /^\/devices/,           icon: 'tim-icons icon-light-3',       title: () => 'Devices' },
  { match: /^\/templates/,         icon: 'tim-icons icon-atom',          title: () => 'Templates' },
  { match: /^\/fichas/,            icon: 'tim-icons icon-paper',         title: () => 'Fichas de equipo' },
  { match: /^\/rulepacks$/,        icon: 'tim-icons icon-book-bookmark', title: () => 'Reglas de monitoreo' },
  { match: /^\/rulepacks\/([^/]+)$/, icon: 'tim-icons icon-book-bookmark', title: (m) => 'Regla ' + m[1] },
  { match: /^\/admin/,             icon: 'tim-icons icon-badge',         title: () => 'Administración' },
  { match: /^\/demo\/simulator/,   icon: 'tim-icons icon-settings',      title: () => 'Simulador' },
];

const MAX_TABS = 10;

export default {
  name: 'WindowTabs',
  data() {
    return { tabs: [] };
  },
  computed: {
    storageKey() {
      const u = this.$store.state.auth && this.$store.state.auth.userData;
      return 'wanomi:winTabs:' + ((u && u._id) || 'anon');
    },
  },
  watch: {
    '$route.path'() {
      this.addCurrent();
    },
    tabs: {
      deep: true,
      handler(v) {
        try { localStorage.setItem(this.storageKey, JSON.stringify(v)); } catch (e) { /* sin storage */ }
      },
    },
  },
  mounted() {
    this.restore();
    this.addCurrent();
  },
  methods: {
    tabFor(path) {
      for (const r of ROUTE_TABS) {
        const m = path.match(r.match);
        if (m) return { path, icon: r.icon, title: r.title(m) };
      }
      const last = path.split('/').filter(Boolean).pop() || 'panel';
      return { path, icon: 'tim-icons icon-app', title: last.charAt(0).toUpperCase() + last.slice(1) };
    },
    addCurrent() {
      const path = this.$route.path;
      if (this.tabs.some(t => t.path === path)) return;
      this.tabs.push(this.tabFor(path));
      // Cap: se descarta la tab más vieja que no sea la activa.
      while (this.tabs.length > MAX_TABS) {
        const idx = this.tabs.findIndex(t => t.path !== path);
        if (idx === -1) { this.tabs.shift(); } else { this.tabs.splice(idx, 1); }
      }
    },
    go(t) {
      if (t.path !== this.$route.path) this.$router.push(t.path).catch(() => {});
    },
    close(t) {
      const wasActive = t.path === this.$route.path;
      this.tabs = this.tabs.filter(x => x.path !== t.path);
      if (wasActive) {
        const last = this.tabs[this.tabs.length - 1];
        this.$router.push(last ? last.path : '/dashboard').catch(() => {});
      }
    },
    restore() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        const arr = raw ? JSON.parse(raw) : [];
        if (Array.isArray(arr)) {
          this.tabs = arr.filter(t => t && typeof t.path === 'string' && t.title).slice(0, MAX_TABS);
        }
      } catch (e) { /* JSON roto → arranca vacío */ }
    },
    // Reorden drag & drop: se arrastra una tab sobre otra y se reubica en
    // vivo (el orden persiste via watcher de `tabs` → localStorage).
    onDragStart(idx) {
      this._dragIdx = idx;
    },
    onDragOver(idx) {
      if (this._dragIdx === null || this._dragIdx === undefined || this._dragIdx === idx) return;
      const moved = this.tabs.splice(this._dragIdx, 1)[0];
      this.tabs.splice(idx, 0, moved);
      this._dragIdx = idx;
    },
    onDragEnd() {
      this._dragIdx = null;
    },
  },
};
</script>

<style scoped>
.wintabs {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 4px 30px 0;
  overflow-x: auto;
}
/* La tira arranca alineada con el contenido (a la derecha del sidebar);
   sigue al sidebar cuando se colapsa a modo mini. */
@media (min-width: 992px) {
  .wintabs { padding-left: 280px; }
  .wrapper.sidebar-mini .wintabs { padding-left: 110px; }
}
.wintab {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  padding: 6px 12px;
  font-size: 0.78rem;
  color: #9aa5b1;
  cursor: grab;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.03);
  transition: background 0.15s;
  user-select: none;
}
.wintab:hover { color: #fff; }
.wintab--active {
  color: #fff;
  font-weight: 600;
  box-shadow: inset 0 2px 0 #00bf9a;
  background: rgba(0, 191, 154, 0.08);
}
.wintab__ico { font-size: 0.85rem; }
.wintab__x {
  border: none;
  background: none;
  color: inherit;
  opacity: 0.55;
  cursor: pointer;
  font-size: 0.62rem;
  line-height: 1;
  padding: 3px 4px;
  border-radius: 6px;
}
.wintab__x:hover { opacity: 1; color: #fd5d93; background: rgba(253, 93, 147, 0.15); }

/* Tema claro */
body.white-content .wintab {
  background: #eef0f6;
  border-color: #e9ecef;
  color: #8898aa;
}
body.white-content .wintab:hover { color: #2b3553; background: #f8f9fc; }
body.white-content .wintab--active {
  background: #f5f6fa;
  color: #32325d;
  box-shadow: inset 0 2px 0 #00bf9a;
}
</style>
