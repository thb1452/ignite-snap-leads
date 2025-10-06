import { ReactNode } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, FolderOpen, Settings as SettingsIcon, Map } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCreditBalance } from "@/hooks/useCredits";

export function AppLayout() {
  const { signOut } = useAuth();
  const location = useLocation();
  const { data: balance } = useCreditBalance();

  const handleSignOut = async () => {
    await signOut();
  };

  const navItems = [
    { name: "Dashboard", path: "/" },
    { name: "Lists", path: "/lists" },
    { name: "Map", path: "/map" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Premium Navigation Bar */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-xl">🔥</span>
              <span className="font-semibold text-ink-900 font-display">Snap Ignite</span>
            </Link>
            <nav className="ml-6 hidden md:flex gap-4 text-sm font-ui">
              {navItems.map((item) => {
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
          <div className="flex items-center gap-3">
            <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-ink-700 font-ui">
              {balance ?? 0} credits
            </span>
            <Button
              size="sm"
              className="px-3 py-1.5 text-sm rounded-xl bg-brand text-white hover:bg-brand/90"
            >
              Buy Credits
            </Button>
            <button
              onClick={handleSignOut}
              className="h-8 w-8 rounded-full bg-gradient-to-br from-brand/20 to-brand/40 hover:from-brand/30 hover:to-brand/50 transition-all"
              title="Sign Out"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white md:hidden">
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => {
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
          <button
            onClick={handleSignOut}
            className="flex items-center justify-center px-3 py-2 flex-1 text-xs font-medium text-ink-500"
          >
            Sign Out
          </button>
        </div>
      </nav>
    </div>
  );
}
