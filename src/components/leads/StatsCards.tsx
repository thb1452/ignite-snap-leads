import { Card } from "@/components/ui/card";
import { Flame, AlertTriangle, TrendingUp, BarChart3 } from "lucide-react";

interface PropertyWithViolations {
  snap_score: number | null;
  violations: any[];
}

interface StatsCardsProps {
  properties: PropertyWithViolations[];
}

export function StatsCards({ properties }: StatsCardsProps) {
  const totalLeads = properties.length;
  const hotLeads = properties.filter(p => (p.snap_score ?? 0) >= 80).length;
  const multipleViolations = properties.filter(p => p.violations.length >= 3).length;
  const avgSnapScore = properties.length > 0
    ? Math.round(properties.reduce((sum, p) => sum + (p.snap_score ?? 0), 0) / properties.length)
    : 0;

  const stats = [
    {
      label: "Total Leads",
      value: totalLeads,
      icon: BarChart3,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Hot Leads",
      value: hotLeads,
      icon: Flame,
      color: "text-red-600",
      bgColor: "bg-red-50",
    },
    {
      label: "Multiple Violations",
      value: multipleViolations,
      icon: AlertTriangle,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      label: "Avg SnapScore",
      value: avgSnapScore,
      icon: TrendingUp,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className="p-6 shadow-md hover:shadow-lg transition-all duration-200">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className={`${stat.bgColor} ${stat.color} p-3 rounded-full`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="text-5xl font-extrabold">{stat.value}</div>
              <div className="text-sm font-medium text-muted-foreground">{stat.label}</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
