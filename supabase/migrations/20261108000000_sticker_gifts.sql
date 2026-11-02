-- Stickers cadeau doen: een sticker (stemming of crew-reactie) met een kort berichtje aan een crewgenoot.
-- Max 3 per week weggeven (dan blijft het iets bijzonders). Wie hem krijgt, plakt er max 3 op de eigen skipas;
-- die geplakte ziet de crew, de rest alleen jij en wie hem gaf. XP en badges tellen hier niet mee.

create table public.sticker_gifts (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  sticker text not null check (sticker in ('mood1', 'mood2', 'mood3', 'mood4', 'mood5', 'vuur', 'stomp', 'lol', 'rip', 'goat')),
  note text check (note is null or char_length(note) <= 60),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create index sticker_gifts_to on public.sticker_gifts (to_user, created_at desc);
create index sticker_gifts_from on public.sticker_gifts (from_user, created_at desc);

alter table public.sticker_gifts enable row level security;

create policy "stickers: gever en ontvanger zien, de crew ziet wat geplakt is" on public.sticker_gifts for select
  using (from_user = auth.uid() or to_user = auth.uid() or (pinned and public.is_crew_mate(to_user)));

create policy "stickers: geven aan een crewgenoot" on public.sticker_gifts for insert
  with check (from_user = auth.uid() and public.is_crew_mate(to_user));

create policy "stickers: ontvanger plakt" on public.sticker_gifts for update
  using (to_user = auth.uid())
  with check (to_user = auth.uid());

create policy "stickers: ontvanger gooit weg" on public.sticker_gifts for delete
  using (to_user = auth.uid());

-- alleen plakken of losmaken; de rest ligt vast
revoke update on public.sticker_gifts from authenticated;
grant update (pinned) on public.sticker_gifts to authenticated;

-- 3 per week weggeven; max 3 tegelijk op je pas
create function public.sticker_gifts_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.pinned := false;
    perform pg_advisory_xact_lock(hashtext('sticker_gifts:' || new.from_user::text));
    if (select count(*) from sticker_gifts where from_user = new.from_user and created_at > now() - interval '7 days') >= 3 then
      raise exception 'Je hebt deze week al 3 stickers weggegeven' using errcode = '23514';
    end if;
  elsif new.pinned and not old.pinned then
    if (select count(*) from sticker_gifts where to_user = new.to_user and pinned) >= 3 then
      raise exception 'Er zitten al 3 stickers op je skipas' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger sticker_gifts_check before insert or update on public.sticker_gifts
  for each row execute function public.sticker_gifts_check();
