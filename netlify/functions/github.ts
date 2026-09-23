const GITHUB_API = 'https://api.github.com'

type GithubOp =
  | 'installations'
  | 'repo'
  | 'languages'
  | 'issues'
  | 'issue'
  | 'createIssue'
  | 'patchIssue'
  | 'comment'
  | 'commits'
  | 'pulls'
  | 'branches'
  | 'rateLimit'

interface GithubParams {
  owner?: string
  repo?: string
  number?: number
  title?: string
  body?: string
  state?: 'open' | 'closed'
  labels?: string[]
  assignees?: string[]
  perPage?: number
  since?: string
}

interface RequestBody {
  op?: GithubOp
  params?: GithubParams
  etag?: string
}

interface SignedInUser {
  id: string
  email: string
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

function csv(value?: string): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') || ''

  if (!header.toLowerCase().startsWith('bearer ')) {
    return ''
  }

  return header.slice(7).trim()
}

/**
 * Validate the caller's Supabase session token by asking Supabase who it is.
 *
 * `/auth/v1/user` answers only for a live, unexpired, unrevoked session, so a
 * forged or stale token gets a 401 here and never reaches GitHub. Sign-in moved
 * from Firebase to Supabase Auth (migration phase 3); this used to be the same
 * check against Firebase's account-lookup API.
 */
async function verifySupabaseUser(accessToken: string): Promise<SignedInUser | null> {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''

  if (!url || !key) {
    throw new Error('Supabase URL and publishable key are not configured on Netlify.')
  }

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    return null
  }

  const user = (await response.json()) as { id?: string; email?: string }

  if (!user.id) {
    return null
  }

  return { id: user.id, email: user.email || '' }
}

/**
 * Astra already has VITE_ALLOWED_UIDS / VITE_ALLOWED_EMAILS.
 *
 * We also support server-only names:
 *
 * ASTRA_ALLOWED_UIDS
 * ASTRA_ALLOWED_EMAILS
 */
function isAllowedUser(user: SignedInUser): boolean {
  const allowedUids = csv(process.env.ASTRA_ALLOWED_UIDS || process.env.VITE_ALLOWED_UIDS)

  const allowedEmails = csv(process.env.ASTRA_ALLOWED_EMAILS || process.env.VITE_ALLOWED_EMAILS)

  // Require an allow-list.
  // We do NOT want every signed-up account using your GitHub PAT.
  if (!allowedUids.length && !allowedEmails.length) {
    return false
  }

  const uid = user.id.toLowerCase()
  const email = String(user.email || '').toLowerCase()

  return allowedUids.includes(uid) || (email.length > 0 && allowedEmails.includes(email))
}

function requireRepo(params: GithubParams): {
  owner: string
  repo: string
} {
  const owner = String(params.owner || '').trim()
  const repo = String(params.repo || '').trim()

  if (!owner || !repo) {
    throw new Error('owner and repo are required')
  }

  return {
    owner,
    repo,
  }
}

function repoPath(params: GithubParams): string {
  const { owner, repo } = requireRepo(params)

  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

function rateLimit(headers: Headers) {
  const limit = Number(headers.get('x-ratelimit-limit') || 0)
  const remaining = Number(headers.get('x-ratelimit-remaining') || 0)
  const reset = Number(headers.get('x-ratelimit-reset') || 0)

  return {
    limit,
    remaining,
    reset,
    resetAt: reset * 1000,
  }
}

async function githubRequest(path: string, options: RequestInit = {}, etag?: string) {
  const githubToken = process.env.GITHUB_TOKEN

  if (!githubToken) {
    throw new Error('GITHUB_TOKEN is not configured.')
  }

  const headers = new Headers(options.headers)

  headers.set('Authorization', `Bearer ${githubToken}`)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  headers.set('User-Agent', 'ASTRA-GitHub-Integration')

  if (etag) {
    headers.set('If-None-Match', etag)
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers,
  })

  const meta = {
    status: response.status,
    etag: response.headers.get('etag'),
    rateLimit: rateLimit(response.headers),
  }

  if (response.status === 304) {
    return {
      ...meta,
      notModified: true,
      data: null,
    }
  }

  let data: unknown = null

  try {
    data = await response.json()
  } catch {
    data = null
  }

  return {
    ...meta,
    notModified: false,
    data,
  }
}

