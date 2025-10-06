import { Skeleton } from "@/components/ui/skeleton";

export function StatsCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/70 shadow-[0_1px_0_0_rgba(16,24,40,.04)] bg-white p-4 md:p-5 space-y-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr className="h-16 border-b border-slate-100">
      <td className="py-3 px-4">
        <Skeleton className="h-6 w-16 rounded-full" />
      </td>
      <td className="py-3 px-4">
        <Skeleton className="h-5 w-48" />
      </td>
      <td className="py-3 px-4">
        <Skeleton className="h-6 w-12" />
      </td>
      <td className="py-3 px-4">
        <Skeleton className="h-5 w-64" />
      </td>
      <td className="py-3 px-4 text-right pr-6">
        <Skeleton className="h-5 w-20 ml-auto" />
      </td>
    </tr>
  );
}
