import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

interface Activity {
  id: string;
  property_id: string;
  status: string;
  notes: string | null;
  created_at: string;
  property?: {
    address: string;
    city: string;
    state: string;
  };
}

interface ActivityTimelineProps {
  activities: Activity[];
  loading?: boolean;
}

const getActivityColor = (status: string) => {
  switch (status) {
    case "Deal Made":
      return "bg-green-100 text-green-800 border-green-200";
    case "Called - Interested":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "Called - Not Interested":
      return "bg-gray-100 text-gray-800 border-gray-200";
    case "Called - No Answer":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "Not Called":
      return "bg-purple-100 text-purple-800 border-purple-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const getActivityIcon = (status: string) => {
  switch (status) {
    case "Deal Made":
      return "🎉";
    case "Called - Interested":
      return "👍";
    case "Called - Not Interested":
      return "👎";
    case "Called - No Answer":
      return "📞";
    case "Not Called":
      return "📋";
    default:
      return "•";
  }
};

export function ActivityTimeline({ activities, loading = false }: ActivityTimelineProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-8 h-8 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-gray-200 rounded" />
                  <div className="h-3 w-48 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Activity</CardTitle>
        <p className="text-sm text-muted-foreground">
          Latest {activities.length} status updates
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {activities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No activity yet</p>
                <p className="text-sm mt-1">
                  Start calling leads to see activity here
                </p>
              </div>
            ) : (
              activities.map((activity, index) => (
                <div key={activity.id} className="flex gap-3 relative">
                  {/* Timeline line */}
                  {index < activities.length - 1 && (
                    <div className="absolute left-4 top-10 bottom-0 w-px bg-gray-200" />
                  )}

                  {/* Activity icon */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-lg relative z-10">
                    {getActivityIcon(activity.status)}
                  </div>

                  {/* Activity content */}
                  <div className="flex-1 space-y-1 pb-4">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`${getActivityColor(activity.status)} text-xs`}
                      >
                        {activity.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>

                    {activity.property && (
                      <p className="text-sm font-medium text-gray-900">
                        {activity.property.address}
                      </p>
                    )}

                    {activity.property && (
                      <p className="text-xs text-gray-600">
                        {activity.property.city}, {activity.property.state}
                      </p>
                    )}

                    {activity.notes && (
                      <p className="text-sm text-gray-700 mt-1 italic">
                        "{activity.notes}"
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
