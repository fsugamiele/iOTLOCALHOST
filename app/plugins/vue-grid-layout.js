// DEC-REF-101 D-7 (#76) — vue-grid-layout registrado como plugin client-only:
// la librería toca `window`/`document` al importar y rompería el bundle SSR.
// Named imports: el default export del paquete es el objeto install y NO
// lleva GridLayout/GridItem (bug medido en #76: Vue.component con undefined
// ⇒ la grilla no renderizaba).
import Vue from 'vue';
import { GridLayout, GridItem } from 'vue-grid-layout';
// El paquete 2.4.0 no publica su CSS operativo: asset propio (ver archivo).
import '@/assets/css/vue-grid-layout.css';

Vue.component('GridLayout', GridLayout);
Vue.component('GridItem', GridItem);
