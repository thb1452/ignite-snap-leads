import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Server,
  Container,
  Rocket,
  ScrollText,
  PanelLeft,
  Bell,
  Search,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VisionaryLayoutProps {
  children: ReactNode;
}

const navItems = [
  { name: "Dashboard", path: "/vsd", icon: LayoutDashboard },
  { name: "Servers", path: "/vsd/servers", icon: Server },
  { name: "Containers", path: "/vsd/containers", icon: Container },
  { name: "Deployments", path: "/vsd/deployments", icon: Rocket },
  { name: "Logs", path: "/vsd/logs", icon: ScrollText },
];

export function VisionaryLayout({ children }: VisionaryLayoutProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const sidebarWidth = collapsed ? "w-[60px]" : "w-[240px]";

  return (
    <div className="min-h-screen bg-[hsl(222,47%,6%)] text-[hsl(210,40%,96%)]">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 h-14 flex items-center justify-between border-b border-[hsl(220,20%,14%)] bg-[hsl(222,47%,8%)]/80 backdrop-blur-md px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[hsl(200,100%,50%)] to-[hsl(260,100%,65%)] flex items-center justify-center">
              <Server className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight hidden sm:inline">
              Visionary<span className="text-[hsl(200,100%,60%)]">VSD</span>
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center max-w-sm w-full mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(215,20%,45%)]" />
            <Input
              placeholder="Search servers, containers…"
              className="pl-9 bg-[hsl(220,20%,12%)] border-[hsl(220,20%,18%)] text-sm text-[hsl(210,40%,96%)] placeholder:text-[hsl(215,20%,45%)] focus-visible:ring-[hsl(200,100%,50%)]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative text-[hsl(215,20%,55%)] hover:text-[hsl(210,40%,96%)] hover:bg-[hsl(220,20%,14%)]">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[hsl(200,100%,50%)]" />
          </Button>
          <Button variant="ghost" size="sm" className="gap-2 text-[hsl(215,20%,55%)] hover:text-[hsl(210,40%,96%)] hover:bg-[hsl(220,20%,14%)]">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[hsl(200,100%,50%)] to-[hsl(260,100%,65%)] flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="hidden sm:inline text-sm">Admin</span>
          </Button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed left-0 top-14 bottom-0 z-30 flex flex-col bg-[hsl(222,47%,8%)] border-r border-[hsl(220,20%,14%)] transition-[width] duration-200 ease-in-out",
            sidebarWidth
          )}
        >
          <nav className="flex-1 flex flex-col gap-1 px-2 py-4 overflow-y-auto">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path !== "/vsd" && location.pathname.startsWith(item.path));
              const Icon = item.icon;

              const link = (
                <Link
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-[hsl(200,100%,50%)]/10 text-[hsl(200,100%,60%)] shadow-[inset_2px_0_0_hsl(200,100%,50%)]"
                      : "text-[hsl(215,20%,55%)] hover:bg-[hsl(220,20%,14%)] hover:text-[hsl(210,40%,96%)]",
                    collapsed && "justify-center px-2"
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.path} delayDuration={0}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" className="font-medium bg-[hsl(220,20%,14%)] text-[hsl(210,40%,96%)] border-[hsl(220,20%,18%)]">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return <div key={item.path}>{link}</div>;
            })}
          </nav>

          {/* Status + Collapse */}
          <div className="border-t border-[hsl(220,20%,14%)] px-2 py-3 space-y-2">
            {!collapsed && (
              <div className="px-3 py-2 rounded-lg bg-[hsl(220,20%,10%)]">
                <div className="flex items-center gap-2 text-xs text-[hsl(215,20%,55%)]">
                  <span className="h-2 w-2 rounded-full bg-[hsl(142,71%,45%)] animate-pulse" />
                  All systems operational
                </div>
              </div>
            )}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(215,20%,55%)] hover:bg-[hsl(220,20%,14%)] hover:text-[hsl(210,40%,96%)] transition-colors w-full",
                collapsed && "justify-center"
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <PanelLeft className={cn("h-[18px] w-[18px] shrink-0 transition-transform", collapsed && "rotate-180")} />
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main
          className={cn(
            "flex-1 transition-[margin-left] duration-200 ease-in-out min-h-[calc(100vh-3.5rem)]",
            collapsed ? "ml-[60px]" : "ml-[240px]"
          )}
        >
          <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
