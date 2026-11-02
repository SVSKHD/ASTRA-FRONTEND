import { z } from 'zod'
import { supabase } from '@/supabase'
import { authProvider } from '@/auth/provider'
import { aureon, errorMessage } from '@/api/client'
import defaults from '@/data/profile.json'
const link = z.object({
  label: z.string(),
  href: z
    .string()
    .refine(
      (v) => /^(https?:|mailto:|tel:|#)/i.test(v),
      'Use an https, mailto, tel or anchor link.',
    ),
})
const fact = z.object({ v: z.string(), k: z.string() })
const project = z.object({
  title: z.string(),
  kind: z.string(),
  role: z.string(),
  stack: z.array(z.string()),
  facts: z.array(fact),
  bullets: z.array(z.string()),
  flow: z.array(z.string()),
  links: z.array(link),
})
export const profileSchema = z.object({
  hero: z.object({
    name: z.string().min(1),
    title: z.string(),
    roles: z.array(z.string()).min(1),
    summary: z.string(),
    links: z.array(link.extend({ value: z.string() })),
  }),
  glance: z.array(z.object({ k: z.string(), v: z.string() })),
  ticker: z.array(z.string()).min(1),
  about: z.object({
    intro: z.string(),
    focus: z.array(z.object({ tag: z.string(), title: z.string(), body: z.string() })),
  }),
  stack: z.array(z.object({ group: z.string(), icon: z.string(), items: z.array(z.string()) })),
  featured: z.object({
    title: z.string(),
    kind: z.string(),
    role: z.string(),
    pitch: z.string(),
    stack: z.array(z.string()),
    facts: z.array(fact),
    bullets: z.array(z.string()),
    flow: z.array(z.object({ label: z.string(), tech: z.string() })),
    storage: z.string(),
    links: z.array(link),
  }),
  projects: z.array(project),
  experience: z.array(
    z.object({
      role: z.string(),
      org: z.string(),
      dates: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(z.object({ degree: z.string(), school: z.string(), year: z.string() })),
})
export type Profile = z.infer<typeof profileSchema>
export const defaultProfile = (): Profile => profileSchema.parse(defaults)
/** The one portfolio profile there is (the public page is Hithesh's). */
export const PROFILE_ID = 'hithesh'

export async function fetchProfile(): Promise<Profile | null> {
  if (authProvider() === 'aureon') {
    const { data, error, response } = await aureon.GET(
      '/api/finance/portfolio-profiles/{profile_id}',
      {
        params: { path: { profile_id: PROFILE_ID } },
      },
    )
    if (data) return profileSchema.parse(data.content)
    if (response.status === 404) return null
    throw new Error(
      errorMessage(error, `The profile could not be loaded (HTTP ${response.status}).`),
    )
  }
  if (!supabase) return null
  const { data, error } = await supabase
    .from('portfolio_profiles')
    .select('content')
    .eq('id', PROFILE_ID)
    .maybeSingle()
  if (error) throw error
  return data ? profileSchema.parse(data.content) : null
}
export async function saveProfile(content: Profile): Promise<void> {
  if (authProvider() === 'aureon') {
    // Writes are admin-only on the server (and audited).
    const { error, response } = await aureon.PUT('/api/finance/portfolio-profiles/{profile_id}', {
      params: { path: { profile_id: PROFILE_ID } },
      body: { content: profileSchema.parse(content) },
    })
    if (response.ok) return
    if (response.status === 401) throw new Error('Sign in before saving your profile.')
    if (response.status === 403) throw new Error('Only an admin can save the profile.')
    throw new Error(
      errorMessage(error, `The profile could not be saved (HTTP ${response.status}).`),
    )
  }
  if (!supabase) throw new Error('Cloud storage is not configured.')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in before saving your profile.')
  const { error } = await supabase.from('portfolio_profiles').upsert({
    id: PROFILE_ID,
    content: profileSchema.parse(content),
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
