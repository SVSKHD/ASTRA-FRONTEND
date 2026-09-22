-- Astra/Aureon Firestore compatibility storage on Supabase.
--
-- The frontend keeps its existing collection/document API while rows are stored
-- in one Postgres table. "namespace" is the old Firestore collection path,
-- "doc_id" is the old document id, and "data" is the document body.
--
-- Firebase Auth remains the login provider during phase 1. Supabase Third-party
-- Auth must trust the Firebase project so auth.jwt()->>'sub' is the Firebase uid.

create table if not exists public.astra_documents (
  namespace text not null,
  doc_id text not null,
  user_id text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (namespace, doc_id)
);

alter table public.astra_documents enable row level security;
alter table public.astra_documents replica identity full;

create index if not exists astra_documents_namespace_user_idx
  on public.astra_documents (namespace, user_id);

create index if not exists astra_documents_ist_date_idx
  on public.astra_documents (namespace, user_id, (data ->> 'istDate'))
  where data ? 'istDate';

create index if not exists astra_documents_date_idx
  on public.astra_documents (namespace, user_id, (data ->> 'date'))
  where data ? 'date';

create index if not exists astra_documents_category_idx
  on public.astra_documents (namespace, (data ->> 'category'))
  where data ? 'category';

drop policy if exists "astra read own and public" on public.astra_documents;
create policy "astra read own and public"
on public.astra_documents
for select
to anon, authenticated
using (
  user_id = nullif(auth.jwt() ->> 'sub', '')
  or namespace = 'forex'
  or (
    namespace = 'aureon-shares'
    and data ->> 'isPublic' = 'true'
  )
);

drop policy if exists "astra insert own" on public.astra_documents;
create policy "astra insert own"
on public.astra_documents
for insert
to anon, authenticated
with check (
  user_id = nullif(auth.jwt() ->> 'sub', '')
  and user_id is not null
);

drop policy if exists "astra update own" on public.astra_documents;
create policy "astra update own"
on public.astra_documents
for update
to anon, authenticated
using (
  user_id = nullif(auth.jwt() ->> 'sub', '')
  and user_id is not null
)
with check (
  user_id = nullif(auth.jwt() ->> 'sub', '')
  and user_id is not null
);

drop policy if exists "astra delete own" on public.astra_documents;
create policy "astra delete own"
on public.astra_documents
for delete
to anon, authenticated
using (
  user_id = nullif(auth.jwt() ->> 'sub', '')
  and user_id is not null
);

-- Atomic Firestore-style setDoc / merge. The uid comes from the verified
-- Firebase JWT received through Supabase Third-party Auth; the browser never
-- chooses the row owner.
create or replace function public.astra_set_document(
  p_namespace text,
  p_doc_id text,
  p_data jsonb,
  p_merge boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid text := nullif(auth.jwt() ->> 'sub', '');
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.astra_documents (namespace, doc_id, user_id, data, updated_at)
  values (p_namespace, p_doc_id, v_uid, coalesce(p_data, '{}'::jsonb), now())
  on conflict (namespace, doc_id) do update
  set
    data = case
      when p_merge
        then public.astra_documents.data || excluded.data
      else excluded.data
    end,
    user_id = excluded.user_id,
    updated_at = now()
  where public.astra_documents.user_id = v_uid;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'document is owned by another user' using errcode = '42501';
  end if;
end;
$$;

grant select, insert, update, delete on public.astra_documents to anon, authenticated;
grant all on public.astra_documents to service_role;
grant execute on function public.astra_set_document(text, text, jsonb, boolean)
  to anon, authenticated, service_role;

-- Realtime is used to preserve the existing onSnapshot behaviour. Make this
-- migration idempotent so it can be run again safely.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'astra_documents'
  ) then
    alter publication supabase_realtime add table public.astra_documents;
  end if;
end
$$;
