<template>
  <div class="wrapper" :class="{ 'nav-open': $sidebar.showSidebar }">
    <notifications></notifications>

    <side-bar
      :background-color="sidebarBackground"
      short-title="IX"
      title="IoTix"
    >
      <template slot-scope="props" slot="links">
        <sidebar-item
          :link="{
            name: 'Dashboard',
            icon: 'tim-icons icon-laptop',
            path: '/dashboard'
          }"
        >
        </sidebar-item>

        <sidebar-item
          :link="{
            name: 'Devices',
            icon: 'tim-icons icon-light-3',
            path: '/devices'
          }"
        >
        </sidebar-item>

        <sidebar-item
          :link="{
            name: 'Reglas',
            icon: 'tim-icons icon-settings-gear-63',
            path: '/rules'
          }"
        >
        </sidebar-item>

        <sidebar-item
          :link="{
            name: 'Alarmas',
            icon: 'tim-icons icon-bell-55',
            path: '/alarms'
          }"
        >
        </sidebar-item>

        <sidebar-item
          :link="{
            name: 'Templates',
            icon: 'tim-icons icon-atom',
            path: '/templates'
          }"
        >
        </sidebar-item>

        <!-- SF-5 Capa 1 (DEC-REF-62.c) — primer patrón de visibilidad
             por rol en el layout. Solo superadmin ve este item. -->
        <sidebar-item
          v-if="isSuperadmin"
          :link="{
            name: 'Reglas de monitoreo',
            icon: 'tim-icons icon-book-bookmark',
            path: '/rulepacks'
          }"
        >
        </sidebar-item>
      </template>
    </side-bar>

    <!--Share plugin (for demo purposes). You can remove it if don't plan on using it-->
    <sidebar-share :background-color.sync="sidebarBackground"> </sidebar-share>

    <div class="main-panel" :data="sidebarBackground">
      <dashboard-navbar></dashboard-navbar>
      <router-view name="header"></router-view>

      <div :class="{ content: !isFullScreenRoute }" @click="toggleSidebar">
        <zoom-center-transition :duration="1000" mode="out-in">
          <!-- your content here -->
          <nuxt></nuxt>
        </zoom-center-transition>
      </div>
      <content-footer v-if="!isFullScreenRoute"></content-footer>
    </div>
  </div>
</template>

<script>
/* eslint-disable no-new */
import PerfectScrollbar from "perfect-scrollbar";
import "perfect-scrollbar/css/perfect-scrollbar.css";
import SidebarShare from "@/components/Layout/SidebarSharePlugin";
function hasElement(className) {
  return document.getElementsByClassName(className).length > 0;
}

function initScrollbar(className) {
  if (hasElement(className)) {
    new PerfectScrollbar(`.${className}`);
  } else {
    // try to init it later in case this component is loaded async
    setTimeout(() => {
      initScrollbar(className);
    }, 100);
  }
}

import DashboardNavbar from "@/components/Layout/DashboardNavbar.vue";
import ContentFooter from "@/components/Layout/ContentFooter.vue";
import DashboardContent from "@/components/Layout/Content.vue";
import { SlideYDownTransition, ZoomCenterTransition } from "vue2-transitions";
import mqtt from "mqtt";

