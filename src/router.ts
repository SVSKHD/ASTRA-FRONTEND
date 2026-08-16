import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { PLURAL } from '@/utils/share'
import type { ItemType } from '@/types'

// Share routes are declared per item type rather than as one wildcard so an
// unknown plural 404s instead of silently rendering an empty share page.
const sharePlurals = Object.values(PLURAL)
// Singular item types for the newer /share/<type>/<id> links minted by the
// per-item globe toggle. Enumerated (not a wildcard) for the same reason: an
// unknown type 404s rather than rendering a blank share.
const shareTypes = Object.keys(PLURAL) as ItemType[]

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'workspace',
    component: () => import('@/views/WorkspaceView.vue'),
  },
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
