import { JobResult } from "@/services/jobs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MapPin } from "lucide-react";

interface JobResultsTableProps {
  pages: Array<{ items: JobResult[] }>;
  onLoadMore: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  isFetchingMore?: boolean;
}

const STATUS_BADGES = {
  success: { bg: 'bg-green-100', text: 'text-green-700', label: 'Success' },
  no_match: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'No Match' },
  vendor_error: { bg: 'bg-red-100', text: 'text-red-700', label: 'Error' },
  timeout: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Timeout' },
};

export function JobResultsTable({ 
  pages, 
  onLoadMore, 
  hasMore, 
  isLoading,
  isFetchingMore 
}: JobResultsTableProps) {
  const allItems = pages.flatMap(page => page.items);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-16 bg-muted rounded" />
          </Card>
        ))}
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">No results found</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {allItems.map((result) => {
        const statusInfo = STATUS_BADGES[result.status];
        
        return (
          <Card key={result.property_id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium truncate">{result.address}</h3>
                  <Badge className={`${statusInfo.bg} ${statusInfo.text} border-0 shrink-0`}>
                    {statusInfo.label}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {result.city}, {result.state} {result.zip}
                  </span>
                  
                  {result.snap_score && (
                    <span className="font-medium text-primary">
                      Score: {result.snap_score}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {result.phones_found > 0 && (
                  <div className="flex items-center gap-1 text-sm">
                    <Phone className="h-4 w-4 text-green-600" />
                    <span className="font-medium">{result.phones_found}</span>
                  </div>
                )}
                
                {result.emails_found > 0 && (
                  <div className="flex items-center gap-1 text-sm">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">{result.emails_found}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button 
            variant="outline" 
            onClick={onLoadMore}
            disabled={isFetchingMore}
          >
            {isFetchingMore ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
