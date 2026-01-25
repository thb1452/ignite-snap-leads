import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUserRole } from "@/hooks/useUserRole";
import { LogoWordmark } from "@/components/branding/LogoWordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, CreditCard, LayoutDashboard, ListChecks } from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const { isAdmin, isVA } = useUserRole();

  const handleSignOut = async () => {
    await signOut();
  };

  // Main navigation items - simplified and role-based
  const mainNavItems = [];
  
  // Admin sees full navigation
  if (isAdmin) {
    mainNavItems.push(
      { name: "Properties", path: "/" },
      { name: "Lists", path: "/lists" }
    );
  }
  
  // Upload/Jobs for admin + VA
  if (isAdmin || isVA) {
    mainNavItems.push(
      { name: "Upload", path: "/upload" },
      { name: "Jobs", path: "/jobs" }
    );
  }
  
  // VA Workspace for VA + admin
  if (isVA || isAdmin) {
    mainNavItems.push({ name: "VA Workspace", path: "/va-workspace" });
  }
  
  // Admin Console only for admins
  if (isAdmin) {
    mainNavItems.push({ name: "Admin", path: "/admin-console" });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar - consolidated with user menu */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/75 supports-[backdrop-filter]:bg-white/55 border-b border-slate-200/70 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-[1400px] px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/">
              <LogoWordmark className="text-[18px] leading-none" />
            </Link>
            <nav className="ml-6 hidden md:flex gap-4 text-sm font-ui">
              {mainNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`transition-colors ${
                      isActive
                        ? "text-ink-900 font-medium"
                        : "text-ink-500 hover:text-ink-900"
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
          
          {/* User dropdown menu - single location for user actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-3 gap-2">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline text-sm truncate max-w-[120px]">
                  {user?.email?.split('@')[0] || 'Account'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {user?.email && (
                <>
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium truncate">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              
              <DropdownMenuItem asChild>
                <Link to="/" className="flex items-center gap-2 cursor-pointer">
                  <LayoutDashboard className="h-4 w-4" />
                  Properties
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuItem asChild>
                <Link to="/lists" className="flex items-center gap-2 cursor-pointer">
                  <ListChecks className="h-4 w-4" />
                  My Lists
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuItem asChild>
                <Link to="/settings?tab=subscription" className="flex items-center gap-2 cursor-pointer">
                  <CreditCard className="h-4 w-4" />
                  Billing
                </Link>
              </DropdownMenuItem>
              
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
      </header>

      {/* Main Content */}
      <main className="w-full pb-16 md:pb-0">
        {children}
      </main>

      {/* Mobile Navigation - simplified */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white md:hidden">
        <div className="flex items-center justify-around h-14">
          {mainNavItems.slice(0, 4).map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-center px-3 py-2 flex-1 text-xs font-medium ${
                  isActive ? "text-brand" : "text-ink-500"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
          <Link
            to="/settings"
            className={`flex items-center justify-center px-3 py-2 flex-1 text-xs font-medium ${
              location.pathname === '/settings' ? "text-brand" : "text-ink-500"
            }`}
          >
            Settings
          </Link>
        </div>
      </nav>
    </div>
  );
}
