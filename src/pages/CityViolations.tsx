import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/brand/BrandLogo";
import SEOHead from "@/components/SEOHead";
import { ArrowRight, MapPin, AlertTriangle, BarChart3, Building2, ArrowLeft } from "lucide-react";

function slugToCity(slug: string) {
  return slug.replace(/-/g, " ");
}

interface JurisdictionWithCounts {
  id: string;
  name: string;
  city: string;
  state: string;
  county: string | null;
  enforcement_profile: Record<string, unknown> | null;
  propertyCount: number;
  ai_summary: string | null;
}

export default function CityViolations() {
  const { citySlug } = useParams<{ citySlug: string }>();
  const citySearch = slugToCity(citySlug || "");

  const { data: jurisdiction, isLoading } = useQuery({
    queryKey: ["city-seo", citySlug],
    queryFn: async (): Promise<JurisdictionWithCounts | null> => {
      // Find jurisdiction matching slug (case-insensitive city match)
      const { data: jurisdictions, error } = await supabase
        .from("jurisdictions")
        .select("*")
        .ilike("city", citySearch);

      if (error || !jurisdictions?.length) return null;

      const j = jurisdictions[0];

      // Get property count for this jurisdiction
      const { count } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("jurisdiction_id", j.id);

      const profile = j.enforcement_profile as Record<string, unknown> | null;

      return {
        id: j.id,
        name: j.name,
        city: j.city,
        state: j.state,
        county: j.county,
        enforcement_profile: profile,
        propertyCount: count || 0,
        ai_summary: (j as any).ai_summary || null,
      };
    },
    enabled: !!citySlug,
  });

  const pageTitle = jurisdiction
    ? `Code Violations in ${jurisdiction.city}, ${jurisdiction.state} | Snap Ignite`
    : `Code Violations – ${citySearch} | Snap Ignite`;

  const pageDesc = jurisdiction
    ? `Track ${jurisdiction.propertyCount.toLocaleString()} properties with code violations in ${jurisdiction.city}, ${jurisdiction.state}. Enforcement intelligence for real estate investors.`
    : `Explore code violation data and enforcement intelligence. Snap Ignite tracks 500K+ properties across 3,800+ cities.`;

  const pageCanonical = `https://snapignite.com/code-violations/${citySlug}`;

  const profile = jurisdiction?.enforcement_profile;
  const totalCited = (profile?.total_properties_cited as number) || 0;
  const avgDaysToClose = (profile?.avg_days_to_close as number) || 0;
  const strictness = (profile?.strictness as string) || "unknown";

  return (
    <div className="landing-theme min-h-screen bg-[hsl(var(--landing-bg))] text-[hsl(var(--landing-text))]">
      <SEOHead title={pageTitle} description={pageDesc} canonical={pageCanonical} />
      {jurisdiction && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": `Code Violations in ${jurisdiction.city}, ${jurisdiction.state}`,
          "description": `Track ${jurisdiction.propertyCount.toLocaleString()} properties with code violations in ${jurisdiction.city}, ${jurisdiction.state}.`,
          "url": `https://snapignite.com/code-violations/${citySlug}`,
          "publisher": { "@type": "Organization", "name": "Snap Ignite", "url": "https://snapignite.com" }
        })}} />
      )}

      <nav className="border-b border-[hsl(var(--landing-surface))] py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <BrandLogo size="md" />
          <div className="flex items-center gap-4">
            <Link to="/code-violations"><Button variant="ghost" className="text-[hsl(var(--landing-text-muted))] hover:text-[hsl(var(--landing-text))]">All Cities</Button></Link>
            <Link to="/auth"><Button className="bg-[hsl(var(--landing-accent))] hover:bg-[hsl(var(--landing-accent))]/90 text-[hsl(var(--landing-bg))]">Start Free Trial</Button></Link>
          </div>
        </div>
      </nav>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[hsl(var(--landing-accent))] border-t-transparent" />
        </div>
      ) : jurisdiction ? (
        <>
          {/* Hero */}
          <section className="py-20 md:py-28 px-6">
            <div className="max-w-4xl mx-auto text-center">
              <Link to="/code-violations" className="inline-flex items-center gap-1 text-sm text-[hsl(var(--landing-text-muted))] hover:text-[hsl(var(--landing-text))] mb-6">
                <ArrowLeft className="h-3 w-3" /> All Cities
              </Link>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
                Code Violations in{" "}
                <span className="text-[hsl(var(--landing-accent))]">{jurisdiction.city}, {jurisdiction.state}</span>
              </h1>
              <p className="text-lg md:text-xl text-[hsl(var(--landing-text-muted))] max-w-2xl mx-auto mb-8">
                Snap Ignite tracks {jurisdiction.propertyCount.toLocaleString()} properties with enforcement records in {jurisdiction.city}. Access violation data, SnapScores, and distress signals — sourced directly from municipal records.
              </p>
              <Link to="/auth">
                <Button size="lg" className="bg-[hsl(var(--landing-accent))] hover:bg-[hsl(var(--landing-accent))]/90 text-[hsl(var(--landing-bg))] px-8">
                  Access {jurisdiction.city} Data <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </section>

          {/* Stats */}
          <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold mb-10 text-center">{jurisdiction.city} Enforcement Overview</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                {[
                  { stat: jurisdiction.propertyCount.toLocaleString(), label: "Properties Tracked" },
                  { stat: totalCited ? totalCited.toLocaleString() : "—", label: "Properties Cited" },
                  { stat: avgDaysToClose ? `${avgDaysToClose}d` : "—", label: "Avg Days to Close" },
                  { stat: strictness !== "unknown" ? strictness.charAt(0).toUpperCase() + strictness.slice(1) : "—", label: "Enforcement Level" },
                ].map((item, i) => (
                  <div key={i}>
                    <div className="text-3xl md:text-4xl font-bold text-[hsl(var(--landing-accent))]">{item.stat}</div>
                    <div className="text-sm text-[hsl(var(--landing-text-muted))] mt-1">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* AI Enforcement Summary */}
          {jurisdiction.ai_summary && (
            <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
              <div className="max-w-4xl mx-auto">
                <h2 className="text-3xl font-bold mb-6 text-center">{jurisdiction.city} Enforcement Intelligence</h2>
                <div className="bg-[hsl(var(--landing-surface))]/30 border border-[hsl(var(--landing-surface))] rounded-xl p-8">
                  <p className="text-[hsl(var(--landing-text-muted))] leading-relaxed text-base whitespace-pre-line">
                    {jurisdiction.ai_summary}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* What You Get */}
          <section className="py-16 px-6 border-t border-[hsl(var(--landing-surface))]">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold mb-10 text-center">What You Get for {jurisdiction.city}</h2>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { icon: AlertTriangle, title: "Violation Records", desc: `Every code violation filed in ${jurisdiction.city} — building, housing, zoning, and safety citations.` },
                  { icon: BarChart3, title: "SnapScore Rankings", desc: "Properties ranked by enforcement pressure, violation severity, and seller motivation signals." },
                  { icon: MapPin, title: "Map Intelligence", desc: `Pin-level mapping of every tracked property in ${jurisdiction.city} with cluster visualization.` },
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
        </>
      ) : (
        /* City Not Found */
        <section className="py-20 md:py-28 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <Building2 className="h-16 w-16 text-[hsl(var(--landing-text-muted))] mx-auto mb-6" />
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
              Coverage Expanding to{" "}
              <span className="text-[hsl(var(--landing-accent))] capitalize">{citySearch}</span>
            </h1>
            <p className="text-lg text-[hsl(var(--landing-text-muted))] max-w-xl mx-auto mb-8">
              We're actively expanding our enforcement data coverage. Sign up to be notified when we add this jurisdiction — or explore 3,800+ cities we already track.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/auth">
                <Button size="lg" className="bg-[hsl(var(--landing-accent))] hover:bg-[hsl(var(--landing-accent))]/90 text-[hsl(var(--landing-bg))] px-8">
                  Get Notified <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/code-violations">
                <Button size="lg" variant="outline" className="border-[hsl(var(--landing-surface))] text-[hsl(var(--landing-text))] hover:bg-[hsl(var(--landing-surface))]">
                  Browse All Cities
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Start Finding Enforcement Leads</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg mb-8">
            Free trial — no credit card required to browse. Pay only when you're ready to export.
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
