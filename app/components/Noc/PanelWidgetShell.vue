<template>
  <!-- DEC-REF-101 D-9 (#76) — cáscara de cada tarjeta del Panel:
       barra con título (editable) + menú de configuración arriba a la
       derecha (intervalo de refresco, ventana del gráfico, renombrar). -->
  <div class="panel-widget" :class="{ 'panel-widget--customizing': customizing }">
    <div class="panel-widget-header" :class="{ 'drag-handle': customizing }">
      <span class="panel-widget-title">{{ title }}</span>
      <el-dropdown
        trigger="click"
        size="mini"
        placement="bottom-end"
        @command="onCommand"
      >
        <button type="button" class="panel-widget-menu-btn" title="Configurar tarjeta">
          <i class="tim-icons icon-settings-gear-63"></i>
        </button>
        <el-dropdown-menu slot="dropdown">
          <el-dropdown-item command="rename">
            <i class="tim-icons icon-pencil"></i> Renombrar
          </el-dropdown-item>
          <el-dropdown-item v-if="siteCode" command="goto-site">
            <i class="tim-icons icon-pin"></i> Ir al sitio
          </el-dropdown-item>
          <template v-if="showRefresh">
            <el-dropdown-item divided disabled class="pw-label">Actualizar cada</el-dropdown-item>
            <el-dropdown-item
              v-for="opt in refreshOptions"
              :key="'r' + opt.value"
              :command="'refresh:' + opt.value"
            >
              <i v-if="opt.value === refreshSec" class="tim-icons icon-check-2"></i>
              {{ opt.label }}
            </el-dropdown-item>
          </template>
          <template v-if="showWindow">
            <el-dropdown-item divided disabled class="pw-label">Ventana del gráfico</el-dropdown-item>
            <el-dropdown-item
              v-for="opt in windowOptions"
              :key="'w' + opt.value"
              :command="'window:' + opt.value"
            >
              <i v-if="opt.value === window" class="tim-icons icon-check-2"></i>
              {{ opt.label }}
            </el-dropdown-item>
          </template>
          <el-dropdown-item v-if="removable" divided command="remove" class="pw-danger">
            <i class="tim-icons icon-simple-remove"></i> Quitar del Panel
          </el-dropdown-item>
        </el-dropdown-menu>
      </el-dropdown>
    </div>
    <div class="panel-widget-body">
      <slot />
    </div>
  </div>
</template>

<script>
import { Dropdown, DropdownMenu, DropdownItem } from 'element-ui';

export default {
  name: 'PanelWidgetShell',
  components: {
    [Dropdown.name]: Dropdown,
    [DropdownMenu.name]: DropdownMenu,
    [DropdownItem.name]: DropdownItem,
  },
  props: {
    title:       { type: String, required: true },
    customizing: { type: Boolean, default: false },
    refreshSec:  { type: Number, default: 60 },
    showWindow:  { type: Boolean, default: false },
    window:      { type: String, default: '24h' },
    // Panel personalizable: showRefresh=false en tarjetas pineadas (viven del
    // bus MQTT, no de polling); siteCode habilita "Ir al sitio"; removable
    // habilita "Quitar del Panel".
    showRefresh: { type: Boolean, default: true },
    siteCode:    { type: String, default: null },
    removable:   { type: Boolean, default: false },
  },
  data() {
    return {
      refreshOptions: [
        { value: 10,  label: '10 segundos' },
        { value: 30,  label: '30 segundos' },
        { value: 60,  label: '1 minuto' },
        { value: 300, label: '5 minutos' },
      ],
      windowOptions: [
        { value: '24h', label: 'Últimas 24 horas' },
        { value: '7d',  label: 'Últimos 7 días' },
        { value: '30d', label: 'Últimos 30 días' },
      ],
    };
  },
  methods: {
    onCommand(cmd) {
      if (cmd === 'rename')    return this.$emit('rename');
      if (cmd === 'goto-site') return this.$emit('goto-site');
      if (cmd === 'remove')    return this.$emit('remove');
      const [kind, value] = cmd.split(':');
      if (kind === 'refresh') return this.$emit('set-refresh', Number(value));
      if (kind === 'window')  return this.$emit('set-window', value);
    },
  },
};
</script>

<style scoped>
.panel-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #27293d;
  border-radius: 6px;
  overflow: hidden;
}
.panel-widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  min-height: 34px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex: 0 0 auto;
}
.panel-widget--customizing .panel-widget-header.drag-handle {
  cursor: move;
  background: rgba(255, 255, 255, 0.04);
}
.panel-widget-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.panel-widget-menu-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  padding: 2px 4px;
  font-size: 14px;
  line-height: 1;
}
.panel-widget-menu-btn:hover { color: #fff; }
.panel-widget-body {
  flex: 1 1 auto;
  overflow: auto;
  padding: 8px;
}
/* tema claro */
.white-content .panel-widget { background: #fff; box-shadow: 0 1px 15px 0 rgba(123,123,123,0.05); }
.white-content .panel-widget-header { border-bottom-color: rgba(0, 0, 0, 0.08); }
.white-content .panel-widget-title { color: rgba(0, 0, 0, 0.7); }
.white-content .panel-widget-menu-btn { color: rgba(0, 0, 0, 0.45); }
.white-content .panel-widget-menu-btn:hover { color: #000; }
.pw-danger { color: #fd5d93 !important; }
</style>
