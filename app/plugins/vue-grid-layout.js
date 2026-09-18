// DEC-REF-101 D-7 (#76) — vue-grid-layout registrado como plugin client-only:
// la librería toca `window` al importar y rompería el bundle SSR.
import Vue from 'vue';
import VueGridLayout from 'vue-grid-layout';
// El paquete 2.4.0 no publica su CSS: asset propio (ver archivo).
import '@/assets/css/vue-grid-layout.css';

Vue.component('GridLayout', VueGridLayout.GridLayout);
Vue.component('GridItem', VueGridLayout.GridItem);
