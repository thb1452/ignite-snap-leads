import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import SEOHead from "@/components/SEOHead";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="About Snap Ignite | Municipal Enforcement Intelligence" description="Snap Ignite helps real estate operators research municipal enforcement records. Customer access is under review for the relaunch." canonical="https://snapignite.com/about" />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" className="mb-8 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold text-foreground mb-2">About Snap Ignite</h1>
        <p className="text-muted-foreground mb-12">Municipal enforcement intelligence for serious real estate operators.</p>

        <div className="prose prose-slate max-w-none space-y-8">
          <p className="text-lg text-muted-foreground leading-relaxed">
            Snap Ignite brings municipal enforcement records and a private research workflow together. We are verifying source quality, customer access, and delivery before the relaunch.
          </p>

          <p className="text-lg text-muted-foreground leading-relaxed">
            We built Snap to make fragmented municipal records easier to investigate. An enforcement event provides context; it does not establish an owner’s intent, finances, or willingness to sell.
          </p>

          <div className="border-t pt-8 mt-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Our Approach</h2>
            <p className="text-muted-foreground leading-relaxed">
              We review records from municipal sources, verify their property matches, and distinguish event dates from receipt dates. Source availability and update timing vary by jurisdiction. No customer market is currently approved for release.
            </p>
          </div>

          <div className="border-t pt-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">What We're Not</h2>
            <p className="text-muted-foreground leading-relaxed">
              Snap provides research context. It does not guarantee seller motivation, exclusivity, a deal, or an investment return. Customer record access, unlocks, exports, and new purchases remain paused during verification.
            </p>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground mb-4">
            <Link to="/privacy" className="hover:text-foreground transition">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition">Terms of Service</Link>
            <a href="mailto:hello@snapignite.com" className="hover:text-foreground transition">Contact</a>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Snap Intelligence LLC. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
