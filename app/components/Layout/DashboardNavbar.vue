<template>
  <div>
    <base-nav
      v-model="showMenu"
      class="top-navbar"
      type="white"
      :transparent="true"
    >
    <div slot="brand" class="navbar-wrapper">
      <div
        class="navbar-toggle d-inline"
        :class="{ toggled: $sidebar.showSidebar }"
      >
        <button type="button" class="navbar-toggler" @click="toggleSidebar">
          <span class="navbar-toggler-bar bar1"></span>
          <span class="navbar-toggler-bar bar2"></span>
          <span class="navbar-toggler-bar bar3"></span>
        </button>
      </div>
      <a class="navbar-brand ml-xl-3 ml-5" href="#pablo">{{ routeName }}</a>
    </div>

    <ul class="navbar-nav" :class="$rtl.isRTL ? 'mr-auto' : 'ml-auto'">
      <!-- DEC-REF-70 (b/c) · #50 — el <el-select> de device salió
           de acá (único cliente era /dashboard-admin; se mudó
           adentro de esa página).
           DEC-REF-70 (g) · #50 refinamiento — el toggle sol/luna que
           había pasado al navbar se retira; el switch dark/light
           vuelve al SidebarSharePlugin junto con el selector de
           colores (un solo lugar de configuración de tema). -->

      <li class="nav-item d-flex align-items-center mr-2">
        <span class="mqtt-status-dot mr-2"
              :class="$store.state.mqttConnected ? 'mqtt-connected' : 'mqtt-disconnected'"></span>
        <!-- Pedido Franco #50 — leyenda al lado de la luz. Texto
             corto ("MQTT Conectado/Desconectado") en tono muted
             para no competir con el resto del navbar. -->
        <span class="mqtt-status-label"
              :class="$store.state.mqttConnected ? 'text-success' : 'text-danger'">
          mqtt {{ $store.state.mqttConnected ? 'conectado' : 'desconectado' }}
        </span>
      </li>

      <!-- FASE 3 rediseño alarmas — la campana ya no abre el dropdown
           legacy de notifications: muestra el conteo de activas sin ACK
           (color = peor severidad activa) y abre el Centro de
           Notificaciones (drawer). El store legacy `notifications` no
           se toca: puede seguir usándose en otras vistas. -->
      <li class="nav-item">
        <button
          type="button"
          class="nav-link alarm-bell-btn"
          aria-label="Abrir centro de notificaciones"
          @click="drawerOpen = true"
        >
          <i class="tim-icons icon-sound-wave"></i>
          <span
            v-if="bellCount > 0"
            class="alarm-bell-badge d-none d-lg-block d-xl-block"
            :class="'sev-badge-' + bellWorstSev"
          >{{ bellCount > 99 ? '99+' : bellCount }}</span>
          <p class="d-lg-none">Notificaciones</p>
        </button>
      </li>

      <base-dropdown
        tag="li"
        :menu-on-right="!$rtl.isRTL"
        title-tag="a"
        class="nav-item"
        title-classes="nav-link"
        menu-classes="dropdown-navbar"
      >
        <template slot="title">
          <div class="photo"><img src="/img/mike.jpg" /></div>
          <b class="caret d-none d-lg-block d-xl-block"></b>
          <p @click="logOut()" class="d-lg-none">Log out</p>
        </template>
        <li class="nav-link">
          <a href="#" class="nav-item dropdown-item">Profile</a>
        </li>
        <li class="nav-link">
          <a href="#" class="nav-item dropdown-item">Settings</a>
        </li>
        <div class="dropdown-divider"></div>
        <li class="nav-link">
          <a href="#" @click="logOut()" class="nav-item dropdown-item">Log out</a>
        </li>
      </base-dropdown>
    </ul>
  </base-nav>

  <notifications-drawer v-model="drawerOpen" />
  </div>
</template>
<script>
import { CollapseTransition } from "vue2-transitions";
import { BaseNav, Modal } from "@/components";
import NotificationsDrawer from "@/components/alarms/NotificationsDrawer.vue";

