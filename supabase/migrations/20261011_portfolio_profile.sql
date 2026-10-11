-- Public portfolio content. Only the existing owner account may publish edits.
create table if not exists public.portfolio_profiles (
  id text primary key check (id = 'hithesh'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.portfolio_profiles enable row level security;
grant select on public.portfolio_profiles to anon, authenticated;
grant insert, update on public.portfolio_profiles to authenticated;
create policy "portfolio public read" on public.portfolio_profiles
  for select to anon, authenticated using (true);
create policy "portfolio owner insert" on public.portfolio_profiles
  for insert to authenticated with check (lower(auth.jwt() ->> 'email') = '8svskhd@gmail.com');
create policy "portfolio owner update" on public.portfolio_profiles
  for update to authenticated using (lower(auth.jwt() ->> 'email') = '8svskhd@gmail.com')
  with check (lower(auth.jwt() ->> 'email') = '8svskhd@gmail.com');
