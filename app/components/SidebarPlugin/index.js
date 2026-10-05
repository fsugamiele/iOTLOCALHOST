import Sidebar from './SideBar.vue';
import SidebarItem from './SidebarItem.vue';

const SidebarStore = {
  showSidebar: false,
  // Modo mini (desktop): sidebar colapsado a íconos. Lo alterna el hamburger
  // del navbar en pantallas ≥992px; se persiste en localStorage (default.vue).
  mini: false,
  sidebarLinks: [],
  displaySidebar(value) {
    this.showSidebar = value;
  },
  displayMini(value) {
    this.mini = value;
  },
  toggleMini() {
    this.mini = !this.mini;
  },
};

const SidebarPlugin = {
  install(Vue, options) {
    if (options && options.sidebarLinks) {
      SidebarStore.sidebarLinks = options.sidebarLinks;
    }
    let app = new Vue({
      data: {
        sidebarStore: SidebarStore
      }
    });
    Vue.prototype.$sidebar = app.sidebarStore;
    Vue.component('side-bar', Sidebar);
    Vue.component('sidebar-item', SidebarItem);
  }
};

export default SidebarPlugin;
