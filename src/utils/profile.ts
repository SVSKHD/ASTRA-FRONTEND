import { z } from 'zod'
import { supabase } from '@/supabase'
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
export async function fetchProfile(): Promise<Profile | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('portfolio_profiles')
    .select('content')
    .eq('id', 'hithesh')
    .maybeSingle()
  if (error) throw error
  return data ? profileSchema.parse(data.content) : null
}
export async function saveProfile(content: Profile): Promise<void> {
  if (!supabase) throw new Error('Cloud storage is not configured.')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in before saving your profile.')
  const { error } = await supabase.from('portfolio_profiles').upsert({
    id: 'hithesh',
    content: profileSchema.parse(content),
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
