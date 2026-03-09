import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/brand/BrandLogo";
import SEOHead from "@/components/SEOHead";
import { ArrowRight, Building2, FileSearch, Globe, Lock, Database, Scale } from "lucide-react";

export default function MunicipalEnforcementData() {

  return (
    <div className="landing-theme min-h-screen bg-[hsl(var(--landing-bg))] text-[hsl(var(--landing-text))]">
      <SEOHead title="Municipal Enforcement Data for Real Estate Professionals | Snap Ignite" description="Access municipal enforcement data from 3,800+ cities. Code violations, compliance orders, and enforcement actions — sourced directly from local governments via FOIA. Start free." canonical="https://snapignite.com/municipal-enforcement-data" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Municipal Enforcement Data for Real Estate Professionals",
        "description": "Access municipal enforcement data from 3,800+ cities. Code violations, compliance orders, and enforcement actions sourced directly from local governments.",
        "url": "https://snapignite.com/municipal-enforcement-data",
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
            Municipal Enforcement Data for{" "}
            <span className="text-[hsl(var(--landing-accent))]">Real Estate Professionals</span>
          </h1>
          <p className="text-lg md:text-xl text-[hsl(var(--landing-text-muted))] max-w-2xl mx-auto mb-8">
            Most enforcement data is buried in city portals, scattered across PDFs, or locked behind FOIA requests. Snap Ignite aggregates it all into a single, searchable intelligence layer.
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

      {/* What Is Municipal Enforcement Data */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">What Is Municipal Enforcement Data?</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg max-w-3xl mx-auto text-center mb-12">
            Municipal enforcement data includes every action a local government takes against a property: code violations, building citations, compliance orders, abatement notices, and fine schedules. This data reveals which properties are under active regulatory pressure — and which owners are running out of options.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Building2, title: "Code Violations", desc: "Building, zoning, housing, and fire code violations filed by municipal inspectors against residential and commercial properties." },
              { icon: Scale, title: "Compliance Orders", desc: "Formal orders requiring property owners to remediate issues within a deadline — often with escalating fines for non-compliance." },
              { icon: FileSearch, title: "Enforcement Actions", desc: "Liens, demolition orders, board hearings, and legal proceedings that indicate maximum municipal pressure on a property." },
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

      {/* Why It's Hidden */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">Why This Data Is Hidden from Most Platforms</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Lock, title: "Locked Behind FOIA", desc: "Enforcement records require formal Freedom of Information Act requests to each jurisdiction — a process most platforms skip entirely." },
              { icon: Globe, title: "No Central Database", desc: "There is no national registry of enforcement data. Each of the 30,000+ U.S. municipalities maintains its own system, format, and release schedule." },
              { icon: Database, title: "Snap Aggregates It", desc: "We file thousands of FOIA requests, normalize the data, and deliver it through a single platform — updated as municipalities refresh their records." },
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
          <h2 className="text-3xl font-bold mb-10 text-center">Enforcement Data at Scale</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { stat: "3,800+", label: "Municipalities" },
              { stat: "500K+", label: "Properties Tracked" },
              { stat: "900+", label: "Counties Covered" },
              { stat: "Monthly", label: "Data Refresh" },
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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Access Municipal Enforcement Data Today</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg mb-8">
            Start your free trial and search enforcement records across thousands of cities. No credit card required to browse.
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
