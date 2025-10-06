import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Users, Flame, Target, Activity } from "lucide-react";

interface DashboardStatsProps {
  totalLeads: number;
  hotLeads: number;
  dealsInProgress: number;
  dealsMade: number;
  loading?: boolean;
}

export function DashboardStats({
  totalLeads,
  hotLeads,
  dealsInProgress,
  dealsMade,
  loading = false,
}: DashboardStatsProps) {
  const conversionRate = totalLeads > 0 ? ((dealsMade / totalLeads) * 100).toFixed(1) : "0.0";
  const hotLeadPercentage = totalLeads > 0 ? ((hotLeads / totalLeads) * 100).toFixed(0) : "0";

  const stats = [
    {
      title: "Total Leads",
      value: totalLeads.toLocaleString(),
      icon: Users,
      description: "Properties in database",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Hot Leads",
      value: hotLeads.toLocaleString(),
      icon: Flame,
      description: `${hotLeadPercentage}% of total (SnapScore 80+)`,
      color: "text-red-600",
      bgColor: "bg-red-50",
      badge: "High Priority",
    },
    {
      title: "Deals in Progress",
      value: dealsInProgress.toLocaleString(),
      icon: Activity,
      description: "Called - Interested",
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
    },
    {
      title: "Conversion Rate",
      value: `${conversionRate}%`,
      icon: Target,
      description: `${dealsMade} deals closed`,
      color: "text-green-600",
      bgColor: "bg-green-50",
      trend: dealsMade > 0 ? "up" : undefined,
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-gray-200 rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-32 bg-gray-200 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold text-gray-900">
                  {stat.value}
                </div>
                {stat.trend === "up" && (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-gray-600">{stat.description}</p>
                {stat.badge && (
                  <Badge variant="destructive" className="text-xs">
                    {stat.badge}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
