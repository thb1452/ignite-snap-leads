import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/auth/RoleProtectedRoute";
import { usePageTracking } from "@/hooks/usePageTracking";
// FOIA Platform
import FoiaLogin from "./pages/FoiaLogin";
import { FoiaAuthGuard } from "@/components/foia/shared/FoiaAuthGuard";
import FoiaAdminDashboard from "./pages/foia/admin/FoiaAdminDashboard";
import FoiaAdminInvite from "./pages/foia/admin/FoiaAdminInvite";
import FoiaAdminImport from "./pages/foia/admin/FoiaAdminImport";
import FoiaAdminRotation from "./pages/foia/admin/FoiaAdminRotation";
import FoiaAdminPressAccounts from "./pages/foia/admin/FoiaAdminPressAccounts";
import FoiaAdminAssignments from "./pages/foia/admin/FoiaAdminAssignments";
import FoiaAdminIntelligence from "./pages/foia/admin/FoiaAdminIntelligence";
import FoiaVADashboard from "./pages/foia/va/FoiaVADashboard";
import FoiaVAQueue from "./pages/foia/va/FoiaVAQueue";
import FoiaVAHistory from "./pages/foia/va/FoiaVAHistory";
import Upload from "./pages/Upload";
import Leads from "./pages/Leads";
import Landing from "./pages/Landing";
import { Lists } from "./pages/Lists";
import ListDetail from "./pages/ListDetail";
import SavedProperties from "./pages/SavedProperties";
import { Settings } from "./pages/Settings";
import JobDetail from "./pages/JobDetail";
import Jobs from "./pages/Jobs";
import UploadJobDetail from "./pages/UploadJobDetail";
import VADashboard from "./pages/VADashboard";
import VAWorkspace from "./pages/VAWorkspace";
import VACountyDetail from "./pages/VACountyDetail";
import VATemplates from "./pages/VATemplates";
import AdminConsole from "./pages/AdminConsole";
import AdminImportCounties from "./pages/AdminImportCounties";
import AdminAssignCounties from "./pages/AdminAssignCounties";
import AdminMigration from "./pages/AdminMigration";
import ResetPassword from "./pages/ResetPassword";
import HowSnapWorks from "./pages/HowSnapWorks";
import Pricing from "./pages/Pricing";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import About from "./pages/About";
import Blog from "./pages/Blog";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import CheckoutSuccess from "./pages/CheckoutSuccess";

const queryClient = new QueryClient();

function PageTracker() {
  usePageTracking();
  return null;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <PageTracker />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/upload" element={
            <ProtectedRoute>
              <Upload />
            </ProtectedRoute>
          } />
          <Route path="/app" element={
            <RoleProtectedRoute allowedRoles={['admin', 'user']}>
              <Leads />
            </RoleProtectedRoute>
          } />
          <Route path="/leads" element={
            <RoleProtectedRoute allowedRoles={['admin', 'user']}>
              <Leads />
            </RoleProtectedRoute>
          } />
          <Route path="/lists" element={
            <RoleProtectedRoute allowedRoles={['admin', 'user']}>
              <Lists />
            </RoleProtectedRoute>
          } />
          <Route path="/lists/:listId" element={
            <RoleProtectedRoute allowedRoles={['admin', 'user']}>
              <ListDetail />
            </RoleProtectedRoute>
          } />
          <Route path="/saved" element={
            <RoleProtectedRoute allowedRoles={['admin', 'user']}>
              <SavedProperties />
            </RoleProtectedRoute>
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
          {/* VA Routes */}
          <Route path="/va-dashboard" element={
            <RoleProtectedRoute allowedRoles={['va', 'admin']}>
              <VADashboard />
            </RoleProtectedRoute>
          } />
          <Route path="/va-workspace" element={
            <RoleProtectedRoute allowedRoles={['va', 'admin']}>
              <VAWorkspace />
            </RoleProtectedRoute>
          } />
          <Route path="/va-workspace/county/:id" element={
            <RoleProtectedRoute allowedRoles={['va', 'admin']}>
              <VACountyDetail />
            </RoleProtectedRoute>
          } />
          <Route path="/va-workspace/templates" element={
            <RoleProtectedRoute allowedRoles={['va', 'admin']}>
              <VATemplates />
            </RoleProtectedRoute>
          } />
          {/* Admin Routes */}
          <Route path="/admin-console" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <AdminConsole />
            </RoleProtectedRoute>
          } />
          <Route path="/admin/import-counties" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <AdminImportCounties />
            </RoleProtectedRoute>
          } />
          <Route path="/admin/assign-counties" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <AdminAssignCounties />
            </RoleProtectedRoute>
          } />
          <Route path="/admin/migration" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <AdminMigration />
            </RoleProtectedRoute>
          } />
          <Route path="/how-snap-works" element={
            <ProtectedRoute>
              <HowSnapWorks />
            </ProtectedRoute>
          } />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/about" element={<About />} />
          <Route path="/blog" element={<Blog />} />
          {/* ============================================================ */}
          {/* FOIA VA PLATFORM ROUTES */}
          {/* ============================================================ */}
          <Route path="/foia/login" element={<FoiaLogin />} />
          {/* Admin routes */}
          <Route path="/foia/admin" element={
            <FoiaAuthGuard requiredRole="admin">
              <FoiaAdminDashboard />
            </FoiaAuthGuard>
          } />
          <Route path="/foia/admin/invite" element={
            <FoiaAuthGuard requiredRole="admin">
              <FoiaAdminInvite />
            </FoiaAuthGuard>
          } />
          <Route path="/foia/admin/import" element={
            <FoiaAuthGuard requiredRole="admin">
              <FoiaAdminImport />
            </FoiaAuthGuard>
          } />
          <Route path="/foia/admin/rotation" element={
            <FoiaAuthGuard requiredRole="admin">
              <FoiaAdminRotation />
            </FoiaAuthGuard>
          } />
          <Route path="/foia/admin/press-accounts" element={
            <FoiaAuthGuard requiredRole="admin">
              <FoiaAdminPressAccounts />
            </FoiaAuthGuard>
          } />
          <Route path="/foia/admin/assignments" element={
            <FoiaAuthGuard requiredRole="admin">
              <FoiaAdminAssignments />
            </FoiaAuthGuard>
          } />
          <Route path="/foia/admin/intelligence" element={
            <FoiaAuthGuard requiredRole="admin">
              <FoiaAdminIntelligence />
            </FoiaAuthGuard>
          } />
          {/* VA routes */}
          <Route path="/foia/va" element={
            <FoiaAuthGuard>
              <FoiaVADashboard />
            </FoiaAuthGuard>
          } />
          <Route path="/foia/va/queue" element={
            <FoiaAuthGuard>
              <FoiaVAQueue />
            </FoiaAuthGuard>
          } />
          <Route path="/foia/va/history" element={
            <FoiaAuthGuard>
              <FoiaVAHistory />
            </FoiaAuthGuard>
          } />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
