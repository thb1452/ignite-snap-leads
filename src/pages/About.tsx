import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
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
            Snap Ignite is a municipal enforcement intelligence platform built for serious real estate operators. We track code violations, water shutoffs, escalating fines, and compliance deadlines across 900+ counties nationwide — sourced directly from municipal agencies, updated weekly.
          </p>

          <p className="text-lg text-muted-foreground leading-relaxed">
            We built Snap because the best opportunities in real estate aren't found in stale databases. They're found in enforcement pressure that most platforms completely miss. Our team monitors government enforcement records so operators can act on signals before they resolve or hit the market.
          </p>

          <div className="border-t pt-8 mt-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Our Approach</h2>
            <p className="text-muted-foreground leading-relaxed">
              We don't scrape. We don't aggregate third-party feeds. Every data point in Snap Ignite comes directly from the municipal agencies and county jurisdictions that generate it. That means fewer false positives, more accurate enforcement signals, and intelligence you can actually act on.
            </p>
          </div>

          <div className="border-t pt-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">What We're Not</h2>
            <p className="text-muted-foreground leading-relaxed">
              Snap Ignite is not a leads tool. It's not a list service. It's not a skip tracing platform. It's an intelligence layer — one that sits alongside your existing workflow and shows you where enforcement pressure is building before anyone else knows to look.
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
