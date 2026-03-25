import { VisionaryLayout } from "@/components/visionary/VisionaryLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, Square, RotateCcw, Trash2, Plus } from "lucide-react";
import { mockContainers } from "@/data/visionaryMockData";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const statusStyles: Record<string, string> = {
  running: "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)]",
  stopped: "bg-[hsl(215,20%,45%)]/15 text-[hsl(215,20%,45%)]",
  restarting: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)]",
  error: "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)]",
};

function ActionButton({ icon: Icon, label, destructive }: { icon: React.ComponentType<{ className?: string }>; label: string; destructive?: boolean }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${
            destructive
              ? "text-[hsl(0,84%,60%)] hover:bg-[hsl(0,84%,60%)]/10"
              : "text-[hsl(215,20%,55%)] hover:text-[hsl(210,40%,96%)] hover:bg-[hsl(220,20%,14%)]"
          }`}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="bg-[hsl(220,20%,14%)] text-[hsl(210,40%,96%)] border-[hsl(220,20%,18%)]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export default function VisionaryContainers() {
  return (
    <VisionaryLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Containers</h1>
            <p className="text-sm text-[hsl(215,20%,55%)] mt-1">
              {mockContainers.length} containers · {mockContainers.filter((c) => c.status === "running").length} running
            </p>
          </div>
          <Button className="gap-2 bg-[hsl(200,100%,50%)] hover:bg-[hsl(200,100%,45%)] text-white border-0">
            <Plus className="h-4 w-4" /> Run Container
          </Button>
        </div>

        <div className="rounded-xl border border-[hsl(220,20%,14%)] bg-[hsl(222,47%,10%)] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-[hsl(220,20%,14%)] hover:bg-transparent">
                <TableHead className="text-[hsl(215,20%,45%)] text-xs uppercase tracking-wider font-medium">Container</TableHead>
                <TableHead className="text-[hsl(215,20%,45%)] text-xs uppercase tracking-wider font-medium">Image</TableHead>
                <TableHead className="text-[hsl(215,20%,45%)] text-xs uppercase tracking-wider font-medium">Status</TableHead>
                <TableHead className="text-[hsl(215,20%,45%)] text-xs uppercase tracking-wider font-medium">Server</TableHead>
                <TableHead className="text-[hsl(215,20%,45%)] text-xs uppercase tracking-wider font-medium">Ports</TableHead>
                <TableHead className="text-[hsl(215,20%,45%)] text-xs uppercase tracking-wider font-medium">Uptime</TableHead>
                <TableHead className="text-[hsl(215,20%,45%)] text-xs uppercase tracking-wider font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockContainers.map((c) => (
                <TableRow key={c.id} className="border-[hsl(220,20%,12%)] hover:bg-[hsl(220,20%,12%)] text-[hsl(210,40%,96%)]">
                  <TableCell className="font-medium text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${c.status === "running" ? "bg-[hsl(142,71%,45%)]" : c.status === "error" ? "bg-[hsl(0,84%,60%)]" : c.status === "restarting" ? "bg-[hsl(38,92%,50%)] animate-pulse" : "bg-[hsl(215,20%,35%)]"}`} />
                      {c.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-[hsl(215,20%,55%)]">{c.image}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] font-medium border-0 ${statusStyles[c.status]}`}>
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-[hsl(215,20%,55%)]">{c.serverName}</TableCell>
                  <TableCell className="text-xs font-mono text-[hsl(215,20%,45%)]">{c.ports}</TableCell>
                  <TableCell className="text-xs text-[hsl(215,20%,45%)]">{c.uptime}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      {c.status === "stopped" || c.status === "error" ? (
                        <ActionButton icon={Play} label="Start" />
                      ) : (
                        <ActionButton icon={Square} label="Stop" />
                      )}
                      <ActionButton icon={RotateCcw} label="Restart" />
                      <ActionButton icon={Trash2} label="Delete" destructive />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </VisionaryLayout>
  );
}
