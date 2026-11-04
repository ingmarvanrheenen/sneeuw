-- Trick van de week: elke week (ma t/m zo) een trick voor de crew (afgeleid in de app, niets opgeslagen). Wie
-- hem filmt, deelt de clip zoals altijd met de crew; hier stemt iedereen één keer per week op de beste clip.
-- Niet op je eigen clip, en alleen op een clip uit je eigen crew. Je stem kun je veranderen of intrekken.

create table public.crew_week_votes (
  crew_id uuid not null references public.crews (id) on delete cascade,
  week date not null check (extract(isodow from week) = 1),
  voter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_id uuid not null references public.records (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (crew_id, week, voter)
);

create index crew_week_votes_week on public.crew_week_votes (crew_id, week);

create function public.crew_week_votes_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  select r.user_id into owner from records r
  where r.id = new.media_id and r.kind = 'media' and r.crew_id = new.crew_id and not r.deleted;
  if owner is null then
    raise exception 'Die clip is niet van je crew' using errcode = '23514';
  end if;
  if owner = new.voter then
    raise exception 'Op je eigen clip stem je niet' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger crew_week_votes_check before insert or update on public.crew_week_votes
  for each row execute function public.crew_week_votes_check();

alter table public.crew_week_votes enable row level security;

create policy "trick van de week: crew ziet de stemmen" on public.crew_week_votes for select
  using (crew_id in (select public.my_crew_ids()));

create policy "trick van de week: eigen stem" on public.crew_week_votes for insert
  with check (voter = auth.uid() and crew_id in (select public.my_crew_ids()));

create policy "trick van de week: stem veranderen" on public.crew_week_votes for update
  using (voter = auth.uid())
  with check (voter = auth.uid() and crew_id in (select public.my_crew_ids()));

create policy "trick van de week: stem intrekken" on public.crew_week_votes for delete
  using (voter = auth.uid());

-- alleen je keuze verander je; crew, week en wie stemde liggen vast
revoke update on public.crew_week_votes from authenticated;
grant update (media_id) on public.crew_week_votes to authenticated;