function githubErrorMessage(data: unknown): string {
  if (
    data &&
    typeof data === 'object' &&
    'message' in data &&
    typeof (data as { message?: unknown }).message === 'string'
  ) {
    return (data as { message: string }).message
  }

  return 'GitHub request failed'
}

async function withCi(params: GithubParams, pulls: unknown[]): Promise<unknown[]> {
  const base = repoPath(params)

  return Promise.all(
    pulls.map(async (raw) => {
      if (!raw || typeof raw !== 'object') {
        return raw
      }

      const pull = raw as Record<string, any>
      const sha = String(pull.head?.sha || '')

      if (!sha) {
        return {
          ...pull,
          ci: 'none',
        }
      }

      try {
        const status = await githubRequest(`${base}/commits/${encodeURIComponent(sha)}/status`)

        const state =
          status.data && typeof status.data === 'object'
            ? String((status.data as Record<string, unknown>).state || '')
            : ''

        let ci: 'passing' | 'failing' | 'pending' | 'none' = 'none'

        if (state === 'success') {
          ci = 'passing'
        } else if (state === 'failure' || state === 'error') {
          ci = 'failing'
        } else if (state === 'pending') {
          ci = 'pending'
        }

        return {
          ...pull,
          ci,
        }
      } catch {
        return {
          ...pull,
          ci: 'none',
        }
      }
    }),
  )
}

