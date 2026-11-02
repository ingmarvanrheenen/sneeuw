-- Potje van de trip: wie heeft wat betaald, voor wie, en wie krijgt nog geld van wie (zoals Tricount).
-- Een uitgave: iemand uit de crew betaalde een bedrag (in centen) voor een groep crewgenoten, gelijk verdeeld.
-- Een terugbetaling (kind = 'transfer') is hetzelfde met precies één ontvanger. De stand rekent de app uit.
-- Iedereen in de crew mag een uitgave toevoegen, ook namens een ander (wie betaalde); aanpassen en weghalen doet
-- wie hem toevoegde of wie betaalde, en weghalen ook de trip-eigenaar.

create table public.crew_trip_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.records (id) on delete cascade,
  crew_id uuid not null references public.crews (id) on delete cascade,
  kind text not null default 'expense' check (kind in ('expense', 'transfer')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  amount_cents integer not null check (amount_cents between 1 and 10000000),
  paid_by uuid not null references auth.users (id) on delete cascade,
  split_between uuid[] not null,
  spent_on date,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index crew_trip_expenses_trip on public.crew_trip_expenses (trip_id, created_at);

create trigger crew_trip_expenses_touch before update on public.crew_trip_expenses
  for each row execute function public.touch_updated_at();

-- Wie betaalde en voor wie: allemaal uit de crew, niemand dubbel, minstens één. Terugbetalen: aan één ander.
-- Max 300 per trip (lock per trip, zodat twee tegelijk er niet samen overheen gaan).
create function public.crew_trip_expenses_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
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
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('expenses:' || new.trip_id::text));
    if (select count(*) from crew_trip_expenses where trip_id = new.trip_id) >= 300 then
      raise exception 'Max 300 uitgaven per trip' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger crew_trip_expenses_check before insert or update on public.crew_trip_expenses
  for each row execute function public.crew_trip_expenses_check();

alter table public.crew_trip_expenses enable row level security;

create policy "potje: crew ziet" on public.crew_trip_expenses for select
  using (crew_id in (select public.my_crew_ids()));

create policy "potje: crew voegt toe" on public.crew_trip_expenses for insert
  with check (created_by = auth.uid() and public.is_crew_trip(trip_id, crew_id));

create policy "potje: toevoeger of betaler past aan" on public.crew_trip_expenses for update
  using (crew_id in (select public.my_crew_ids()) and (created_by = auth.uid() or paid_by = auth.uid()))
  with check (public.is_crew_trip(trip_id, crew_id));

create policy "potje: toevoeger, betaler of trip-eigenaar haalt weg" on public.crew_trip_expenses for delete
  using (
    crew_id in (select public.my_crew_ids())
    and (
      created_by = auth.uid()
      or paid_by = auth.uid()
      or exists (select 1 from public.records r where r.id = trip_id and r.user_id = auth.uid())
    )
  );

-- trip, crew, soort en wie hem toevoegde liggen vast
revoke update on public.crew_trip_expenses from authenticated;
grant update (title, amount_cents, paid_by, split_between, spent_on) on public.crew_trip_expenses to authenticated;
