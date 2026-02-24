import { supabase } from '@/integrations/supabase/client';
import type { PressAccount, PressRotation, Target } from '@/types/foia';

/**
 * Get the current rotation month in YYYY-MM format.
 */
export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get N months prior to the given month.
 */
export function getPriorMonths(month: string, count: number): string[] {
  const [year, m] = month.split('-').map(Number);
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(year, m - 1 - i, 1);
    result.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    );
  }
  return result;
}

/**
 * Generate the next month's rotation for all active targets.
 * Algorithm:
 * 1. Get last N months history for each target (N = # press accounts)
 * 2. Find accounts not used in the cooldown window
 * 3. If all accounts used, pick the one with the oldest last assignment
 *
 * Returns count of rotations created.
 */
export async function generateMonthlyRotation(
  month: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ created: number; skipped: number; errors: number }> {
  // Fetch all active targets that have FOIA URLs
  const { data: targets, error: targetsError } = await supabase
    .from('targets')
    .select('id')
    .not('foia_url', 'is', null)
    .eq('is_duplicate', false);

  if (targetsError) throw targetsError;
  if (!targets || targets.length === 0) return { created: 0, skipped: 0, errors: 0 };

  // Fetch all active press accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('press_accounts')
    .select('*')
    .eq('is_active', true);

  if (accountsError) throw accountsError;
  if (!accounts || accounts.length === 0) throw new Error('No active press accounts found');

  const cooldownMonths = accounts.length;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  // Check existing rotations for this month to avoid re-creating
  const { data: existing } = await supabase
    .from('press_rotation')
    .select('target_id')
    .eq('rotation_month', month);

  const alreadyRotated = new Set((existing || []).map((r: { target_id: string }) => r.target_id));

  // Fetch all rotation history for all targets in one query (last 12 months)
  const pastMonths = getPriorMonths(month, 12);
  const { data: historyAll } = await supabase
    .from('press_rotation')
    .select('target_id, press_account_id, rotation_month')
    .in('rotation_month', pastMonths)
    .order('rotation_month', { ascending: false });

  // Build a history map: target_id -> array of { press_account_id, rotation_month }
  const historyMap = new Map<string, Array<{ press_account_id: string; rotation_month: string }>>();
  for (const row of historyAll || []) {
    if (!historyMap.has(row.target_id)) {
      historyMap.set(row.target_id, []);
    }
    historyMap.get(row.target_id)!.push(row);
  }

  const BATCH_SIZE = 100;
  const inserts: Array<{ target_id: string; press_account_id: string; rotation_month: string }> = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];

    if (alreadyRotated.has(target.id)) {
      skipped++;
      continue;
    }

    const history = historyMap.get(target.id) || [];
    // Sort by month descending (most recent first)
    history.sort((a, b) => b.rotation_month.localeCompare(a.rotation_month));

    const recentlyUsed = new Set(
      history.slice(0, cooldownMonths).map((h) => h.press_account_id)
    );

    const available = accounts.filter((a: PressAccount) => !recentlyUsed.has(a.id));

    let chosen: PressAccount;
    if (available.length > 0) {
      // Pick the one with the oldest last use among available, or any if never used
      const withLastUse = available.map((a: PressAccount) => {
        const lastUse = history.find((h) => h.press_account_id === a.id);
        return { account: a, lastMonth: lastUse?.rotation_month ?? '0000-00' };
      });
      withLastUse.sort((a, b) => a.lastMonth.localeCompare(b.lastMonth));
      chosen = withLastUse[0].account;
    } else {
      // All accounts have been used in cooldown window — pick oldest assignment
      const withLastUse = accounts.map((a: PressAccount) => {
        const lastUse = history.find((h) => h.press_account_id === a.id);
        return { account: a, lastMonth: lastUse?.rotation_month ?? '0000-00' };
      });
      withLastUse.sort((a, b) => a.lastMonth.localeCompare(b.lastMonth));
      chosen = withLastUse[0].account;
    }

    inserts.push({
      target_id: target.id,
      press_account_id: chosen.id,
      rotation_month: month,
    });

    if (onProgress && i % 50 === 0) {
      onProgress(i, targets.length);
    }

    // Flush in batches
    if (inserts.length >= BATCH_SIZE) {
      const { error } = await supabase.from('press_rotation').insert(inserts);
      if (error) {
        errors += inserts.length;
      } else {
        created += inserts.length;
      }
      inserts.length = 0;
    }
  }

  // Flush remaining
  if (inserts.length > 0) {
    const { error } = await supabase.from('press_rotation').insert(inserts);
    if (error) {
      errors += inserts.length;
    } else {
      created += inserts.length;
    }
  }

  return { created, skipped, errors };
}

/**
 * Get the press account assigned to a target for the current month.
 */
export async function getTargetRotationForMonth(
  targetId: string,
  month: string
): Promise<PressRotation | null> {
  const { data, error } = await supabase
    .from('press_rotation')
    .select('*, press_account:press_accounts(*)')
    .eq('target_id', targetId)
    .eq('rotation_month', month)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as PressRotation;
}