async function executeGithubOperation(op: GithubOp, params: GithubParams, etag?: string) {
  const perPage = Math.min(Math.max(Number(params.perPage || 30), 1), 100)

  switch (op) {
    /**
     * Existing Astra ghProxy calls this operation "installations".
     *
     * Since we're using a PAT instead of a GitHub App installation,
     * this returns every repository visible to that PAT.
     */
    case 'installations':
      return githubRequest(
        `/user/repos?per_page=100&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member`,
        {},
        etag,
      )

    case 'repo':
      return githubRequest(repoPath(params), {}, etag)

    /**
     * Bytes of code per language, e.g. { TypeScript: 812345, CSS: 41200 }.
     *
     * The repository list carries only `language` — the single largest one — so
     * "what is this built with" cannot be answered from it. This is the endpoint
     * that answers it, and it is cheap: one request per repository, cached by
     * the caller's etag.
     */
    case 'languages':
      return githubRequest(`${repoPath(params)}/languages`, {}, etag)

    case 'branches':
      return githubRequest(`${repoPath(params)}/branches?per_page=${perPage}`, {}, etag)

    case 'commits':
      return githubRequest(`${repoPath(params)}/commits?per_page=${perPage}`, {}, etag)

    case 'pulls': {
      const result = await githubRequest(
        `${repoPath(params)}/pulls?state=open&per_page=${perPage}&sort=updated&direction=desc`,
        {},
        etag,
      )

      if (result.status === 200 && Array.isArray(result.data)) {
        result.data = await withCi(params, result.data)
      }

      return result
    }

    case 'issues': {
      const query = new URLSearchParams()

      query.set('state', params.state || 'open')
      query.set('per_page', String(perPage))
      query.set('sort', 'updated')
      query.set('direction', 'desc')

      if (params.since) {
        query.set('since', params.since)
      }

      const result = await githubRequest(`${repoPath(params)}/issues?${query.toString()}`, {}, etag)

      /**
       * GitHub's /issues endpoint also includes pull requests.
       * Astra has a separate PR panel, so remove them here.
       */
      if (Array.isArray(result.data)) {
        result.data = result.data.filter((item) => {
          if (!item || typeof item !== 'object') {
            return true
          }

          return !('pull_request' in (item as Record<string, unknown>))
        })
      }

      return result
    }

    case 'issue': {
      if (!params.number) {
        throw new Error('issue number is required')
      }

      return githubRequest(`${repoPath(params)}/issues/${params.number}`, {}, etag)
    }

    case 'createIssue': {
      if (!params.title?.trim()) {
        throw new Error('issue title is required')
      }

      return githubRequest(`${repoPath(params)}/issues`, {
        method: 'POST',
        body: JSON.stringify({
          title: params.title,
          body: params.body || '',
          labels: params.labels || [],
          assignees: params.assignees || [],
        }),
      })
    }

    case 'patchIssue': {
      if (!params.number) {
        throw new Error('issue number is required')
      }

      const patch: Record<string, unknown> = {}

      if (params.title !== undefined) {
        patch.title = params.title
      }

      if (params.body !== undefined) {
        patch.body = params.body
      }

      if (params.state !== undefined) {
        patch.state = params.state
      }

      if (params.labels !== undefined) {
        patch.labels = params.labels
      }

      if (params.assignees !== undefined) {
        patch.assignees = params.assignees
      }

      return githubRequest(`${repoPath(params)}/issues/${params.number}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    }

    case 'comment': {
      if (!params.number) {
        throw new Error('issue number is required')
      }

      if (!params.body?.trim()) {
        throw new Error('comment body is required')
      }

      return githubRequest(`${repoPath(params)}/issues/${params.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          body: params.body,
        }),
      })
    }

    case 'rateLimit':
      return githubRequest('/rate_limit')

    default:
      throw new Error(`Unsupported GitHub operation: ${op}`)
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (req.method !== 'POST') {
    return json(
      {
        error: 'POST only',
      },
      405,
    )
  }

  try {
    /*
     * 1. Authenticate Astra user
     */
    const accessToken = bearerToken(req)

    if (!accessToken) {
      return json(
        {
          error: 'Sign in to Astra first.',
        },
        401,
      )
    }

    const signedIn = await verifySupabaseUser(accessToken)

    if (!signedIn) {
      return json(
        {
          error: 'Your session is invalid or expired. Sign in again.',
        },
        401,
      )
    }

    /*
     * 2. Make sure only your approved Astra account
     *    can use the GitHub PAT.
     */
    if (!isAllowedUser(signedIn)) {
      console.warn('Blocked GitHub proxy access', {
        uid: signedIn.id,
        email: signedIn.email,
      })

      return json(
        {
          error: 'This Astra account is not allowed to access GitHub.',
        },
        403,
      )
    }

    /*
     * 3. Read the existing ghProxy request contract
     */
    const body = (await req.json()) as RequestBody

    const op = body.op
    const params = body.params || {}

    if (!op) {
      return json(
        {
          error: 'GitHub operation is required.',
        },
        400,
      )
    }

    /*
     * 4. GitHub API
     */
    const result = await executeGithubOperation(op, params, body.etag)

    if (result.status === 304) {
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': 'no-store',
          ...(result.etag
            ? {
                ETag: result.etag,
              }
            : {}),
        },
      })
    }

    if (result.status === 401 || result.status === 403) {
      console.error('GitHub authentication error', {
        status: result.status,
      })

      return json(
        {
          error: githubErrorMessage(result.data),
          rateLimit: result.rateLimit,
        },
        result.status,
      )
    }

    if (result.status < 200 || result.status >= 300) {
      return json(
        {
          error: githubErrorMessage(result.data),
          rateLimit: result.rateLimit,
        },
        result.status,
      )
    }

    /*
     * Keep this envelope exactly compatible with
     * src/utils/ghProxy.ts
     */
    return json({
      data: result.data,
      etag: result.etag,
      rateLimit: result.rateLimit,
    })
  } catch (error) {
    console.error('ASTRA GitHub proxy error', error)

    return json(
      {
        error: error instanceof Error ? error.message : 'GitHub integration failed.',
      },
      500,
    )
  }
}

export const config = {
  path: '/api/github',
}
