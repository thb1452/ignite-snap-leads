import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/brand/BrandLogo";
import SEOHead from "@/components/SEOHead";
import { ArrowRight, Eye, EyeOff, Target, AlertTriangle, Droplets, Gavel, Clock } from "lucide-react";

export default function OffMarketPropertyLeads() {

  return (
    <div className="landing-theme min-h-screen bg-[hsl(var(--landing-bg))] text-[hsl(var(--landing-text))]">
      <SEOHead title="Off-Market Property Leads from Enforcement Data | Snap Ignite" description="Find off-market property leads most investors miss. Snap Ignite surfaces properties under active enforcement pressure — code violations, escalating fines, and water shutoffs — before they hit any list." canonical="https://snapignite.com/off-market-property-leads" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Off-Market Property Leads Powered by Enforcement Intelligence",
        "description": "Find off-market property leads most investors miss. Properties under active enforcement pressure before they hit any list.",
        "url": "https://snapignite.com/off-market-property-leads",
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
            Off-Market Property Leads Powered by{" "}
            <span className="text-[hsl(var(--landing-accent))]">Enforcement Intelligence</span>
          </h1>
          <p className="text-lg md:text-xl text-[hsl(var(--landing-text-muted))] max-w-2xl mx-auto mb-8">
            Everyone's chasing the same foreclosure lists, probate filings, and driving-for-dollars routes. The enforcement layer is the off-market signal almost nobody is tracking.
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

      {/* Hidden Signals */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">Hidden Signals Most Investors Miss</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg max-w-3xl mx-auto text-center mb-12">
            Traditional off-market strategies compete on the same data. Enforcement intelligence gives you a completely different signal layer — one that reveals distress before it becomes public.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: AlertTriangle, title: "Code Violations", desc: "Properties flagged by municipal inspectors for building, housing, or safety code failures." },
              { icon: Clock, title: "Enforcement Escalations", desc: "Multi-department actions and repeated citations that signal mounting pressure on owners." },
              { icon: Droplets, title: "Water Shutoffs", desc: "Utility disconnections that signal financial distress and potential vacancy." },
              { icon: Gavel, title: "Enforcement Liens", desc: "Municipal liens filed for unpaid fines, indicating owners who can't or won't resolve issues." },
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

      {/* Traditional vs Enforcement */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">Traditional Off-Market vs. Enforcement Intelligence</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-[hsl(var(--landing-surface))]/30 border border-[hsl(var(--landing-surface))] rounded-xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <EyeOff className="h-6 w-6 text-[hsl(var(--landing-text-muted))]" />
                <h3 className="text-xl font-bold">Traditional Methods</h3>
              </div>
              <ul className="space-y-3 text-[hsl(var(--landing-text-muted))]">
                <li>• Driving for dollars — time-intensive, limited scale</li>
                <li>• Foreclosure lists — shared with thousands of investors</li>
                <li>• Probate filings — emotional sellers, legal complexity</li>
                <li>• Tax delinquency — lagging indicator, 12–18 month delay</li>
              </ul>
            </div>
            <div className="bg-[hsl(var(--landing-accent))]/5 border border-[hsl(var(--landing-accent))]/20 rounded-xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <Eye className="h-6 w-6 text-[hsl(var(--landing-accent))]" />
                <h3 className="text-xl font-bold">Enforcement Intelligence</h3>
              </div>
              <ul className="space-y-3 text-[hsl(var(--landing-text-muted))]">
                <li>• <span className="text-[hsl(var(--landing-text))]">Active municipal pressure</span> — owners under real deadlines</li>
                <li>• <span className="text-[hsl(var(--landing-text))]">Earliest distress signal</span> — before foreclosure or tax sale</li>
                <li>• <span className="text-[hsl(var(--landing-text))]">Almost zero competition</span> — most investors don't know this data exists</li>
                <li>• <span className="text-[hsl(var(--landing-text))]">Scalable</span> — 500K+ properties, automated scoring</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-10 text-center">Off-Market Leads at Scale</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { stat: "500K+", label: "Properties Under Pressure" },
              { stat: "3,800+", label: "Cities Tracked" },
              { stat: "~0%", label: "Investor Competition" },
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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Find Off-Market Leads Before Anyone Else</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg mb-8">
            Start your free trial and access the enforcement intelligence layer that most investors don't even know exists.
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
