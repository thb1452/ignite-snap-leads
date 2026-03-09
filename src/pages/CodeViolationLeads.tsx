import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/brand/BrandLogo";
import SEOHead from "@/components/SEOHead";
import { Search, TrendingUp, MapPin, ArrowRight, Shield, Zap, BarChart3 } from "lucide-react";

export default function CodeViolationLeads() {

  return (
    <div className="landing-theme min-h-screen bg-[hsl(var(--landing-bg))] text-[hsl(var(--landing-text))]">
      <SEOHead title="Code Violation Leads for Real Estate Investors | Snap Ignite" description="Find code violation leads across 500K+ properties in 3,800+ cities. Track enforcement pressure, identify distressed owners, and close deals before the competition. Start free." canonical="https://snapignite.com/code-violation-leads" />
      {/* JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Code Violation Leads for Real Estate Investors",
        "description": "Find code violation leads across 500K+ properties in 3,800+ cities. Track enforcement pressure and identify distressed owners.",
        "url": "https://snapignite.com/code-violation-leads",
        "publisher": { "@type": "Organization", "name": "Snap Ignite", "url": "https://snapignite.com" }
      })}} />

      {/* Nav */}
      <nav className="border-b border-[hsl(var(--landing-surface))] py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <BrandLogo size="md" />
          <div className="flex items-center gap-4">
            <Link to="/pricing"><Button variant="ghost" className="text-[hsl(var(--landing-text-muted))] hover:text-[hsl(var(--landing-text))]">Pricing</Button></Link>
            <Link to="/auth"><Button className="bg-[hsl(var(--landing-accent))] hover:bg-[hsl(var(--landing-accent))]/90 text-[hsl(var(--landing-bg))]">Start Free Trial</Button></Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 md:py-28 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Code Violation Leads for{" "}
            <span className="text-[hsl(var(--landing-accent))]">Real Estate Investors</span>
          </h1>
          <p className="text-lg md:text-xl text-[hsl(var(--landing-text-muted))] max-w-2xl mx-auto mb-8">
            Stop chasing cold lists. Snap Ignite surfaces properties under active municipal enforcement — owners who are motivated to sell before fines escalate.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="bg-[hsl(var(--landing-accent))] hover:bg-[hsl(var(--landing-accent))]/90 text-[hsl(var(--landing-bg))] px-8">
                Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="outline" className="border-[hsl(var(--landing-surface))] text-[hsl(var(--landing-text))] hover:bg-[hsl(var(--landing-surface))]">
                View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* What Are Code Violation Leads */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">What Are Code Violation Leads?</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg max-w-3xl mx-auto text-center mb-12">
            Code violation leads are properties flagged by local municipalities for failing to meet building, housing, or safety codes. These violations — from overgrown lots to structural decay — signal distressed ownership and high seller motivation.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Search, title: "Enforcement-Sourced", desc: "Every lead comes directly from municipal enforcement records — not scraped or estimated." },
              { icon: TrendingUp, title: "Pressure-Scored", desc: "Our SnapScore algorithm ranks properties by enforcement severity, repeat violations, and escalation risk." },
              { icon: MapPin, title: "Nationwide Coverage", desc: "Access code violation leads across 4,500+ cities and 500K+ properties in the United States." },
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

      {/* How It Works */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">How Snap Ignite Delivers Better Leads</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Shield, title: "FOIA Data Pipelines", desc: "We file Freedom of Information requests with thousands of municipalities to build the most comprehensive enforcement database available." },
              { icon: Zap, title: "Real-Time Scoring", desc: "Properties are scored based on violation count, severity, open duration, and escalation signals — updated as records refresh." },
              { icon: BarChart3, title: "Actionable Intelligence", desc: "Filter by city, violation type, enforcement pressure, and distress signals. Export the leads that match your investment criteria." },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-[hsl(var(--landing-accent))]/10 mb-4">
                  <item.icon className="h-7 w-7 text-[hsl(var(--landing-accent))]" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-[hsl(var(--landing-text-muted))] text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-10 text-center">The Numbers Behind the Platform</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { stat: "500K+", label: "Properties Tracked" },
              { stat: "4,500+", label: "Cities Covered" },
              { stat: "Monthly", label: "Data Refresh" },
              { stat: "$79/mo", label: "Starting Price" },
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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Find Code Violation Leads?</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg mb-8">
            Start your 3-day free trial. No credit card required to browse — pay only when you're ready to export.
          </p>
          <Link to="/auth">
            <Button size="lg" className="bg-[hsl(var(--landing-accent))] hover:bg-[hsl(var(--landing-accent))]/90 text-[hsl(var(--landing-bg))] px-10">
              Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
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
