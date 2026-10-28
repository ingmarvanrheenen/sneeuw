-- Pow-alarm: melding als er verse sneeuw voorspeld wordt bij je volgende trip. Nieuwe voorkeur per telefoon,
-- standaard aan (net als de andere meldingen). Versturen doet de push-function via de bestaande uurlijkse cron.
alter table public.push_subscriptions add column pow boolean not null default true;
grant update (pow) on public.push_subscriptions to authenticated;
