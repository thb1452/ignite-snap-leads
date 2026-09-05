import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOwnerSession } from '@/services/owner/session';
import { ownerClient } from '@/services/owner/client';
import { OwnerLogin } from './OwnerLogin';
import { verifyOwner } from '@/services/owner/operations';
import { Button } from '@/components/ui/button';

export function OwnerAccessGate({ children }: { children: ReactNode }) {
  const { user, loading } = useOwnerSession();
  const access = useQuery({
    queryKey: ['owner-access', user?.id],
    queryFn: () => verifyOwner(user!.id),
    enabled: !loading && !!user,
    staleTime: 0, gcTime: 0, retry: false,
    refetchOnMount: 'always', refetchOnWindowFocus: true,
  });
  if (loading || (!!user && access.isPending)) return <Gate title="Checking owner access…" />;
  if (!user) return <OwnerLogin />;
  if (access.isError) return <Gate title="We couldn’t verify owner access"><Button onClick={() => access.refetch()}>Try again</Button></Gate>;
  if (access.data !== true) return <Gate title="Owner access required"><p>This dashboard is available to authorized Snap administrators.</p><Button variant="outline" onClick={() => ownerClient.auth.signOut()}>Sign in with a different account</Button></Gate>;
  return <>{children}</>;
}
function Gate({ title, children }: { title: string; children?: ReactNode }) {
  return <main className="min-h-screen grid place-content-center gap-5 p-8 text-center"><h1 className="text-2xl font-semibold">{title}</h1>{children}</main>;
}
