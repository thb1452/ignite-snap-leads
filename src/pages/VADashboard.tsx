import { PageHeader } from "@/components/layout/PageHeader";
import { AppLayout } from "@/components/layout/AppLayout";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function VADashboard() {
  const { isVA, isAdmin, loading } = useUserRole();

  if (loading) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8 px-4 max-w-6xl">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AppLayout>
    );
  }

  if (!isVA && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
        <PageHeader
          title="VA Dashboard"
          description="Workspace for the Snap upload team to track FOIA responses, jobs, and daily targets."
        />
        
        <Card className="border-2 border-blue-200">
          <CardContent className="p-8">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-blue-100">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">VA Workspace Placeholder</h3>
                <p className="text-muted-foreground mb-4">
                  This is the VA dashboard. Here we'll show:
                </p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Jobs assigned to this VA</li>
                  <li>Today's target requests and progress</li>
                  <li>Upload status for assigned counties</li>
                  <li>FOIA response tracking</li>
                  <li>Performance metrics and goals</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
