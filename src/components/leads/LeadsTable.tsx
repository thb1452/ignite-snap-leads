import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
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

  const getPrimaryViolation = (violations: Violation[]) => {
    if (violations.length === 0) return "No violations";
    const description = violations[0].description || violations[0].violation_type;
    return description.length > 60 ? description.substring(0, 60) + "..." : description;
  };

  return (
    <>
      <PropertyDetailPanel
        property={selectedProperty}
        open={!!selectedProperty}
        onOpenChange={(open) => !open && setSelectedProperty(null)}
      />
      <div className="rounded-2xl border border-slate-200/70 shadow-[0_1px_0_0_rgba(16,24,40,.04)] bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="sticky top-14 bg-white/90 backdrop-blur z-10 border-b border-slate-200/70">
            <tr className="text-xs/5 text-slate-500 font-medium tracking-wide uppercase">
              <th className="py-3 px-4 text-left">SnapScore</th>
              <th className="py-3 px-4 text-left">Address</th>
              <th className="py-3 px-4 text-left">Violations</th>
              <th className="py-3 px-4 text-left">Primary</th>
              <th className="py-3 px-4 text-right pr-6">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {properties.map((property, index) => {
              const violationCount = property.violations.length;
              const primaryViolation = getPrimaryViolation(property.violations);

              return (
                <motion.tr
                  key={property.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: index * 0.02 }}
                  className="h-16 odd:bg-white even:bg-slate-50/40 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedProperty(property)}
                >
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all ${scoreClass(property.snap_score)}`}>
                      {property.snap_score && property.snap_score >= 80 ? "🔥 " : ""}
                      {property.snap_score ?? "N/A"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-ink-900 font-medium">{property.address}</td>
                  <td className="py-3 px-4">
                    {violationCount > 1 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200 transition-all">
                        Multiple ({violationCount})
                      </span>
                    ) : (
                      <span className="text-ink-400">{violationCount}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-ink-600">{primaryViolation}</td>
                  <td className="py-3 px-4 text-right pr-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProperty(property);
                      }}
                      className="text-brand hover:text-brand/80 hover:bg-brand/5 transition-all"
                    >
                      View Details
                    </Button>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
