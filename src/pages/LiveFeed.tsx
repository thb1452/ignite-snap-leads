import SEOHead from "@/components/SEOHead";
import { LiveEnforcementCounter } from "@/components/live-feed/LiveEnforcementCounter";
import { LiveActivityFeed } from "@/components/live-feed/LiveActivityFeed";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function LiveFeed() {
  return (
    <>
      <SEOHead
        title="Live Enforcement Feed | Snap Ignite"
        description="Watch enforcement actions happen in real-time across 3,800+ municipalities. Code violations, water shutoffs, and municipal court filings updated live."
        canonical="https://ignite-snap-leads.lovable.app/live-feed"
      />

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground">
                  Live Enforcement Activity
                </h1>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
          <LiveEnforcementCounter />
          <LiveActivityFeed />
        </main>
      </div>
    </>
  );
}
