-- Trip-bingo: afgevinkte vakjes per crewlid per trip. De kaart zelf rekent de app uit (trip + speler);
-- de vakjes staan als content in de app, hier alleen hun id. Iedereen vinkt alleen voor zichzelf af.

create table public.crew_trip_bingo (
  trip_id uuid not null references public.records (id) on delete cascade,
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  square text not null check (square ~ '^[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id, square)
);

alter table public.crew_trip_bingo enable row level security;

create policy "bingo: crew ziet" on public.crew_trip_bingo for select
  using (public.is_crew_trip(trip_id, crew_id));

create policy "bingo: zelf afvinken" on public.crew_trip_bingo for insert
  with check (user_id = auth.uid() and public.is_crew_trip(trip_id, crew_id));

create policy "bingo: zelf uitvinken" on public.crew_trip_bingo for delete
  using (user_id = auth.uid());

-- afvinken is een moment (wie had als eerste bingo), dus niet achteraf aan te passen
revoke update on public.crew_trip_bingo from authenticated;
