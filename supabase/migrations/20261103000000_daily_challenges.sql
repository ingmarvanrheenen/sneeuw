-- Dagopdracht: wie de opdracht van vandaag deed. Eén rij per persoon per dag; de opdracht zelf is content in
-- de app (alleen het id staat hier). Jij en je crewgenoten zien hem; alleen jezelf afvinken, rond vandaag.

create table public.daily_challenges (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

create index daily_challenges_date on public.daily_challenges (date);

alter table public.daily_challenges enable row level security;

create policy "dagopdracht: jij en je crew zien" on public.daily_challenges for select
  using (user_id = auth.uid() or public.is_crew_mate(user_id));

-- tot een week terug (offline afgevinkt, later gesynct), niet in de toekomst (een dag speling voor tijdzones)
create policy "dagopdracht: zelf afvinken" on public.daily_challenges for insert
  with check (user_id = auth.uid() and date between current_date - 7 and current_date + 1);

create policy "dagopdracht: zelf omzetten" on public.daily_challenges for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and date between current_date - 7 and current_date + 1);
revoke update on public.daily_challenges from authenticated;
grant update (challenge) on public.daily_challenges to authenticated;

create policy "dagopdracht: zelf uitvinken" on public.daily_challenges for delete
  using (user_id = auth.uid());
