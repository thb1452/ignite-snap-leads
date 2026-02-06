import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/auth/RoleProtectedRoute";
import Upload from "./pages/Upload";
import Leads from "./pages/Leads";
import Landing from "./pages/Landing";
import { Lists } from "./pages/Lists";
import ListDetail from "./pages/ListDetail";
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
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import CheckoutSuccess from "./pages/CheckoutSuccess";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/app" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <Leads />
            </RoleProtectedRoute>
          } />
          <Route path="/leads" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <Leads />
            </RoleProtectedRoute>
          } />
          <Route path="/lists" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <Lists />
            </RoleProtectedRoute>
          } />
          <Route path="/lists/:listId" element={
            <RoleProtectedRoute allowedRoles={['admin']}>
              <ListDetail />
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
