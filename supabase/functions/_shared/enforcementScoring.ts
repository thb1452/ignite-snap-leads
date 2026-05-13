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
// SCORE COMPONENT BREAKDOWN — single source of truth for per-bucket points.
// calculateEnforcementIntensity sums these; buildComponentBreakdown exposes
// them for the MCP get_enforcement_breakdown tool. They cannot drift.
// ============================================================================
export interface ScoreComponent {
  name: string;
  points_contributed: number;
  max_possible: number;
  evidence: Record<string, unknown>;
  signals: string[];
}

export function computeScoreComponents(
  violations: Violation[],
  classified: ViolationWithPriority[],
  intelligence: PropertyIntelligence
): ScoreComponent[] {
  const openViolations = violations.filter(v => (v.status || '').toLowerCase().trim() === 'open');
  const openClassified = classified.filter(c => (c.original.status || '').toLowerCase().trim() === 'open');

  const components: ScoreComponent[] = [];

  // ── 1. Duration ──
  const maxDaysOpen = openViolations.length > 0
    ? Math.max(...openViolations.map(v => v.days_open || 0), 0)
    : 0;
  const monthsOpen = Math.floor(maxDaysOpen / 30);
  {
    const pts = Math.min(30, monthsOpen * 3);
    const sigs: string[] = [];
    if (maxDaysOpen > 180) sigs.push('extended_enforcement');
    components.push({
      name: 'duration',
      points_contributed: pts,
      max_possible: 30,
      evidence: { max_days_open: maxDaysOpen, months_open: monthsOpen },
      signals: sigs,
    });
  }

  // ── 2. High Priority ──
  const highPriorityCount = openClassified.filter(v => v.priority === 'high').length;
  {
    let pts = 0;
    const sigs: string[] = [];
    if (highPriorityCount > 0) {
      pts = 40 + Math.min((highPriorityCount - 1) * 10, 20);
      if (openClassified.some(v => v.priority === 'high' && v.category === 'Fire')) sigs.push('fire_citation');
      if (openClassified.some(v => v.priority === 'high' && v.category === 'Structural')) sigs.push('structural_citation');
    }
    components.push({
      name: 'high_priority',
      points_contributed: pts,
      max_possible: 60,
      evidence: { high_priority_open_count: highPriorityCount },
      signals: sigs,
    });
  }

  // ── 3. Medium Priority ──
  const mediumPriorityCount = openClassified.filter(v => v.priority === 'medium').length;
  {
    const pts = Math.min(mediumPriorityCount * 15, 30);
    components.push({
      name: 'medium_priority',
      points_contributed: pts,
      max_possible: 30,
      evidence: { medium_priority_open_count: mediumPriorityCount },
      signals: [],
    });
  }

  // ── 4. Total Volume (repeat activity) ──
  const totalViolCount = violations.length;
  {
    let pts = 0;
    const sigs: string[] = [];
    if (totalViolCount >= 10) { pts = 30; sigs.push('recurring_enforcement'); }
    else if (totalViolCount >= 5) { pts = 25; sigs.push('recurring_enforcement'); }
    else if (totalViolCount >= 3) { pts = 15; sigs.push('multiple_citations'); }
    else if (totalViolCount >= 2) { pts = 5; sigs.push('multiple_citations'); }
    components.push({
      name: 'total_volume',
      points_contributed: pts,
      max_possible: 30,
      evidence: { total_violations: totalViolCount },
      signals: sigs,
    });
  }

  // ── 5. Open Violation Volume (progressive) ──
  const openViolCount = openViolations.length;
  {
    let pts = 0;
    const sigs: string[] = [];
    if (openViolCount >= 200) { pts = 70; sigs.push('extreme_enforcement_load'); }
    else if (openViolCount >= 100) { pts = 60; sigs.push('massive_enforcement_load'); }
    else if (openViolCount >= 50) { pts = 50; sigs.push('massive_enforcement_load'); }
    else if (openViolCount >= 20) { pts = 40; sigs.push('high_violation_volume'); }
    else if (openViolCount >= 10) { pts = 30; sigs.push('high_violation_volume'); }
    else if (openViolCount >= 5) { pts = 20; sigs.push('active_enforcement_load'); }
    else if (openViolCount >= 3) { pts = 10; sigs.push('active_enforcement_load'); }
    components.push({
      name: 'open_volume',
      points_contributed: pts,
      max_possible: 70,
      evidence: { open_violations: openViolCount },
      signals: sigs,
    });
  }

  // ── 6. Multi-Category ──
  const openCategories = [...new Set(openClassified.map(v => v.category).filter(c => c !== 'Other'))];
  {
    let pts = 0;
    const sigs: string[] = [];
    if (openCategories.length >= 3) { pts = 25; sigs.push('coordinated_enforcement'); }
    else if (openCategories.length >= 2) { pts = 15; sigs.push('multi_department'); }
    components.push({
      name: 'multi_category',
      points_contributed: pts,
      max_possible: 25,
      evidence: { open_categories: openCategories, open_category_count: openCategories.length },
      signals: sigs,
    });
  }

  // ── 7. Escalation ──
  {
    let pts = 0;
    const sigs: string[] = [];
    let tier: string | null = null;
    if (intelligence.escalated) {
      const allStatuses = violations.map(v => (v.status || '').toLowerCase());
      const allDescs = violations.map(v => (v.raw_description || '').toLowerCase());
      const combined = [...allStatuses, ...allDescs].join(' ');
      if (combined.includes('condemned') || combined.includes('prosecution') || combined.includes('condemnation')) {
        pts = 30; tier = 'condemned_or_prosecution'; sigs.push('enforcement_escalation');
      } else if (combined.includes('legal') || combined.includes('court')) {
        pts = 25; tier = 'legal_or_court'; sigs.push('enforcement_escalation');
      } else if (combined.includes('board') || combined.includes('hearing')) {
        pts = 15; tier = 'board_or_hearing'; sigs.push('enforcement_escalation');
      }
    }
    components.push({
      name: 'escalation',
      points_contributed: pts,
      max_possible: 30,
      evidence: { escalated: intelligence.escalated, tier },
      signals: sigs,
    });
  }

  // ── 8. Vacancy ──
  const hasVacancySignals = openClassified.some(v =>
    v.category === 'Vacancy' ||
    (v.original.violation_type || '').toLowerCase().includes('vacant') ||
    (v.original.violation_type || '').toLowerCase().includes('abandon')
  );
  {
    const pts = hasVacancySignals ? 25 : 0;
    components.push({
      name: 'vacancy',
      points_contributed: pts,
      max_possible: 25,
      evidence: { vacancy_signals_present: hasVacancySignals },
      signals: hasVacancySignals ? ['vacancy_citation'] : [],
    });
  }

  // ── 9. Recency ──
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const getRecentDate = (v: Violation): Date | null => {
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
  const hasRecent7 = violations.some(v => { const d = getRecentDate(v); return d !== null && d >= sevenDaysAgo; });
  const hasRecent30 = !hasRecent7 && violations.some(v => { const d = getRecentDate(v); return d !== null && d >= thirtyDaysAgo; });
  {
    let pts = 0;
    const sigs: string[] = [];
    let tier: string | null = null;
    if (hasRecent7) { pts = 40; tier = '7d'; sigs.push('recent_activity'); }
    else if (hasRecent30) { pts = 20; tier = '30d'; sigs.push('current_enforcement'); }
    components.push({
      name: 'recency',
      points_contributed: pts,
      max_possible: 40,
      evidence: { tier, has_recent_7d: hasRecent7, has_recent_30d: hasRecent30 },
      signals: sigs,
    });
  }

  // ── 10. Water Shutoff ──
  const hasWaterShutoff = (violations as any).__enforcement_type === 'water_shutoff' ||
    classified.some(v => {
      const combined = `${(v.original.violation_type || '').toLowerCase()} ${(v.original.raw_description || '').toLowerCase()}`;
      return combined.includes('water shutoff') || combined.includes('water disconnect') ||
             combined.includes('no water') || combined.includes('water termination') ||
             combined.includes('water service disconnect');
    });
  const hasOpenCodeViolations = openClassified.filter(v => v.category !== 'Utility').length > 0;
  {
    let pts = 0;
    const sigs: string[] = [];
    let tier: string | null = null;
    if (hasWaterShutoff) {
      sigs.push('water_shutoff_enforcement');
      if (hasOpenCodeViolations && intelligence.repeat_offender && (hasRecent7 || hasRecent30)) {
        pts = 55; tier = 'maximum_pressure'; sigs.push('maximum_enforcement_pressure');
      } else if (hasRecent7 || hasRecent30) {
        pts = 48; tier = 'active_current'; sigs.push('active_enforcement_current');
      } else if (hasOpenCodeViolations) {
        pts = 42; tier = 'compounding'; sigs.push('compounding_enforcement');
      } else {
        pts = 40; tier = 'direct_action'; sigs.push('direct_municipal_action');
      }
    }
    components.push({
      name: 'water_shutoff',
      points_contributed: pts,
      max_possible: 55,
      evidence: {
        has_water_shutoff: hasWaterShutoff,
        has_open_code_violations: hasOpenCodeViolations,
        repeat_offender: intelligence.repeat_offender,
        tier,
      },
      signals: sigs,
    });
  }

  return components;
}

// ============================================================================
// ENFORCEMENT INTENSITY SCORING — v7.1
// ============================================================================
export function calculateEnforcementIntensity(
  violations: Violation[],
  classified: ViolationWithPriority[],
  intelligence: PropertyIntelligence
): SnapScoreResult {
  const components = computeScoreComponents(violations, classified, intelligence);

  let score = components.reduce((s, c) => s + c.points_contributed, 0);
  const signals: string[] = [];
  for (const c of components) for (const s of c.signals) signals.push(s);

  // Add non-component signal: utility_enforcement (no points)
  const openClassified = classified.filter(c => (c.original.status || '').toLowerCase().trim() === 'open');
  const waterComp = components.find(c => c.name === 'water_shutoff');
  const hasWaterShutoff = waterComp ? (waterComp.points_contributed > 0) : false;
  if (!hasWaterShutoff && openClassified.some(v => v.category === 'Utility')) {
    signals.push('utility_enforcement');
  }

  // Cap score if all violations resolved
  const openCount = violations.filter(v => (v.status || '').toLowerCase().trim() === 'open').length;
  if (openCount === 0 && violations.length > 0) {
    if (intelligence.escalated) score = Math.min(score, 35);
    else score = Math.min(score, 20);
  }

  const finalScore = Math.min(100, Math.max(0, score));

  let activityClass: 'critical' | 'elevated' | 'monitoring' = 'monitoring';
  if (finalScore >= 70) activityClass = 'critical';
  else if (finalScore >= 40) activityClass = 'elevated';

  return { score: finalScore, signals, activityClass };
}

// ============================================================================
// COMPONENT BREAKDOWN — for MCP get_enforcement_breakdown tool
// ============================================================================
export interface ComponentBreakdown {
  components: ScoreComponent[];
  raw_sum_pre_cap: number;
  resolved_cap_applied: number | null; // 20, 35, or null if no cap applied
  final_score: number;
  signals: string[];
  activity_class: 'critical' | 'elevated' | 'monitoring';
  scoring_version: string;
}

export function buildComponentBreakdown(
  violations: Violation[],
  classified: ViolationWithPriority[],
  intelligence: PropertyIntelligence
): ComponentBreakdown {
  const components = computeScoreComponents(violations, classified, intelligence);
  const rawSum = components.reduce((s, c) => s + c.points_contributed, 0);

  const signals: string[] = [];
  for (const c of components) for (const s of c.signals) signals.push(s);
  const openClassified = classified.filter(c => (c.original.status || '').toLowerCase().trim() === 'open');
  const waterComp = components.find(c => c.name === 'water_shutoff');
  const hasWaterShutoff = waterComp ? (waterComp.points_contributed > 0) : false;
  if (!hasWaterShutoff && openClassified.some(v => v.category === 'Utility')) {
    signals.push('utility_enforcement');
  }

  let postCap = rawSum;
  let resolvedCapApplied: number | null = null;
  const openCount = violations.filter(v => (v.status || '').toLowerCase().trim() === 'open').length;
  if (openCount === 0 && violations.length > 0) {
    const cap = intelligence.escalated ? 35 : 20;
    if (postCap > cap) {
      postCap = cap;
      resolvedCapApplied = cap;
    }
  }
  const finalScore = Math.min(100, Math.max(0, postCap));

  let activityClass: 'critical' | 'elevated' | 'monitoring' = 'monitoring';
  if (finalScore >= 70) activityClass = 'critical';
  else if (finalScore >= 40) activityClass = 'elevated';

  return {
    components,
    raw_sum_pre_cap: rawSum,
    resolved_cap_applied: resolvedCapApplied,
    final_score: finalScore,
    signals,
    activity_class: activityClass,
    scoring_version: SCORING_VERSION,
  };
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
