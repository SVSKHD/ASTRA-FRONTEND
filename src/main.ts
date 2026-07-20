import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { vHoverStyle } from './directives/hoverStyle'
import './style.css'

createApp(App).use(createPinia()).use(router).directive('hover-style', vHoverStyle).mount('#app')
