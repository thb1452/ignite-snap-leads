import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/auth/RoleProtectedRoute";
import Upload from "./pages/Upload";
import Leads from "./pages/Leads";
import { Lists } from "./pages/Lists";
import { Settings } from "./pages/Settings";
import JobDetail from "./pages/JobDetail";
import Jobs from "./pages/Jobs";
import UploadJobDetail from "./pages/UploadJobDetail";
import VADashboard from "./pages/VADashboard";
import AdminConsole from "./pages/AdminConsole";
import ResetPassword from "./pages/ResetPassword";
import HowSnapWorks from "./pages/HowSnapWorks";
import Pricing from "./pages/Pricing";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Leads />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/upload" element={
            <RoleProtectedRoute allowedRoles={['admin', 'va']}>
              <Upload />
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
          <Route path="/pricing" element={<Pricing />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
