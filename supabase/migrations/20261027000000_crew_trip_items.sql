-- Groepslijst voor een crew-trip: "wie neemt de speaker mee?"
-- Trips zelf blijven records van de eigenaar. Deze lijst is van de hele crew: iedereen mag
-- dingen toevoegen, claimen en afvinken. Verwijderen kan wie het toevoegde of de trip-eigenaar.

create table public.crew_trip_items (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  trip_id uuid not null references public.records (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  claimed_by uuid references auth.users (id) on delete set null,
  done boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index crew_trip_items_trip on public.crew_trip_items (trip_id, created_at);

create trigger crew_trip_items_touch before update on public.crew_trip_items
  for each row execute function public.touch_updated_at();

-- Hoort deze trip bij een crew waar jij in zit? (security definer: records-RLS niet nog eens doorlopen)
create function public.is_crew_trip(tid uuid, cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from records r
    where r.id = tid and r.kind = 'trip' and not r.deleted
      and r.crew_id = cid and cid in (select my_crew_ids())
  )
$$;

alter table public.crew_trip_items enable row level security;

create policy "groepslijst: crew ziet" on public.crew_trip_items for select
  using (crew_id in (select public.my_crew_ids()));

create policy "groepslijst: crew voegt toe" on public.crew_trip_items for insert
  with check (
    created_by = auth.uid()
    and public.is_crew_trip(trip_id, crew_id)
    and (claimed_by is null or claimed_by = auth.uid())
  );

create policy "groepslijst: crew werkt bij" on public.crew_trip_items for update
  using (crew_id in (select public.my_crew_ids()))
  with check (public.is_crew_trip(trip_id, crew_id));

-- Claimen doe je alleen voor jezelf (of je laat een claim los). Afvinken mag iedereen in de crew.
create function public.crew_trip_items_claim_rule() returns trigger
language plpgsql as $$
begin
  if new.claimed_by is distinct from old.claimed_by
     and new.claimed_by is not null
     and new.claimed_by is distinct from auth.uid() then
    raise exception 'Je kunt alleen zelf iets claimen' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger crew_trip_items_claim before update on public.crew_trip_items
  for each row execute function public.crew_trip_items_claim_rule();

create policy "groepslijst: maker of trip-eigenaar verwijdert" on public.crew_trip_items for delete
  using (
    crew_id in (select public.my_crew_ids())
    and (created_by = auth.uid() or exists (select 1 from public.records r where r.id = trip_id and r.user_id = auth.uid()))
  );

-- id, crew en trip liggen vast; alleen label, claim en afvinken mogen veranderen
revoke update on public.crew_trip_items from authenticated;
grant update (label, claimed_by, done) on public.crew_trip_items to authenticated;
