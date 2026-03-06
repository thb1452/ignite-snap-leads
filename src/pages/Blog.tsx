import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import SEOHead from "@/components/SEOHead";

export default function Blog() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Enforcement Intelligence Insights | Snap Ignite Blog" description="Analysis, data trends, and operator resources for real estate investors using municipal enforcement intelligence. Deep dives into county coverage and enforcement patterns." canonical="https://snapignite.com/blog" />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" className="mb-8 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold text-foreground mb-2">Enforcement Intelligence Insights</h1>
        <p className="text-muted-foreground mb-12">Analysis, data trends, and operator resources — coming soon.</p>

        <div className="rounded-xl border border-border bg-muted/30 px-8 py-16 text-center">
          <p className="text-2xl font-semibold text-foreground mb-3">We're working on it.</p>
          <p className="text-muted-foreground max-w-md mx-auto">
            Deep dives into municipal enforcement trends, county coverage updates, and practical intelligence for real estate operators will be published here.
          </p>
          <div className="mt-8">
            <a href="mailto:hello@snapignite.com">
              <Button variant="outline">Get notified when we publish</Button>
            </a>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground mb-4">
            <Link to="/about" className="hover:text-foreground transition">About</Link>
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
