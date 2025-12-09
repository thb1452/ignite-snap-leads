import { useHotProperties } from "@/hooks/useIntelligenceDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Flame, AlertTriangle, Building2, Scale } from "lucide-react";

interface HotPropertiesProps {
  onPropertyClick?: (propertyId: string) => void;
}

export function HotProperties({ onPropertyClick }: HotPropertiesProps) {
  const { data: properties, isLoading } = useHotProperties(5);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Flame className="h-4 w-4 text-[hsl(var(--score-red))]" />
            Hot Properties
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!properties?.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Flame className="h-4 w-4 text-[hsl(var(--score-red))]" />
            Hot Properties
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No distressed properties found. Generate insights to populate.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Flame className="h-4 w-4 text-[hsl(var(--score-red))]" />
          Hot Properties
        </CardTitle>
        <p className="text-xs text-muted-foreground">Top distressed opportunities</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {properties.map((property, index) => (
          <div
            key={property.id}
            onClick={() => onPropertyClick?.(property.id)}
            className="p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>
                  <p className="font-medium text-sm truncate">{property.address}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {property.city}, {property.state}
                </p>
                
                {/* Distress signals */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {property.escalated && (
                    <Badge variant="destructive" className="text-[10px] px-1 py-0">
                      <Scale className="h-2.5 w-2.5 mr-0.5" />
                      Legal
                    </Badge>
                  )}
                  {property.multi_department && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                      <Building2 className="h-2.5 w-2.5 mr-0.5" />
                      Multi-Dept
                    </Badge>
                  )}
                  {(property.total_violations ?? 0) >= 3 && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      {property.total_violations} violations
                    </Badge>
                  )}
                </div>
              </div>
              
              {/* Score badge */}
              <div className="flex-shrink-0">
                <div className="px-2 py-1 rounded bg-[hsl(var(--score-red))] text-[hsl(var(--score-red-foreground))] text-sm font-bold">
                  {property.snap_score}
                </div>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
