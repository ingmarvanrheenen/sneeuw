-- Trip-toernooi: aan het eind van een crew-trip de beste clips in een bracket (max 8), de crew stemt per duel.
-- De bracket ligt vast bij de start (clips die er later bijkomen schuiven niks op). Een stem is een clip uit de
-- bracket; wie er per duel doorgaat rekent de app uit (meeste stemmen, gelijk = de eerste).

create table public.crew_trip_brackets (
  trip_id uuid primary key references public.records (id) on delete cascade,
  crew_id uuid not null references public.crews (id) on delete cascade,
  entries uuid[] not null check (cardinality(entries) between 2 and 8),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.crew_trip_bracket_votes (
  trip_id uuid not null references public.crew_trip_brackets (trip_id) on delete cascade,
  round smallint not null check (round between 0 and 2),
  match smallint not null check (match between 0 and 3),
  voter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pick uuid not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, round, match, voter)
);

alter table public.crew_trip_brackets enable row level security;
alter table public.crew_trip_bracket_votes enable row level security;

-- Alleen clips die met deze crew gedeeld zijn kunnen in de bracket (geen losse ids van buiten).
create function public.bracket_entries_ok(cid uuid, ids uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(bool_and(exists (
    select 1 from records r where r.id = e and r.kind = 'media' and not r.deleted and r.crew_id = cid
  )), false)
  from unnest(ids) as e
  where cardinality(ids) = (select count(distinct x) from unnest(ids) as x)
$$;

create policy "toernooi: crew ziet" on public.crew_trip_brackets for select
  using (crew_id in (select public.my_crew_ids()));

create policy "toernooi: crew start" on public.crew_trip_brackets for insert
  with check (created_by = auth.uid() and public.is_crew_trip(trip_id, crew_id) and public.bracket_entries_ok(crew_id, entries));

create policy "toernooi: starter of trip-eigenaar begint opnieuw" on public.crew_trip_brackets for delete
  using (
    crew_id in (select public.my_crew_ids())
    and (created_by = auth.uid() or exists (select 1 from public.records r where r.id = trip_id and r.user_id = auth.uid()))
  );
-- geen update: opnieuw beginnen = weghalen en opnieuw starten
revoke update on public.crew_trip_brackets from authenticated;

create policy "toernooistemmen: crew ziet" on public.crew_trip_bracket_votes for select
  using (exists (select 1 from public.crew_trip_brackets b where b.trip_id = crew_trip_bracket_votes.trip_id and b.crew_id in (select public.my_crew_ids())));

-- stemmen op een clip uit de bracket, alleen voor jezelf
create policy "toernooistemmen: zelf stemmen" on public.crew_trip_bracket_votes for insert
  with check (
    voter = auth.uid()
    and exists (
      select 1 from public.crew_trip_brackets b
      where b.trip_id = crew_trip_bracket_votes.trip_id and b.crew_id in (select public.my_crew_ids()) and pick = any (b.entries)
    )
  );

create policy "toernooistemmen: eigen stem omzetten" on public.crew_trip_bracket_votes for update
  using (voter = auth.uid())
  with check (
    voter = auth.uid()
    and exists (select 1 from public.crew_trip_brackets b where b.trip_id = crew_trip_bracket_votes.trip_id and pick = any (b.entries))
  );
revoke update on public.crew_trip_bracket_votes from authenticated;
grant update (pick) on public.crew_trip_bracket_votes to authenticated;

create policy "toernooistemmen: eigen stem intrekken" on public.crew_trip_bracket_votes for delete
  using (voter = auth.uid());
