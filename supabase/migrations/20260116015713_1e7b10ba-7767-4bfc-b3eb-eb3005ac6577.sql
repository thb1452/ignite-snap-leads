-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create the weekly digest cron job
-- Runs every Monday at 8:00 AM EST (13:00 UTC)
SELECT cron.schedule(
  'weekly-digest-email',
  '0 13 * * 1',  -- 8am EST = 13:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://ojyxblegxpdgaqiscxpz.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);