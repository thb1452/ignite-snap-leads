import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useFoiaAuth } from '@/lib/foia/hooks';
import type { FoiaRole } from '@/types/foia';

interface FoiaAuthGuardProps {
  children: ReactNode;
  requiredRole?: FoiaRole;
}

export function FoiaAuthGuard({ children, requiredRole }: FoiaAuthGuardProps) {
  const { profile, loading } = useFoiaAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/foia/login" replace />;
  }

  if (requiredRole && profile.role !== requiredRole && profile.role !== 'admin') {
    // VAs can't access admin-only pages
    if (requiredRole === 'admin') {
      return <Navigate to="/foia/va" replace />;
    }
    return <Navigate to="/foia/login" replace />;
  }

  return <>{children}</>;
}
