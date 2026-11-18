import { START_LOCATION, createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { rememberDhanReturn } from '@/control/dhanReturn'
import { PLURAL } from '@/utils/share'
import { useUiStore } from '@/stores/ui'
import { LAST_ROUTE_KEY, sessionRead } from '@/composables/useTradeRoute'
import { tabOf } from '@/composables/useTabRoute'
import { rememberedTab, tabUrl } from '@/utils/lastTab'
import type { ItemType, TabKey } from '@/types'

// Share routes are declared per item type rather than as one wildcard so an
// unknown plural 404s instead of silently rendering an empty share page.
const sharePlurals = Object.values(PLURAL)
// Singular item types for the newer /share/<type>/<id> links minted by the
// per-item globe toggle. Enumerated (not a wildcard) for the same reason: an
// unknown type 404s rather than rendering a blank share.
const shareTypes = Object.keys(PLURAL) as ItemType[]

// Tabs that have a URL of their own (section 33). The workspace is one page
// with a tab rail, so these all render the same view — the path names which tab
// it opens on, which is what makes a link to a month of trades a link rather
// than an instruction to click twice.
export const TAB_ROUTES: Record<string, TabKey> = {
  '/trades': 'trades',
  '/expenses': 'expenses',
  '/news': 'news',
  '/code': 'code',
}

const routes: RouteRecordRaw[] = [
  { path: '/profile', name: 'profile', component: () => import('@/views/ProfileView.vue') },
  // The trading panel (Trading Phase E): read-only views over Aureon_Agentic's
  // trading API. `/trading/<section>`; it signs in to Aureon on its own.
  {
    path: '/trading/:section?',
    name: 'trading',
    component: () => import('@/views/TradingView.vue'),
  },
  // Code (Aureon): the read-only repository browser and code tasks on the
  // self-hosted coding agent. The GitHub mirror moves here in Phase 21.
  {
    path: '/code-aureon',
    name: 'code-aureon',
    component: () => import('@/views/CodeAureonView.vue'),
  },
  // The server's modules (GET /api/v1/ui/manifest): generic views for any
  // backend route that declares `x-ui`, or the app's own page when it has one.
  { path: '/modules/:key?', name: 'modules', component: () => import('@/views/ModulesView.vue') },
  // The control center (Phase 21): GitHub, Actions, agents, repairs, reviews
  // and the approval inbox, admin-only, behind the same Aureon gate as
  // /trading. `/dev/<module>`. The DEV-only /dev/login and /dev/shot/* below
  // are static segments, so they still win over `:module` in development.
  // The approval engine's Discord deep link (`/dev/approvals/{id}`) and the
  // voice-navigation routes (backend docs/23) land on the modules here.
  // Settings and secrets (backend docs/settings.md) are on /settings, an alias of
  // the workspace below: the home shell with Settings on the stage. The control
  // center's Settings module renders the same page.
  { path: '/dev/approvals', redirect: '/dev/inbox' },
  {
    path: '/dev/approvals/:id',
    redirect: (to) => ({ path: '/dev/inbox', query: { id: String(to.params.id) } }),
  },
  { path: '/dev/prs', redirect: '/dev/pulls' },
  {
    path: '/dev/prs/:n',
    redirect: (to) => ({ path: '/dev/pulls', query: { n: String(to.params.n) } }),
  },
  {
    path: '/dev/:module?',
    name: 'control-center',
    component: () => import('@/views/ControlCenterView.vue'),
  },
  // The image studio, phone-first, for any signed-in Aureon user (section 46).
  { path: '/images', name: 'images', component: () => import('@/views/ImagesView.vue') },
  // The AI Cost Center: budget, billed usage, versioned prices and the estimator.
  { path: '/ai/costs', name: 'ai-costs', component: () => import('@/views/AiCostsView.vue') },
  // The GitHub AI workspace: browse, explain, review, and request approved changes.
  { path: '/github-ai', name: 'github-ai', component: () => import('@/views/GithubAiView.vue') },
  // Agents, tools (MCP), permissions, history, approvals and audit, from the server.
  { path: '/agents-hub', name: 'agents-hub', component: () => import('@/views/AgentsHubView.vue') },
  {
    path: '/astra',
    name: 'astra',
    component: () => import('@/views/AstraView.vue'),
  },
  {
    path: '/',
    name: 'workspace',
    component: () => import('@/views/WorkspaceView.vue'),
  },
  // Settings on the home stage: the workspace itself, with Settings where a tab
  // would be (WorkspaceView checks the path). Its own record, NOT an alias of `/`:
  // an alias is the same record, so `/` → `/settings` counted as a duplicate
  // navigation and was silently cancelled. Both records resolve to the same
  // component, so moving between them keeps the workspace mounted, as the task
  // and transfer routes below do.
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/WorkspaceView.vue'),
  },
  // Forgiving task/todo transfer links. The canonical shape is
  // /?tab=todo&title=..., but /tab?=todo=... is accepted too because it is the
  // form people tend to type when sketching a quick capture URL by hand.
  {
    path: '/tab',
    name: 'tab-transfer',
    component: () => import('@/views/WorkspaceView.vue'),
  },
  ...Object.entries(TAB_ROUTES).map(([path, key]): RouteRecordRaw => ({
    path,
    name: `tab-${key}-${path.slice(1)}`,
    component: () => import('@/views/WorkspaceView.vue'),
  })),
  // Existing deep link into a task, kept working: three segments, so it does
  // not collide with the two-segment share route below.
  {
    path: '/tasks/:id/view',
    name: 'task-view',
    component: () => import('@/views/WorkspaceView.vue'),
  },
  // The owner's full trip page. Constrained to a numeric id so it is matched
  // before the share route below (share ids are 20-char Firestore ids, never
  // all-digits) — /trips/123 is the owner's trip, /trips/<shareId> is a share.
  {
    path: '/trips/:id(\\d+)',
    name: 'trip-page',
    component: () => import('@/views/TripPage.vue'),
    props: (route) => ({ id: Number(route.params.id) }),
  },
  // The goal's own wide page (section 18d's "Open full page"). Numeric like the
  // trip page above, and declared before the share routes so it is matched
  // first — /goals is not a share plural today, but making the constraint
  // explicit keeps it from becoming a collision if it ever is.
  {
    path: '/goals/:goalId(\\d+)',
    name: 'goal-page',
    component: () => import('@/views/WorkspaceView.vue'),
  },
  // A note's own page (section 22c's "Open full"). Numeric like the two above
  // and declared before the share routes, because `notes` IS a share plural —
  // /notes/123 is the owner's note, /notes/<shareId> is a share.
  {
    path: '/notes/:noteId(\\d+)',
    name: 'note-page',
    component: () => import('@/views/WorkspaceView.vue'),
  },
  ...sharePlurals.map((plural): RouteRecordRaw => ({
    path: `/${plural}/:shareId`,
    name: `share-${plural}`,
    component: () => import('@/views/SharePage.vue'),
    props: (route) => ({ plural, shareId: String(route.params.shareId) }),
  })),
  // Public, singular, namespaced under /share — e.g. /share/todo/<shareId>.
  // SharePage renders read-only from the frozen mirror doc and is not behind any
  // auth guard, so a signed-out visitor resolves it directly.
  ...shareTypes.map((type): RouteRecordRaw => ({
    path: `/share/${type}/:shareId`,
    name: `share-public-${type}`,
    component: () => import('@/views/SharePage.vue'),
    props: (route) => ({ plural: PLURAL[type], shareId: String(route.params.shareId) }),
  })),
  // Goals URL import (task 8). The inbound link is pasted in-app; the preview
  // screen parses it and lets the user edit rows before one atomic import write.
  {
    path: '/import/goals',
    name: 'import-goals',
    component: () => import('@/views/GoalsImportView.vue'),
  },
  // The design system showcase. Authenticated like the workspace it documents,
  // and only registered outside production so it never ships to end users.
  ...(import.meta.env.DEV
    ? [
        {
          path: '/ui',
          name: 'ui-showcase',
          component: () => import('@/views/UiShowcaseView.vue'),
        } as RouteRecordRaw,
        // The screenshot harness (section 38). Both of these are registered
        // inside a DEV branch, which the bundler evaluates statically — so they
        // are absent from a production build rather than present and guarded.
        {
          path: '/dev/login',
          name: 'dev-login',
          component: () => import('@/dev/DevLogin.vue'),
        } as RouteRecordRaw,
        {
          path: '/dev/shot/:view',
          name: 'dev-shot',
          component: () => import('@/dev/DevShot.vue'),
        } as RouteRecordRaw,
      ]
    : []),
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

/**
 * The tab is chosen BEFORE the view paints, not in `onMounted` (section 33).
 *
 * Mounting first and correcting afterwards is what produces the default-tab
 * flash: Overview renders, its listeners attach, and a frame later Trades
 * replaces it. Deciding here means the first paint is already the right tab.
 *
 * The bare domain is also resolved here, from the last route this browser tab
 * was on. Silently: a stored path that no longer resolves simply does not
 * redirect, and the workspace opens on whatever it opens on.
 */
router.beforeEach((to, from) => {
  // Dhan sent the browser back (?dhan_login=ready): remember it before any sign-in step can
  // drop the query string, so /dev/settings finishes the login after the admin signs in.
  // Only a marker; never redirects.
  rememberDhanReturn(to.query)
  // Only a BARE `/` is resolved from memory. It used to be any `/` whose full
  // path differed from the stored route — so reloading on `/?tab=todo` could be
  // sent somewhere else entirely (a task page, a stale tab) when the stored
  // route had fallen behind the address bar. A URL that says where it is wins.
  // And only on arrival (a load or reload), not when the app itself goes to `/`:
  // the stored route is then the page being left, so leaving /settings for `/`
  // was sent straight back to /settings.
  if (from === START_LOCATION && to.path === '/' && Object.keys(to.query).length === 0) {
    const last = sessionRead(LAST_ROUTE_KEY)
    if (last && last !== to.fullPath && router.resolve(last).name !== 'not-found') {
      return last
    }
    // No route in this browser tab (a new window, the installed app relaunching
    // on `/`): fall back to the tab last worked on, from localStorage.
    if (!last) {
      const remembered = rememberedTab()
      if (remembered && remembered !== 'overview') return tabUrl(remembered)
    }
  }
  // The reading half, for every tab rather than for the four with a path of
  // their own (section 42): `?tab=finances` on the root is how the other
  // seventeen say which one they are.
  const tab = tabOf(to.path, to.query)
  if (tab) useUiStore().setTab(tab)
  return true
})
