export const state = () => ({
  auth: null,
  devices: [],
  selectedDevice: {},
  notifications: [],
  mqttConnected: false
});

export const mutations = {

  setAuth(state, auth) {
    state.auth = auth;
  },

  setNotifications(state, notifications) {
    state.notifications = notifications;
  },

  setDevices(state, devices) {
    state.devices = devices;
  },

  setSelectedDevice(state, device) {
    state.selectedDevice = device;
  },

  setMqttConnected(state, value) {
    state.mqttConnected = value;
  },

};

export const actions = {

  readToken() {
    let auth = null;
    try {
      auth = JSON.parse(localStorage.getItem("auth"));
    } catch (error) {
      console.log(err);
    }
    //saving auth in state
    this.commit("setAuth", auth);
  },

  getDevices() {

    const axiosHeader = {
      headers: {
        token: this.state.auth.token
      }
    };

    return this.$axios.get("/device", axiosHeader)
    .then(res => {
      const devices = res.data.data;
      this.commit("setDevices", devices);

      // DEC-REF-78: la selección es preferencia de sesión del usuario,
      // no estado persistente del device. La preferencia vive en
      // localStorage namespaceada por userId; el fallback es el primer
      // device de la lista (backend garantiza orden estable por _id).
      if (devices.length === 0) {
        this.commit("setSelectedDevice", {});
        $nuxt.$emit('selectedDeviceIndex', null);
        return;
      }

      const userId = this.state.auth && this.state.auth.userData && this.state.auth.userData._id;
      const key = userId ? ('lastSelectedDId:' + userId) : null;
      const savedDId = key ? localStorage.getItem(key) : null;

      let index = savedDId ? devices.findIndex(d => d.dId === savedDId) : -1;
      if (index === -1) index = 0;  // fallback determinístico al primero

      this.commit("setSelectedDevice", devices[index]);
      $nuxt.$emit('selectedDeviceIndex', index);
    }).catch(error => {
      console.log(error);
    });
    
  },

  getNotifications() {

    const axiosHeader = {
      headers: {
        token: this.state.auth.token
      }
    };

    this.$axios.get("/notifications", axiosHeader)
    .then(res => {
      console.log(res.data.data);
      this.commit("setNotifications", res.data.data)
    }).catch(error => {
      console.log(error);
    });
    
  }
};
