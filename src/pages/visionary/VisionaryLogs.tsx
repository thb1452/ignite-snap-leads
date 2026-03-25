import { useState, useRef, useEffect } from "react";
import { VisionaryLayout } from "@/components/visionary/VisionaryLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollText, ChevronDown, Download, Pause, Play } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { mockLogs, mockContainers } from "@/data/visionaryMockData";

const levelColors: Record<string, string> = {
  info: "text-[hsl(200,100%,60%)]",
  warn: "text-[hsl(38,92%,50%)]",
  error: "text-[hsl(0,84%,60%)]",
  debug: "text-[hsl(215,20%,50%)]",
};

const containerNames = Object.keys(mockLogs);

export default function VisionaryLogs() {
  const [selected, setSelected] = useState(containerNames[0]);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const logs = mockLogs[selected] || [];

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selected, paused]);

  return (
    <VisionaryLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Logs</h1>
            <p className="text-sm text-[hsl(215,20%,55%)] mt-1">
              Real-time container output
            </p>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 bg-[hsl(220,20%,12%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)] hover:bg-[hsl(220,20%,16%)]">
                  <ScrollText className="h-4 w-4 text-[hsl(200,100%,50%)]" />
                  {selected}
                  <ChevronDown className="h-3 w-3 text-[hsl(215,20%,45%)]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[hsl(222,47%,10%)] border-[hsl(220,20%,18%)] text-[hsl(210,40%,96%)]">
                {containerNames.map((name) => (
                  <DropdownMenuItem
                    key={name}
                    onClick={() => setSelected(name)}
                    className={`cursor-pointer hover:bg-[hsl(220,20%,14%)] ${selected === name ? "text-[hsl(200,100%,60%)]" : ""}`}
                  >
                    {name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPaused((p) => !p)}
              className="text-[hsl(215,20%,55%)] hover:text-[hsl(210,40%,96%)] hover:bg-[hsl(220,20%,14%)]"
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>

            <Button variant="ghost" size="icon" className="text-[hsl(215,20%,55%)] hover:text-[hsl(210,40%,96%)] hover:bg-[hsl(220,20%,14%)]">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Card className="bg-[hsl(222,84%,5%)] border-[hsl(220,20%,14%)] overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-[hsl(220,20%,12%)] bg-[hsl(222,47%,8%)]">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[hsl(0,84%,60%)]" />
                <span className="h-3 w-3 rounded-full bg-[hsl(38,92%,50%)]" />
                <span className="h-3 w-3 rounded-full bg-[hsl(142,71%,45%)]" />
              </div>
              <span className="text-xs text-[hsl(215,20%,45%)] font-mono ml-2">{selected} — logs</span>
              {paused && (
                <span className="ml-auto text-[10px] text-[hsl(38,92%,50%)] font-medium uppercase tracking-wider">
                  Paused
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div
              ref={scrollRef}
              className="h-[500px] overflow-y-auto font-mono text-[13px] leading-6 p-4 space-y-0"
            >
              {logs.map((log, i) => {
                const ts = new Date(log.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
                return (
                  <div key={i} className="flex gap-3 hover:bg-[hsl(220,20%,8%)] px-2 -mx-2 rounded">
                    <span className="text-[hsl(215,20%,35%)] select-none shrink-0 w-[70px]">{ts}</span>
                    <span className={`shrink-0 w-[42px] uppercase text-[11px] font-semibold ${levelColors[log.level]}`}>
                      {log.level}
                    </span>
                    <span className="text-[hsl(210,30%,80%)] break-all">{log.message}</span>
                  </div>
                );
              })}
              {/* Blinking cursor */}
              <div className="flex gap-3 px-2 -mx-2">
                <span className="text-[hsl(215,20%,35%)] select-none shrink-0 w-[70px]" />
                <span className="shrink-0 w-[42px]" />
                <span className="inline-block w-2 h-4 bg-[hsl(200,100%,50%)] animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </VisionaryLayout>
  );
}
