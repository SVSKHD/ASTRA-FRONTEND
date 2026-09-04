// A local design harness for the trade logger. Not shipped: it exists so the
// components can be looked at with real-shaped data, at 1280px and at 360px,
// without a Firebase project or a signed-in user.
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { vHoverStyle } from '@/directives/hoverStyle'
import { applyThemeToDom } from '@/themes/apply'
import '@/style.css'
import '@/components/ui/tokens.css'
import Harness from './Harness.vue'

applyThemeToDom('deepSpace', 'deepSpace')
createApp(Harness).use(createPinia()).directive('hover-style', vHoverStyle).mount('#app')
