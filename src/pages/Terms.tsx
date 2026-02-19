import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" className="mb-8 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold text-foreground mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-12">Effective Date: January 21, 2026</p>

        <div className="prose prose-slate max-w-none space-y-10">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">1. Service Description</h2>
            <p className="text-muted-foreground leading-relaxed">
              Snap Ignite provides municipal enforcement intelligence data to help real estate operators 
              identify properties under active enforcement pressure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">2. Subscription Terms</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Monthly billing cycle</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Auto-renewal unless cancelled</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Cancel anytime from account settings</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span><strong>Refunds:</strong> 30-day money-back guarantee</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span><strong>Pricing:</strong> See <Link to="/pricing" className="text-primary hover:underline">snapignite.com/pricing</Link></span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">3. Acceptable Use</h2>
            <p className="text-muted-foreground mb-3">You may NOT:</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-destructive rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Resell or redistribute our data</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-destructive rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Use automated scraping tools</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-destructive rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Share your account credentials</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-destructive rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Use the service for illegal purposes</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-destructive rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Violate privacy laws when contacting property owners</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">4. Data Ownership</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>You own any data you input</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>We own the enforcement data we collect</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>You may export your data anytime</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">5. Service Availability</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>We strive for 99.9% uptime</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>No guarantee of uninterrupted service</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>We may update the service without notice</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">6. Limitation of Liability</h2>
            <p className="text-muted-foreground mb-3">
              Our service provides data for informational purposes. We are not responsible for:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Accuracy of third-party data</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Investment decisions you make</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Deals you pursue based on our data</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">7. Termination</h2>
            <p className="text-muted-foreground mb-3">We may terminate accounts that:</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-destructive rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Violate these terms</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-destructive rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Engage in fraudulent activity</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-destructive rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Abuse the service</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">8. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these terms. Continued use after changes means acceptance.
            </p>
          </section>

          <section className="border-t pt-8 mt-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">9. Contact</h2>
            <p className="text-muted-foreground">
              <strong>Email:</strong>{" "}
              <a href="mailto:support@snapignite.com" className="text-primary hover:underline">
                support@snapignite.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground mb-4">
            <Link to="/privacy" className="hover:text-foreground transition">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition">Terms of Service</Link>
            <a href="mailto:support@snapignite.com" className="hover:text-foreground transition">Contact</a>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Snap Intelligence LLC. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
