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
    }
  },
  mounted() {
    this.$store.dispatch("getNotifications");
    this.initScrollbar();

    setTimeout(() => {
      this.startMqttClient();
    }, 2000);
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

    async startMqttClient() {
      // Defensive cleanup before (re)starting to avoid listener accumulation
      this.$nuxt.$off("mqtt-sender");
      await this.getMqttCredentials();

      //ex topic: "userid/did/variableId/sdata"
      const deviceSubscribeTopic =
        this.$store.state.auth.userData._id + "/+/+/sdata";
      const notifSubscribeTopic =
        this.$store.state.auth.userData._id + "/+/+/notif";

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

        //SDATA SUBSCRIBE
        this.client.subscribe(deviceSubscribeTopic, { qos: 0 }, err => {
          if (err) {
            console.log("Error in DeviceSubscription");
            return;
          }
          console.log("Device subscription Success");
          console.log(deviceSubscribeTopic);
        });

        //NOTIF SUBSCRIBE
        this.client.subscribe(notifSubscribeTopic, { qos: 0 }, err => {
          if (err) {
            console.log("Error in NotifSubscription");
            return;
          }
          console.log("Notif subscription Success");
          console.log(notifSubscribeTopic);
        });

        //ACTDATA SUBSCRIBE (para recibir actualizaciones de estado desde servidor/reglas)
        const actdataSubscribeTopic = this.$store.state.auth.userData._id + "/+/+/actdata";
        this.client.subscribe(actdataSubscribeTopic, { qos: 0 }, err => {
          if (err) {
            console.log("Error in ActdataSubscription");
            return;
          }
          console.log("Actdata subscription Success");
          console.log(actdataSubscribeTopic);
        });
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
            this.$notify({
              type: "danger",
              icon: "tim-icons icon-alert-circle-exc",
              message: message.toString()
            });
            this.$store.dispatch("getNotifications");
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
