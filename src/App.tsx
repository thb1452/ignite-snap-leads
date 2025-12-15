/**
 * App Root Component
 * Phase 4: Performance - Code splitting with React.lazy
 */

import { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/auth/RoleProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Eager-loaded components (critical path)
import Leads from "./pages/Leads";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// Lazy-loaded components (code splitting)
const Upload = lazy(() => import("./pages/Upload"));
const Lists = lazy(() => import("./pages/Lists").then(m => ({ default: m.Lists })));
const Settings = lazy(() => import("./pages/Settings").then(m => ({ default: m.Settings })));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const Jobs = lazy(() => import("./pages/Jobs"));
const UploadJobDetail = lazy(() => import("./pages/UploadJobDetail"));
const VADashboard = lazy(() => import("./pages/VADashboard"));
const AdminConsole = lazy(() => import("./pages/AdminConsole"));
const HowSnapWorks = lazy(() => import("./pages/HowSnapWorks"));

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
  </div>
);

// Query client with optimized defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds default
      gcTime: 300000, // 5 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Critical path - eager loaded */}
              <Route path="/" element={
                <ProtectedRoute>
                  <Leads />
                </ProtectedRoute>
              } />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/leads" element={
                <ProtectedRoute>
                  <Leads />
                </ProtectedRoute>
              } />

              {/* Lazy-loaded routes */}
              <Route path="/upload" element={
                <RoleProtectedRoute allowedRoles={['admin', 'va']}>
                  <Upload />
                </RoleProtectedRoute>
              } />
              <Route path="/lists" element={
                <ProtectedRoute>
                  <Lists />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } />
              <Route path="/jobs" element={
                <RoleProtectedRoute allowedRoles={['admin', 'va']}>
                  <Jobs />
                </RoleProtectedRoute>
              } />
              <Route path="/jobs/:id" element={
                <RoleProtectedRoute allowedRoles={['admin', 'va']}>
                  <JobDetail />
                </RoleProtectedRoute>
              } />
              <Route path="/upload-jobs/:id" element={
                <RoleProtectedRoute allowedRoles={['admin', 'va']}>
                  <UploadJobDetail />
                </RoleProtectedRoute>
              } />
              <Route path="/va-dashboard" element={
                <RoleProtectedRoute allowedRoles={['va', 'admin']}>
                  <VADashboard />
                </RoleProtectedRoute>
              } />
              <Route path="/admin-console" element={
                <RoleProtectedRoute allowedRoles={['admin']}>
                  <AdminConsole />
                </RoleProtectedRoute>
              } />
              <Route path="/how-snap-works" element={
                <ProtectedRoute>
                  <HowSnapWorks />
                </ProtectedRoute>
              } />

              {/* Catch-all - eager loaded */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
