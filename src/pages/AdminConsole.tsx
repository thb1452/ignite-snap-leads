import { PageHeader } from "@/components/layout/PageHeader";
import { AppLayout } from "@/components/layout/AppLayout";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function AdminConsole() {
  const { isAdmin, loading } = useUserRole();

  if (loading) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8 px-4 max-w-6xl">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
        <PageHeader
          title="Admin Console"
          description="Internal controls for Snap operators and admins."
        />
        
        <Card className="border-2 border-brand/20">
          <CardContent className="p-8">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-brand/10">
                <Shield className="h-6 w-6 text-brand" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Admin Dashboard Placeholder</h3>
                <p className="text-muted-foreground mb-4">
                  This is the admin-only dashboard. Here we'll show:
                </p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>System stats and health metrics</li>
                  <li>Upload job summaries across all VAs</li>
                  <li>User management and role assignments</li>
                  <li>County management and FOIA tracking</li>
                  <li>Analytics and reporting tools</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
