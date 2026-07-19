import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { vHoverStyle } from './directives/hoverStyle'
import './style.css'

createApp(App).use(createPinia()).directive('hover-style', vHoverStyle).mount('#app')
