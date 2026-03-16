import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/externalClient";
import {
  Users,
  AlertTriangle,
  DollarSign,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";

const ADMIN_EMAIL = "juniordorelien@gmail.com";

// ── Types ────────────────────────────────────────────────────────
interface AdminUser {
  userId: string;
  email: string;
  planName: string;
  displayName: string;
  status: string;
  trialEndsAt: string | null;
  trialTier: string | null;
  exportsCount: number;
  maxExports: number;
  lastActive: string | null;
  stripeCustomerId: string | null;
  priceMonthlyCents: number;
}

interface ExportLog {
  id: string;
  created_at: string;
  state_filter: string | null;
  city_filter: string | null;
  row_count: number;
  filters: Record<string, unknown>;
}

// ── Main Component ───────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [exportLogs, setExportLogs] = useState<ExportLog[]>([]);
  const [exportLogsLoading, setExportLogsLoading] = useState(false);

  // Guard: redirect non-admin users
  useEffect(() => {
    if (!authLoading && (!user || user.email !== ADMIN_EMAIL)) {
      navigate("/", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Fetch all user data
  const fetchData = async () => {
    try {
      // Fetch subscriptions with plan info
      const { data: subs, error: subsErr } = await supabase
        .from("user_subscriptions")
        .select(`
          user_id,
          status,
          plan_id,
          stripe_customer_id,
          trial_ends_at,
          trial_tier,
          current_period_start,
          current_period_end,
          updated_at,
          subscription_plans (
            name,
            display_name,
            max_monthly_exports,
            price_monthly_cents
          )
        `);

      if (subsErr) throw subsErr;

      // Fetch usage data
      const { data: usageData, error: usageErr } = await supabase
        .from("subscription_usage")
        .select("user_id, exports_count, period_start, period_end");

      if (usageErr) throw usageErr;

      // Fetch profiles for email info
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, email, updated_at");

      if (profErr) throw profErr;

      // Build lookup maps
      const usageMap = new Map<string, number>();
      if (usageData) {
        const now = new Date();
        for (const u of usageData) {
          // Only count current period usage
          if (u.period_start && u.period_end) {
            const start = new Date(u.period_start);
            const end = new Date(u.period_end);
            if (now >= start && now <= end) {
              usageMap.set(u.user_id, u.exports_count);
            }
          } else {
            usageMap.set(u.user_id, u.exports_count);
          }
        }
      }

      const profileMap = new Map<string, { email: string; lastActive: string | null }>();
      if (profiles) {
        for (const p of profiles) {
          profileMap.set(p.user_id, {
            email: p.email || "unknown",
            lastActive: p.updated_at,
          });
        }
      }

      // Build user list
      const userList: AdminUser[] = (subs || []).map((sub: any) => {
        const plan = sub.subscription_plans;
        const profile = profileMap.get(sub.user_id);
        return {
          userId: sub.user_id,
          email: profile?.email || "unknown",
          planName: plan?.name || "unknown",
          displayName: plan?.display_name || "Unknown",
          status: sub.status,
          trialEndsAt: sub.trial_ends_at,
          trialTier: sub.trial_tier,
          exportsCount: usageMap.get(sub.user_id) ?? 0,
          maxExports: plan?.max_monthly_exports ?? 0,
          lastActive: profile?.lastActive || sub.updated_at,
          stripeCustomerId: sub.stripe_customer_id,
          priceMonthlyCents: plan?.price_monthly_cents ?? 0,
        };
      });

      setUsers(userList);
    } catch (err) {
      console.error("[AdminDashboard] Failed to fetch data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.email === ADMIN_EMAIL) {
      fetchData();
    }
  }, [user]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Fetch export logs for a specific user
  const fetchExportLogs = async (userId: string) => {
    setExportLogsLoading(true);
    try {
      const { data, error } = await supabase
        .from("export_logs" as any)
        .select("id, created_at, state_filter, city_filter, row_count, filters")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setExportLogs((data as ExportLog[]) || []);
    } catch (err) {
      console.error("[AdminDashboard] Failed to fetch export logs:", err);
      setExportLogs([]);
    } finally {
      setExportLogsLoading(false);
    }
  };

  const toggleExpand = (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setExportLogs([]);
    } else {
      setExpandedUserId(userId);
      fetchExportLogs(userId);
    }
  };

  // ── Summary Stats ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    let activeCount = 0;
    let pastDueCount = 0;
    let trialCount = 0;
    let trialExpiringCount = 0;
    let mrr = 0;
    let totalExports = 0;

    for (const u of users) {
      if (u.status === "active") {
        activeCount++;
        mrr += u.priceMonthlyCents;
      }
      if (u.status === "past_due") pastDueCount++;
      if (u.status === "trial" || u.status === "trialing") {
        trialCount++;
        if (u.trialEndsAt) {
          const expiresAt = new Date(u.trialEndsAt);
          if (expiresAt <= threeDaysFromNow && expiresAt >= now) {
            trialExpiringCount++;
          }
        }
      }
      totalExports += u.exportsCount;
    }

    return { activeCount, pastDueCount, trialCount, trialExpiringCount, mrr, totalExports };
  }, [users]);

  // ── Filtered users ─────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.planName.toLowerCase().includes(q) ||
        u.status.toLowerCase().includes(q)
    );
  }, [users, search]);

  // ── Status badge helper ────────────────────────────────────────
  const statusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/15 text-green-700 border-green-500/30">Active</Badge>;
      case "past_due":
        return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">Past Due</Badge>;
      case "trial":
      case "trialing":
        return <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30">Trial</Badge>;
      case "cancelled":
      case "canceled":
        return <Badge className="bg-red-500/15 text-red-700 border-red-500/30">Canceled</Badge>;
      case "expired":
        return <Badge className="bg-gray-500/15 text-gray-700 border-gray-500/30">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // ── Export progress bar ────────────────────────────────────────
  const exportBar = (count: number, max: number) => {
    const isUnlimited = max === -1;
    const pct = isUnlimited ? 0 : max > 0 ? Math.min(100, (count / max) * 100) : 0;
    const isHigh = pct >= 80;

    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isHigh ? "bg-amber-500" : "bg-primary"
            }`}
            style={{ width: isUnlimited ? "0%" : `${pct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {count.toLocaleString()}/{isUnlimited ? "∞" : max.toLocaleString()}
        </span>
      </div>
    );
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (user?.email !== ADMIN_EMAIL) return null;

  return (
    <AppLayout>
      <div className="container mx-auto py-4 px-4 max-w-7xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Active</span>
            </div>
            <p className="text-2xl font-bold">{stats.activeCount}</p>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs">Past Due</span>
            </div>
            <p className="text-2xl font-bold">{stats.pastDueCount}</p>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Trials</span>
            </div>
            <p className="text-2xl font-bold">
              {stats.trialCount}
              {stats.trialExpiringCount > 0 && (
                <span className="text-sm font-normal text-red-600 ml-1">
                  ({stats.trialExpiringCount} expiring)
                </span>
              )}
            </p>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">MRR</span>
            </div>
            <p className="text-2xl font-bold">
              ${(stats.mrr / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}
            </p>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Download className="h-4 w-4" />
              <span className="text-xs">Total Exports</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalExports.toLocaleString()}</p>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email, plan, or status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Users Table */}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3 text-left">Email</th>
                  <th className="p-3 text-left hidden md:table-cell">Plan</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left hidden md:table-cell">Trial Expiry</th>
                  <th className="p-3 text-left">Exports</th>
                  <th className="p-3 text-left hidden lg:table-cell">Last Active</th>
                  <th className="p-3 text-left hidden lg:table-cell">Stripe</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      {search ? "No users match your search" : "No user data available"}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <>
                      <tr
                        key={u.userId}
                        className="border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggleExpand(u.userId)}
                      >
                        <td className="p-3">
                          <div>
                            <span className="font-medium">{u.email}</span>
                            {/* Show plan on mobile where column is hidden */}
                            <span className="block md:hidden text-xs text-muted-foreground">
                              {u.displayName}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <Badge variant="secondary">{u.displayName}</Badge>
                        </td>
                        <td className="p-3">{statusBadge(u.status)}</td>
                        <td className="p-3 hidden md:table-cell">
                          {u.trialEndsAt ? (
                            <span
                              className={
                                new Date(u.trialEndsAt) <=
                                new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
                                  ? "text-red-600 font-medium"
                                  : ""
                              }
                            >
                              {new Date(u.trialEndsAt).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">{exportBar(u.exportsCount, u.maxExports)}</td>
                        <td className="p-3 hidden lg:table-cell text-muted-foreground">
                          {u.lastActive
                            ? new Date(u.lastActive).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="p-3 hidden lg:table-cell">
                          {u.stripeCustomerId ? (
                            <a
                              href={`https://dashboard.stripe.com/customers/${u.stripeCustomerId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                            >
                              {u.stripeCustomerId.slice(0, 14)}...
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          {expandedUserId === u.userId ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                      </tr>

                      {/* Expanded row: export history */}
                      {expandedUserId === u.userId && (
                        <tr key={`${u.userId}-logs`}>
                          <td colSpan={8} className="p-0">
                            <div className="bg-muted/20 border-b px-4 py-3">
                              {/* Mobile-only details */}
                              <div className="md:hidden space-y-2 mb-3 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Trial Expiry:</span>
                                  <span>
                                    {u.trialEndsAt
                                      ? new Date(u.trialEndsAt).toLocaleDateString()
                                      : "—"}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Last Active:</span>
                                  <span>
                                    {u.lastActive
                                      ? new Date(u.lastActive).toLocaleDateString()
                                      : "—"}
                                  </span>
                                </div>
                                {u.stripeCustomerId && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Stripe:</span>
                                    <a
                                      href={`https://dashboard.stripe.com/customers/${u.stripeCustomerId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                    >
                                      {u.stripeCustomerId.slice(0, 14)}...
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                )}
                              </div>

                              <h4 className="text-sm font-semibold mb-2">Export History</h4>
                              {exportLogsLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Loading...
                                </div>
                              ) : exportLogs.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">
                                  No export history found
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="p-2 text-left">Date</th>
                                        <th className="p-2 text-left">Rows</th>
                                        <th className="p-2 text-left">State</th>
                                        <th className="p-2 text-left">City</th>
                                        <th className="p-2 text-left hidden md:table-cell">
                                          Filters
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {exportLogs.map((log) => (
                                        <tr key={log.id} className="border-b border-border/50">
                                          <td className="p-2 whitespace-nowrap">
                                            {new Date(log.created_at).toLocaleString(undefined, {
                                              month: "short",
                                              day: "numeric",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}
                                          </td>
                                          <td className="p-2 font-medium">
                                            {log.row_count.toLocaleString()}
                                          </td>
                                          <td className="p-2">{log.state_filter || "—"}</td>
                                          <td className="p-2">{log.city_filter || "—"}</td>
                                          <td className="p-2 hidden md:table-cell">
                                            {log.filters &&
                                            Object.keys(log.filters).length > 0 ? (
                                              <span className="text-muted-foreground">
                                                {Object.entries(log.filters)
                                                  .filter(
                                                    ([k]) =>
                                                      k !== "sortBy" &&
                                                      k !== "state" &&
                                                      k !== "cities"
                                                  )
                                                  .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                                                  .join(", ") || "—"}
                                              </span>
                                            ) : (
                                              "—"
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
