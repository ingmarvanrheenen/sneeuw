-- Huisje-briefje per crew-trip: adres, wifi, in- en uitchecken, eerste lift en vrije notities, plus een kookrooster.
-- Het briefje is van de hele crew: iedereen vult aan (laatste wijziging wint per veld). Koken claim je alleen
-- voor jezelf; het menu past de kok aan; weghalen doet de kok of de trip-eigenaar.

create table public.crew_trip_house (
  trip_id uuid primary key references public.records (id) on delete cascade,
  crew_id uuid not null references public.crews (id) on delete cascade,
  address text check (address is null or char_length(address) <= 160),
  wifi_name text check (wifi_name is null or char_length(wifi_name) <= 60),
  wifi_code text check (wifi_code is null or char_length(wifi_code) <= 60),
  checkin text check (checkin is null or char_length(checkin) <= 60),
  checkout text check (checkout is null or char_length(checkout) <= 60),
  first_lift text check (first_lift is null or char_length(first_lift) <= 60),
  notes text check (notes is null or char_length(notes) <= 1000),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- wie het laatst iets aanpaste, en wanneer: altijd door de database ingevuld
create function public.crew_trip_house_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger crew_trip_house_touch before insert or update on public.crew_trip_house
  for each row execute function public.crew_trip_house_touch();

alter table public.crew_trip_house enable row level security;

create policy "briefje: crew ziet" on public.crew_trip_house for select
  using (crew_id in (select public.my_crew_ids()));

create policy "briefje: crew begint" on public.crew_trip_house for insert
  with check (public.is_crew_trip(trip_id, crew_id));

create policy "briefje: crew vult aan" on public.crew_trip_house for update
  using (crew_id in (select public.my_crew_ids()))
  with check (public.is_crew_trip(trip_id, crew_id));

create policy "briefje: trip-eigenaar haalt weg" on public.crew_trip_house for delete
  using (exists (select 1 from public.records r where r.id = trip_id and r.user_id = auth.uid()));

-- trip en crew liggen vast; de velden mag de crew aanpassen
revoke update on public.crew_trip_house from authenticated;
grant update (address, wifi_name, wifi_code, checkin, checkout, first_lift, notes) on public.crew_trip_house to authenticated;

create table public.crew_trip_cooking (
  trip_id uuid not null references public.records (id) on delete cascade,
  crew_id uuid not null references public.crews (id) on delete cascade,
  day date not null,
  cook uuid not null default auth.uid() references auth.users (id) on delete cascade,
  menu text check (menu is null or char_length(menu) <= 80),
  created_at timestamptz not null default now(),
  -- één kok per avond
  primary key (trip_id, day)
);

alter table public.crew_trip_cooking enable row level security;

create policy "koken: crew ziet" on public.crew_trip_cooking for select
  using (crew_id in (select public.my_crew_ids()));

create policy "koken: zelf claimen" on public.crew_trip_cooking for insert
  with check (cook = auth.uid() and public.is_crew_trip(trip_id, crew_id));

create policy "koken: kok past het menu aan" on public.crew_trip_cooking for update
  using (cook = auth.uid())
  with check (cook = auth.uid());

create policy "koken: kok of trip-eigenaar haalt weg" on public.crew_trip_cooking for delete
  using (
    crew_id in (select public.my_crew_ids())
    and (cook = auth.uid() or exists (select 1 from public.records r where r.id = trip_id and r.user_id = auth.uid()))
  );

revoke update on public.crew_trip_cooking from authenticated;
grant update (menu) on public.crew_trip_cooking to authenticated;
