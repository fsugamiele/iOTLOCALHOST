<template>
  <base-nav
    v-model="showMenu"
    class="navbar-absolute top-navbar"
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
      <!-- DEC-REF-70 (b/c) · #50 — el <el-select> de device del navbar
           salió de acá (único cliente era /dashboard-admin; se mudó
           adentro de esa página). -->

      <li class="nav-item d-flex align-items-center mr-2">
        <el-tooltip :content="$store.state.mqttConnected ? 'MQTT Connected' : 'MQTT Disconnected'" placement="bottom">
          <span class="mqtt-status-dot" :class="$store.state.mqttConnected ? 'mqtt-connected' : 'mqtt-disconnected'"></span>
        </el-tooltip>
      </li>

      <!-- DEC-REF-70 (g) · #50 — toggle sol/luna migrado desde el
           SidebarSharePlugin. Mismo mecanismo body.white-content →
           el observer en pages/dashboard.vue lo detecta y baja
           `isLight` como prop a los 4 componentes Noc*. -->
      <li class="nav-item d-flex align-items-center mr-2">
        <el-tooltip :content="isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'" placement="bottom">
          <a href="#" class="nav-link theme-toggle" @click.prevent="toggleTheme">
            <i :class="isLight ? 'tim-icons icon-moon-stars' : 'tim-icons icon-sun'"></i>
          </a>
        </el-tooltip>
      </li>

      <base-dropdown
        tag="li"
        :menu-on-right="!$rtl.isRTL"
        title-tag="a"
        title-classes="nav-link"
        class="nav-item"
      >
        <template slot="title">
          <div
            v-if="$store.state.notifications.length > 0"
            class="notification d-none d-lg-block d-xl-block"
          ></div>
          <i class="tim-icons icon-sound-wave"></i>
          <p class="d-lg-none">New Notifications</p>
        </template>

        <li
          @click="notificationReaded(notification._id)"
          v-for="notification in $store.state.notifications" :key="notification"
          class="nav-link"
        >
          <a href="#" class="nav-item dropdown-item">
            <b style="color:orangered">{{ unixToDate(notification.time) }}</b>
            <div style="margin-left:50px">
              <b>Device: </b> {{ notification.deviceName }} <br />
              <b>Variable: </b> {{ notification.variableFullName }} <br />
              <b>Condition: </b> {{ notification.condition }} <br />
              <b>Limit: </b> {{ notification.value }} <br />
              <b>Value: </b> {{ notification.payload.value }}
            </div>
          </a>
        </li>
      </base-dropdown>

      <base-dropdown
        tag="li"
        :menu-on-right="!$rtl.isRTL"
        title-tag="a"
        class="nav-item"
        title-classes="nav-link"
        menu-classes="dropdown-navbar"
      >
        <template slot="title">
          <div class="photo"><img src="img/mike.jpg" /></div>
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
</template>
<script>
import { CollapseTransition } from "vue2-transitions";
import { BaseNav, Modal } from "@/components";

export default {
  components: {
    CollapseTransition,
    BaseNav,
    Modal
  },
  data() {
    return {
      activeNotifications: false,
      showMenu: false,
      searchModalVisible: false,
      searchQuery: "",
      // DEC-REF-70 (g) · #50 — el navbar dueño del estado del toggle
      // sol/luna. El observer en pages/dashboard.vue sigue detectando
      // el cambio en body.white-content (no depende de saber que somos
      // nosotros quienes toggleamos).
      isLight: false,
      _themeObserver: null,
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
    }
  },
  mounted() {
    this.$store.dispatch("getDevices");
    // DEC-REF-70 (g) · #50 — sync inicial + observer para que el ícono
    // (sol/luna) refleje el estado actual del body, aunque el toggle
    // haya sido activado desde otro lado (compatibilidad con el
    // SidebarSharePlugin durante la migración; futuro-a-prueba).
    if (typeof document !== 'undefined') {
      this.isLight = document.body.classList.contains('white-content');
      this._themeObserver = new MutationObserver(() => {
        this.isLight = document.body.classList.contains('white-content');
      });
      this._themeObserver.observe(document.body, {
        attributes: true, attributeFilter: ['class'],
      });
    }
  },
  beforeDestroy() {
    if (this._themeObserver) {
      this._themeObserver.disconnect();
      this._themeObserver = null;
    }
  },
  methods: {
    // DEC-REF-70 (g) · #50 — toggle sol/luna. Mismo mecanismo que el
    // BaseSwitch del SidebarSharePlugin removido: body.white-content
    // + observer en el Panel que baja isLight como prop.
    toggleTheme() {
      const docClasses = document.body.classList;
      if (docClasses.contains('white-content')) {
        docClasses.remove('white-content');
      } else {
        docClasses.add('white-content');
      }
    },
    notificationReaded(notifId) {
      const axiosHeaders = {
        headers: {
          token: this.$store.state.auth.token
        }
      };

      const toSend = {
        notifId: notifId
      };

      this.$axios
        .put("/notifications", toSend, axiosHeaders)
        .then(res => {
          this.$store.dispatch("getNotifications");
        })
        .catch(e => {
          console.log(e);
          return;
        });
    },
    logOut() {
      console.log("logout");

      localStorage.clear();

      const auth = {};
      this.$store.commit("setAuth", auth);

      window.location.href = "/login";
    },
    //UNIX A FECHA
    unixToDate(ms) {
      var d = new Date(parseInt(ms)),
        yyyy = d.getFullYear(),
        mm = ("0" + (d.getMonth() + 1)).slice(-2), // Months are zero based. Add leading 0.
        dd = ("0" + d.getDate()).slice(-2), // Add leading 0.
        hh = d.getHours(),
        h = hh,
        min = ("0" + d.getMinutes()).slice(-2), // Add leading 0.
        ampm = "AM",
        time;

      if (hh > 12) {
        h = hh - 12;
        ampm = "PM";
      } else if (hh === 12) {
        h = 12;
        ampm = "PM";
      } else if (hh == 0) {
        h = 12;
      }

      // ie: 2013-02-18, 8:35 AM
      time = dd + "/" + mm + "/" + yyyy + ", " + h + ":" + min + " " + ampm;

      return time;
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
      this.$sidebar.displaySidebar(!this.$sidebar.showSidebar);
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
.theme-toggle i {
  font-size: 1.2rem;
  vertical-align: middle;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.2; }
}
</style>
