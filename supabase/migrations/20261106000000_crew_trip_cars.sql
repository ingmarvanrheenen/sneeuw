-- Wie rijdt met wie: per crew-trip auto's met plekken. Wie rijdt biedt een auto aan (naam, plekken, vertrek,
-- bagage-notitie); crewgenoten pakken een plek. Eén plek per persoon per trip, nooit meer mensen dan plekken,
-- en wie rijdt zit niet ook nog bij een ander in de auto. Dat bewaakt de database zelf (triggers met lock).

create table public.crew_trip_cars (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  trip_id uuid not null references public.records (id) on delete cascade,
  driver uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  seats smallint not null check (seats between 1 and 8),
  departs text check (departs is null or char_length(departs) <= 60),
  note text check (note is null or char_length(note) <= 120),
  created_at timestamptz not null default now(),
  -- één auto per bestuurder per trip
  unique (trip_id, driver)
);

create table public.crew_trip_riders (
  trip_id uuid not null references public.records (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  car_id uuid not null references public.crew_trip_cars (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- één plek per persoon per trip
  primary key (trip_id, user_id)
);

create index crew_trip_cars_trip on public.crew_trip_cars (trip_id, created_at);
create index crew_trip_riders_car on public.crew_trip_riders (car_id);

alter table public.crew_trip_cars enable row level security;
alter table public.crew_trip_riders enable row level security;

-- Auto's: de crew ziet ze; je biedt alleen je eigen auto aan; aanpassen doet de bestuurder;
-- weghalen de bestuurder of de trip-eigenaar.
create policy "auto's: crew ziet" on public.crew_trip_cars for select
  using (crew_id in (select public.my_crew_ids()));

create policy "auto's: eigen auto aanbieden" on public.crew_trip_cars for insert
  with check (driver = auth.uid() and public.is_crew_trip(trip_id, crew_id));

create policy "auto's: bestuurder past aan" on public.crew_trip_cars for update
  using (driver = auth.uid())
  with check (driver = auth.uid() and public.is_crew_trip(trip_id, crew_id));

create policy "auto's: bestuurder of trip-eigenaar haalt weg" on public.crew_trip_cars for delete
  using (
    crew_id in (select public.my_crew_ids())
    and (driver = auth.uid() or exists (select 1 from public.records r where r.id = trip_id and r.user_id = auth.uid()))
  );

-- id, crew, trip en bestuurder liggen vast
revoke update on public.crew_trip_cars from authenticated;
grant update (label, seats, departs, note) on public.crew_trip_cars to authenticated;

-- Plekken: de crew ziet wie waar zit; een plek pak je alleen voor jezelf; loslaten doe je zelf,
-- of de bestuurder haalt je uit de eigen auto.
create policy "plekken: crew ziet" on public.crew_trip_riders for select
  using (exists (select 1 from public.crew_trip_cars c where c.id = car_id and c.crew_id in (select public.my_crew_ids())));

create policy "plekken: zelf instappen" on public.crew_trip_riders for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.crew_trip_cars c where c.id = car_id and c.trip_id = trip_id and public.is_crew_trip(c.trip_id, c.crew_id))
  );

create policy "plekken: zelf of bestuurder haalt weg" on public.crew_trip_riders for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from public.crew_trip_cars c where c.id = car_id and c.driver = auth.uid())
  );
-- overstappen = weghalen en opnieuw instappen; geen update
revoke update on public.crew_trip_riders from authenticated;

-- Niet voller dan de plekken, en wie rijdt stapt niet bij een ander in. De lock op de auto zorgt dat twee
-- mensen die tegelijk de laatste plek pakken niet allebei binnenkomen.
create function public.crew_trip_riders_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cap smallint;
  taken int;
begin
  select seats into cap from crew_trip_cars where id = new.car_id for update;
  select count(*) into taken from crew_trip_riders where car_id = new.car_id;
  if taken >= cap then
    raise exception 'Deze auto zit vol' using errcode = '23514';
  end if;
  if exists (select 1 from crew_trip_cars where trip_id = new.trip_id and driver = new.user_id) then
    raise exception 'Je rijdt zelf al' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger crew_trip_riders_check before insert on public.crew_trip_riders
  for each row execute function public.crew_trip_riders_check();

-- Minder plekken dan er al mensen in zitten mag niet; en wie al meerijdt kan niet ook nog een auto aanbieden.
create function public.crew_trip_cars_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.seats < (select count(*) from crew_trip_riders where car_id = new.id) then
    raise exception 'Er zitten al meer mensen in deze auto' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and exists (select 1 from crew_trip_riders where trip_id = new.trip_id and user_id = new.driver) then
    raise exception 'Je rijdt al mee met iemand anders' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger crew_trip_cars_check before insert or update on public.crew_trip_cars
  for each row execute function public.crew_trip_cars_check();
