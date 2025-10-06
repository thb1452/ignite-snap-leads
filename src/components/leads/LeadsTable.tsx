import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Lightbulb } from "lucide-react";
import { PropertyDetailPanel } from "./PropertyDetailPanel";
import { runSkipTrace } from "@/services/skiptrace";
import { useToast } from "@/hooks/use-toast";
import { useCreditBalance } from "@/hooks/useCredits";

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
  contacts?: any[];
  contactCount?: number;
}

interface LeadsTableProps {
  properties: PropertyWithViolations[];
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

export function LeadsTable({ properties, selectedIds = [], onSelectionChange }: LeadsTableProps) {
  const [selectedProperty, setSelectedProperty] = useState<PropertyWithViolations | null>(null);
  const [loadingSkipTrace, setLoadingSkipTrace] = useState<Record<string, boolean>>({});
  const [propertyContacts, setPropertyContacts] = useState<Record<string, number>>({});
  const { toast } = useToast();
  const { data: creditsData } = useCreditBalance();

  const scoreClass = (n: number | null) => {
    if (!n) return 'bg-slate-100 text-ink-600 border border-slate-200';
    if (n >= 80) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (n >= 50) return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-slate-100 text-ink-600 border border-slate-200';
  };

  const computeSnapInsight = (property: PropertyWithViolations) => {
    if (property.snap_insight) return property.snap_insight;
    
    // Fallback: compute from available data
    const bits: string[] = [];
    const daysOpen = getMaxDaysOpen(property.violations);
    if (daysOpen > 0) bits.push(`${daysOpen}d open`);
    if (property.violations.length > 0) {
      const primaryType = property.violations[0].violation_type;
      bits.push(primaryType);
    }
    if ((property.snap_score ?? 0) >= 80) bits.push("High SnapScore");
    return bits.length > 0 ? bits.join(" • ") : "Recent activity";
  };

  const getMaxDaysOpen = (violations: Violation[]) => {
    if (violations.length === 0) return 0;
    return Math.max(...violations.map(v => v.days_open ?? 0));
  };

  const handleSkipTrace = async (property: PropertyWithViolations, e: React.MouseEvent) => {
    e.stopPropagation();
    
    console.log("[LeadsTable] Skip trace clicked for property:", property.id);
    
    const credits = creditsData ?? 0;
    console.log("[LeadsTable] Credits available:", credits);
    
    if (credits <= 0) {
      toast({
        title: "No credits",
        description: "0 credits – Buy Credits to enable skip tracing",
        variant: "destructive",
      });
      return;
    }

    setLoadingSkipTrace(prev => ({ ...prev, [property.id]: true }));
    
    try {
      const res = await runSkipTrace(property.id);
      const found = res.contacts?.length ?? 0;
      
      console.log("[LeadsTable] Skip trace complete. Found contacts:", found);
      
      setPropertyContacts(prev => ({ ...prev, [property.id]: found }));
      
      toast({
        title: found ? `Found ${found} contact(s)` : "No numbers found",
        description: found ? "Contact information retrieved successfully" : "No numbers found — try alternate address or owner search",
      });
    } catch (error: any) {
      console.error("[LeadsTable] Skip trace error:", error);
      toast({
        title: "Skip trace failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoadingSkipTrace(prev => ({ ...prev, [property.id]: false }));
    }
  };

  const getReachability = (propertyId: string) => {
    const count = propertyContacts[propertyId];
    if (count === undefined) return { text: "Not traced", color: "bg-slate-300" };
    if (count > 0) return { text: `Numbers found (${count})`, color: "bg-emerald-400" };
    return { text: "No numbers", color: "bg-amber-400" };
  };

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange(properties.map(p => p.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (propertyId: string, checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange([...selectedIds, propertyId]);
    } else {
      onSelectionChange(selectedIds.filter(id => id !== propertyId));
    }
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
                {onSelectionChange && (
                  <th className="py-3 px-4 w-12">
                    <Checkbox 
                      checked={selectedIds.length === properties.length && properties.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </th>
                )}
                <th className="py-3 px-4 text-left w-28">Distress</th>
                <th className="py-3 px-4 text-left w-64">Address</th>
                <th className="py-3 px-4 text-left w-24">Days Open</th>
                <th className="py-3 px-4 text-left w-28">Reachability</th>
                <th className="py-3 px-4 text-left">
                  <span className="inline-flex items-center gap-1 normal-case">
                    <Lightbulb className="h-3.5 w-3.5" />
                    SnapInsight
                  </span>
                </th>
                <th className="py-3 px-4 text-right pr-6 w-32">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {properties.map((property, index) => {
                const daysOpen = getMaxDaysOpen(property.violations);
                const snapInsight = computeSnapInsight(property);
                const reachability = getReachability(property.id);
                const isTracing = loadingSkipTrace[property.id] ?? false;
                const notTraced = propertyContacts[property.id] === undefined;
                const credits = creditsData ?? 0;

                return (
                  <motion.tr
                    key={property.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: index * 0.02 }}
                    className="h-16 odd:bg-white even:bg-slate-50/40 hover:bg-slate-50 transition-all cursor-pointer group"
                    onClick={() => setSelectedProperty(property)}
                  >
                    {onSelectionChange && (
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox 
                          checked={selectedIds.includes(property.id)}
                          onCheckedChange={(checked) => handleSelectOne(property.id, checked as boolean)}
                        />
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-help ${scoreClass(property.snap_score)}`}>
                            {property.snap_score ?? "N/A"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-medium mb-1">Distress Index: {property.snap_score}</p>
                          <p className="text-xs opacity-90">{snapInsight}</p>
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
                        <span className={`h-1.5 w-1.5 rounded-full ${reachability.color}`} />
                        {reachability.text}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm text-ink-700 line-clamp-1 cursor-help block max-w-md">
                            {snapInsight}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          <p>{snapInsight}</p>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-4 text-right pr-6">
                      {notTraced ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleSkipTrace(property, e)}
                          disabled={isTracing || credits <= 0}
                          className="text-brand hover:text-brand/80 hover:bg-brand/5 transition-all opacity-0 group-hover:opacity-100 text-xs font-medium disabled:opacity-40"
                        >
                          {isTracing ? "Tracing..." : "Skip Trace"}
                        </Button>
                      ) : (
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
                      )}
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
