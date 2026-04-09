import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/auth/RoleProtectedRoute";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { usePageTracking } from "@/hooks/usePageTracking";
import { FoiaAuthGuard } from "@/components/foia/shared/FoiaAuthGuard";

import Landing from "./pages/Landing";
import Auth from "./pages/Auth";

const Upload = lazy(() => import("./pages/Upload"));
const Leads = lazy(() => import("./pages/Leads"));
const Lists = lazy(() => import("./pages/Lists").then((m) => ({ default: m.Lists })));
const ListDetail = lazy(() => import("./pages/ListDetail"));
const SavedProperties = lazy(() => import("./pages/SavedProperties"));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const Jobs = lazy(() => import("./pages/Jobs"));
const UploadJobDetail = lazy(() => import("./pages/UploadJobDetail"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const HowSnapWorks = lazy(() => import("./pages/HowSnapWorks"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const About = lazy(() => import("./pages/About"));
const Blog = lazy(() => import("./pages/Blog"));
const CodeViolationLeads = lazy(() => import("./pages/CodeViolationLeads"));
const DistressedPropertyData = lazy(() => import("./pages/DistressedPropertyData"));
const CodeEnforcementData = lazy(() => import("./pages/CodeEnforcementData"));
const MunicipalEnforcementData = lazy(() => import("./pages/MunicipalEnforcementData"));
const OffMarketPropertyLeads = lazy(() => import("./pages/OffMarketPropertyLeads"));
const RealEstateDistressSignals = lazy(() => import("./pages/RealEstateDistressSignals"));
const HowInvestorsFindDistressedProperties = lazy(() => import("./pages/HowInvestorsFindDistressedProperties"));
const CityViolationsIndex = lazy(() => import("./pages/CityViolationsIndex"));
const CityViolations = lazy(() => import("./pages/CityViolations"));
const ListEnrichment = lazy(() => import("./pages/ListEnrichment").then((m) => ({ default: m.ListEnrichment })));
const EnrichGate = lazy(() => import("./components/EnrichGate"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Referrals = lazy(() => import("./pages/Referrals"));

const VADashboard = lazy(() => import("./pages/VADashboard"));
const VAWorkspace = lazy(() => import("./pages/VAWorkspace"));
const VACountyDetail = lazy(() => import("./pages/VACountyDetail"));
const VATemplates = lazy(() => import("./pages/VATemplates"));

const AdminConsole = lazy(() => import("./pages/AdminConsole"));
const AdminImportCounties = lazy(() => import("./pages/AdminImportCounties"));
const AdminAssignCounties = lazy(() => import("./pages/AdminAssignCounties"));
const AdminMigration = lazy(() => import("./pages/AdminMigration"));
const AuditReport = lazy(() => import("./pages/AuditReport"));
const AdminMonitoring = lazy(() => import("./pages/AdminMonitoring"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

const FoiaLogin = lazy(() => import("./pages/FoiaLogin"));
const FoiaAdminDashboard = lazy(() => import("./pages/foia/admin/FoiaAdminDashboard"));
const FoiaAdminIntelligence = lazy(() => import("./pages/foia/admin/FoiaAdminIntelligence"));
const FoiaAdminInvite = lazy(() => import("./pages/foia/admin/FoiaAdminInvite"));
const FoiaAdminImport = lazy(() => import("./pages/foia/admin/FoiaAdminImport"));
const FoiaAdminRotation = lazy(() => import("./pages/foia/admin/FoiaAdminRotation"));
const FoiaAdminPressAccounts = lazy(() => import("./pages/foia/admin/FoiaAdminPressAccounts"));
const FoiaAdminAssignments = lazy(() => import("./pages/foia/admin/FoiaAdminAssignments"));
const FoiaVADashboard = lazy(() => import("./pages/foia/va/FoiaVADashboard"));
const FoiaVAQueue = lazy(() => import("./pages/foia/va/FoiaVAQueue"));
const FoiaVAHistory = lazy(() => import("./pages/foia/va/FoiaVAHistory"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    </div>
  );
}

function PageTracker() {
  usePageTracking();
  return null;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <PageTracker />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/index" element={<Navigate to="/" replace />} />
                <Route path="/index.html" element={<Navigate to="/" replace />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/checkout/success" element={<CheckoutSuccess />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
                <Route path="/app" element={<Navigate to="/properties" replace />} />
                <Route path="/leads" element={<Navigate to="/properties" replace />} />
                <Route path="/properties" element={<RoleProtectedRoute allowedRoles={["admin", "user"]}><Leads /></RoleProtectedRoute>} />
                <Route path="/lists" element={<RoleProtectedRoute allowedRoles={["admin", "user"]}><Lists /></RoleProtectedRoute>} />
                <Route path="/lists/:listId" element={<RoleProtectedRoute allowedRoles={["admin", "user"]}><ListDetail /></RoleProtectedRoute>} />
                <Route path="/enrich" element={<RoleProtectedRoute allowedRoles={["admin", "user"]}><EnrichGate /></RoleProtectedRoute>} />
                <Route path="/saved" element={<RoleProtectedRoute allowedRoles={["admin", "user"]}><SavedProperties /></RoleProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/referrals" element={<ProtectedRoute><Referrals /></ProtectedRoute>} />
                <Route path="/jobs" element={<RoleProtectedRoute allowedRoles={["admin", "va"]}><Jobs /></RoleProtectedRoute>} />
                <Route path="/jobs/:id" element={<RoleProtectedRoute allowedRoles={["admin", "va"]}><JobDetail /></RoleProtectedRoute>} />
                <Route path="/upload-jobs/:id" element={<RoleProtectedRoute allowedRoles={["admin", "va"]}><UploadJobDetail /></RoleProtectedRoute>} />
                <Route path="/va-dashboard" element={<RoleProtectedRoute allowedRoles={["va", "admin"]}><VADashboard /></RoleProtectedRoute>} />
                <Route path="/va-workspace" element={<RoleProtectedRoute allowedRoles={["va", "admin"]}><VAWorkspace /></RoleProtectedRoute>} />
                <Route path="/va-workspace/county/:id" element={<RoleProtectedRoute allowedRoles={["va", "admin"]}><VACountyDetail /></RoleProtectedRoute>} />
                <Route path="/va-workspace/templates" element={<RoleProtectedRoute allowedRoles={["va", "admin"]}><VATemplates /></RoleProtectedRoute>} />
                <Route path="/admin-console" element={<RoleProtectedRoute allowedRoles={["admin"]}><AdminConsole /></RoleProtectedRoute>} />
                <Route path="/admin/import-counties" element={<RoleProtectedRoute allowedRoles={["admin"]}><AdminImportCounties /></RoleProtectedRoute>} />
                <Route path="/admin/assign-counties" element={<RoleProtectedRoute allowedRoles={["admin"]}><AdminAssignCounties /></RoleProtectedRoute>} />
                <Route path="/admin/migration" element={<RoleProtectedRoute allowedRoles={["admin"]}><AdminMigration /></RoleProtectedRoute>} />
                <Route path="/audit-report" element={<RoleProtectedRoute allowedRoles={["admin"]}><AuditReport /></RoleProtectedRoute>} />
                <Route path="/admin/monitoring" element={<RoleProtectedRoute allowedRoles={["admin"]}><AdminMonitoring /></RoleProtectedRoute>} />
                <Route path="/admin" element={<RoleProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></RoleProtectedRoute>} />
                <Route path="/how-snap-works" element={<ProtectedRoute><HowSnapWorks /></ProtectedRoute>} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/privacy-policy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/terms-and-conditions" element={<Terms />} />
                <Route path="/about" element={<About />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/code-violation-leads" element={<CodeViolationLeads />} />
                <Route path="/distressed-property-data" element={<DistressedPropertyData />} />
                <Route path="/code-enforcement-data" element={<CodeEnforcementData />} />
                <Route path="/municipal-enforcement-data" element={<MunicipalEnforcementData />} />
                <Route path="/off-market-property-leads" element={<OffMarketPropertyLeads />} />
                <Route path="/real-estate-distress-signals" element={<RealEstateDistressSignals />} />
                <Route path="/how-investors-find-distressed-properties" element={<HowInvestorsFindDistressedProperties />} />
                <Route path="/code-violations" element={<CityViolationsIndex />} />
                <Route path="/code-violations/:citySlug" element={<CityViolations />} />
                <Route path="/foia/login" element={<FoiaLogin />} />
                <Route path="/foia/admin" element={<FoiaAuthGuard requiredRole="admin"><FoiaAdminDashboard /></FoiaAuthGuard>} />
                <Route path="/foia/admin/invite" element={<FoiaAuthGuard requiredRole="admin"><FoiaAdminInvite /></FoiaAuthGuard>} />
                <Route path="/foia/admin/import" element={<FoiaAuthGuard requiredRole="admin"><FoiaAdminImport /></FoiaAuthGuard>} />
                <Route path="/foia/admin/rotation" element={<FoiaAuthGuard requiredRole="admin"><FoiaAdminRotation /></FoiaAuthGuard>} />
                <Route path="/foia/admin/press-accounts" element={<FoiaAuthGuard requiredRole="admin"><FoiaAdminPressAccounts /></FoiaAuthGuard>} />
                <Route path="/foia/admin/intelligence" element={<FoiaAuthGuard requiredRole="admin"><FoiaAdminIntelligence /></FoiaAuthGuard>} />
                <Route path="/foia/admin/assignments" element={<FoiaAuthGuard requiredRole="admin"><FoiaAdminAssignments /></FoiaAuthGuard>} />
                <Route path="/foia/va" element={<FoiaAuthGuard><FoiaVADashboard /></FoiaAuthGuard>} />
                <Route path="/foia/va/queue" element={<FoiaAuthGuard><FoiaVAQueue /></FoiaAuthGuard>} />
                <Route path="/foia/va/history" element={<FoiaAuthGuard><FoiaVAHistory /></FoiaAuthGuard>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
// build-trigger: 2026-03-24T14:30Z
