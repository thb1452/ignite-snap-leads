import { VisionaryLayout } from "@/components/visionary/VisionaryLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Server,
  Container,
  Cpu,
  MemoryStick,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  HardDrive,
} from "lucide-react";
import {
  dashboardStats,
  cpuHistory,
  memoryHistory,
  mockDeployments,
  mockContainers,
} from "@/data/visionaryMockData";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const statCards = [
  {
    label: "Total Servers",
    value: dashboardStats.totalServers,
    sub: `${dashboardStats.onlineServers} online`,
    icon: Server,
    color: "hsl(200,100%,50%)",
    trend: "+1",
    up: true,
  },
  {
    label: "Containers",
    value: dashboardStats.totalContainers,
    sub: `${dashboardStats.runningContainers} running`,
    icon: Container,
    color: "hsl(260,100%,65%)",
    trend: "+2",
    up: true,
  },
  {
    label: "Avg CPU",
    value: `${dashboardStats.avgCpu}%`,
    sub: "across all servers",
    icon: Cpu,
    color: "hsl(142,71%,45%)",
    trend: "-5%",
    up: false,
  },
  {
    label: "Avg Memory",
    value: `${dashboardStats.avgMemory}%`,
    sub: "across all servers",
    icon: MemoryStick,
    color: "hsl(38,92%,50%)",
    trend: "+3%",
    up: true,
  },
];

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-[hsl(142,71%,45%)]",
    success: "bg-[hsl(142,71%,45%)]",
    stopped: "bg-[hsl(215,20%,45%)]",
    error: "bg-[hsl(0,84%,60%)]",
    failed: "bg-[hsl(0,84%,60%)]",
    deploying: "bg-[hsl(38,92%,50%)] animate-pulse",
    restarting: "bg-[hsl(38,92%,50%)] animate-pulse",
    queued: "bg-[hsl(215,20%,45%)]",
  };
  return <span className={`h-2 w-2 rounded-full inline-block ${colors[status] || "bg-[hsl(215,20%,45%)]"}`} />;
}

export default function VisionaryDashboard() {
  return (
    <VisionaryLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[hsl(215,20%,55%)] mt-1">
            Overview of your infrastructure
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((s) => (
            <Card
              key={s.label}
              className="bg-[hsl(222,47%,10%)] border-[hsl(220,20%,14%)] text-[hsl(210,40%,96%)]"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-[hsl(215,20%,55%)] uppercase tracking-wider">
                      {s.label}
                    </p>
                    <p className="text-3xl font-bold mt-1">{s.value}</p>
                    <p className="text-xs text-[hsl(215,20%,45%)] mt-1">{s.sub}</p>
                  </div>
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${s.color}15` }}
                  >
                    <s.icon className="h-5 w-5" style={{ color: s.color }} />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3 text-xs">
                  {s.up ? (
                    <ArrowUpRight className="h-3 w-3 text-[hsl(142,71%,45%)]" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-[hsl(200,100%,50%)]" />
                  )}
                  <span className={s.up ? "text-[hsl(142,71%,45%)]" : "text-[hsl(200,100%,50%)]"}>
                    {s.trend}
                  </span>
                  <span className="text-[hsl(215,20%,45%)]">vs last week</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-[hsl(222,47%,10%)] border-[hsl(220,20%,14%)] text-[hsl(210,40%,96%)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-[hsl(210,40%,96%)]">
                <Cpu className="h-4 w-4 text-[hsl(200,100%,50%)]" /> CPU Usage (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cpuHistory}>
                    <defs>
                      <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(200,100%,50%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(200,100%,50%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,16%)" />
                    <XAxis dataKey="time" tick={{ fill: "hsl(215,20%,45%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "hsl(215,20%,45%)", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(222,47%,12%)", border: "1px solid hsl(220,20%,18%)", borderRadius: 8, color: "hsl(210,40%,96%)" }}
                      formatter={(v: number) => [`${v}%`, "CPU"]}
                    />
                    <Area type="monotone" dataKey="value" stroke="hsl(200,100%,50%)" strokeWidth={2} fill="url(#cpuGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[hsl(222,47%,10%)] border-[hsl(220,20%,14%)] text-[hsl(210,40%,96%)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-[hsl(210,40%,96%)]">
                <MemoryStick className="h-4 w-4 text-[hsl(260,100%,65%)]" /> Memory Usage (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={memoryHistory}>
                    <defs>
                      <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(260,100%,65%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(260,100%,65%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,16%)" />
                    <XAxis dataKey="time" tick={{ fill: "hsl(215,20%,45%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "hsl(215,20%,45%)", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(222,47%,12%)", border: "1px solid hsl(220,20%,18%)", borderRadius: 8, color: "hsl(210,40%,96%)" }}
                      formatter={(v: number) => [`${v}%`, "Memory"]}
                    />
                    <Area type="monotone" dataKey="value" stroke="hsl(260,100%,65%)" strokeWidth={2} fill="url(#memGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Deployments */}
          <Card className="bg-[hsl(222,47%,10%)] border-[hsl(220,20%,14%)] text-[hsl(210,40%,96%)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-[hsl(210,40%,96%)]">
                <Activity className="h-4 w-4 text-[hsl(142,71%,45%)]" /> Recent Deployments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockDeployments.slice(0, 4).map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-[hsl(220,20%,12%)] last:border-0">
                  <div className="flex items-center gap-3">
                    <StatusDot status={d.status} />
                    <div>
                      <p className="text-sm font-medium">{d.appName}</p>
                      <p className="text-xs text-[hsl(215,20%,45%)]">{d.timestamp}</p>
                    </div>
                  </div>
                  <Badge
                    className={`text-[10px] font-medium border-0 ${
                      d.status === "success"
                        ? "bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,45%)]"
                        : d.status === "failed"
                          ? "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)]"
                          : d.status === "deploying"
                            ? "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)]"
                            : "bg-[hsl(215,20%,45%)]/15 text-[hsl(215,20%,45%)]"
                    }`}
                  >
                    {d.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Container Status */}
          <Card className="bg-[hsl(222,47%,10%)] border-[hsl(220,20%,14%)] text-[hsl(210,40%,96%)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-[hsl(210,40%,96%)]">
                <HardDrive className="h-4 w-4 text-[hsl(38,92%,50%)]" /> Container Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockContainers.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-[hsl(220,20%,12%)] last:border-0">
                  <div className="flex items-center gap-3">
                    <StatusDot status={c.status} />
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-[hsl(215,20%,45%)]">{c.image}</p>
                    </div>
                  </div>
                  <span className="text-xs text-[hsl(215,20%,45%)]">{c.serverName}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </VisionaryLayout>
  );
}
