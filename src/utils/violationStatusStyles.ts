/**
 * Utility for consistent violation status styling across the app
 */

export interface ViolationStatusStyle {
  badge: string;
  dot: string;
  tooltip: string | null;
}

export function getViolationStatusStyle(status: string): ViolationStatusStyle {
  const statusLower = status.toLowerCase().trim();
  
  // OPEN / Active violations - Red/Orange (urgent)
  if (
    statusLower === 'open' ||
    statusLower.includes('pending summons') ||
    statusLower.includes('repeat violation') ||
    statusLower.includes('abate') ||
    statusLower.includes('active') ||
    statusLower.includes('in progress')
  ) {
    return {
      badge: 'bg-rose-100 text-rose-700 border border-rose-200',
      dot: 'bg-rose-500',
      tooltip: null,
    };
  }
  
  // PENDING / Warning states - Yellow/Amber
  if (
    statusLower.includes('notice sent') ||
    statusLower.includes('abatement pending') ||
    statusLower.includes('pending') ||
    statusLower.includes('warning')
  ) {
    return {
      badge: 'bg-amber-100 text-amber-700 border border-amber-200',
      dot: 'bg-amber-400',
      tooltip: null,
    };
  }
  
  // CLOSED / Resolved - Green
  if (
    statusLower === 'closed' ||
    statusLower.includes('voluntary compliance') ||
    statusLower.includes('resolved') ||
    statusLower.includes('complied') ||
    statusLower.includes('complete')
  ) {
    return {
      badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      dot: 'bg-emerald-500',
      tooltip: null,
    };
  }
  
  // UNKNOWN / No status - Muted gray (uncertainty)
  return {
    badge: 'bg-slate-100 text-slate-500 border border-slate-200/80',
    dot: 'bg-slate-400',
    tooltip: 'Status not provided by city data. May still be active.',
  };
}

/**
 * Legacy helper for PropertyCard - returns just the className string
 */
export function getStatusColor(status: string): string {
  const styles = getViolationStatusStyle(status);
  return styles.badge;
}
