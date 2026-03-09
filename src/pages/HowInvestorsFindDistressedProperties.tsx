import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/brand/BrandLogo";
import SEOHead from "@/components/SEOHead";
import { ArrowRight, Car, FileText, Home, Landmark, Zap, CheckCircle2 } from "lucide-react";

export default function HowInvestorsFindDistressedProperties() {

  return (
    <div className="landing-theme min-h-screen bg-[hsl(var(--landing-bg))] text-[hsl(var(--landing-text))]">
      <SEOHead title="How Investors Find Distressed Properties in 2026 | Snap Ignite" description="How do real estate investors find distressed properties in 2026? Compare driving for dollars, tax liens, probate, foreclosures, and the newest method: enforcement intelligence." canonical="https://snapignite.com/how-investors-find-distressed-properties" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "How Investors Find Distressed Properties in 2026",
        "description": "Compare all methods investors use to find distressed properties: driving for dollars, tax liens, probate, foreclosures, and enforcement intelligence.",
        "url": "https://snapignite.com/how-investors-find-distressed-properties",
        "publisher": { "@type": "Organization", "name": "Snap Ignite", "url": "https://snapignite.com" }
      })}} />

      <nav className="border-b border-[hsl(var(--landing-surface))] py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <BrandLogo size="md" />
          <div className="flex items-center gap-4">
            <Link to="/pricing"><Button variant="ghost" className="text-[hsl(var(--landing-text-muted))] hover:text-[hsl(var(--landing-text))]">Pricing</Button></Link>
            <Link to="/auth"><Button className="bg-[hsl(var(--landing-accent))] hover:bg-[hsl(var(--landing-accent))]/90 text-[hsl(var(--landing-bg))]">Start Free Trial</Button></Link>
          </div>
        </div>
      </nav>

      <section className="py-20 md:py-28 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            How Investors Find Distressed Properties in{" "}
            <span className="text-[hsl(var(--landing-accent))]">2026</span>
          </h1>
          <p className="text-lg md:text-xl text-[hsl(var(--landing-text-muted))] max-w-2xl mx-auto mb-8">
            The complete guide to distressed property sourcing — from traditional methods to the enforcement intelligence approach that's changing how smart investors find deals.
          </p>
        </div>
      </section>

      {/* Traditional Methods */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">Traditional Methods: What Every Investor Uses</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              { icon: Car, title: "Driving for Dollars", pros: "Visual confirmation of distress, local market knowledge", cons: "Time-intensive, limited geographic reach, no scalability", timing: "Real-time but manual" },
              { icon: Landmark, title: "Tax Lien & Tax Deed Sales", pros: "Clear financial distress signal, public records", cons: "Highly competitive, 12–18 month lag, crowded auctions", timing: "18–24 months after initial distress" },
              { icon: FileText, title: "Probate Filings", pros: "Motivated heirs who often want to sell quickly", cons: "Emotionally sensitive, legal complexity, limited volume", timing: "Varies — weeks to months after death" },
              { icon: Home, title: "Pre-Foreclosure & REO", pros: "High motivation, clear timeline", cons: "Everyone has access, banks set terms, competitive bidding", timing: "6–12 months after default" },
            ].map((item, i) => (
              <div key={i} className="bg-[hsl(var(--landing-surface))]/50 border border-[hsl(var(--landing-surface))] rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <item.icon className="h-6 w-6 text-[hsl(var(--landing-text-muted))]" />
                  <h3 className="text-xl font-bold">{item.title}</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <p><span className="text-green-400 font-medium">Pros:</span> <span className="text-[hsl(var(--landing-text-muted))]">{item.pros}</span></p>
                  <p><span className="text-red-400 font-medium">Cons:</span> <span className="text-[hsl(var(--landing-text-muted))]">{item.cons}</span></p>
                  <p><span className="text-[hsl(var(--landing-accent))] font-medium">Timing:</span> <span className="text-[hsl(var(--landing-text-muted))]">{item.timing}</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The New Method */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">The Method Most Investors Don't Know About</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg max-w-3xl mx-auto text-center mb-12">
            Enforcement intelligence uses municipal code violation data, compliance orders, and enforcement actions to identify distressed properties 12–18 months before they appear on any traditional list.
          </p>
          <div className="bg-[hsl(var(--landing-accent))]/5 border border-[hsl(var(--landing-accent))]/20 rounded-xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Zap className="h-7 w-7 text-[hsl(var(--landing-accent))]" />
              <h3 className="text-2xl font-bold">Enforcement Intelligence</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 text-[hsl(var(--landing-accent))]">Why It Works</h4>
                <ul className="space-y-2 text-[hsl(var(--landing-text-muted))]">
                  {[
                    "Code violations are the earliest public signal of property distress",
                    "Owners face real deadlines with escalating financial consequences",
                    "Data is sourced from governments, not estimated or scraped",
                    "Almost zero investor competition on this data layer",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--landing-accent))] mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-3 text-[hsl(var(--landing-accent))]">What Snap Ignite Tracks</h4>
                <ul className="space-y-2 text-[hsl(var(--landing-text-muted))]">
                  {[
                    "500K+ properties under active enforcement",
                    "3,800+ cities across the United States",
                    "SnapScore algorithm ranks seller motivation",
                    "Filter by violation type, pressure level, and location",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--landing-accent))] mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Try Enforcement Intelligence?</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg mb-8">
            Join the investors who find distressed properties before anyone else. Start your free trial — no credit card required to browse.
          </p>
          <Link to="/auth">
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
