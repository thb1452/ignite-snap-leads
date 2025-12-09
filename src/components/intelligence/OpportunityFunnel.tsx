import { useOpportunityFunnel } from "@/hooks/useIntelligenceDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, AlertTriangle, Eye } from "lucide-react";

export function OpportunityFunnel() {
  const { data: funnel, isLoading } = useOpportunityFunnel();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Opportunity Funnel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const getOpportunityConfig = (className: string) => {
    switch (className) {
      case "distressed":
        return {
          label: "Distressed",
          description: "Score 70-100",
          icon: AlertTriangle,
          bgClass: "bg-[hsl(var(--score-red))]",
          textClass: "text-[hsl(var(--score-red-foreground))]",
        };
      case "value_add":
        return {
          label: "Value-Add",
          description: "Score 40-69",
          icon: TrendingUp,
          bgClass: "bg-[hsl(var(--score-orange))]",
          textClass: "text-[hsl(var(--score-orange-foreground))]",
        };
      default:
        return {
          label: "Watch",
          description: "Score 0-39",
          icon: Eye,
          bgClass: "bg-[hsl(var(--score-blue))]",
          textClass: "text-[hsl(var(--score-blue-foreground))]",
        };
    }
  };

  const total = funnel?.reduce((sum, f) => sum + f.property_count, 0) || 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Opportunity Funnel</CardTitle>
        <p className="text-xs text-muted-foreground">{total.toLocaleString()} total properties</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {funnel?.map((item) => {
          const config = getOpportunityConfig(item.opportunity_class);
          const Icon = config.icon;
          const percentage = total > 0 ? Math.round((item.property_count / total) * 100) : 0;

          return (
            <div
              key={item.opportunity_class}
              className={`p-3 rounded-lg ${config.bgClass} ${config.textClass}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <div>
                    <p className="font-semibold">{config.label}</p>
                    <p className="text-xs opacity-80">{config.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{item.property_count.toLocaleString()}</p>
                  <p className="text-xs opacity-80">{percentage}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
