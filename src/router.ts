import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { PLURAL } from '@/utils/share'

// Share routes are declared per item type rather than as one wildcard so an
// unknown plural 404s instead of silently rendering an empty share page.
const sharePlurals = Object.values(PLURAL)

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
