-- Phase 3: sign-in moved from Firebase to Supabase Auth.
--
-- Every row so far is owned by the Firebase uid (a 28-character string).
-- Signing in with Supabase Auth gives the same person a new id (a uuid), and
-- row-level security compares rows with that id — so until the rows are moved
-- the app sees an empty account. This moves one user's rows across.
--
-- HOW TO USE (Supabase SQL editor):
--
--   1. Sign in to the app once with Supabase (Google). That creates the new
--      account — and, because it looks empty, a fresh workspace for it.
--   2. Find the new id:
--        select id from auth.users where email = 'you@example.com';
--   3. Dry run — counts only, changes nothing:
--        select * from public.astra_remap_user('<old firebase uid>', '<new id>');
--   4. Apply:
--        select * from public.astra_remap_user('<old firebase uid>', '<new id>', true);
--   5. Reload the app.
--
-- The fresh workspace from step 1 is not deleted: it is renamed out of the way
-- ("…__before-remap-<time>") so nothing is lost if step 1 was used for real.
--
-- Runs in one transaction: it moves everything or nothing.

create or replace function public.astra_remap_user(
  p_old text,
  p_new text,
  p_apply boolean default false
)
returns table (what text, affected bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- Namespaces whose document id IS the owner's uid (one document per user).
  keyed text[] := array['aureon-notes', 'Astra-users'];
  stamp text := to_char(now(), 'YYYYMMDD-HH24MISS');
begin
  if coalesce(p_old, '') = '' or coalesce(p_new, '') = '' or p_old = p_new then
    raise exception 'astra_remap_user needs two different, non-empty user ids';
  end if;

  -- 1. What the new account created on its first sign-in, where the old
  --    account has the real thing. Moved aside so the real one can take its id.
  what := 'new-account documents set aside (' || array_to_string(keyed, ', ') || ')';
  select count(*) into affected
  from astra_documents n
  where n.namespace = any (keyed) and n.doc_id = p_new
    and exists (
      select 1 from astra_documents o where o.namespace = n.namespace and o.doc_id = p_old
    );
  return next;
  if p_apply then
    update astra_documents n
    set doc_id = p_new || '__before-remap-' || stamp
    where n.namespace = any (keyed) and n.doc_id = p_new
      and exists (
        select 1 from astra_documents o where o.namespace = n.namespace and o.doc_id = p_old
      );
  end if;

  -- 2. The documents. Owner column, the id of the per-user documents, and the
  --    owner fields stored inside the data (`userId` on owned rows, `ownerId`
  --    on the workspace and on shares) all follow.
  what := 'astra_documents rows';
  select count(*) into affected
  from astra_documents
  where user_id = p_old or (namespace = any (keyed) and doc_id = p_old);
  return next;
  if p_apply then
    update astra_documents
    set
      user_id = p_new,
      doc_id = case when namespace = any (keyed) and doc_id = p_old then p_new else doc_id end,
      data = data
        || case when data ->> 'userId' = p_old then jsonb_build_object('userId', p_new) else '{}'::jsonb end
        || case when data ->> 'ownerId' = p_old then jsonb_build_object('ownerId', p_new) else '{}'::jsonb end,
      updated_at = now()
    where user_id = p_old or (namespace = any (keyed) and doc_id = p_old);
  end if;

  -- 3. The phase-2 tables, when they exist.
  if to_regclass('public.trades') is not null then
    what := 'trades';
    select count(*) into affected from trades where user_id = p_old;
    return next;
    if p_apply then update trades set user_id = p_new where user_id = p_old; end if;
  end if;
  if to_regclass('public.expenses') is not null then
    what := 'expenses';
    select count(*) into affected from expenses where user_id = p_old;
    return next;
    if p_apply then update expenses set user_id = p_new where user_id = p_old; end if;
  end if;
  if to_regclass('public.secured') is not null then
    what := 'secured';
    select count(*) into affected from secured where user_id = p_old;
    return next;
    if p_apply then update secured set user_id = p_new where user_id = p_old; end if;
  end if;

  what := case when p_apply then 'APPLIED' else 'DRY RUN — nothing changed; pass true to apply' end;
  affected := null;
  return next;
end;
$$;

-- An owner-rewriting function is for the SQL editor (the database owner)
-- only. No signed-in user — let alone an anonymous visitor — may call it.
revoke all on function public.astra_remap_user(text, text, boolean) from public, anon, authenticated;
