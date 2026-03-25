// Mock data for Visionary Server Dashboard UI

export interface Server {
  id: string;
  name: string;
  ip: string;
  status: "online" | "offline" | "maintenance";
  cpu: number;
  memory: number;
  disk: number;
  os: string;
  region: string;
  uptime: string;
  containers: number;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  status: "running" | "stopped" | "restarting" | "error";
  serverId: string;
  serverName: string;
  ports: string;
  cpu: number;
  memory: number;
  created: string;
  uptime: string;
}

export interface Deployment {
  id: string;
  appName: string;
  image: string;
  status: "success" | "failed" | "deploying" | "queued";
  timestamp: string;
  duration: string;
  triggeredBy: string;
  commit?: string;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

export const mockServers: Server[] = [
  { id: "srv-1", name: "prod-web-01", ip: "192.168.1.10", status: "online", cpu: 42, memory: 67, disk: 55, os: "Ubuntu 22.04", region: "US East", uptime: "45d 12h", containers: 6 },
  { id: "srv-2", name: "prod-api-01", ip: "192.168.1.11", status: "online", cpu: 78, memory: 82, disk: 40, os: "Ubuntu 22.04", region: "US East", uptime: "30d 8h", containers: 4 },
  { id: "srv-3", name: "staging-01", ip: "192.168.2.20", status: "online", cpu: 15, memory: 34, disk: 22, os: "Debian 12", region: "EU West", uptime: "12d 3h", containers: 3 },
  { id: "srv-4", name: "db-primary", ip: "10.0.0.5", status: "online", cpu: 55, memory: 91, disk: 72, os: "Ubuntu 24.04", region: "US East", uptime: "90d 1h", containers: 2 },
  { id: "srv-5", name: "worker-01", ip: "10.0.1.15", status: "offline", cpu: 0, memory: 0, disk: 65, os: "Ubuntu 22.04", region: "US West", uptime: "—", containers: 0 },
  { id: "srv-6", name: "monitoring", ip: "10.0.0.50", status: "maintenance", cpu: 8, memory: 25, disk: 30, os: "Alpine 3.19", region: "EU West", uptime: "5d 22h", containers: 2 },
];

export const mockContainers: Container[] = [
  { id: "ctr-1", name: "nginx-proxy", image: "nginx:1.25-alpine", status: "running", serverId: "srv-1", serverName: "prod-web-01", ports: "80:80, 443:443", cpu: 2, memory: 128, created: "2026-01-15", uptime: "45d 12h" },
  { id: "ctr-2", name: "app-frontend", image: "myapp/frontend:3.2.1", status: "running", serverId: "srv-1", serverName: "prod-web-01", ports: "3000:3000", cpu: 12, memory: 512, created: "2026-02-01", uptime: "30d 8h" },
  { id: "ctr-3", name: "api-gateway", image: "myapp/api:2.8.0", status: "running", serverId: "srv-2", serverName: "prod-api-01", ports: "8080:8080", cpu: 35, memory: 1024, created: "2026-02-10", uptime: "25d 4h" },
  { id: "ctr-4", name: "redis-cache", image: "redis:7-alpine", status: "running", serverId: "srv-2", serverName: "prod-api-01", ports: "6379:6379", cpu: 5, memory: 256, created: "2026-01-20", uptime: "40d 2h" },
  { id: "ctr-5", name: "postgres-db", image: "postgres:16-alpine", status: "running", serverId: "srv-4", serverName: "db-primary", ports: "5432:5432", cpu: 30, memory: 2048, created: "2025-12-01", uptime: "90d 1h" },
  { id: "ctr-6", name: "staging-app", image: "myapp/frontend:3.3.0-rc1", status: "stopped", serverId: "srv-3", serverName: "staging-01", ports: "3000:3000", cpu: 0, memory: 0, created: "2026-03-20", uptime: "—" },
  { id: "ctr-7", name: "worker-queue", image: "myapp/worker:1.4.2", status: "error", serverId: "srv-2", serverName: "prod-api-01", ports: "—", cpu: 0, memory: 0, created: "2026-03-10", uptime: "—" },
  { id: "ctr-8", name: "grafana", image: "grafana/grafana:10.3", status: "running", serverId: "srv-6", serverName: "monitoring", ports: "3001:3000", cpu: 8, memory: 384, created: "2026-01-05", uptime: "5d 22h" },
  { id: "ctr-9", name: "prometheus", image: "prom/prometheus:v2.50", status: "restarting", serverId: "srv-6", serverName: "monitoring", ports: "9090:9090", cpu: 0, memory: 0, created: "2026-01-05", uptime: "—" },
];

export const mockDeployments: Deployment[] = [
  { id: "dep-1", appName: "app-frontend", image: "myapp/frontend:3.2.1", status: "success", timestamp: "2026-03-25 09:14", duration: "2m 34s", triggeredBy: "admin", commit: "a1b2c3d" },
  { id: "dep-2", appName: "api-gateway", image: "myapp/api:2.8.0", status: "success", timestamp: "2026-03-24 18:45", duration: "3m 12s", triggeredBy: "CI/CD", commit: "e4f5g6h" },
  { id: "dep-3", appName: "worker-queue", image: "myapp/worker:1.4.2", status: "failed", timestamp: "2026-03-24 14:22", duration: "1m 05s", triggeredBy: "admin", commit: "i7j8k9l" },
  { id: "dep-4", appName: "staging-app", image: "myapp/frontend:3.3.0-rc1", status: "deploying", timestamp: "2026-03-25 10:02", duration: "—", triggeredBy: "CI/CD", commit: "m0n1o2p" },
  { id: "dep-5", appName: "redis-cache", image: "redis:7-alpine", status: "success", timestamp: "2026-03-23 08:30", duration: "0m 45s", triggeredBy: "admin" },
  { id: "dep-6", appName: "nginx-proxy", image: "nginx:1.25-alpine", status: "queued", timestamp: "2026-03-25 10:05", duration: "—", triggeredBy: "admin" },
];

export const mockLogs: Record<string, LogEntry[]> = {
  "nginx-proxy": [
    { timestamp: "2026-03-25T10:00:01Z", level: "info", message: '192.168.1.1 - - [25/Mar/2026:10:00:01 +0000] "GET / HTTP/1.1" 200 612' },
    { timestamp: "2026-03-25T10:00:02Z", level: "info", message: '192.168.1.2 - - [25/Mar/2026:10:00:02 +0000] "GET /api/health HTTP/1.1" 200 15' },
    { timestamp: "2026-03-25T10:00:05Z", level: "warn", message: "upstream timed out (110: Connection timed out) while reading response header from upstream" },
    { timestamp: "2026-03-25T10:00:08Z", level: "info", message: '10.0.0.1 - - [25/Mar/2026:10:00:08 +0000] "POST /api/deploy HTTP/1.1" 201 89' },
    { timestamp: "2026-03-25T10:00:12Z", level: "error", message: "connect() failed (111: Connection refused) while connecting to upstream, client: 192.168.1.5" },
    { timestamp: "2026-03-25T10:00:15Z", level: "info", message: '192.168.1.3 - - [25/Mar/2026:10:00:15 +0000] "GET /dashboard HTTP/1.1" 200 4521' },
    { timestamp: "2026-03-25T10:00:18Z", level: "debug", message: "SSL_do_handshake() successful for client 192.168.1.10" },
    { timestamp: "2026-03-25T10:00:22Z", level: "info", message: '192.168.1.4 - - [25/Mar/2026:10:00:22 +0000] "GET /static/js/main.js HTTP/1.1" 304 0' },
  ],
  "api-gateway": [
    { timestamp: "2026-03-25T10:00:00Z", level: "info", message: "Server listening on port 8080" },
    { timestamp: "2026-03-25T10:00:03Z", level: "info", message: "Health check passed — DB connection OK, Redis OK" },
    { timestamp: "2026-03-25T10:00:06Z", level: "warn", message: "Rate limit approaching for IP 192.168.1.50 (85/100 requests)" },
    { timestamp: "2026-03-25T10:00:09Z", level: "info", message: "POST /api/v1/users — 201 Created (14ms)" },
    { timestamp: "2026-03-25T10:00:11Z", level: "error", message: "Unhandled rejection: TypeError — Cannot read property 'id' of undefined at UserService.getById" },
    { timestamp: "2026-03-25T10:00:14Z", level: "info", message: "GET /api/v1/containers — 200 OK (8ms)" },
    { timestamp: "2026-03-25T10:00:17Z", level: "debug", message: "Cache HIT for key: user:abc123 (TTL: 245s remaining)" },
    { timestamp: "2026-03-25T10:00:20Z", level: "info", message: "WebSocket connection established — client #47" },
  ],
  "postgres-db": [
    { timestamp: "2026-03-25T10:00:00Z", level: "info", message: "database system is ready to accept connections" },
    { timestamp: "2026-03-25T10:00:02Z", level: "info", message: "checkpoint starting: time" },
    { timestamp: "2026-03-25T10:00:05Z", level: "info", message: "checkpoint complete: wrote 124 buffers (0.8%); 0 WAL file(s) added" },
    { timestamp: "2026-03-25T10:00:10Z", level: "warn", message: "connection from 10.0.0.3 not authenticated — password missing" },
    { timestamp: "2026-03-25T10:00:15Z", level: "info", message: "autovacuum: processing table \"public.events\"" },
    { timestamp: "2026-03-25T10:00:20Z", level: "error", message: "deadlock detected — Process 1234 waits for ShareLock on transaction 5678" },
  ],
};

export const dashboardStats = {
  totalServers: mockServers.length,
  onlineServers: mockServers.filter((s) => s.status === "online").length,
  totalContainers: mockContainers.length,
  runningContainers: mockContainers.filter((c) => c.status === "running").length,
  avgCpu: Math.round(mockServers.filter((s) => s.status === "online").reduce((a, s) => a + s.cpu, 0) / mockServers.filter((s) => s.status === "online").length),
  avgMemory: Math.round(mockServers.filter((s) => s.status === "online").reduce((a, s) => a + s.memory, 0) / mockServers.filter((s) => s.status === "online").length),
  recentDeployments: mockDeployments.filter((d) => d.status === "success").length,
  failedDeployments: mockDeployments.filter((d) => d.status === "failed").length,
};

export const cpuHistory = [
  { time: "00:00", value: 32 }, { time: "04:00", value: 28 }, { time: "08:00", value: 45 },
  { time: "12:00", value: 72 }, { time: "16:00", value: 65 }, { time: "20:00", value: 48 },
  { time: "Now", value: 42 },
];

export const memoryHistory = [
  { time: "00:00", value: 58 }, { time: "04:00", value: 55 }, { time: "08:00", value: 62 },
  { time: "12:00", value: 78 }, { time: "16:00", value: 74 }, { time: "20:00", value: 68 },
  { time: "Now", value: 67 },
];
