-- Phase 2, domain 1: trading data out of the JSONB compatibility table.
--
-- See docs/SUPABASE_NORMALISATION_PLAN.md. Trades, expenses and the secured
-- ledger get real tables with typed columns, row-level security and Realtime,
-- and their rows are copied out of public.astra_documents.
--
-- Dacoit signals are NOT here on purpose: their writer is still the Firebase
-- `dacoitSignal` function, so they move with it in phase 4.
--
-- Safe to run more than once. The copy never overwrites a row that already
-- exists, so running it again after the app has started writing to these
-- tables cannot undo a newer edit.
--
-- Owner: `user_id` is text because it still holds the Firebase uid delivered
-- through Supabase third-party auth (phase 3 converts it). Every policy compares
-- it with the `sub` of the verified JWT.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.astra_uid()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

-- Epoch milliseconds (how phase 1 stored every Firestore Timestamp) to
-- timestamptz. Anything that is not a number is treated as absent.
create or replace function public.astra_ms_to_ts(value jsonb)
returns timestamptz
language sql
immutable
as $$
  select case
    when jsonb_typeof(value) = 'number' then to_timestamp((value #>> '{}')::double precision / 1000)
  end
$$;

-- A JSON number as double precision; anything else is absent. The documents
-- were written by the app, but a hand edit in the console can put "abc" in a
-- numeric field, and one bad cast must not abort the copy of every other row.
create or replace function public.astra_num(value jsonb)
returns double precision
language sql
immutable
as $$
  select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::double precision end
$$;

create or replace function public.astra_bool(value jsonb)
returns boolean
language sql
immutable
as $$
  select case when jsonb_typeof(value) = 'boolean' then (value #>> '{}')::boolean end
$$;

-- A 'YYYY-MM-DD' string as a date, or null. The pattern alone is not enough:
-- '2026-02-30' matches it and then fails the cast, and one such row would
-- abort the whole migration — the SQL editor runs it as one transaction.
create or replace function public.astra_date(value text)
returns date
language plpgsql
immutable
as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return value::date;
exception
  when others then
    return null;
end;
$$;

create or replace function public.astra_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table if not exists public.trades (
  user_id text not null default public.astra_uid(),
  -- The client-minted id the row already had. Kept verbatim so a queued write
  -- replayed after the move lands on the same row instead of duplicating it.
  id text not null,
  ist_date date not null,
  ist_time text not null default '',
  entry_at timestamptz,
  exit_at timestamptz,
  ts timestamptz,
  broker_offset_minutes integer not null default 180,
  symbol text not null default '',
  session text not null default 'London' check (session in ('Asia', 'London', 'NY')),
  side text not null default 'buy' check (side in ('buy', 'sell')),
  lot double precision not null default 1,
  entry double precision not null default 0,
  exit double precision not null default 0,
  move double precision not null default 0,
  pl double precision not null default 0,
  note text not null default '',
  -- '' in the old documents meant "no signal"; here that is null.
  signal_id text,
  time_estimated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.expenses (
  user_id text not null default public.astra_uid(),
  id text not null,
  date date not null,
  -- Always a size: the app stores the absolute value and so does this.
  amount double precision not null default 0 check (amount >= 0),
  category text not null default 'Other',
  note text not null default '',
  kind text not null default 'one-off' check (kind in ('one-off', 'recurring')),
  recur_day smallint check (recur_day between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.secured (
  user_id text not null default public.astra_uid(),
  id text not null,
  date date not null,
  amt double precision not null default 0 check (amt >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- The month query every screen runs: one user, a date range.
create index if not exists trades_user_date_idx on public.trades (user_id, ist_date);
create index if not exists expenses_user_date_idx on public.expenses (user_id, date);
create index if not exists secured_user_date_idx on public.secured (user_id, date);

drop trigger if exists trades_touch on public.trades;
create trigger trades_touch before update on public.trades
  for each row execute function public.astra_touch_updated_at();
drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.astra_touch_updated_at();
drop trigger if exists secured_touch on public.secured;
create trigger secured_touch before update on public.secured
  for each row execute function public.astra_touch_updated_at();

-- ---------------------------------------------------------------------------
-- row-level security: every row belongs to exactly one user
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['trades', 'expenses', 'secured'] loop
    execute format('alter table public.%I enable row level security', t);
    -- Realtime delete events carry the whole old row, so a subscriber filtered
    -- on user_id still hears about deletes.
    execute format('alter table public.%I replica identity full', t);

    execute format('drop policy if exists "own rows: read" on public.%I', t);
    execute format('drop policy if exists "own rows: insert" on public.%I', t);
    execute format('drop policy if exists "own rows: update" on public.%I', t);
    execute format('drop policy if exists "own rows: delete" on public.%I', t);

    execute format(
      'create policy "own rows: read" on public.%I for select to authenticated
         using (user_id = public.astra_uid())', t);
    execute format(
      'create policy "own rows: insert" on public.%I for insert to authenticated
         with check (user_id = public.astra_uid())', t);
    -- Both sides: a row cannot be read into, nor handed to another user.
    execute format(
      'create policy "own rows: update" on public.%I for update to authenticated
         using (user_id = public.astra_uid())
         with check (user_id = public.astra_uid())', t);
    execute format(
      'create policy "own rows: delete" on public.%I for delete to authenticated
         using (user_id = public.astra_uid())', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end
$$;

-- Realtime keeps the app's live month listeners working.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['trades', 'expenses', 'secured'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- the copy out of astra_documents
-- ---------------------------------------------------------------------------
--
-- WHICH NAMESPACE. Each user chose where their trades, expenses and secured
-- entries live (`Astra-users/{uid}.tradesCollection` and friends). A rename
-- copied rows to the new collection and never deleted the old one, so the old
-- one can still hold rows that were deleted after the move. Only the namespace
-- the user currently points at is copied; that is the one the app shows.

create or replace view public.astra_trading_sources
with (security_invoker = true) as
with users as (
  select distinct user_id from public.astra_documents where user_id is not null
),
pointers as (
  select
    u.user_id,
    coalesce(nullif(s.data ->> 'tradesCollection', ''), 'astra-trades') as trades_ns,
    coalesce(nullif(s.data ->> 'expensesCollection', ''), 'astra-expenses') as expenses_ns,
    coalesce(nullif(s.data ->> 'securedCollection', ''), 'astra-secured') as secured_ns
  from users u
  left join public.astra_documents s
    on s.namespace = 'Astra-users' and s.doc_id = u.user_id
)
select user_id, 'trades'::text as target, trades_ns as namespace from pointers
union all
select user_id, 'expenses', expenses_ns from pointers
union all
select user_id, 'secured', secured_ns from pointers;

-- The service role reads the whole table; nobody else needs this view.
revoke all on public.astra_trading_sources from anon, authenticated;

insert into public.trades (
  user_id, id, ist_date, ist_time, entry_at, exit_at, ts, broker_offset_minutes,
  symbol, session, side, lot, entry, exit, move, pl, note, signal_id,
  time_estimated, created_at
)
select
  d.user_id,
  d.doc_id,
  -- The stored day when it is a real date, otherwise the day of the entry
  -- instant in IST — the same rule `tradeDocument` uses to derive it.
  coalesce(
    public.astra_date(d.data ->> 'istDate'),
    (public.astra_ms_to_ts(d.data -> 'entryAt') at time zone 'Asia/Kolkata')::date
  ),
  coalesce(d.data ->> 'istTime', ''),
  public.astra_ms_to_ts(d.data -> 'entryAt'),
  public.astra_ms_to_ts(d.data -> 'exitAt'),
  public.astra_ms_to_ts(d.data -> 'ts'),
  coalesce(round(public.astra_num(d.data -> 'brokerOffsetMinutes'))::integer, 180),
  upper(coalesce(d.data ->> 'symbol', '')),
  case when d.data ->> 'session' in ('Asia', 'London', 'NY') then d.data ->> 'session' else 'London' end,
  case when d.data ->> 'side' in ('buy', 'sell') then d.data ->> 'side' else 'buy' end,
  coalesce(public.astra_num(d.data -> 'lot'), 1),
  coalesce(public.astra_num(d.data -> 'entry'), 0),
  coalesce(public.astra_num(d.data -> 'exit'), 0),
  coalesce(public.astra_num(d.data -> 'move'), 0),
  coalesce(public.astra_num(d.data -> 'pl'), 0),
  coalesce(d.data ->> 'note', ''),
  nullif(d.data ->> 'signalId', ''),
  coalesce(public.astra_bool(d.data -> 'timeEstimated'), false),
  coalesce(public.astra_ms_to_ts(d.data -> 'createdAt'), d.updated_at)
from public.astra_documents d
join public.astra_trading_sources src
  on src.target = 'trades' and src.user_id = d.user_id and src.namespace = d.namespace
where coalesce(
  public.astra_date(d.data ->> 'istDate'),
  (public.astra_ms_to_ts(d.data -> 'entryAt') at time zone 'Asia/Kolkata')::date
) is not null
on conflict (user_id, id) do nothing;

insert into public.expenses (user_id, id, date, amount, category, note, kind, recur_day, created_at)
select
  d.user_id,
  d.doc_id,
  public.astra_date(d.data ->> 'date'),
  abs(coalesce(public.astra_num(d.data -> 'amount'), 0)),
  coalesce(nullif(trim(d.data ->> 'category'), ''), 'Other'),
  coalesce(d.data ->> 'note', ''),
  case when d.data ->> 'kind' = 'recurring' then 'recurring' else 'one-off' end,
  case
    when d.data ->> 'kind' = 'recurring'
      and round(public.astra_num(d.data -> 'recurDay')) between 1 and 31
    then round(public.astra_num(d.data -> 'recurDay'))::smallint
  end,
  coalesce(public.astra_ms_to_ts(d.data -> 'createdAt'), d.updated_at)
from public.astra_documents d
join public.astra_trading_sources src
  on src.target = 'expenses' and src.user_id = d.user_id and src.namespace = d.namespace
where public.astra_date(d.data ->> 'date') is not null
on conflict (user_id, id) do nothing;

insert into public.secured (user_id, id, date, amt, note, created_at)
select
  d.user_id,
  d.doc_id,
  public.astra_date(d.data ->> 'date'),
  abs(coalesce(public.astra_num(d.data -> 'amt'), 0)),
  coalesce(d.data ->> 'note', ''),
  coalesce(public.astra_ms_to_ts(d.data -> 'createdAt'), d.updated_at)
from public.astra_documents d
join public.astra_trading_sources src
  on src.target = 'secured' and src.user_id = d.user_id and src.namespace = d.namespace
where public.astra_date(d.data ->> 'date') is not null
on conflict (user_id, id) do nothing;

-- ---------------------------------------------------------------------------
-- what did not come across
-- ---------------------------------------------------------------------------
--
-- A source document with no usable date cannot be placed in a month, so it is
-- not copied — and it was already invisible in the app, which only ever shows
-- a month at a time. This view lists every such document instead of letting it
-- vanish silently. It should be empty; check it before switching the app over:
--
--   select * from public.astra_trading_not_copied;

create or replace view public.astra_trading_not_copied
with (security_invoker = true) as
select src.target, d.user_id, d.namespace, d.doc_id, d.data
from public.astra_documents d
join public.astra_trading_sources src
  on src.user_id = d.user_id and src.namespace = d.namespace
where not exists (
  select 1 from public.trades t
  where src.target = 'trades' and t.user_id = d.user_id and t.id = d.doc_id
)
and not exists (
  select 1 from public.expenses e
  where src.target = 'expenses' and e.user_id = d.user_id and e.id = d.doc_id
)
and not exists (
  select 1 from public.secured s
  where src.target = 'secured' and s.user_id = d.user_id and s.id = d.doc_id
);

revoke all on public.astra_trading_not_copied from anon, authenticated;
