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
import VADashboard from "./pages/VADashboard";
import AdminConsole from "./pages/AdminConsole";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            <ProtectedRoute>
              <Leads />
            </ProtectedRoute>
          } />
          <Route path="/upload" element={
            <RoleProtectedRoute allowedRoles={['admin', 'va']}>
              <Upload />
            </RoleProtectedRoute>
          } />
          <Route path="/leads" element={
            <ProtectedRoute>
              <Leads />
            </ProtectedRoute>
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
