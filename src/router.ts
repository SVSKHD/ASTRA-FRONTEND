import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { PLURAL } from '@/utils/share'
import { useUiStore } from '@/stores/ui'
import { LAST_ROUTE_KEY, sessionRead } from '@/composables/useTradeRoute'
import { tabOf } from '@/composables/useTabRoute'
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
router.beforeEach((to) => {
  if (to.path === '/') {
    const last = sessionRead(LAST_ROUTE_KEY)
    if (last && last !== to.fullPath && router.resolve(last).name !== 'not-found') {
      return last
    }
  }
  // The reading half, for every tab rather than for the four with a path of
  // their own (section 42): `?tab=finances` on the root is how the other
  // seventeen say which one they are.
  const tab = tabOf(to.path, to.query)
  if (tab) useUiStore().setTab(tab)
  return true
})
