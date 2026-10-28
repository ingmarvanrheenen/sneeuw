-- Dagopdracht-duwtje: om 9:00 tijdens een trip, als je de opdracht van vandaag nog niet deed. Nieuwe voorkeur per
-- telefoon, standaard aan. Versturen doet de push-function via de bestaande uurlijkse cron; die leest
-- daily_challenges met de service role.
alter table public.push_subscriptions add column challenge boolean not null default true;
grant update (challenge) on public.push_subscriptions to authenticated;
