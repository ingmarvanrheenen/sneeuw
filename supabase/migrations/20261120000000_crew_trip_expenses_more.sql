-- Potje, meer: uitgaven in CHF met een vaste koers per trip, niet gelijk verdelen (delen per persoon), en een
-- bonnetje (een foto uit je kluis die je met de crew deelt).
-- amount_cents blijft altijd in euro's: daar rekent de stand mee. Bij CHF bewaren we wat je echt betaalde
-- (orig_cents) en de koers (euro per frank). De eerste CHF-uitgave van een trip zet de koers; daarna ligt hij vast.
-- weights hoort bij split_between (zelfde volgorde): 1 tot 20 delen per persoon. Leeg = gelijk verdelen.

alter table public.crew_trip_expenses
  add column currency text not null default 'EUR' check (currency in ('EUR', 'CHF')),
  add column orig_cents integer check (orig_cents between 1 and 10000000),
  add column rate numeric(10, 6) check (rate > 0 and rate < 10),
  add column weights smallint[],
  add column receipt uuid;

create or replace function public.crew_trip_expenses_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
  fixed numeric;
begin
  if not exists (select 1 from crew_members m where m.crew_id = new.crew_id and m.user_id = new.paid_by) then
    raise exception 'Wie betaalde zit niet in de crew' using errcode = '23514';
  end if;
  n := coalesce(array_length(new.split_between, 1), 0);
  if n = 0 or n > 30 then
    raise exception 'Kies voor wie het was' using errcode = '23514';
  end if;
  if n <> (select count(distinct x) from unnest(new.split_between) x) then
    raise exception 'Iemand staat er dubbel in' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(new.split_between) x
    where not exists (select 1 from crew_members m where m.crew_id = new.crew_id and m.user_id = x)
  ) then
    raise exception 'Iemand zit niet in de crew' using errcode = '23514';
  end if;
  if new.kind = 'transfer' and (n <> 1 or new.split_between[1] = new.paid_by) then
    raise exception 'Terugbetalen doe je aan één ander' using errcode = '23514';
  end if;

  -- niet gelijk verdelen: per persoon 1 tot 20 delen, net zoveel als mensen; nooit bij terugbetalen
  if new.weights is not null then
    if new.kind = 'transfer' or coalesce(array_length(new.weights, 1), 0) <> n
      or exists (select 1 from unnest(new.weights) w where w is null or w < 1 or w > 20) then
      raise exception 'Delen per persoon kloppen niet' using errcode = '23514';
    end if;
  end if;

  -- valuta: euro zonder koers; frank met wat je betaalde, de koers, en het bedrag in euro dat erbij hoort
  if new.currency = 'EUR' then
    if new.orig_cents is not null or new.rate is not null then
      raise exception 'Een euro-uitgave heeft geen koers' using errcode = '23514';
    end if;
  else
    if new.orig_cents is null or new.rate is null or abs(new.amount_cents - round(new.orig_cents * new.rate)) > 1 then
      raise exception 'Bedrag in CHF en euro kloppen niet met de koers' using errcode = '23514';
    end if;
    select e.rate into fixed from crew_trip_expenses e
    where e.trip_id = new.trip_id and e.currency = 'CHF' and e.id <> new.id
    order by e.created_at limit 1;
    if fixed is not null and fixed <> new.rate then
      raise exception 'De koers ligt vast voor deze trip' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('expenses:' || new.trip_id::text));
    if (select count(*) from crew_trip_expenses where trip_id = new.trip_id) >= 300 then
      raise exception 'Max 300 uitgaven per trip' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

grant update (currency, orig_cents, rate, weights, receipt) on public.crew_trip_expenses to authenticated;
