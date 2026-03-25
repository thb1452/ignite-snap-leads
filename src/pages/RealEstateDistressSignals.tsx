import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/brand/BrandLogo";
import SEOHead from "@/components/SEOHead";
import { ArrowRight, AlertTriangle, Flame, Droplets, FileWarning, Timer, TrendingDown } from "lucide-react";

export default function RealEstateDistressSignals() {

  return (
    <div className="landing-theme min-h-screen bg-[hsl(var(--landing-bg))] text-[hsl(var(--landing-text))]">
      <SEOHead title="Real Estate Distress Signals: The Enforcement Layer | Snap Ignite" description="Discover real estate distress signals most investors miss. Code violations, enforcement fines, and water shutoffs reveal motivated sellers before foreclosure lists do." canonical="https://snapignite.com/real-estate-distress-signals" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Real Estate Distress Signals: The Enforcement Layer Most Investors Miss",
        "description": "Discover real estate distress signals most investors miss. Enforcement data reveals motivated sellers before foreclosure lists do.",
        "url": "https://snapignite.com/real-estate-distress-signals",
        "publisher": { "@type": "Organization", "name": "Snap Ignite", "url": "https://snapignite.com" }
      })}} />

      <nav className="border-b border-[hsl(var(--landing-surface))] py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <BrandLogo size="md" />
          <div className="flex items-center gap-4">
            <Link to="/pricing"><Button variant="ghost" className="text-[hsl(var(--landing-text-muted))] hover:text-[hsl(var(--landing-text))]">Pricing</Button></Link>
            <Link to="/auth?mode=signup"><Button className="bg-[hsl(var(--landing-accent))] hover:bg-[hsl(var(--landing-accent))]/90 text-[hsl(var(--landing-bg))]">Start Free Trial</Button></Link>
          </div>
        </div>
      </nav>

      <section className="py-20 md:py-28 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Real Estate Distress Signals:{" "}
            <span className="text-[hsl(var(--landing-accent))]">The Enforcement Layer Most Investors Miss</span>
          </h1>
          <p className="text-lg md:text-xl text-[hsl(var(--landing-text-muted))] max-w-2xl mx-auto mb-8">
            Foreclosure filings are lagging indicators. By the time a property hits a tax sale list, dozens of investors are already competing for it. The real distress signals come earlier — from municipal enforcement.
          </p>
          <Link to="/auth?mode=signup">
            <Button size="lg" className="bg-[hsl(var(--landing-accent))] hover:bg-[hsl(var(--landing-accent))]/90 text-[hsl(var(--landing-bg))] px-8">
              Detect Distress Signals Now <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Signal Types */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">The Six Enforcement Distress Signals</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg max-w-3xl mx-auto text-center mb-12">
            Each signal alone indicates potential distress. When multiple signals converge on a single property, seller motivation skyrockets.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: AlertTriangle, title: "Active Code Violations", desc: "Open violations on record signal deferred maintenance and potential financial strain on the owner." },
              { icon: Flame, title: "Escalating Fines", desc: "Daily fines that compound create urgency — owners face mounting costs they may not be able to absorb." },
              { icon: Timer, title: "Enforcement Escalations", desc: "Multi-department actions and repeated citations create compounding pressure owners can't ignore." },
              { icon: Droplets, title: "Water Shutoffs", desc: "Utility disconnections indicate vacancy, abandonment, or severe financial hardship." },
              { icon: FileWarning, title: "Repeat Violations", desc: "Properties cited multiple times show chronic neglect — a hallmark of distressed or absent ownership." },
              { icon: TrendingDown, title: "Multi-Department Actions", desc: "When building, fire, and health departments all cite the same property, it signals systemic distress." },
            ].map((item, i) => (
              <div key={i} className="bg-[hsl(var(--landing-surface))]/50 border border-[hsl(var(--landing-surface))] rounded-xl p-6">
                <item.icon className="h-8 w-8 text-[hsl(var(--landing-accent))] mb-4" />
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-[hsl(var(--landing-text-muted))] text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">Where Enforcement Signals Appear on the Distress Timeline</h2>
          <div className="space-y-6">
            {[
              { phase: "Early Signal", time: "Months 1–6", signal: "First code violation filed", color: "text-green-400" },
              { phase: "Mounting Pressure", time: "Months 6–12", signal: "Repeat violations, fines accumulate, enforcement escalates", color: "text-yellow-400" },
              { phase: "Critical Distress", time: "Months 12–18", signal: "Liens filed, water shutoff, multi-department actions", color: "text-orange-400" },
              { phase: "Public Record", time: "Months 18–24+", signal: "Tax delinquency, pre-foreclosure, auction — everyone sees it now", color: "text-red-400" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-6 bg-[hsl(var(--landing-surface))]/30 rounded-xl p-6">
                <div className="shrink-0 w-28">
                  <div className={`text-sm font-bold ${item.color}`}>{item.phase}</div>
                  <div className="text-xs text-[hsl(var(--landing-text-muted))]">{item.time}</div>
                </div>
                <div className="text-[hsl(var(--landing-text-muted))]">{item.signal}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-[hsl(var(--landing-accent))] font-semibold mt-8">
            Snap Ignite detects signals in the Early and Mounting Pressure phases — 12–18 months before most investors even know about the property.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { stat: "500K+", label: "Properties Monitored" },
              { stat: "6", label: "Distress Signal Types" },
              { stat: "12–18mo", label: "Earlier Than Foreclosure" },
              { stat: "$0.97", label: "Per Address" },
            ].map((item, i) => (
              <div key={i}>
                <div className="text-3xl md:text-4xl font-bold text-[hsl(var(--landing-accent))]">{item.stat}</div>
                <div className="text-sm text-[hsl(var(--landing-text-muted))] mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Stop Waiting for Foreclosure Lists</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg mb-8">
            Detect distress signals months before other investors. Start your free trial today.
          </p>
          <Link to="/auth?mode=signup">
            <Button size="lg" className="bg-[hsl(var(--landing-accent))] hover:bg-[hsl(var(--landing-accent))]/90 text-[hsl(var(--landing-bg))] px-10">
              Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-[hsl(var(--landing-surface))] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[hsl(var(--landing-text-muted))] text-sm">© 2026 Snap Ignite. All rights reserved.</p>
          <div className="flex items-center gap-6 text-sm text-[hsl(var(--landing-text-muted))]">
            <Link to="/about" className="hover:text-[hsl(var(--landing-text))]">About</Link>
            <Link to="/pricing" className="hover:text-[hsl(var(--landing-text))]">Pricing</Link>
            <Link to="/privacy" className="hover:text-[hsl(var(--landing-text))]">Privacy</Link>
            <Link to="/terms" className="hover:text-[hsl(var(--landing-text))]">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
