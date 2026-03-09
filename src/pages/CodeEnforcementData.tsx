import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/brand/BrandLogo";
import SEOHead from "@/components/SEOHead";
import { ArrowRight, Building2, Globe, FileText, Clock, Users, TrendingUp } from "lucide-react";

export default function CodeEnforcementData() {

  return (
    <div className="landing-theme min-h-screen bg-[hsl(var(--landing-bg))] text-[hsl(var(--landing-text))]">
      <SEOHead title="Code Enforcement Data Across 3,800+ Cities | Snap Ignite" description="Access code enforcement data from 3,800+ U.S. cities. FOIA-sourced violation records, enforcement pressure scoring, and distress signals for real estate investors." canonical="https://snapignite.com/code-enforcement-data" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Code Enforcement Data Across 3,800+ Cities",
        "description": "Access code enforcement data from 3,800+ U.S. cities with FOIA-sourced violation records and enforcement pressure scoring.",
        "url": "https://snapignite.com/code-enforcement-data",
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
            Code Enforcement Data Across{" "}
            <span className="text-[hsl(var(--landing-accent))]">3,800+ Cities</span>
          </h1>
          <p className="text-lg md:text-xl text-[hsl(var(--landing-text-muted))] max-w-2xl mx-auto mb-8">
            The most comprehensive municipal enforcement database for real estate investors. FOIA-sourced records from thousands of jurisdictions, scored and searchable in one platform.
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

      {/* How We Source */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">How We Source Code Enforcement Data</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg max-w-3xl mx-auto text-center mb-12">
            Snap Ignite maintains active FOIA (Freedom of Information Act) data pipelines with thousands of municipal governments. We request, process, and normalize enforcement records so you don't have to.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: FileText, title: "FOIA Requests at Scale", desc: "Our team files and manages thousands of public records requests across all 50 states to obtain code enforcement data." },
              { icon: Building2, title: "Multi-Department Coverage", desc: "We track enforcement from building, housing, fire, health, and zoning departments — not just one source per city." },
              { icon: Clock, title: "Monthly Refreshes", desc: "Data pipelines refresh as municipalities update their records, ensuring you work with current enforcement signals." },
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

      {/* What You Get */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">What the Data Includes</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Globe, title: "Full Address & Location", desc: "Property addresses with city, state, zip, and geocoded coordinates for mapping and market analysis." },
              { icon: Users, title: "Violation Details", desc: "Violation types, descriptions, open dates, enforcement actions, and resolution status for every record." },
              { icon: TrendingUp, title: "SnapScore Intelligence", desc: "Proprietary enforcement pressure score (0–100) based on violation severity, count, recency, and escalation patterns." },
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

      {/* Coverage Stats */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-10 text-center">Nationwide Enforcement Coverage</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { stat: "4,500+", label: "Cities & Counties" },
              { stat: "500K+", label: "Properties in Database" },
              { stat: "50", label: "States" },
              { stat: "FOIA", label: "Data Source" },
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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Start Searching Code Enforcement Data</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg mb-8">
            3-day free trial with full platform access. Search properties, save favorites, and test data quality in your markets.
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
