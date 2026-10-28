-- S.N.O.W.: zoals S.K.A.T.E., maar op de piste. Een potje hoort bij een crew; de spelers zijn crewleden.
-- De database bewaart alleen de zetten (wie, welke trick, geland of niet). De stand (letters, wie aan de
-- beurt is, wie wint) rekent de app daaruit uit, net als XP. Elke zet heeft een volgnummer: twee telefoons
-- die tegelijk dezelfde beurt invullen botsen op de primary key, en de tweede laadt opnieuw.

create table public.snow_games (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  -- speelvolgorde
  players uuid[] not null check (cardinality(players) between 2 and 8),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index snow_games_crew on public.snow_games (crew_id, created_at desc);

create table public.snow_moves (
  game_id uuid not null references public.snow_games (id) on delete cascade,
  seq int not null check (seq between 0 and 499),
  kind text not null check (kind in ('set', 'match')),
  player uuid not null,
  trick_id text not null check (trick_id ~ '^[a-z0-9-]{1,40}$'),
  landed boolean not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, seq)
);

-- Alle spelers verschillend en allemaal lid van de crew.
create function public.snow_players_ok(cid uuid, ps uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select cardinality(ps) = (select count(distinct p) from unnest(ps) p)
    and not exists (
      select 1 from unnest(ps) p
      where not exists (select 1 from crew_members m where m.crew_id = cid and m.user_id = p)
    )
$$;

-- Zit jij in de crew van dit potje? (security definer: geen RLS-lus tussen de twee tabellen)
create function public.is_my_snow_game(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from snow_games g where g.id = gid and g.crew_id in (select my_crew_ids()))
$$;

create function public.snow_is_player(gid uuid, p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from snow_games g where g.id = gid and p = any (g.players))
$$;

-- Volgende vrije volgnummer: zetten sluiten zonder gaten op elkaar aan.
create function public.snow_next_seq(gid uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(seq) + 1, 0) from snow_moves where game_id = gid
$$;

alter table public.snow_games enable row level security;
alter table public.snow_moves enable row level security;

create policy "snow: crew ziet potjes" on public.snow_games for select
  using (crew_id in (select public.my_crew_ids()));

create policy "snow: crewlid start een potje met crewleden" on public.snow_games for insert
  with check (created_by = auth.uid() and crew_id in (select public.my_crew_ids()) and public.snow_players_ok(crew_id, players));

create policy "snow: maker gooit potje weg" on public.snow_games for delete
  using (created_by = auth.uid());

revoke update on public.snow_games from authenticated;

create policy "snow: crew ziet zetten" on public.snow_moves for select
  using (public.is_my_snow_game(game_id));

-- elke telefoon in de crew mag een poging invullen, maar alleen voor een speler van dit potje en als volgende zet
create policy "snow: crewlid vult de volgende zet in" on public.snow_moves for insert
  with check (
    created_by = auth.uid()
    and public.is_my_snow_game(game_id)
    and public.snow_is_player(game_id, player)
    and seq = public.snow_next_seq(game_id)
  );

-- ongedaan maken: alleen de laatste zet
create policy "snow: crewlid haalt de laatste zet weg" on public.snow_moves for delete
  using (public.is_my_snow_game(game_id) and seq = public.snow_next_seq(game_id) - 1);

revoke update on public.snow_moves from authenticated;
