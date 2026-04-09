import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import SEOHead from "@/components/SEOHead";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Terms & Conditions | Snap Ignite" description="Terms and conditions for Snap Ignite Property Alerts program. Subscription terms, SMS messaging, data usage, intellectual property, and limitation of liability." canonical="https://snapignite.com/terms-and-conditions" />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" className="mb-8 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold text-foreground mb-2">Terms &amp; Conditions</h1>
        <p className="text-muted-foreground mb-12">Effective Date: January 21, 2026</p>

        <div className="prose prose-slate max-w-none space-y-10">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">1. Program Description</h2>
            <p className="text-muted-foreground leading-relaxed">
              <strong>Snap Ignite Property Alerts</strong> is a service operated by Snap Intelligence LLC ("Snap Ignite," "we," "us," or "our") that provides municipal enforcement intelligence data and property alerts to help real estate operators identify properties under active enforcement pressure. By creating an account and opting in, you agree to receive property alerts, account notifications, and service updates via email, in-app messages, and/or SMS/text messages.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">2. SMS/Text Message Terms</h2>
            <div className="bg-accent/30 border border-border rounded-lg p-4 space-y-3 mb-4">
              <p className="text-foreground">
                <strong>Message Frequency:</strong> Message frequency varies. You may receive up to 5 messages per day depending on your alert preferences and property activity. Alert types include: new violation alerts, enforcement escalation updates, weekly property digests, and account notifications.
              </p>
              <p className="text-foreground">
                <strong>Message &amp; Data Rates:</strong> Msg &amp; Data rates may apply. Contact your wireless carrier for details about your text messaging plan.
              </p>
              <p className="text-foreground">
                <strong>Carriers:</strong> Carriers are not liable for delayed or undelivered messages.
              </p>
            </div>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>You must be 18 years or older to opt in to SMS alerts</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Consent to receive texts is not a condition of purchase</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Your phone number will not be sold or shared with third parties</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">3. Opt-Out &amp; Support</h2>
            <div className="bg-accent/30 border border-border rounded-lg p-4 space-y-3">
              <p className="text-foreground">
                <strong>To opt out of SMS messages:</strong> Reply <span className="font-mono bg-muted px-2 py-0.5 rounded text-sm">STOP</span> to any text message from Snap Ignite. You will receive a one-time confirmation message and no further texts will be sent.
              </p>
              <p className="text-foreground">
                <strong>For help or support:</strong> Reply <span className="font-mono bg-muted px-2 py-0.5 rounded text-sm">HELP</span> to any text message, or contact us:
              </p>
              <ul className="text-foreground space-y-1 ml-4">
                <li>Email: <a href="mailto:hello@snapignite.com" className="text-primary hover:underline">hello@snapignite.com</a></li>
                <li>Website: <a href="https://snapignite.com" className="text-primary hover:underline">snapignite.com</a></li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">4. Subscription Terms</h2>
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
            <h2 className="text-2xl font-semibold text-foreground mb-4">5. Acceptable Use</h2>
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
            <h2 className="text-2xl font-semibold text-foreground mb-4">6. Data Ownership</h2>
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
            <h2 className="text-2xl font-semibold text-foreground mb-4">7. Disclaimer &amp; Limitation of Liability</h2>
            <div className="bg-accent/30 border border-border rounded-lg p-4 mb-4">
              <p className="text-foreground">
                <strong>Important:</strong> Snap Ignite provides property and enforcement information for <em>informational purposes only</em>. The accuracy, completeness, and availability of property data, violation records, and enforcement information are not guaranteed. Always verify information independently before making investment decisions.
              </p>
            </div>
            <p className="text-muted-foreground mb-3">
              We are not responsible for:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Accuracy of third-party data sources</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Investment or purchasing decisions you make based on our data</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Deals you pursue using information from our platform</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Changes in property status or enforcement actions after data was collected</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">8. Service Availability</h2>
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
            <h2 className="text-2xl font-semibold text-foreground mb-4">9. Termination</h2>
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
            <h2 className="text-2xl font-semibold text-foreground mb-4">10. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these terms at any time. Continued use of the service after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section className="border-t pt-8 mt-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">11. Contact</h2>
            <p className="text-muted-foreground">
              <strong>Email:</strong>{" "}
              <a href="mailto:hello@snapignite.com" className="text-primary hover:underline">
                hello@snapignite.com
              </a>
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Address:</strong> 1621 Central Ave, Cheyenne, WY 82001
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground mb-4">
            <Link to="/privacy-policy" className="hover:text-foreground transition">Privacy Policy</Link>
            <Link to="/terms-and-conditions" className="hover:text-foreground transition">Terms & Conditions</Link>
            <a href="mailto:hello@snapignite.com" className="hover:text-foreground transition">Contact</a>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Snap Intelligence LLC. All rights reserved.
          </p>
          <p className="text-center text-xs text-muted-foreground mt-1">
            Snap Intelligence LLC · 1621 Central Ave, Cheyenne, WY 82001
          </p>
        </div>
      </div>
    </div>
  );
}
