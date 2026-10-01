import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import BrandLogo from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import SEOHead from "@/components/SEOHead";
import AvailabilityNotice from "@/components/AvailabilityNotice";
import { FREE_ACCOUNT_MESSAGE } from "@/lib/publicAvailability";

interface Props {
  title: string;
  description: string;
  path: string;
  heading: string;
  introduction: string;
  sections: { title: string; body: string }[];
}

export default function ResearchMarketingPage({ title, description, path, heading, introduction, sections }: Props) {
  return (
    <div className="landing-theme min-h-screen bg-landing-bg text-landing-text">
      <SEOHead title={`${title} | Snap Ignite`} description={description} canonical={`https://snapignite.com${path}`} />
      <nav aria-label="Main navigation" className="border-b border-landing-surface px-4 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <BrandLogo size="md" />
          <div className="flex items-center gap-4 text-sm">
            <Link to="/code-violations" className="hover:underline">Availability</Link>
            <Link to="/pricing" className="hover:underline">Pricing</Link>
            <Link to="/auth?mode=signin" className="hover:underline">Sign in</Link>
          </div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <p className="text-landing-accent font-semibold mb-4">SNAP IGNITE · MUNICIPAL ENFORCEMENT INTELLIGENCE</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">{heading}</h1>
          <p className="text-lg md:text-xl text-landing-text-muted mb-8">{introduction}</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button asChild className="bg-landing-accent text-landing-bg hover:bg-landing-accent/90"><Link to="/code-violations">Check availability <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild variant="outline" className="bg-transparent border-landing-text-muted text-landing-text hover:bg-landing-surface"><Link to="/pricing">View pricing</Link></Button>
          </div>
        </div>
        <AvailabilityNotice className="max-w-4xl mx-auto mb-14" />
        <div className="grid md:grid-cols-3 gap-6">
          {sections.map(section => <section key={section.title} className="rounded-xl border border-landing-surface bg-landing-surface/50 p-6"><h2 className="text-xl font-semibold mb-3">{section.title}</h2><p className="text-landing-text-muted">{section.body}</p></section>)}
        </div>
        <section className="max-w-3xl mx-auto mt-16 text-center">
          <h2 className="text-2xl font-bold mb-4">Evidence for your research</h2>
          <p className="text-landing-text-muted mb-4">An enforcement record documents an agency action. It does not establish a property's current condition, an owner's finances or willingness to sell. Verify the source, dates, property match, and current status before acting.</p>
          <p className="text-sm text-landing-text-muted mb-6">{FREE_ACCOUNT_MESSAGE}</p>
          <Button asChild className="bg-landing-accent text-landing-bg hover:bg-landing-accent/90"><Link to="/auth?mode=signup">Create free account</Link></Button>
        </section>
      </main>
      <footer className="border-t border-landing-surface px-6 py-10"><div className="max-w-6xl mx-auto flex flex-wrap justify-between gap-6 text-sm text-landing-text-muted"><p>© {new Date().getFullYear()} Snap Ignite</p><div className="flex gap-6"><Link to="/about">About</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href="mailto:hello@snapignite.com">Contact</a></div></div></footer>
    </div>
  );
}
