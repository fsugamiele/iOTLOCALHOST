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

        <!-- DEC-REF-70 (g) · #50 refinamiento — el switch dark/light
             VUELVE al plugin junto con el selector de colores
             (coherencia: los controles visuales van juntos, un solo
             lugar de configuración de tema). El sol/luna que había
             pasado al navbar se retira. -->
        <li class="header-title">Sidebar Mini</li>
        <li class="adjustments-line">
          <div class="togglebutton switch-change-color mt-3">
            <span class="label-switch">LIGHT MODE</span>
            <base-switch v-model="darkMode" @input="toggleMode"></base-switch>
            <span class="label-switch label-right">DARK MODE</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
<script>
  import { BaseSwitch } from '@/components';

  export default {
    name: 'sidebar-share',
    components: {
      BaseSwitch
    },
    props: {
      backgroundColor: String
    },
    data() {
      return {
        // darkMode: true = tema oscuro (body SIN .white-content).
        // El sync inicial en mounted() alinea el switch con el
        // estado real del body (evita mostrar posición equivocada
        // si el usuario recarga con tema claro persistido).
        darkMode: true,
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
    mounted() {
      // Sync inicial con el body — mantiene la posición del switch
      // coherente si el tema viene persistido de otra sesión.
      if (typeof document !== 'undefined') {
        this.darkMode = !document.body.classList.contains('white-content');
      }
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
      toggleMode(isDarkMode) {
        // isDarkMode: true → tema oscuro (SIN .white-content).
        // isDarkMode: false → tema claro (CON .white-content).
        // El observer en pages/dashboard.vue detecta este cambio y
        // baja `isLight` como prop a los 4 componentes Noc* — patrón
        // #49/R3 intacto.
        const docClasses = document.body.classList;
        if (isDarkMode) {
          docClasses.remove('white-content');
        } else {
          docClasses.add('white-content');
        }
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
