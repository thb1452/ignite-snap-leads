import { useState } from "react";
import { VisionaryLayout } from "@/components/visionary/VisionaryLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Rocket, GitBranch, Clock, User, X } from "lucide-react";
import { mockDeployments } from "@/data/visionaryMockData";

const statusStyles: Record<string, string> = {
  success: "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)]",
  failed: "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)]",
  deploying: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)]",
  queued: "bg-[hsl(215,20%,45%)]/15 text-[hsl(215,20%,45%)]",
};

export default function VisionaryDeployments() {
  const [newOpen, setNewOpen] = useState(false);
  const [envVars, setEnvVars] = useState([{ key: "", value: "" }]);

  const addEnvVar = () => setEnvVars((prev) => [...prev, { key: "", value: "" }]);
  const removeEnvVar = (i: number) => setEnvVars((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <VisionaryLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Deployments</h1>
            <p className="text-sm text-[hsl(215,20%,55%)] mt-1">
              {mockDeployments.length} deployments
            </p>
          </div>
          <Button
            onClick={() => setNewOpen(true)}
            className="gap-2 bg-[hsl(200,100%,50%)] hover:bg-[hsl(200,100%,45%)] text-white border-0"
          >
            <Plus className="h-4 w-4" /> New Deployment
          </Button>
        </div>

        <div className="space-y-3">
          {mockDeployments.map((dep) => (
            <Card
              key={dep.id}
              className="bg-[hsl(222,47%,10%)] border-[hsl(220,20%,14%)] text-[hsl(210,40%,96%)] hover:border-[hsl(220,20%,20%)] transition-colors"
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      dep.status === "success" ? "bg-[hsl(142,71%,45%)]/10" :
                      dep.status === "failed" ? "bg-[hsl(0,84%,60%)]/10" :
                      dep.status === "deploying" ? "bg-[hsl(38,92%,50%)]/10" :
                      "bg-[hsl(215,20%,20%)]"
                    }`}>
                      <Rocket className={`h-5 w-5 ${
                        dep.status === "success" ? "text-[hsl(142,71%,45%)]" :
                        dep.status === "failed" ? "text-[hsl(0,84%,60%)]" :
                        dep.status === "deploying" ? "text-[hsl(38,92%,50%)]" :
                        "text-[hsl(215,20%,45%)]"
                      }`} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{dep.appName}</p>
                      <p className="text-xs text-[hsl(215,20%,45%)] font-mono">{dep.image}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-4 text-xs text-[hsl(215,20%,45%)]">
                      {dep.commit && (
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3" /> {dep.commit}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {dep.duration}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {dep.triggeredBy}
                      </span>
                    </div>
                    <Badge className={`text-[10px] font-medium border-0 ${statusStyles[dep.status]}`}>
                      {dep.status}
                    </Badge>
                  </div>
                </div>
                <p className="text-[11px] text-[hsl(215,20%,40%)] mt-3 ml-14">{dep.timestamp}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* New Deployment Modal */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="bg-[hsl(222,47%,10%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)] max-w-lg">
          <DialogHeader>
            <DialogTitle>New Deployment</DialogTitle>
            <DialogDescription className="text-[hsl(215,20%,55%)]">
              Deploy a new container to your infrastructure
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[hsl(215,20%,55%)]">Docker Image</Label>
              <Input placeholder="e.g. myapp/api:latest" className="bg-[hsl(220,20%,12%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)] font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[hsl(215,20%,55%)]">Host Port</Label>
                <Input placeholder="8080" className="bg-[hsl(220,20%,12%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)]" />
              </div>
              <div className="space-y-2">
                <Label className="text-[hsl(215,20%,55%)]">Container Port</Label>
                <Input placeholder="3000" className="bg-[hsl(220,20%,12%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)]" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[hsl(215,20%,55%)]">Git Repo URL (optional)</Label>
              <Input placeholder="https://github.com/user/repo" className="bg-[hsl(220,20%,12%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)]" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[hsl(215,20%,55%)]">Environment Variables</Label>
                <Button variant="ghost" size="sm" onClick={addEnvVar} className="text-[hsl(200,100%,50%)] hover:bg-[hsl(200,100%,50%)]/10 text-xs h-7">
                  + Add
                </Button>
              </div>
              <div className="space-y-2">
                {envVars.map((_, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="KEY" className="bg-[hsl(220,20%,12%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)] font-mono text-xs flex-1" />
                    <Input placeholder="value" className="bg-[hsl(220,20%,12%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)] font-mono text-xs flex-1" />
                    {envVars.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-10 w-10 text-[hsl(0,84%,60%)] hover:bg-[hsl(0,84%,60%)]/10 shrink-0" onClick={() => removeEnvVar(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)} className="text-[hsl(215,20%,55%)] hover:bg-[hsl(220,20%,14%)]">
              Cancel
            </Button>
            <Button className="gap-2 bg-[hsl(200,100%,50%)] hover:bg-[hsl(200,100%,45%)] text-white border-0">
              <Rocket className="h-4 w-4" /> Deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VisionaryLayout>
  );
}
