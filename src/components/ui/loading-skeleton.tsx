import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function StatsCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

export function TableRowSkeleton() {
  return (
    <tr className="border-b border-border">
      <td className="p-4">
        <Skeleton className="h-4 w-32" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-48" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-36" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="p-4">
        <Skeleton className="h-6 w-16 rounded-full" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-12" />
      </td>
      <td className="p-4">
        <Skeleton className="h-8 w-16" />
      </td>
    </tr>
  );
}

export function CardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex gap-4">
          <Skeleton className="h-5 w-5 flex-shrink-0 mt-1" />
          <div className="flex-1 space-y-3">
            <div className="flex justify-between items-start">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-24" />
            <div className="flex gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
