-- Push-meldingen: per telefoon een abonnement met voorkeuren, plus een logboek zodat elke melding maar één keer gaat.
-- Versturen doet de Edge Function `push` (service role); de app beheert alleen zijn eigen abonnementen.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- alleen echte push-diensten: de server stuurt naar dit adres
  endpoint text not null unique check (
    char_length(endpoint) < 1000
    and endpoint ~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
  ),
  p256dh text not null check (char_length(p256dh) between 80 and 100),
  auth text not null check (char_length(auth) between 16 and 30),
  tz text not null default 'Europe/Amsterdam' check (char_length(tz) < 64),
  crew_days boolean not null default true,
  goals boolean not null default true,
  reminder boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push: eigen abonnementen zien" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "push: eigen voorkeuren" on public.push_subscriptions for update using (user_id = auth.uid());
create policy "push: eigen abonnement weg" on public.push_subscriptions for delete using (user_id = auth.uid());
-- geen insert-policy: aanmelden gaat via save_push_subscription()

revoke insert, update on public.push_subscriptions from authenticated, anon;
grant update (crew_days, goals, reminder, tz) on public.push_subscriptions to authenticated;

-- Aanmelden of bijwerken. Dezelfde telefoon (endpoint) met een ander account: die gaat over naar jou,
-- zodat je na wisselen van account niet de meldingen van de vorige krijgt. Max 10 telefoons per account.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_tz text)
returns public.push_subscriptions
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  row public.push_subscriptions;
begin
  if me is null then
    raise exception 'Log eerst in' using errcode = '42501';
  end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id <> me;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, tz)
  values (me, p_endpoint, p_p256dh, p_auth, coalesce(nullif(p_tz, ''), 'Europe/Amsterdam'))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz, updated_at = now()
  returning * into row;
  delete from push_subscriptions where user_id = me and id in (
    select id from push_subscriptions where user_id = me order by updated_at desc offset 10
  );
  return row;
end $$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Welke meldingen al verstuurd zijn (bijv. 'day:<id>', 'reminder:<user>:<datum>'). Alleen de server.
create table public.push_log (
  key text primary key,
  created_at timestamptz not null default now()
);
alter table public.push_log enable row level security;
revoke all on public.push_log from authenticated, anon;
