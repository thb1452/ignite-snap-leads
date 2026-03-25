import { useState } from "react";
import { VisionaryLayout } from "@/components/visionary/VisionaryLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Server, Cpu, MemoryStick, HardDrive, MapPin } from "lucide-react";
import { mockServers } from "@/data/visionaryMockData";

const statusStyles: Record<string, string> = {
  online: "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)]",
  offline: "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)]",
  maintenance: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)]",
};

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-[hsl(220,20%,14%)] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${value}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function VisionaryServers() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <VisionaryLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Servers</h1>
            <p className="text-sm text-[hsl(215,20%,55%)] mt-1">
              {mockServers.length} servers · {mockServers.filter((s) => s.status === "online").length} online
            </p>
          </div>
          <Button
            onClick={() => setAddOpen(true)}
            className="gap-2 bg-[hsl(200,100%,50%)] hover:bg-[hsl(200,100%,45%)] text-white border-0"
          >
            <Plus className="h-4 w-4" /> Add Server
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {mockServers.map((server) => (
            <Card
              key={server.id}
              className="bg-[hsl(222,47%,10%)] border-[hsl(220,20%,14%)] text-[hsl(210,40%,96%)] hover:border-[hsl(220,20%,20%)] transition-colors cursor-pointer"
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-[hsl(200,100%,50%)]/10 flex items-center justify-center">
                      <Server className="h-5 w-5 text-[hsl(200,100%,50%)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{server.name}</p>
                      <p className="text-xs text-[hsl(215,20%,45%)] font-mono">{server.ip}</p>
                    </div>
                  </div>
                  <Badge className={`text-[10px] font-medium border-0 ${statusStyles[server.status]}`}>
                    {server.status}
                  </Badge>
                </div>

                <div className="flex items-center gap-4 text-xs text-[hsl(215,20%,45%)]">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {server.region}
                  </span>
                  <span>{server.os}</span>
                  <span>{server.containers} containers</span>
                </div>

                {server.status === "online" && (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-1 text-[hsl(215,20%,55%)]">
                          <Cpu className="h-3 w-3" /> CPU
                        </span>
                        <span className="font-mono">{server.cpu}%</span>
                      </div>
                      <ProgressBar value={server.cpu} color={server.cpu > 80 ? "hsl(0,84%,60%)" : server.cpu > 60 ? "hsl(38,92%,50%)" : "hsl(200,100%,50%)"} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-1 text-[hsl(215,20%,55%)]">
                          <MemoryStick className="h-3 w-3" /> Memory
                        </span>
                        <span className="font-mono">{server.memory}%</span>
                      </div>
                      <ProgressBar value={server.memory} color={server.memory > 85 ? "hsl(0,84%,60%)" : server.memory > 70 ? "hsl(38,92%,50%)" : "hsl(260,100%,65%)"} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-1 text-[hsl(215,20%,55%)]">
                          <HardDrive className="h-3 w-3" /> Disk
                        </span>
                        <span className="font-mono">{server.disk}%</span>
                      </div>
                      <ProgressBar value={server.disk} color={server.disk > 80 ? "hsl(0,84%,60%)" : "hsl(142,71%,45%)"} />
                    </div>
                  </div>
                )}

                {server.status === "online" && (
                  <p className="text-[11px] text-[hsl(215,20%,40%)]">Uptime: {server.uptime}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Add Server Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[hsl(222,47%,10%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)]">
          <DialogHeader>
            <DialogTitle>Add Server</DialogTitle>
            <DialogDescription className="text-[hsl(215,20%,55%)]">
              Connect a new VPS to your dashboard
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[hsl(215,20%,55%)]">Server Name</Label>
              <Input placeholder="e.g. prod-web-02" className="bg-[hsl(220,20%,12%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)]" />
            </div>
            <div className="space-y-2">
              <Label className="text-[hsl(215,20%,55%)]">IP Address</Label>
              <Input placeholder="e.g. 192.168.1.100" className="bg-[hsl(220,20%,12%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)]" />
            </div>
            <div className="space-y-2">
              <Label className="text-[hsl(215,20%,55%)]">SSH Key (paste public key)</Label>
              <textarea
                rows={3}
                placeholder="ssh-rsa AAAA..."
                className="w-full rounded-md bg-[hsl(220,20%,12%)] border border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)] p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(200,100%,50%)]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[hsl(215,20%,55%)]">Region</Label>
              <Input placeholder="e.g. US East" className="bg-[hsl(220,20%,12%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} className="text-[hsl(215,20%,55%)] hover:bg-[hsl(220,20%,14%)]">
              Cancel
            </Button>
            <Button className="bg-[hsl(200,100%,50%)] hover:bg-[hsl(200,100%,45%)] text-white border-0">
              Connect Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VisionaryLayout>
  );
}
