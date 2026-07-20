<template>
  <div class="fixed-plugin" v-click-outside="closeDropDown">
    <div class="dropdown show-dropdown" :class="{ show: isOpen }">
      <a data-toggle="dropdown" class="settings-icon">
        <i class="fa fa-cog fa-2x" @click="toggleDropDown"> </i>
      </a>
      <ul class="dropdown-menu" :class="{ show: isOpen }">
        <li class="header-title">Sidebar Background</li>
        <li class="adjustments-line">
          <a class="switch-trigger background-color">
            <div class="badge-colors text-center">
              <span
                v-for="item in sidebarColors"
                :key="item.color"
                class="badge filter"
                :class="[`badge-${item.color}`, { active: item.active }]"
                :data-color="item.color"
                @click="changeSidebarBackground(item);"
              ></span>
            </div>
            <div class="clearfix"></div>
          </a>
        </li>

        <!-- DEC-REF-70 (g) · #50 — poda: el toggle dark/light salió
             de acá y vive ahora como botón sol/luna en el
             DashboardNavbar. El selector de color de fondo del
             sidebar QUEDA. -->
      </ul>
    </div>
  </div>
</template>
<script>
  export default {
    name: 'sidebar-share',
    props: {
      backgroundColor: String
    },
    data() {
      return {
        isOpen: false,
        // DEC-REF-70 (g) · #50 — default AZUL (`value:'blue'` → CSS
        // `.badge-info` → hex $info=#1d8cf8 en _variables.scss:105).
        // El default en layouts/default.vue también arranca en "blue"
        // para que el sync inicial no muestre el swatch equivocado.
        sidebarColors: [
          { color: 'primary', active: false, value: 'primary' },
          { color: 'vue',     active: false, value: 'vue'     },
          { color: 'info',    active: true,  value: 'blue'    },
          { color: 'success', active: false, value: 'green'   }
        ]
      };
    },
    methods: {
      toggleDropDown() {
        this.isOpen = !this.isOpen;
      },
      closeDropDown() {
        this.isOpen = false;
      },
      toggleList(list, itemToActivate) {
        list.forEach(listItem => {
          listItem.active = false;
        });
        itemToActivate.active = true;
      },
      changeSidebarBackground(item) {
        this.$emit('update:backgroundColor', item.value);
        this.toggleList(this.sidebarColors, item);
      },
      minimizeSidebar() {
        this.$sidebar.toggleMinimize();
      }
    }
  };
</script>
<style scoped lang="scss">
  @import '~@/assets/sass/dashboard/custom/variables';

  .settings-icon {
    cursor: pointer;
  }

  .badge-vue {
    background-color: $vue;
  }
</style>
