-- Waar is de crew: je status met één tik (in de lift, op de piste, pauze, in het park, bij het huisje, klaar).
-- Eén rij per persoon; jij en je crewgenoten zien hem. Geen locatie, alleen de status en wanneer je hem zette.
-- Zetten gaat via set_crew_status(), die ook de tijd invult (de app kan geen tijd verzinnen).

create table public.crew_status (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  status text not null check (status in ('lift', 'piste', 'pauze', 'park', 'huisje', 'klaar')),
  updated_at timestamptz not null default now()
);

alter table public.crew_status enable row level security;

create policy "status: jij en je crew zien" on public.crew_status for select
  using (user_id = auth.uid() or public.is_crew_mate(user_id));

create policy "status: eigen status weghalen" on public.crew_status for delete
  using (user_id = auth.uid());

-- geen insert- of update-policy: zetten gaat via de functie hieronder
revoke insert, update on public.crew_status from authenticated, anon;

create function public.set_crew_status(p_status text) returns public.crew_status
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  row public.crew_status;
begin
  if me is null then
    raise exception 'niet ingelogd';
  end if;
  insert into crew_status (user_id, status, updated_at) values (me, p_status, now())
  on conflict (user_id) do update set status = excluded.status, updated_at = now()
  returning * into row;
  return row;
end;
$$;

revoke execute on function public.set_crew_status(text) from public, anon;
grant execute on function public.set_crew_status(text) to authenticated;
