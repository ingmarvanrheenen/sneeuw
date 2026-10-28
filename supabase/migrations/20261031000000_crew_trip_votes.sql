-- Crew-awards: stemronde aan het eind van een trip ("Val van de trip", "Held van de trip").
-- Eén stem per persoon per categorie, alleen op een crewgenoot en niet op jezelf. Je stem omzetten mag.
-- De automatische awards (meeste uren, valkampioen, ...) rekent de app uit de gedeelde dagen; die staan niet hier.

create table public.crew_trip_votes (
  trip_id uuid not null references public.records (id) on delete cascade,
  crew_id uuid not null references public.crews (id) on delete cascade,
  category text not null check (category in ('val', 'held')),
  voter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  candidate uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trip_id, category, voter),
  check (candidate <> voter)
);

-- Zit deze persoon in de crew?
create function public.is_crew_member(cid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crew_members m where m.crew_id = cid and m.user_id = uid)
$$;

alter table public.crew_trip_votes enable row level security;

create policy "stemmen: crew ziet" on public.crew_trip_votes for select
  using (public.is_crew_trip(trip_id, crew_id));

create policy "stemmen: zelf stemmen op een crewgenoot" on public.crew_trip_votes for insert
  with check (voter = auth.uid() and public.is_crew_trip(trip_id, crew_id) and public.is_crew_member(crew_id, candidate));

create policy "stemmen: eigen stem omzetten" on public.crew_trip_votes for update
  using (voter = auth.uid())
  with check (voter = auth.uid() and public.is_crew_trip(trip_id, crew_id) and public.is_crew_member(crew_id, candidate));
revoke update on public.crew_trip_votes from authenticated;
grant update (candidate) on public.crew_trip_votes to authenticated;

create policy "stemmen: eigen stem intrekken" on public.crew_trip_votes for delete
  using (voter = auth.uid());
