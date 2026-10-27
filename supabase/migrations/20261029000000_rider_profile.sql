-- Rider-profiel. De velden (foto, motto, thuisresort, signature trick, bijnaam) staan in profiles.data
-- en de afgeleide stats in profiles.stats; beide al leesbaar voor je crew. Nieuw: bijnamen die je crew
-- voorstelt en jij goedkeurt, en een maximum op de profielgrootte (de foto is een kleine jpeg).

alter table public.profiles add constraint profiles_data_size check (octet_length(data::text) < 120000);
alter table public.profiles add constraint profiles_stats_size check (octet_length(stats::text) < 20000);

create table public.nicknames (
  id uuid primary key default gen_random_uuid(),
  to_user uuid not null references public.profiles (user_id) on delete cascade,
  from_user uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 30),
  status text not null default 'open' check (status in ('open', 'ok', 'nee')),
  created_at timestamptz not null default now(),
  check (to_user <> from_user)
);

-- dezelfde bijnaam maar één keer voorstellen
create unique index nicknames_once on public.nicknames (to_user, from_user, lower(btrim(nickname)));
create index nicknames_to on public.nicknames (to_user, status);

alter table public.nicknames enable row level security;

-- alleen de voorsteller en de ontvanger zien een voorstel
create policy "bijnaam: betrokkenen zien" on public.nicknames for select
  using (to_user = auth.uid() or from_user = auth.uid());

-- voorstellen aan een crewgenoot, max 3 open voorstellen per persoon
create policy "bijnaam: crewgenoot stelt voor" on public.nicknames for insert
  with check (
    from_user = auth.uid()
    and status = 'open'
    and public.is_crew_mate(to_user)
    and (select count(*) from public.nicknames n where n.from_user = auth.uid() and n.to_user = nicknames.to_user and n.status = 'open') < 3
  );

-- alleen de ontvanger beslist (en alleen over de status)
create policy "bijnaam: ontvanger beslist" on public.nicknames for update
  using (to_user = auth.uid()) with check (to_user = auth.uid());
revoke update on public.nicknames from authenticated, anon;
grant update (status) on public.nicknames to authenticated;

-- intrekken (voorsteller) of opruimen (ontvanger)
create policy "bijnaam: betrokkenen verwijderen" on public.nicknames for delete
  using (to_user = auth.uid() or from_user = auth.uid());
