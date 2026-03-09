import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/brand/BrandLogo";
import SEOHead from "@/components/SEOHead";
import { ArrowRight, Database, Activity, Target, Layers, Filter, Download } from "lucide-react";

export default function DistressedPropertyData() {

  return (
    <div className="landing-theme min-h-screen bg-[hsl(var(--landing-bg))] text-[hsl(var(--landing-text))]">
      <SEOHead title="Distressed Property Data Powered by Enforcement Intelligence | Snap Ignite" description="Access distressed property data sourced from municipal enforcement records. 500K+ properties scored by enforcement pressure across 3,800+ U.S. cities. Start free." canonical="https://snapignite.com/distressed-property-data" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Distressed Property Data Powered by Enforcement Intelligence",
        "description": "Access distressed property data sourced from municipal enforcement records across 3,800+ U.S. cities.",
        "url": "https://snapignite.com/distressed-property-data",
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
            Distressed Property Data Powered by{" "}
            <span className="text-[hsl(var(--landing-accent))]">Enforcement Intelligence</span>
          </h1>
          <p className="text-lg md:text-xl text-[hsl(var(--landing-text-muted))] max-w-2xl mx-auto mb-8">
            Traditional distressed property lists are stale and over-marketed. Snap Ignite delivers enforcement-sourced data that reveals true owner distress — before it shows up on any other platform.
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

      {/* Why Enforcement Data */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">Why Enforcement Data Beats Traditional Distress Signals</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg max-w-3xl mx-auto text-center mb-12">
            Pre-foreclosure lists, tax liens, and probate records are shared across dozens of platforms. Code enforcement data is different — it reveals properties under active municipal pressure that most investors never see.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Database, title: "Government-Sourced", desc: "Every data point originates from official municipal records obtained through FOIA requests — not third-party scraping." },
              { icon: Activity, title: "Active Distress Signals", desc: "Track open violations, escalation patterns, repeat offenders, and multi-department enforcement across properties." },
              { icon: Target, title: "Less Competition", desc: "While everyone fights over the same pre-foreclosure lists, enforcement data gives you exclusive access to motivated sellers." },
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

      {/* Data Features */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">What's Inside the Data</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Layers, title: "Violation Categories", desc: "Filter by structural, safety, nuisance, zoning, and environmental violations to match your investment strategy." },
              { icon: Filter, title: "Advanced Filters", desc: "Search by city, state, zip, SnapScore range, enforcement pressure level, and distress signals." },
              { icon: Download, title: "Export Ready", desc: "Download filtered property lists as CSV with addresses, violation details, and enforcement metrics." },
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
          <h2 className="text-3xl font-bold mb-10 text-center">Platform Coverage</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { stat: "500K+", label: "Distressed Properties" },
              { stat: "4,500+", label: "Municipalities" },
              { stat: "50", label: "States Covered" },
              { stat: "Monthly", label: "Data Updates" },
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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Access Distressed Property Data Today</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg mb-8">
            Start your 3-day free trial and search 500K+ enforcement-tracked properties.
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
