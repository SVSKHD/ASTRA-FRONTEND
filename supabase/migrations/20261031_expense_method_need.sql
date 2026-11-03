-- Expenses gain what paid for them and whether they had to be spent (section 35),
-- and the currency they were paid in (section 35c). `amount` stays in INR; a
-- foreign expense also keeps the amount paid and the rate it was converted at.
--
-- Defaults match what the app reads for a row that predates the fields: paid
-- from the bank and essential, which invents no card debt and accuses nobody of
-- waste. Apply before deploying a build that writes them.
alter table public.expenses
  add column if not exists method text not null default 'debit'
    check (method in ('card', 'debit', 'cash')),
  add column if not exists need text not null default 'essential'
    check (need in ('essential', 'lifestyle', 'avoidable')),
  add column if not exists currency text not null default 'INR'
    check (currency ~ '^[A-Z]{3}$'),
  add column if not exists original_amount double precision check (original_amount >= 0),
  add column if not exists fx_rate double precision check (fx_rate > 0);
