-- Verzamelpunt: één pin per crew waar je elkaar treft (lunch, bovenaan de lift), met een label en eventueel een
-- tijd. Iedereen in de crew mag hem zetten, verplaatsen of weghalen. Alleen de pin wordt gedeeld, op het moment
-- dat je hem zet; je eigen plek blijft op je telefoon (de app rekent daar afstand en richting mee uit).

create table public.crew_meetpoints (
  crew_id uuid primary key references public.crews (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  meet_at timestamptz,
  set_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create trigger crew_meetpoints_touch before update on public.crew_meetpoints
  for each row execute function public.touch_updated_at();

alter table public.crew_meetpoints enable row level security;

create policy "verzamelpunt: crew ziet" on public.crew_meetpoints for select
  using (crew_id in (select public.my_crew_ids()));

create policy "verzamelpunt: crew zet" on public.crew_meetpoints for insert
  with check (set_by = auth.uid() and crew_id in (select public.my_crew_ids()));

create policy "verzamelpunt: crew verplaatst" on public.crew_meetpoints for update
  using (crew_id in (select public.my_crew_ids()))
  with check (set_by = auth.uid() and crew_id in (select public.my_crew_ids()));

create policy "verzamelpunt: crew haalt weg" on public.crew_meetpoints for delete
  using (crew_id in (select public.my_crew_ids()));
