-- Programma samen met je crew: je deelt per programma met één crew welke dagen je deed, en ziet die van je
-- crewgenoten. Eén rij per gedane dag; je schrijft en haalt alleen je eigen dagen weg, je crew leest mee.
-- Alleen kant-en-klare programma's (ids uit src/content/programs.ts): die kent iedereen in de crew.

create table public.crew_program_days (
  crew_id uuid not null references public.crews (id) on delete cascade,
  program_id text not null check (program_id ~ '^[a-z0-9-]{1,40}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day smallint not null check (day between 0 and 13),
  done_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (crew_id, program_id, user_id, day)
);

create index crew_program_days_crew on public.crew_program_days (crew_id, program_id);

alter table public.crew_program_days enable row level security;

create policy "programma: crew ziet" on public.crew_program_days for select
  using (crew_id in (select public.my_crew_ids()));

create policy "programma: eigen dag in je eigen crew" on public.crew_program_days for insert
  with check (user_id = auth.uid() and crew_id in (select public.my_crew_ids()));

create policy "programma: eigen dag weghalen" on public.crew_program_days for delete
  using (user_id = auth.uid());

-- aanpassen hoeft niet: een dag is gedaan of niet
revoke update on public.crew_program_days from authenticated;
