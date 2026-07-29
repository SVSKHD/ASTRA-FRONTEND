import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { vHoverStyle } from './directives/hoverStyle'
import './style.css'
// Leaflet's stylesheet powers the Trips maps (tiles, controls, panes).
import 'leaflet/dist/leaflet.css'

createApp(App).use(createPinia()).use(router).directive('hover-style', vHoverStyle).mount('#app')
