-- "Log je dag"-herinnering: elk uur de push-function aanroepen. Eenmalig draaien in de Supabase SQL Editor.
-- Geen migratie: het is projectspecifiek, en pg_cron/pg_net bestaan niet in de lokale testdatabase.
-- Veilig om vaker aan te roepen: de function stuurt alleen om 17:00 lokale tijd (van je telefoon),
-- alleen tijdens een trip als je nog niks logde, en per persoon maar één keer per dag.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('sneeuw-push-reminder') where exists (select 1 from cron.job where jobname = 'sneeuw-push-reminder');

select cron.schedule(
  'sneeuw-push-reminder',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://vaikzodfgmgwwqevyxww.supabase.co/functions/v1/push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"task": "reminder"}'::jsonb
  )
  $$
);
