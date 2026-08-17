import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { vHoverStyle } from './directives/hoverStyle'
import './style.css'
// The design system's token layer: spacing, radii, type, motion and the
// density/direction switches every ui/ component styles itself from.
import './components/ui/tokens.css'

import { reportError, scrubValue } from './utils/scrub'

const app = createApp(App)

// Wallet addresses and anything key-shaped are scrubbed before an error leaves
// the app (section 14 privacy). Every reporter — Vue's handler, an unhandled
// rejection, a window error — goes through the same scrub, so a stack frame or
// a thrown string carrying an address never reaches a console or an analytics
// pipeline verbatim.
app.config.errorHandler = (err, _instance, info) => {
  reportError('[Aureon] Unhandled error (' + info + ')', scrubValue(err))
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    reportError('[Aureon] Unhandled rejection', scrubValue(event.reason))
  })
  window.addEventListener('error', (event) => {
    reportError('[Aureon] Window error', scrubValue(event.message))
  })
}

app.use(createPinia()).use(router).directive('hover-style', vHoverStyle).mount('#app')
