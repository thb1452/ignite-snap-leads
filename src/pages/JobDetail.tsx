import { useParams } from "react-router-dom";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JobHeader } from "@/components/jobs/JobHeader";
import { JobProgress } from "@/components/jobs/JobProgress";
import { JobStatCard } from "@/components/jobs/JobStatCard";
import { JobDuration } from "@/components/jobs/JobDuration";
import { JobResultsFilters } from "@/components/jobs/JobResultsFilters";
import { JobResultsTable } from "@/components/jobs/JobResultsTable";
import { JobTimeline } from "@/components/jobs/JobTimeline";
import { JobLedgerTable } from "@/components/jobs/JobLedgerTable";
import { getJob, getJobEvents, getJobResults } from "@/services/jobs";
import { Skeleton } from "@/components/ui/skeleton";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [filter, setFilter] = useState<'all' | 'success' | 'no_match' | 'vendor_error' | 'timeout'>('all');

  // Fetch job with auto-refresh while processing
  const jobQuery = useQuery({
    queryKey: ['job', id],
    queryFn: () => getJob(id!),
    refetchInterval: (query) => {
      return query.state.data?.finished_at ? false : 2500;
    },
    enabled: !!id,
  });

  // Fetch events with auto-refresh
  const eventsQuery = useQuery({
    queryKey: ['job-events', id],
    queryFn: () => getJobEvents(id!),
    refetchInterval: (jobQuery.data && !jobQuery.data.finished_at) ? 3000 : false,
    enabled: !!id,
  });

  // Infinite query for results with filtering
  const resultsQuery = useInfiniteQuery({
    queryKey: ['job-results', id, filter],
    queryFn: ({ pageParam = 1 }) => getJobResults(id!, { page: pageParam as number, status: filter }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.items.length === 0) return undefined;
      return pages.length + 1;
    },
    enabled: !!id,
  });

  if (jobQuery.isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!jobQuery.data) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold mb-2">Job not found</h2>
          <p className="text-muted-foreground">This skip trace job doesn't exist or you don't have access to it.</p>
        </div>
      </div>
    );
  }

  const job = jobQuery.data;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <JobHeader job={job} />
      
      <div className="grid gap-4 md:grid-cols-3">
        <JobProgress job={job} />
        <JobStatCard 
          title="Refunds" 
          value={job.counts?.failed ?? 0} 
          hint="No match + vendor errors"
          variant="warning"
        />
        <JobDuration job={job} />
      </div>

      <Tabs defaultValue="results" className="w-full">
        <TabsList>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="space-y-4">
          <JobResultsFilters 
            filter={filter} 
            onChange={setFilter} 
            total={job.counts?.total ?? 0}
            succeeded={job.counts?.succeeded ?? 0}
            failed={job.counts?.failed ?? 0}
          />
          <JobResultsTable 
            pages={resultsQuery.data?.pages ?? []} 
            onLoadMore={() => resultsQuery.fetchNextPage()}
            hasMore={resultsQuery.hasNextPage}
            isLoading={resultsQuery.isLoading}
            isFetchingMore={resultsQuery.isFetchingNextPage}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <JobTimeline events={eventsQuery.data ?? []} job={job} />
        </TabsContent>

        <TabsContent value="ledger">
          <JobLedgerTable jobId={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
