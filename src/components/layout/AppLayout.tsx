import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  User,
  Settings,
  CreditCard,
  Clock,
  Map,
  List,
  Sparkles,
  Upload,
  Briefcase,
  Users,
  Shield,
  PanelLeft,
  Menu,
  X,
} from "lucide-react";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useAuth } from "@/hooks/use-auth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { LogoWordmark } from "@/components/branding/LogoWordmark";
import { TrialBanner } from "@/components/trial/TrialBanner";
import { TrialExpiredModal } from "@/components/trial/TrialExpiredModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AppLayoutProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}

const SIDEBAR_COLLAPSED_KEY = "sidebar:collapsed";

export function AppLayout({ children }: AppLayoutProps) {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isVA } = useUserRole();
  const {
    isOnTrial,
    hasTrialExpired,
    trialDaysRemaining,
    trialTier,
    hasActiveSubscription,
    subscriptionStatus,
  } = useTrialStatus();
  const isMobile = useIsMobile();

  // Sidebar state
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persist collapse state
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Determine if user has a paid (non-trial) subscription
  const isPaidSubscriber =
    hasActiveSubscription &&
    subscriptionStatus &&
    !["trial", "trialing"].includes(subscriptionStatus);

  const trialTierDisplay =
    trialTier === "professional"
      ? "Pro"
      : trialTier === "enterprise"
        ? "Elite"
        : "Starter";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Build nav items based on role
  const navItems: NavItem[] = [
    { name: "Properties", path: "/properties", icon: Map },
    { name: "Lists", path: "/lists", icon: List },
    { name: "Scan", path: "/enrich", icon: Sparkles, comingSoon: !isAdmin },
  ];

  if (isAdmin || isVA) {
    navItems.push(
      { name: "Upload", path: "/upload", icon: Upload },
      { name: "Jobs", path: "/jobs", icon: Briefcase }
    );
  }

  if (isVA || isAdmin) {
    navItems.push({ name: "VA Workspace", path: "/va-workspace", icon: Users });
  }

  if (isAdmin) {
    navItems.push({ name: "Admin", path: "/admin-console", icon: Shield });
  }

  const sidebarWidth = collapsed ? "w-[60px]" : "w-[220px]";

  // Sidebar content (shared between desktop and mobile)
  const renderNavItems = (showLabels: boolean) =>
    navItems.map((item) => {
      const isActive =
        location.pathname === item.path ||
        (item.path !== "/properties" && location.pathname.startsWith(item.path + "/"));
      const Icon = item.icon;
      const disabled = !!item.comingSoon;

      const linkContent = disabled ? (
        <div
          key={item.path}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium opacity-50 cursor-not-allowed text-slate-400 ${!showLabels ? "justify-center" : ""}`}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {showLabels && (
            <>
              <span className="truncate">{item.name}</span>
              <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400 leading-none whitespace-nowrap">
                Soon
              </span>
            </>
          )}
        </div>
      ) : (
        <Link
          key={item.path}
          to={item.path}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive
              ? "bg-white/10 text-white"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          } ${!showLabels ? "justify-center" : ""}`}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {showLabels && <span className="truncate">{item.name}</span>}
        </Link>
      );

      // In collapsed mode, wrap each item in a tooltip
      if (!showLabels) {
        return (
          <Tooltip key={item.path} delayDuration={0}>
            <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {item.name}{disabled ? " (Coming Soon)" : ""}
            </TooltipContent>
          </Tooltip>
        );
      }

      return <div key={item.path}>{linkContent}</div>;
    });

  return (
    <div className="min-h-screen bg-background">
      {/* Trial Banner */}
      <TrialBanner />
      <TrialExpiredModal />

      {/* Top Bar — logo + bell + avatar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/75 supports-[backdrop-filter]:bg-white/55 border-b border-slate-200/70 pt-[env(safe-area-inset-top)]">
        <div className="px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <LogoWordmark className="text-[18px] leading-none" />
          </div>

          {/* Right side: bell + user dropdown */}
          <div className="flex items-center gap-1">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 gap-2"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm truncate max-w-[120px]">
                    {user?.email?.split("@")[0] || "Account"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {user?.email && (
                  <>
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium truncate">
                        {user.email}
                      </p>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}

                {/* Trial status */}
                {(isOnTrial || hasTrialExpired) && !isPaidSubscriber && (
                  <>
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium">
                        {isOnTrial
                          ? `${trialTierDisplay} Trial`
                          : "Trial Expired"}
                      </p>
                      {isOnTrial && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Expires in {trialDaysRemaining} day
                          {trialDaysRemaining !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                    <DropdownMenuItem asChild>
                      <Link
                        to="/pricing"
                        className="flex items-center gap-2 cursor-pointer text-cyan-600"
                      >
                        <CreditCard className="h-4 w-4" />
                        {isOnTrial ? "View Pricing" : "Upgrade Now"}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}

                {location.pathname !== "/settings" && (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/settings"
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                )}

                {location.pathname !== "/settings" && (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/settings?tab=subscription"
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <CreditCard className="h-4 w-4" />
                      Billing
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside
        className={`fixed left-0 top-14 bottom-0 z-30 hidden md:flex flex-col bg-slate-900 transition-[width] duration-200 ease-in-out ${sidebarWidth}`}
      >
        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-1 px-2 py-4 overflow-y-auto">
          {renderNavItems(!collapsed)}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-white/10 px-2 py-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors w-full ${
              collapsed ? "justify-center" : ""
            }`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft
              className={`h-[18px] w-[18px] shrink-0 transition-transform ${
                collapsed ? "rotate-180" : ""
              }`}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Slide-out panel */}
          <aside className="fixed left-0 top-0 bottom-0 z-50 w-[260px] bg-slate-900 flex flex-col md:hidden animate-in slide-in-from-left duration-200">
            {/* Mobile sidebar header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-white/10">
              <span className="text-white font-semibold text-sm">Menu</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {/* Nav items */}
            <nav className="flex-1 flex flex-col gap-1 px-2 py-4 overflow-y-auto">
              {renderNavItems(true)}
            </nav>
          </aside>
        </>
      )}

      {/* Main Content — offset by sidebar width on desktop */}
      <main
        className={`pb-0 transition-[margin-left] duration-200 ease-in-out ${
          collapsed ? "md:ml-[60px]" : "md:ml-[220px]"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
