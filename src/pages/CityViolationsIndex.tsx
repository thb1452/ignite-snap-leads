import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/brand/BrandLogo";
import SEOHead from "@/components/SEOHead";
import { ArrowRight, Search, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";

interface JurisdictionRow {
  id: string;
  name: string;
  city: string;
  state: string;
  county: string | null;
}

function cityToSlug(city: string) {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function CityViolationsIndex() {
  const [search, setSearch] = useState("");

  const { data: jurisdictions = [], isLoading } = useQuery({
    queryKey: ["jurisdictions-index"],
    queryFn: async (): Promise<JurisdictionRow[]> => {
      const { data, error } = await supabase
        .from("jurisdictions")
        .select("id, name, city, state, county")
        .order("state")
        .order("city");
      if (error) throw error;
      return data || [];
    },
  });

  const grouped = useMemo(() => {
    const filtered = search
      ? jurisdictions.filter(j =>
          j.city.toLowerCase().includes(search.toLowerCase()) ||
          j.state.toLowerCase().includes(search.toLowerCase())
        )
      : jurisdictions;

    const map: Record<string, JurisdictionRow[]> = {};
    for (const j of filtered) {
      if (!map[j.state]) map[j.state] = [];
      map[j.state].push(j);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [jurisdictions, search]);

  return (
    <div className="landing-theme min-h-screen bg-[hsl(var(--landing-bg))] text-[hsl(var(--landing-text))]">
      <SEOHead title="Code Violations by City | Snap Ignite" description="Browse code violation data across 3,800+ cities. Find enforcement intelligence for any city in the United States. Snap Ignite tracks 500K+ properties." canonical="https://snapignite.com/code-violations" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Code Violations by City",
        "description": "Browse code violation data across 3,800+ cities in the United States.",
        "url": "https://snapignite.com/code-violations",
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

      <section className="py-16 md:py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Code Violations by{" "}
            <span className="text-[hsl(var(--landing-accent))]">City</span>
          </h1>
          <p className="text-lg md:text-xl text-[hsl(var(--landing-text-muted))] max-w-2xl mx-auto mb-10">
            Browse enforcement intelligence across {jurisdictions.length.toLocaleString()} tracked cities. Click any city to see violation data, enforcement profiles, and property counts.
          </p>

          {/* Search */}
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--landing-text-muted))]" />
            <Input
              placeholder="Search cities or states…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 bg-[hsl(var(--landing-surface))]/50 border-[hsl(var(--landing-surface))] text-[hsl(var(--landing-text))] placeholder:text-[hsl(var(--landing-text-muted))]"
            />
          </div>
        </div>
      </section>

      <section className="pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[hsl(var(--landing-accent))] border-t-transparent" />
            </div>
          ) : grouped.length === 0 ? (
            <p className="text-center text-[hsl(var(--landing-text-muted))] py-12">No cities match your search.</p>
          ) : (
            <div className="space-y-10">
              {grouped.map(([state, cities]) => (
                <div key={state}>
                  <h2 className="text-xl font-bold mb-4 border-b border-[hsl(var(--landing-surface))] pb-2">{state}</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {cities.map(j => (
                      <Link
                        key={j.id}
                        to={`/code-violations/${cityToSlug(j.city)}`}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-[hsl(var(--landing-text-muted))] hover:text-[hsl(var(--landing-text))] hover:bg-[hsl(var(--landing-surface))]/50 transition-colors"
                      >
                        <MapPin className="h-3 w-3 text-[hsl(var(--landing-accent))] shrink-0" />
                        {j.city}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-[hsl(var(--landing-surface))]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Access Enforcement Data in Any City</h2>
          <p className="text-[hsl(var(--landing-text-muted))] text-lg mb-8">
            Start your free trial and search violation records across thousands of cities. No credit card required.
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
