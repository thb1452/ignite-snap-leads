import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Building2, FileWarning, CheckCircle2 } from "lucide-react";

export interface DetectedLocation {
  city: string;
  state: string;
  count: number;
}

export interface CsvDetectionResult {
  locations: DetectedLocation[];
  missingLocationRows: number;
  totalRows: number;
  uniqueStates: string[];
  uniqueCities: string[];
}

interface CsvLocationDetectorProps {
  detection: CsvDetectionResult | null;
  fallbackCity?: string;
  fallbackState?: string;
  multiFileMode?: boolean;
  fileCount?: number;
}

export function CsvLocationDetector({ detection, fallbackCity, fallbackState, multiFileMode, fileCount }: CsvLocationDetectorProps) {
  if (!detection) return null;

  const { locations, missingLocationRows, totalRows, uniqueStates, uniqueCities } = detection;
  
  const hasMultipleLocations = locations.length > 1 || uniqueStates.length > 1;
  const hasMissingData = missingLocationRows > 0;
  const willUseFallback = hasMissingData && (fallbackCity || fallbackState);

  // Multi-file mode display
  if (multiFileMode && fileCount) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            {fileCount} Files Selected
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-background rounded-lg p-3 text-center">
            <div className="text-3xl font-bold text-primary">{fileCount}</div>
            <div className="text-muted-foreground text-sm">CSV files ready to process</div>
          </div>
          
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {locations.slice(0, 20).map((loc, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                <Building2 className="h-3 w-3 mr-1" />
                {loc.city}
              </Badge>
            ))}
            {locations.length > 20 && (
              <Badge variant="outline" className="text-xs">
                +{locations.length - 20} more
              </Badge>
            )}
          </div>

          <div className="text-xs text-muted-foreground bg-background rounded-lg p-3">
            <strong>Batch upload mode.</strong> Each file will be processed as a separate ingest job. Location will be auto-detected from each file.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Location Detection Complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-background rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-primary">{totalRows}</div>
            <div className="text-muted-foreground text-xs">Total Rows</div>
          </div>
          <div className="bg-background rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-primary">{uniqueCities.length}</div>
            <div className="text-muted-foreground text-xs">Cities Detected</div>
          </div>
          <div className="bg-background rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-primary">{uniqueStates.length}</div>
            <div className="text-muted-foreground text-xs">States Detected</div>
          </div>
        </div>

        {/* Detected Locations */}
        {locations.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Detected Locations
            </div>
            <div className="flex flex-wrap gap-2">
              {locations.slice(0, 10).map((loc, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  <Building2 className="h-3 w-3 mr-1" />
                  {loc.city}, {loc.state} ({loc.count})
                </Badge>
              ))}
              {locations.length > 10 && (
                <Badge variant="outline" className="text-xs">
                  +{locations.length - 10} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Missing Location Warning */}
        {hasMissingData && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm">
            <div className="flex items-start gap-2">
              <FileWarning className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div>
                <span className="font-medium text-yellow-700 dark:text-yellow-400">
                  {missingLocationRows} rows missing city/state
                </span>
                {willUseFallback ? (
                  <p className="text-muted-foreground text-xs mt-1">
                    Will use fallback: {fallbackCity && `${fallbackCity}`}{fallbackCity && fallbackState && ", "}{fallbackState}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs mt-1">
                    Enter fallback location above, or these rows will be skipped.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Multi-city info */}
        {hasMultipleLocations && (
          <div className="text-xs text-muted-foreground bg-background rounded-lg p-3">
            <strong>Multi-location file detected.</strong> Snap will automatically split this into separate ingest jobs per city for optimal processing.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
