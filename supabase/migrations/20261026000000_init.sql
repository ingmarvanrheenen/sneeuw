-- Sneeuw Daddy — database schema
-- Eén generieke `records` tabel voor alle offline-first data (dagen, tricks, doelen, gear, reizen, media),
-- plus crews, profielen, reacties en coach-gebruik.

create extension if not exists pgcrypto;

-- ── Profielen ────────────────────────────────────────────────────────────
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Rider',
  data jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Profiel automatisch aanmaken bij registratie
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Rider'))
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Crews ────────────────────────────────────────────────────────────────
create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

-- Security definer helpers om recursie in RLS te voorkomen
create function public.my_crew_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select crew_id from crew_members where user_id = auth.uid()
$$;

create function public.is_crew_mate(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from crew_members a join crew_members b on a.crew_id = b.crew_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

create function public.create_crew(crew_name text) returns public.crews
language plpgsql security definer set search_path = public as $$
declare
  c public.crews;
  code text;
begin
  if auth.uid() is null then raise exception 'niet ingelogd'; end if;
  insert into profiles (user_id) values (auth.uid()) on conflict do nothing;
  loop
    code := upper(substr(translate(encode(gen_random_bytes(6), 'base64'), '/+=0O1lI', ''), 1, 6));
    exit when char_length(code) = 6 and not exists (select 1 from crews where invite_code = code);
  end loop;
  insert into crews (name, invite_code, created_by) values (crew_name, code, auth.uid()) returning * into c;
  insert into crew_members (crew_id, user_id, role) values (c.id, auth.uid(), 'owner');
  return c;
end $$;

create function public.join_crew(code text) returns public.crews
language plpgsql security definer set search_path = public as $$
declare
  c public.crews;
begin
  if auth.uid() is null then raise exception 'niet ingelogd'; end if;
  select * into c from crews where invite_code = upper(code);
  if c.id is null then raise exception 'Crew-code bestaat niet'; end if;
  insert into profiles (user_id) values (auth.uid()) on conflict do nothing;
  insert into crew_members (crew_id, user_id) values (c.id, auth.uid()) on conflict do nothing;
  return c;
end $$;

create function public.crew_members_with_stats(cid uuid) returns table (
  user_id uuid, role text, display_name text, stats jsonb
)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.role, p.display_name, p.stats
  from crew_members m join profiles p on p.user_id = m.user_id
  where m.crew_id = cid and cid in (select my_crew_ids())
  order by (p.stats ->> 'xp')::int desc nulls last
$$;

-- ── Records (offline-first sync) ─────────────────────────────────────────
create table public.records (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  data jsonb not null,
  crew_id uuid references public.crews (id) on delete set null,
  deleted boolean not null default false,
  client_updated_at bigint not null,
  updated_at timestamptz not null default now()
);

create index records_user_updated on public.records (user_id, updated_at);
create index records_crew on public.records (crew_id, updated_at desc) where crew_id is not null;

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_updated_at();

-- ── Reacties ─────────────────────────────────────────────────────────────
create table public.reactions (
  record_id uuid not null references public.records (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now(),
  primary key (record_id, user_id, emoji)
);

-- ── Coach gebruik (budget-bewaking) ──────────────────────────────────────
create table public.coach_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  messages int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);

-- ── Row Level Security ───────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.records enable row level security;
alter table public.reactions enable row level security;
alter table public.coach_usage enable row level security;

create policy "profiel: zelf of crew" on public.profiles for select
  using (user_id = auth.uid() or public.is_crew_mate(user_id));
create policy "profiel: zelf schrijven" on public.profiles for insert with check (user_id = auth.uid());
create policy "profiel: zelf updaten" on public.profiles for update using (user_id = auth.uid());

create policy "crew: leden zien" on public.crews for select using (id in (select public.my_crew_ids()));
create policy "crew: eigenaar wijzigt" on public.crews for update using (created_by = auth.uid());
create policy "crew: eigenaar verwijdert" on public.crews for delete using (created_by = auth.uid());

create policy "leden: zien" on public.crew_members for select using (crew_id in (select public.my_crew_ids()));
create policy "leden: zelf verlaten" on public.crew_members for delete using (user_id = auth.uid());

create policy "records: eigen of crew" on public.records for select
  using (user_id = auth.uid() or (crew_id is not null and crew_id in (select public.my_crew_ids())));
create policy "records: eigen insert" on public.records for insert
  with check (user_id = auth.uid() and (crew_id is null or crew_id in (select public.my_crew_ids())));
create policy "records: eigen update" on public.records for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (crew_id is null or crew_id in (select public.my_crew_ids())));

create policy "reacties: crew ziet" on public.reactions for select
  using (exists (select 1 from public.records r where r.id = record_id
                 and (r.user_id = auth.uid() or r.crew_id in (select public.my_crew_ids()))));
create policy "reacties: zelf plaatsen" on public.reactions for insert
  with check (user_id = auth.uid() and exists (select 1 from public.records r where r.id = record_id
                 and (r.user_id = auth.uid() or r.crew_id in (select public.my_crew_ids()))));
create policy "reacties: zelf verwijderen" on public.reactions for delete using (user_id = auth.uid());

create policy "coach: eigen gebruik zien" on public.coach_usage for select using (user_id = auth.uid());

-- ── Storage: foto's en video's ───────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)
on conflict (id) do nothing;

create policy "media: upload in eigen map" on storage.objects for insert
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media: eigen map updaten" on storage.objects for update
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media: eigen map verwijderen" on storage.objects for delete
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
-- Lezen: eigen bestanden, of bestanden die aan een met jouw crew gedeeld media-record hangen
create policy "media: lezen eigen of crew" on storage.objects for select
  using (bucket_id = 'media' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.records r
      where r.kind = 'media' and r.data ->> 'path' = storage.objects.name
        and r.crew_id in (select public.my_crew_ids())
    )
  ));
