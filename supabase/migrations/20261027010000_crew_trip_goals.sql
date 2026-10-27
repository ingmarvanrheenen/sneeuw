-- Crew-doelen voor een trip: "iedereen een rode piste". Iedereen vinkt voor zichzelf af.
-- Doel toevoegen: iedereen in de crew. Doel verwijderen: wie het maakte of de trip-eigenaar.
-- Afvinken: alleen voor jezelf.

create table public.crew_trip_goals (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  trip_id uuid not null references public.records (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index crew_trip_goals_trip on public.crew_trip_goals (trip_id, created_at);

create table public.crew_trip_goal_done (
  goal_id uuid not null references public.crew_trip_goals (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (goal_id, user_id)
);

-- Zit jij in de crew van dit doel? (security definer: geen RLS-lus tussen de twee tabellen)
create function public.is_my_crew_goal(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crew_trip_goals g where g.id = gid and g.crew_id in (select my_crew_ids()))
$$;

alter table public.crew_trip_goals enable row level security;
alter table public.crew_trip_goal_done enable row level security;

create policy "crewdoelen: crew ziet" on public.crew_trip_goals for select
  using (crew_id in (select public.my_crew_ids()));

create policy "crewdoelen: crew voegt toe" on public.crew_trip_goals for insert
  with check (created_by = auth.uid() and public.is_crew_trip(trip_id, crew_id));

create policy "crewdoelen: maker of trip-eigenaar verwijdert" on public.crew_trip_goals for delete
  using (
    crew_id in (select public.my_crew_ids())
    and (created_by = auth.uid() or exists (select 1 from public.records r where r.id = trip_id and r.user_id = auth.uid()))
  );

-- titel aanpassen mag de maker; crew en trip liggen vast
create policy "crewdoelen: maker past aan" on public.crew_trip_goals for update
  using (created_by = auth.uid() and crew_id in (select public.my_crew_ids()))
  with check (created_by = auth.uid());
revoke update on public.crew_trip_goals from authenticated;
grant update (title) on public.crew_trip_goals to authenticated;

create policy "gehaald: crew ziet" on public.crew_trip_goal_done for select
  using (public.is_my_crew_goal(goal_id));

create policy "gehaald: alleen jezelf afvinken" on public.crew_trip_goal_done for insert
  with check (user_id = auth.uid() and public.is_my_crew_goal(goal_id));

create policy "gehaald: alleen jezelf uitvinken" on public.crew_trip_goal_done for delete
  using (user_id = auth.uid());

revoke update on public.crew_trip_goal_done from authenticated;
