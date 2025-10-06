import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PropertyDetailPanel } from "./PropertyDetailPanel";

interface Violation {
  id: string;
  violation_type: string;
  description: string | null;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
}

interface LeadActivity {
  id: string;
  property_id: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface PropertyWithViolations {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  snap_insight: string | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  violations: Violation[];
  latest_activity?: LeadActivity | null;
}

interface LeadsTableProps {
  properties: PropertyWithViolations[];
}

export function LeadsTable({ properties }: LeadsTableProps) {
  const [selectedProperty, setSelectedProperty] = useState<PropertyWithViolations | null>(null);

  const scoreClass = (n: number | null) => {
    if (!n) return 'bg-slate-100 text-ink-600 border border-slate-200';
    if (n >= 80) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (n >= 50) return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-slate-100 text-ink-600 border border-slate-200';
  };

  const getDistressReasons = (property: PropertyWithViolations) => {
    const reasons: string[] = [];
    if (property.violations.length >= 3) reasons.push("Multiple violations");
    const maxDays = Math.max(...(property.violations.map(v => v.days_open ?? 0)), 0);
    if (maxDays > 180) reasons.push(`${maxDays}d open`);
    const hasSafety = property.violations.some(v => v.violation_type.toLowerCase().includes('safety'));
    if (hasSafety) reasons.push("Safety issue");
    return reasons.length > 0 ? reasons.join(" • ") : "Recent complaint";
  };

  const getMaxDaysOpen = (violations: Violation[]) => {
    if (violations.length === 0) return 0;
    return Math.max(...violations.map(v => v.days_open ?? 0));
  };

  return (
    <>
      <TooltipProvider>
        <PropertyDetailPanel
          property={selectedProperty}
          open={!!selectedProperty}
          onOpenChange={(open) => !open && setSelectedProperty(null)}
        />
        <div className="rounded-2xl border border-slate-200/70 shadow-[0_8px_24px_rgba(15,23,42,0.06)] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="sticky top-14 bg-white/90 backdrop-blur z-10 border-b border-slate-200/70">
              <tr className="text-xs/5 text-slate-500 font-medium tracking-wide uppercase">
                <th className="py-3 px-4 text-left w-28">Distress</th>
                <th className="py-3 px-4 text-left w-64">Address</th>
                <th className="py-3 px-4 text-left w-24">Days Open</th>
                <th className="py-3 px-4 text-left w-28">Reachability</th>
                <th className="py-3 px-4 text-left">Why Hot</th>
                <th className="py-3 px-4 text-right pr-6 w-32">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {properties.map((property, index) => {
                const daysOpen = getMaxDaysOpen(property.violations);
                const distressReasons = getDistressReasons(property);

                return (
                  <motion.tr
                    key={property.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: index * 0.02 }}
                    className="h-16 odd:bg-white even:bg-slate-50/40 hover:bg-slate-50 transition-all cursor-pointer group"
                    onClick={() => setSelectedProperty(property)}
                  >
                    <td className="py-3 px-4">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-help ${scoreClass(property.snap_score)}`}>
                            {property.snap_score && property.snap_score >= 80 ? "🔥 " : ""}
                            {property.snap_score ?? "N/A"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-medium mb-1">Distress Index: {property.snap_score}</p>
                          <p className="text-xs opacity-90">{distressReasons}</p>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-ink-900">{property.address}</div>
                      <div className="text-xs text-ink-400">{property.city}, {property.state}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-medium ${daysOpen > 180 ? 'text-rose-600' : daysOpen > 90 ? 'text-amber-600' : 'text-ink-600'}`}>
                        {daysOpen > 0 ? `${daysOpen}d` : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-ink-400 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                        Not traced
                      </span>
                    </td>
                    <td className="py-3 px-4 text-ink-600 text-sm">
                      {distressReasons}
                    </td>
                    <td className="py-3 px-4 text-right pr-6">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProperty(property);
                        }}
                        className="text-brand hover:text-brand/80 hover:bg-brand/5 transition-all opacity-0 group-hover:opacity-100 text-xs font-medium"
                      >
                        Contact
                      </Button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TooltipProvider>
    </>
  );
}
