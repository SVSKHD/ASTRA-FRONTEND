// One async read with loading / error / data, for the panel's pages.
import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'

export interface Load<T> {
  data: ShallowRef<T | null>
  error: Ref<string>
  loading: Ref<boolean>
  /** True when the API said 501 not_supported (the broker cannot provide it). */
  unsupported: Ref<boolean>
  reload: () => Promise<void>
}

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function useLoad<T>(fn: () => Promise<T>, immediate = true): Load<T> {
  const data = shallowRef<T | null>(null)
  const error = ref('')
  const loading = ref(false)
  const unsupported = ref(false)
  async function reload() {
    loading.value = true
    error.value = ''
    unsupported.value = false
    try {
      data.value = await fn()
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 501) unsupported.value = true
      error.value = (e as Error).message || 'Could not load.'
    } finally {
      loading.value = false
    }
  }
  if (immediate) void reload()
  return { data, error, loading, unsupported, reload }
}

/** Unwrap an openapi-fetch result, turning an error body into an ApiFailure. */
export function must<T>(r: { data?: T; error?: unknown; response: Response }): T {
  if (r.data !== undefined && r.response.ok) return r.data
  const body = r.error as { detail?: unknown } | undefined
  const d = body?.detail
  const msg =
    typeof d === 'string'
      ? d
      : d && typeof d === 'object' && 'detail' in d && typeof d.detail === 'string'
        ? d.detail
        : d && typeof d === 'object' && 'code' in d && typeof d.code === 'string'
          ? d.code.replaceAll('_', ' ')
          : `Aureon answered ${r.response.status}`
  throw new ApiFailure(msg, r.response.status)
}
