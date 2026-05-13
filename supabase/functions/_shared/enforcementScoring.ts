// SnapScore v7.1 canonical algorithm. Used by:
//   - supabase/functions/generate-insights (writes properties.snap_score)
//   - supabase/functions/snap-mcp-proxy (get_enforcement_breakdown tool)
// All scoring logic lives here. Do not duplicate.

export const SCORING_VERSION = "v7.1";

export interface Violation {
  id: string;
  violation_type: string;
  status: string;
  days_open: number | null;
  opened_date: string | null;
  raw_description: string | null;
  last_updated: string | null;
}

export interface ViolationWithPriority {
  category: string;
  priority: 'high' | 'medium' | 'low';
  original: Violation;
}

export interface SnapScoreResult {
  score: number;
  signals: string[];
  activityClass: 'critical' | 'elevated' | 'monitoring';
}

export interface PropertyIntelligence {
  total_violations: number;
  open_violations: number;
  oldest_violation_date: string | null;
  newest_violation_date: string | null;
  avg_days_open: number;
  violation_types: string[];
  repeat_offender: boolean;
  multi_department: boolean;
  escalated: boolean;
  oldest_violation_days: number;
  high_priority_count: number;
  medium_priority_count: number;
  low_priority_count: number;
}

// ============================================================================
// PROPERTY INTELLIGENCE AGGREGATION
// ============================================================================
export function aggregatePropertyIntelligence(
  violations: Violation[],
  classified: ViolationWithPriority[],
  propertyEscalated?: boolean
): PropertyIntelligence {
  const escalatedStatuses = ['board', 'legal', 'court', 'condemned', 'prosecution'];
  const now = new Date();
  
  // Derive days_open from opened_date when null; warn if both null
  for (const v of violations) {
    if (v.days_open == null && v.opened_date) {
      const opened = new Date(v.opened_date);
      if (!isNaN(opened.getTime())) {
        v.days_open = Math.max(0, Math.floor((now.getTime() - opened.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }
    // Also check last_updated as fallback for days_open
    if (v.days_open == null && v.last_updated) {
      const updated = new Date(v.last_updated);
      if (!isNaN(updated.getTime())) {
        v.days_open = Math.max(0, Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }
    if (v.days_open == null && !v.opened_date && !v.last_updated) {
      console.warn(`[enforcementScoring ${SCORING_VERSION}] Violation ${v.id} has no date info — days_open defaults to 0`);
    }
  }
  
  const openViolations = violations.filter(v => (v.status || '').toLowerCase().trim() === 'open');
  
  const now_ts = now.getTime();
  const dates = violations
    .map(v => v.opened_date)
    .filter(d => d)
    .map(d => new Date(d!))
    .filter(d => !isNaN(d.getTime()) && d.getTime() <= now_ts) // Filter out future dates
    .sort((a, b) => a.getTime() - b.getTime());
  
  const daysOpen = violations.map(v => v.days_open || 0);
  const avgDays = daysOpen.length > 0 
    ? Math.round(daysOpen.reduce((a, b) => a + b, 0) / daysOpen.length) 
    : 0;
  
  const violationTypes = [...new Set(violations.map(v => v.violation_type).filter(Boolean))];
  
  // Escalation: check property flag OR violation statuses (condemned gets escalation even if closed)
  const hasStatusEscalation = violations.some(v => {
    const status = (v.status || '').toLowerCase();
    return escalatedStatuses.some(s => status.includes(s));
  });
  // Also check raw_description for condemned/condemnation even on closed violations
  const hasDescEscalation = violations.some(v => {
    const desc = (v.raw_description || '').toLowerCase();
    return desc.includes('condemned') || desc.includes('condemnation') || desc.includes('unsafe structure');
  });
  const isEscalated = !!propertyEscalated || hasStatusEscalation || hasDescEscalation;
  
  // Oldest violation in days
  const oldestDays = dates.length > 0 
    ? Math.max(0, Math.floor((now.getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Severity counts from classified violations
  const highCount = classified.filter(v => v.priority === 'high').length;
  const medCount = classified.filter(v => v.priority === 'medium').length;
  const lowCount = classified.filter(v => v.priority === 'low').length;

  // Multi-department: use keyword-derived categories (not just violation_type)
  const uniqueCategories = [...new Set(classified.map(v => v.category).filter(c => c !== 'Other'))];
  
  return {
    total_violations: violations.length,
    open_violations: openViolations.length,
    oldest_violation_date: dates.length > 0 ? dates[0].toISOString().split('T')[0] : null,
    newest_violation_date: dates.length > 0 ? dates[dates.length - 1].toISOString().split('T')[0] : null,
    avg_days_open: avgDays,
    violation_types: violationTypes,
    repeat_offender: violations.length >= 3,
    multi_department: uniqueCategories.length >= 2,
    escalated: isEscalated,
    oldest_violation_days: oldestDays,
    high_priority_count: highCount,
    medium_priority_count: medCount,
    low_priority_count: lowCount,
  };
}

// ============================================================================
// ENFORCEMENT INTENSITY SCORING — v7.1
// Fixes: progressive volume scaling (no cap at 50), recency checks last_updated
// first, escalation for condemned even if closed, multi-category from keywords
// ============================================================================
export function calculateEnforcementIntensity(
  violations: Violation[],
  classified: ViolationWithPriority[],
  intelligence: PropertyIntelligence
): SnapScoreResult {
  let score = 0;
  const signals: string[] = [];
  
  const openViolations = violations.filter(v => (v.status || '').toLowerCase().trim() === 'open');
  const openClassified = classified.filter(c => (c.original.status || '').toLowerCase().trim() === 'open');
  
  // ── Duration Factor ──
  const maxDaysOpen = openViolations.length > 0 
    ? Math.max(...openViolations.map(v => v.days_open || 0), 0)
    : 0;
  const monthsOpen = Math.floor(maxDaysOpen / 30);
  score += Math.min(30, monthsOpen * 3);
  if (maxDaysOpen > 180) signals.push('extended_enforcement');
  
  // ── Priority Matrix ──
  const highPriorityCount = openClassified.filter(v => v.priority === 'high').length;
  const mediumPriorityCount = openClassified.filter(v => v.priority === 'medium').length;
  
  if (highPriorityCount > 0) {
    score += 40 + Math.min((highPriorityCount - 1) * 10, 20);
    if (openClassified.some(v => v.priority === 'high' && v.category === 'Fire')) signals.push('fire_citation');
    if (openClassified.some(v => v.priority === 'high' && v.category === 'Structural')) signals.push('structural_citation');
  }
  score += Math.min(mediumPriorityCount * 15, 30);
  
  // ── Repeat Activity & Volume ──
  const totalViolCount = violations.length;
  const openViolCount = openViolations.length;
  
  if (totalViolCount >= 10) {
    score += 30;
    signals.push('recurring_enforcement');
  } else if (totalViolCount >= 5) {
    score += 25;
    signals.push('recurring_enforcement');
  } else if (totalViolCount >= 3) {
    score += 15;
    signals.push('multiple_citations');
  } else if (totalViolCount >= 2) {
    score += 5;
    signals.push('multiple_citations');
  }

  // ── Open Violation Volume — PROGRESSIVE (no hard cap) ──
  // Uses log scaling so 200 open scores higher than 50
  if (openViolCount >= 200) {
    score += 70;
    signals.push('extreme_enforcement_load');
  } else if (openViolCount >= 100) {
    score += 60;
    signals.push('massive_enforcement_load');
  } else if (openViolCount >= 50) {
    score += 50;
    signals.push('massive_enforcement_load');
  } else if (openViolCount >= 20) {
    score += 40;
    signals.push('high_violation_volume');
  } else if (openViolCount >= 10) {
    score += 30;
    signals.push('high_violation_volume');
  } else if (openViolCount >= 5) {
    score += 20;
    signals.push('active_enforcement_load');
  } else if (openViolCount >= 3) {
    score += 10;
    signals.push('active_enforcement_load');
  }
  
  // ── Multi-Category (keyword-derived, not just violation_type) ──
  const openCategories = [...new Set(openClassified.map(v => v.category).filter(c => c !== 'Other'))];
  if (openCategories.length >= 3) {
    score += 25;
    signals.push('coordinated_enforcement');
  } else if (openCategories.length >= 2) {
    score += 15;
    signals.push('multi_department');
  }
  
  // ── Escalation — check ALL violations (not just open) for condemned ──
  if (intelligence.escalated) {
    const allStatuses = violations.map(v => (v.status || '').toLowerCase());
    const allDescs = violations.map(v => (v.raw_description || '').toLowerCase());
    const combined = [...allStatuses, ...allDescs].join(' ');
    
    if (combined.includes('condemned') || combined.includes('prosecution') || combined.includes('condemnation')) {
      score += 30;
      signals.push('enforcement_escalation');
    } else if (combined.includes('legal') || combined.includes('court')) {
      score += 25;
      signals.push('enforcement_escalation');
    } else if (combined.includes('board') || combined.includes('hearing')) {
      score += 15;
      signals.push('enforcement_escalation');
    }
  }
  
  // ── Vacancy ──
  const hasVacancySignals = openClassified.some(v => 
    v.category === 'Vacancy' ||
    (v.original.violation_type || '').toLowerCase().includes('vacant') ||
    (v.original.violation_type || '').toLowerCase().includes('abandon')
  );
  if (hasVacancySignals) {
    score += 25;
    signals.push('vacancy_citation');
  }
  
  // ── Recency — check last_updated FIRST, fall back to opened_date ──
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const getRecentDate = (v: Violation): Date | null => {
    // Check last_updated first (more recent activity on old violations)
    if (v.last_updated) {
      const d = new Date(v.last_updated);
      if (!isNaN(d.getTime())) return d;
    }
    if (v.opened_date) {
      const d = new Date(v.opened_date);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };
  
  const hasRecent7 = violations.some(v => {
    const d = getRecentDate(v);
    return d && d >= sevenDaysAgo;
  });
  const hasRecent30 = !hasRecent7 && violations.some(v => {
    const d = getRecentDate(v);
    return d && d >= thirtyDaysAgo;
  });
  
  if (hasRecent7) {
    score += 40;
    signals.push('recent_activity');
  } else if (hasRecent30) {
    score += 20;
    signals.push('current_enforcement');
  }

  // ── Water Shutoff ──
  // Detect via enforcement_type first, then keyword scan — never silently skip
  const hasWaterShutoff = (violations as any).__enforcement_type === 'water_shutoff' ||
    classified.some(v => {
      const combined = `${(v.original.violation_type || '').toLowerCase()} ${(v.original.raw_description || '').toLowerCase()}`;
      return combined.includes('water shutoff') || combined.includes('water disconnect') ||
             combined.includes('no water') || combined.includes('water termination') ||
             combined.includes('water service disconnect');
    });
  
  const hasOpenCodeViolations = openClassified.filter(v => v.category !== 'Utility').length > 0;
  
  if (hasWaterShutoff) {
    signals.push('water_shutoff_enforcement');
    
    if (hasOpenCodeViolations && intelligence.repeat_offender && (hasRecent7 || hasRecent30)) {
      score += 55;
      signals.push('maximum_enforcement_pressure');
    } else if (hasRecent7 || hasRecent30) {
      score += 48;
      signals.push('active_enforcement_current');
    } else if (hasOpenCodeViolations) {
      score += 42;
      signals.push('compounding_enforcement');
    } else {
      score += 40;
      signals.push('direct_municipal_action');
    }
  }

  if (!hasWaterShutoff && openClassified.some(v => v.category === 'Utility')) {
    signals.push('utility_enforcement');
  }
  
  // Cap score if all violations resolved (but escalated condemned still gets some credit)
  if (openViolations.length === 0 && violations.length > 0) {
    if (intelligence.escalated) {
      score = Math.min(score, 35); // Condemned properties keep some score even if closed
    } else {
      score = Math.min(score, 20);
    }
  }
  
  const finalScore = Math.min(100, Math.max(0, score));
  
  let activityClass: 'critical' | 'elevated' | 'monitoring' = 'monitoring';
  if (finalScore >= 70) activityClass = 'critical';
  else if (finalScore >= 40) activityClass = 'elevated';
  
  return { score: finalScore, signals, activityClass };
}

// ============================================================================
// VIOLATION CLASSIFICATION — uses keyword scan on combined type + description
// ============================================================================
export function classifyViolation(violation: Violation): ViolationWithPriority {
  const t = (violation.violation_type || '').toLowerCase();
  const desc = (violation.raw_description || '').toLowerCase();
  const combined = `${t} ${desc}`;
  
  // HIGH PRIORITY
  if (combined.includes('collapse') || combined.includes('unsafe structure') || 
      combined.includes('condemned') || combined.includes('foundation failure') ||
      combined.includes('imminent danger')) {
    return { category: 'Structural', priority: 'high', original: violation };
  }
  
  if (combined.includes('fire damage') || combined.includes('burnt') || 
      combined.includes('smoke damage') || combined.includes('charred')) {
    return { category: 'Fire', priority: 'high', original: violation };
  }
  
  if (combined.includes('no utilities') || combined.includes('utility disconnect') ||
      combined.includes('no water') || combined.includes('no electric') ||
      combined.includes('water disconnect') || combined.includes('water shutoff')) {
    return { category: 'Utility', priority: 'high', original: violation };
  }
  
  // MEDIUM PRIORITY
  if (combined.includes('roof leak') || combined.includes('structural damage') ||
      combined.includes('foundation crack') || combined.includes('major repair')) {
    return { category: 'Structural', priority: 'medium', original: violation };
  }
  
  if (combined.includes('vacant') || combined.includes('abandon') || 
      combined.includes('unoccup') || combined.includes('boarded')) {
    return { category: 'Vacancy', priority: 'medium', original: violation };
  }
  
  if (combined.includes('unsafe') || combined.includes('hazard') || 
      combined.includes('danger') || combined.includes('health')) {
    return { category: 'Safety', priority: 'medium', original: violation };
  }
  
  if (combined.includes('plumbing') || combined.includes('electrical') ||
      combined.includes('sewage') || combined.includes('hvac')) {
    return { category: 'Utility', priority: 'medium', original: violation };
  }
  
  if (combined.includes('zoning') || combined.includes('zone violation') ||
      combined.includes('land use') || combined.includes('code enforcement') ||
      combined.includes('unpermitted') || combined.includes('without permit') ||
      combined.includes('permit violation') || combined.includes('illegal construction')) {
    return { category: 'Zoning', priority: 'medium', original: violation };
  }

  if (combined.includes('property maintenance') || combined.includes('property inspection') ||
      combined.includes('code compliance') || combined.includes('nuisance')) {
    return { category: 'Maintenance', priority: 'medium', original: violation };
  }
  
  // LOW PRIORITY
  if (combined.includes('paint') || combined.includes('siding') || 
      combined.includes('fence') || combined.includes('grass') ||
      combined.includes('weeds') || combined.includes('debris')) {
    return { category: 'Exterior', priority: 'low', original: violation };
  }
  
  if (combined.includes('window') || combined.includes('door') ||
      combined.includes('screen') || combined.includes('gutter')) {
    return { category: 'Exterior', priority: 'low', original: violation };
  }
  
  // Defaults
  if (combined.includes('structur') || combined.includes('foundation') || 
      combined.includes('roof') || combined.includes('wall')) {
    return { category: 'Structural', priority: 'medium', original: violation };
  }
  
  if (combined.includes('fire') || combined.includes('burn') || combined.includes('smoke')) {
    return { category: 'Fire', priority: 'high', original: violation };
  }
  
  if (combined.includes('exterior') || combined.includes('facade')) {
    return { category: 'Exterior', priority: 'low', original: violation };
  }
  
  // Open violations of unknown type → medium priority (not ignored)
  const status = (violation.status || '').toLowerCase().trim();
  if (status === 'open') {
    return { category: 'General Enforcement', priority: 'medium', original: violation };
  }
  
  return { category: 'Other', priority: 'low', original: violation };
}
