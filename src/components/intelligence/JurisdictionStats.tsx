import { useJurisdictionStats } from "@/hooks/useIntelligenceDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MapPin, Building } from "lucide-react";

export function JurisdictionStats() {
  const { data: stats, isLoading } = useJurisdictionStats();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Jurisdiction Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!stats?.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Jurisdiction Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No jurisdiction data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getStrictnessColor = (strictness: string) => {
    switch (strictness) {
      case "strict":
        return "bg-[hsl(var(--score-blue))] text-[hsl(var(--score-blue-foreground))]";
      case "moderate":
        return "bg-[hsl(var(--score-yellow))] text-[hsl(var(--score-yellow-foreground))]";
      case "lax":
        return "bg-[hsl(var(--score-orange))] text-[hsl(var(--score-orange-foreground))]";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Jurisdiction Overview
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {stats.length} jurisdictions with properties
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {stats.slice(0, 6).map((jurisdiction) => (
          <div
            key={jurisdiction.jurisdiction_id}
            className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Building className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">
                  {jurisdiction.jurisdiction_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {jurisdiction.city}, {jurisdiction.state}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge
                variant="outline"
                className={`text-[10px] ${getStrictnessColor(jurisdiction.enforcement_profile?.strictness || "unknown")}`}
              >
                {jurisdiction.enforcement_profile?.strictness || "unknown"}
              </Badge>
              
              <div className="text-right">
                <p className="text-sm font-semibold">
                  {jurisdiction.property_count.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {jurisdiction.distressed_count} distressed
                </p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
