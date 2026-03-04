import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/externalClient";

type TrialEvent =
  | 'trial_started'
  | 'trial_export_used'
  | 'trial_expired'
  | 'trial_upgraded'
  | 'trial_upgrade_dismissed';

interface EventProperties {
  tier?: string;
  count?: number;
  remaining?: number;
  from_tier?: string;
  to_tier?: string;
  days_remaining?: number;
}

/**
 * Lightweight analytics tracking for trial events.
 * Inserts events into the events table (if available) and logs to console.
 */
export function useTrialAnalytics() {
  const trackEvent = useCallback(async (event: TrialEvent, properties: EventProperties = {}) => {
    console.log(`[TrialAnalytics] ${event}`, properties);

    try {
      // Try to insert into events table if it exists
      await supabase.from('events').insert({
        job_id: 'trial-events',
        type: event,
        ts: new Date().toISOString(),
        payload: properties as unknown as import("@/integrations/supabase/types").Json,
      });
    } catch {
      // Events table may not exist — silent fail
    }
  }, []);

  return { trackEvent };
}
