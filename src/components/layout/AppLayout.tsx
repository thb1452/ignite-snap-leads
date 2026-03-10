import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, User, Settings, CreditCard, Clock } from "lucide-react";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useAuth } from "@/hooks/use-auth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTrialStatus } from "@/hooks/useTrialStatus";
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

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isVA } = useUserRole();
  const { isOnTrial, hasTrialExpired, trialDaysRemaining, trialTier, hasActiveSubscription, subscriptionStatus } = useTrialStatus();

  // Determine if user has a paid (non-trial) subscription
  const isPaidSubscriber = hasActiveSubscription && subscriptionStatus && !['trial', 'trialing'].includes(subscriptionStatus);

  const trialTierDisplay = trialTier === 'professional' ? 'Pro' : trialTier === 'enterprise' ? 'Elite' : 'Starter';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Main navigation items - role-based but Properties/Lists visible to all users
  const mainNavItems: { name: string; path: string }[] = [
    { name: "Properties", path: "/properties" },
    { name: "Lists", path: "/lists" }
  ];
  
  // Upload/Jobs for admin + VA only
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
      {/* Trial Banner */}
      <TrialBanner />
      <TrialExpiredModal />
      {/* Navigation Bar - consolidated with user menu */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/75 supports-[backdrop-filter]:bg-white/55 border-b border-slate-200/70 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-[1400px] px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <LogoWordmark className="text-[18px] leading-none" />
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
          
          {/* Notification bell + User dropdown */}
          <div className="flex items-center gap-1">
            <NotificationBell />
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

               {/* Trial status in dropdown - hide if user has paid subscription */}
               {(isOnTrial || hasTrialExpired) && !isPaidSubscriber && (
                 <>
                   <div className="px-2 py-1.5">
                     <p className="text-sm font-medium">
                       {isOnTrial ? `${trialTierDisplay} Trial` : 'Trial Expired'}
                     </p>
                     {isOnTrial && (
                       <p className="text-xs text-muted-foreground flex items-center gap-1">
                         <Clock className="h-3 w-3" />
                         Expires in {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''}
                       </p>
                     )}
                   </div>
                   <DropdownMenuItem asChild>
                     <Link to="/pricing" className="flex items-center gap-2 cursor-pointer text-cyan-600">
                       <CreditCard className="h-4 w-4" />
                       {isOnTrial ? 'View Pricing' : 'Upgrade Now'}
                     </Link>
                   </DropdownMenuItem>
                   <DropdownMenuSeparator />
                 </>
               )}
               
              
              {/* Only show Settings link when not on settings page */}
              {location.pathname !== '/settings' && (
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
              )}
              
              {/* Only show Billing link when not on settings page */}
              {location.pathname !== '/settings' && (
                <DropdownMenuItem asChild>
                  <Link to="/settings?tab=subscription" className="flex items-center gap-2 cursor-pointer">
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
      </header>

      {/* Main Content */}
      <main className="w-full pb-16 md:pb-0">
        {children}
      </main>

      {/* Mobile Navigation - simplified */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white md:hidden">
        <div className="flex items-center justify-around h-14">
          {mainNavItems.slice(0, 5).map((item) => {
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
        </div>
      </nav>
    </div>
  );
}
