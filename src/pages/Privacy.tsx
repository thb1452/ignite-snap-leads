import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import SEOHead from "@/components/SEOHead";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Privacy Policy | Snap Ignite" description="Learn how Snap Ignite collects, uses, and protects your personal information. We do not sell your data to third parties." canonical="https://snapignite.com/privacy" />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" className="mb-8 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-12">Effective Date: January 21, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8">
          <p className="text-lg text-muted-foreground leading-relaxed">
            Snap Intelligence LLC ("Snap Ignite," "we," "us," or "our") operates snapignite.com. 
            This page informs you of our policies regarding the collection, use, and disclosure 
            of personal information when you use our service.
          </p>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">Information We Collect</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span><strong>Account information</strong> — full name, email address, and phone number (if provided)</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span><strong>Payment information</strong> — processed securely by Stripe; we never store card numbers</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span><strong>Usage data</strong> — which features you use, pages viewed, and interaction timestamps</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span><strong>Property search & preferences</strong> — saved properties, search filters, geographic areas of interest, and notification preferences</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span><strong>Communication data</strong> — records of alerts, notifications, and messages we send you (including SMS/text messages)</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">How We Use Your Information</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Provide and maintain the Snap Ignite platform</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Process your subscription payments</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Send service updates, enforcement alerts, and property notifications via email, in-app messages, or SMS/text</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Personalize your experience based on your saved properties and preferences</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Improve our service based on aggregated usage patterns</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Comply with legal obligations</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">Data Sharing</h2>
            <div className="bg-accent/30 border border-border rounded-lg p-4 mb-4">
              <p className="text-foreground font-semibold">We do NOT sell, rent, or share your personal information with third parties for marketing purposes.</p>
            </div>
            <p className="text-muted-foreground mb-3">We share data only with the following service providers to operate our platform:</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span><strong>Stripe:</strong> Payment processing</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span><strong>Twilio:</strong> SMS/text message delivery (if opted in)</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span><strong>Cloud Infrastructure:</strong> Secure data hosting and storage</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">SMS/Text Message Communications</h2>
            <p className="text-muted-foreground mb-3">
              If you opt in to receive SMS/text notifications from Snap Ignite, the following applies:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>We will only send SMS messages you have explicitly consented to receive</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Message frequency varies based on your alert preferences and property activity</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Message and data rates may apply depending on your mobile carrier</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Your phone number will never be sold or shared with third parties</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">Opt-Out Instructions</h2>
            <div className="bg-accent/30 border border-border rounded-lg p-4 space-y-3">
              <p className="text-foreground">
                <strong>To stop SMS/text messages:</strong> Reply <span className="font-mono bg-muted px-2 py-0.5 rounded text-sm">STOP</span> to any message from Snap Ignite. You will receive a one-time confirmation and no further texts.
              </p>
              <p className="text-foreground">
                <strong>For help:</strong> Reply <span className="font-mono bg-muted px-2 py-0.5 rounded text-sm">HELP</span> to any message, or email us at{" "}
                <a href="mailto:hello@snapignite.com" className="text-primary hover:underline">hello@snapignite.com</a>.
              </p>
              <p className="text-foreground">
                <strong>To manage email notifications:</strong> Visit your <Link to="/settings" className="text-primary hover:underline">Account Settings</Link> and adjust your notification preferences.
              </p>
              <p className="text-foreground">
                <strong>To delete your account:</strong> Contact us at{" "}
                <a href="mailto:hello@snapignite.com" className="text-primary hover:underline">hello@snapignite.com</a>{" "}
                and we will remove all your personal data within 30 days.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">Your Rights</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Access your data at any time</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Request data deletion</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Export your data</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Update your information</span>
              </li>
              <li className="flex items-start">
                <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                <span>Opt out of any communications at any time</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use industry-standard encryption and security measures to protect your data. 
              All data is transmitted over HTTPS, and sensitive information is encrypted at rest.
            </p>
          </section>

          <section className="border-t pt-8 mt-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Contact Us</h2>
            <p className="text-muted-foreground">
              <strong>Email:</strong>{" "}
              <a href="mailto:hello@snapignite.com" className="text-primary hover:underline">
                hello@snapignite.com
              </a>
            </p>
            <p className="text-muted-foreground">
              <strong>Website:</strong>{" "}
              <a href="https://snapignite.com" className="text-primary hover:underline">
                snapignite.com
              </a>
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Address:</strong> 1621 Central Ave, Cheyenne, WY 82001
            </p>
          </section>
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
          <p className="text-center text-xs text-muted-foreground mt-1">
            Snap Intelligence LLC · 1621 Central Ave, Cheyenne, WY 82001
          </p>
        </div>
      </div>
    </div>
  );
}