export default {
  components: {
    CollapseTransition,
    BaseNav,
    Modal,
    NotificationsDrawer
  },
  data() {
    return {
      activeNotifications: false,
      showMenu: false,
      searchModalVisible: false,
      searchQuery: "",
      // FASE 3 — drawer del Centro de Notificaciones + badge de la campana.
      drawerOpen: false,
      alarmSummary: null,
      _summaryTimer: null,
      _notifHandler: null,
      _notifRefreshTimer: null
    };
  },
  computed: {
    routeName() {
      const { path } = this.$route;
      let parts = path.split("/");
      if (parts == ",") {
        return "Dashboard";
      }
      return parts.map(p => this.capitalizeFirstLetter(p)).join(" ");
    },
    isRTL() {
      return this.$rtl.isRTL;
    },
    // Badge de la campana: activas sin ACK (GET /api/alarms/summary).
    bellCount() {
      return this.alarmSummary ? (this.alarmSummary.unacked || 0) : 0;
    },
    // Color del badge = peor severidad con activas (el summary no
    // segmenta unacked por severidad: es la cota superior del peor
    // severity sin ACK — criterio simple acordado).
    bellWorstSev() {
      const a = this.alarmSummary && this.alarmSummary.active;
      if (!a) return "info";
      if (a.critical > 0) return "critical";
      if (a.warning > 0) return "warning";
      return "info";
    }
  },
  mounted() {
    this.$store.dispatch("getDevices");
    this.fetchAlarmSummary();
    this._summaryTimer = setInterval(this.fetchAlarmSummary, 60000);
    // Real-time-lite: cada notif refresca el badge (debounce 1.2 s por
    // la race MQTT/Mongo — el notif llega antes que el doc).
    this._notifHandler = () => {
      if (this._notifRefreshTimer) clearTimeout(this._notifRefreshTimer);
      this._notifRefreshTimer = setTimeout(() => {
        this._notifRefreshTimer = null;
        this.fetchAlarmSummary();
      }, 1200);
    };
    this.$nuxt.$on("wanomi:notif", this._notifHandler);
  },
  beforeDestroy() {
    if (this._summaryTimer) { clearInterval(this._summaryTimer); this._summaryTimer = null; }
    if (this._notifHandler) {
      this.$nuxt.$off("wanomi:notif", this._notifHandler);
      this._notifHandler = null;
    }
    if (this._notifRefreshTimer) {
      clearTimeout(this._notifRefreshTimer);
      this._notifRefreshTimer = null;
    }
  },
  methods: {
    async fetchAlarmSummary() {
      try {
        const res = await this.$axios.get("/alarms/summary", {
          headers: { token: this.$store.state.auth.token }
        });
        if (res.data && res.data.status === "success") {
          this.alarmSummary = res.data.data;
        }
      } catch (e) {
        // Silent — la campana conserva el último conteo conocido.
      }
    },
    logOut() {
      console.log("logout");

      localStorage.clear();

      const auth = {};
      this.$store.commit("setAuth", auth);

      window.location.href = "/login";
    },
    capitalizeFirstLetter(string) {
      if (!string || typeof string !== "string") {
        return "";
      }
      return string.charAt(0).toUpperCase() + string.slice(1);
    },
    closeDropDown() {
      this.activeNotifications = false;
    },
    toggleSidebar() {
      // Desktop (≥992px): el hamburger colapsa el sidebar a modo mini (solo
      // íconos). Mobile: mantiene el comportamiento original (overlay).
      if (typeof window !== 'undefined' && window.innerWidth >= 992) {
        this.$sidebar.toggleMini();
      } else {
        this.$sidebar.displaySidebar(!this.$sidebar.showSidebar);
      }
    },
    toggleMenu() {
      this.showMenu = !this.showMenu;
    }
  }
};
</script>
<style scoped>
.top-navbar {
  top: 0px;
}
.alarm-bell-btn {
  position: relative;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
}
.alarm-bell-badge {
  position: absolute;
  top: 2px;
  right: 4px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  line-height: 17px;
  text-align: center;
}
.mqtt-status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.mqtt-connected {
  background-color: #00f2c3;
  box-shadow: 0 0 6px #00f2c3;
}
.mqtt-disconnected {
  background-color: #fd5d93;
  animation: blink 1.2s infinite;
}
.mqtt-status-label {
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.3px;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.2; }
}
</style>