export default {
  components: {
    DashboardNavbar,
    ContentFooter,
    DashboardContent,
    SlideYDownTransition,
    ZoomCenterTransition,
    SidebarShare
  },
  data() {
    return {
      sidebarBackground: "primary", //vue|blue|orange|green|red|primary
      client: null,
      options: {
        host: "",
        port: "",
        endpoint: "/mqtt",
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 5000,
        keepalive: 30,

        // Certification Information
        clientId:
          "web_" +
          this.$store.state.auth.userData.name +
          "_" +
          Math.floor(Math.random() * 1000000 + 1),
        username: "",
        password: ""
      }
    };
  },
  computed: {
    isFullScreenRoute() {
      return this.$route.path === "/maps/full-screen";
    },
    // SF-5 Capa 1 · DEC-REF-62.a/c — visibilidad del item "Reglas de
    // monitoreo". Optional chaining defensivo por si `auth` no está
    // hidratado todavía (edge case en el ciclo de vida del layout).
    isSuperadmin() {
      const grants = this.$store.state.auth?.userData?.grants || [];
      return grants.some(g => g.role === 'superadmin');
    }
  },
  watch: {
    // Pieza 3 (DEC-REF-38) — refresh dinámico de suscripciones MQTT cuando cambia
    // la lista de devices visibles. Desuscribe los que dejaron de estar; resuscribe
    // todos (mqtt.js dedupe re-subscribe al mismo topic, es no-op).
    '$store.state.devices': function (newList, oldList) {
      if (!this.client) return;
      const keyOf = (d) => d.userId + '/' + d.dId;
      const newKeys = new Set((newList || []).map(keyOf));
      (oldList || []).forEach((d) => {
        if (!newKeys.has(keyOf(d))) {
          ['sdata', 'notif', 'actdata'].forEach((t) =>
            this.client.unsubscribe(d.userId + '/' + d.dId + '/+/' + t)
          );
        }
      });
      this.subscribeToDevices();
    },
  },
  async mounted() {
    this.$store.dispatch("getNotifications");
    this.initScrollbar();
    // Pieza 3 (DEC-REF-38) — await getDevices ANTES de armar MQTT: la suscripción
    // ahora es por (owner, dId) del scope; necesita el store poblado. Reemplaza el
    // setTimeout(2000) mágico — orden explícito.
    await this.$store.dispatch("getDevices");
    this.startMqttClient();
  },
  beforeDestroy() {
    this.$nuxt.$off("mqtt-sender");
  },
  methods: {
    async getMqttCredentials() {
      try {
        const axiosHeaders = {
          headers: {
            token: this.$store.state.auth.token
          }
        };

        const credentials = await this.$axios.post(
          "/getmqttcredentials",
          null,
          axiosHeaders
        );
        console.log(credentials.data);

        if (credentials.data.status == "success") {
          this.options.username = credentials.data.username;
          this.options.password = credentials.data.password;
          this.options.host = process.env.mqtt_host;
          this.options.port = process.env.mqtt_port;
        }
      } catch (error) {
        console.log(error);

        if (error.response.status == 401) {
          console.log("NO VALID TOKEN");
          localStorage.clear();

          const auth = {};
          this.$store.commit("setAuth", auth);

          window.location.href = "/login";
        }
      }
    },

    subscribeToDevices() {
      // Pieza 3 (DEC-REF-38) — suscribe a sdata/notif/actdata por (owner, dId)
      // del scope del grant. La ACL del web-user es α-estricta y solo autoriza
      // estos topics; el namespace propio {auth_userId}/# queda inutilizado
      // post-TENANT-4 (el dato vive en el namespace del owner, no del caller).
      if (!this.client) return;
      const devices = this.$store.state.devices || [];
      devices.forEach((d) => {
        if (!d.userId || !d.dId) return;
        const base = d.userId + "/" + d.dId + "/+/";
        ["sdata", "notif", "actdata"].forEach((t) => {
          this.client.subscribe(base + t, { qos: 0 }, (err) => {
            if (err) console.error("MQTT subscribe error:", base + t, err);
          });
        });
      });
    },

    async startMqttClient() {
      // Defensive cleanup before (re)starting to avoid listener accumulation
      this.$nuxt.$off("mqtt-sender");
      await this.getMqttCredentials();

      const connectUrl =
        process.env.mqtt_prefix +
        this.options.host +
        ":" +
        this.options.port +
        this.options.endpoint;

      try {
        this.client = mqtt.connect(connectUrl, this.options);
      } catch (error) {
        console.log(error);
      }

      //MQTT CONNECTION SUCCESS
      this.client.on("connect", () => {
        console.log("Connection succeeded!");
        this.$store.commit("setMqttConnected", true);

        // Pieza 3 (DEC-REF-38) — (re)suscribir en cada connect/reconnect. clean:true
        // pierde suscripciones al reconectar, así que re-armarlas acá es necesario.
        this.subscribeToDevices();
      });

      this.client.on("error", async error => {
        console.log("Connection failed", error);
        this.$store.commit("setMqttConnected", false);
        // mqtt.js stops retrying after CONNACK "Not authorized" (fatal error).
        // Rotate credentials and restart the client once.
        if (error && error.message && error.message.includes("Not authorized")) {
          if (this._mqttAuthRetrying) return;
          this._mqttAuthRetrying = true;
          console.log("MQTT auth error — refreshing credentials and restarting client...");
          this.client.end(true);
          this.$nuxt.$off("mqtt-sender");
          setTimeout(async () => {
            this._mqttAuthRetrying = false;
            await this.startMqttClient();
          }, 3000);
        }
      });

      this.client.on("reconnect", () => {
        console.log("reconnecting...");
        this.$store.commit("setMqttConnected", false);
      });

      this.client.on("disconnect", () => {
        console.log("MQTT disconnected");
        this.$store.commit("setMqttConnected", false);
      });

      this.client.on("message", (topic, message) => {
        console.log("Message from topic " + topic + " -> ");
        console.log(message.toString());

        try {
          const splittedTopic = topic.split("/");
          const msgType = splittedTopic[3];

          if (msgType == "notif") {
            const raw = message.toString();
            // DEC-REF-55 — payload JSON con shape {siteId, severity, ruleId,
            // variable, message, time, correlationParent, mode}. Fallback:
            // mensajes en tránsito en formato viejo (texto plano) durante
            // rollout — el string se preserva como `message` con siteId null.
            let payload;
            try {
              payload = JSON.parse(raw);
              if (typeof payload !== 'object' || payload === null) throw new Error('not object');
            } catch (e) {
              payload = { siteId: null, severity: 'critical', message: raw };
            }
            // SF-4 · DEC-REF-64 — condicionar toast por payload.kind.
            // resolve → verde 'success' + icon check + prefijo "Resuelto: ".
            // fire (o sin kind, legacy pre-SF-4) → danger rojo (comportamiento
            // vigente).
            const isResolve = payload.kind === 'resolve';
            this.$notify({
              type: isResolve ? 'success' : 'danger',
              icon: isResolve ? 'tim-icons icon-check-2' : 'tim-icons icon-alert-circle-exc',
              message: (isResolve ? 'Resuelto: ' : '') + (payload.message || raw)
            });
            this.$store.dispatch("getNotifications");
            // Real-time-lite (DEC-REF-44 / DEC-REF-54 / DEC-REF-55): reemitir
            // objeto al bus; la vista de detalle filtra por siteId antes de
            // re-fetchear (fin del re-fetch ciego).
            this.$nuxt.$emit("wanomi:notif", payload);
            return;
          } else if (msgType == "sdata") {
            this.$nuxt.$emit(topic, JSON.parse(message.toString()));
            return;
          } else if (msgType == "actdata") {
            this.$nuxt.$emit(topic, JSON.parse(message.toString()));
            return;
          }
        } catch (error) {
          console.log(error);
        }
      });

      this.$nuxt.$on("mqtt-sender", toSend => {
        this.client.publish(toSend.topic, JSON.stringify(toSend.msg));
      });
    },

    toggleSidebar() {
      if (this.$sidebar.showSidebar) {
        this.$sidebar.displaySidebar(false);
      }
    },
    initScrollbar() {
      let docClasses = document.body.classList;
      let isWindows = navigator.platform.startsWith("Win");
      if (isWindows) {
        // if we are on windows OS we activate the perfectScrollbar function
        initScrollbar("sidebar");
        initScrollbar("main-panel");
        initScrollbar("sidebar-wrapper");

        docClasses.add("perfect-scrollbar-on");
      } else {
        docClasses.add("perfect-scrollbar-off");
      }
    }
  }
};
</script>
<style lang="scss">
$scaleSize: 0.95;
@keyframes zoomIn95 {
  from {
    opacity: 0;
    transform: scale3d($scaleSize, $scaleSize, $scaleSize);
  }
  to {
    opacity: 1;
  }
}

.main-panel .zoomIn {
  animation-name: zoomIn95;
}

@keyframes zoomOut95 {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
    transform: scale3d($scaleSize, $scaleSize, $scaleSize);
  }
}

.main-panel .zoomOut {
  animation-name: zoomOut95;
}
</style>
