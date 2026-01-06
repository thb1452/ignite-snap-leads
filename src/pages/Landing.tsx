import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, Target, Brain, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

export default function Landing() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("waitlist")
        .insert({
          email: email.toLowerCase().trim(),
          name: name.trim() || null,
          role: role || null,
        });

      if (error) {
        if (error.code === "23505") { // Unique violation
          toast({
            title: "Already on the list!",
            description: "This email is already registered. We'll contact you soon.",
          });
          setSubmitted(true);
        } else {
          throw error;
        }
      } else {
        setSubmitted(true);
        toast({
          title: "You're on the list!",
          description: "We'll contact you within 24 hours to get you started.",
        });
      }
    } catch (error) {
      console.error("Waitlist signup error:", error);
      toast({
        title: "Something went wrong",
        description: "Please try again or email us directly.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white">
      {/* Navigation */}
      <nav className="border-b border-gray-800 bg-gray-950/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {/* TODO: Add Snap Ignite logo here */}
            <span className="text-2xl font-bold">
              <span className="text-blue-500">SNAP</span>
              <span className="text-white"> IGNITE</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/pricing">
              <Button variant="ghost" className="text-gray-300 hover:text-white">
                Pricing
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="outline" className="border-gray-700 hover:bg-gray-800">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            Stop chasing owners who{" "}
            <span className="text-blue-500">aren't under real pressure</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-400 mb-8 max-w-3xl mx-auto">
            Snap shows you which properties cities are actively squeezing — before owners are forced to act.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a href="#early-access" className="w-full sm:w-auto">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-8 py-6 w-full">
                Get Early Access - $119/month
              </Button>
            </a>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            First 100 customers only
          </p>

          {/* TODO: Add screenshot of property map or SnapScore interface here */}
          <div className="mt-16 rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-gray-500">
            <div className="aspect-video flex items-center justify-center">
              [Product Screenshot: Property Map with SnapScore Highlighting]
            </div>
          </div>
        </div>
      </section>

      {/* One-Liner Differentiation */}
      <section className="bg-gray-900/50 border-y border-gray-800 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-8">
              Other platforms show property data.{" "}
              <span className="text-blue-500">Snap shows enforcement pressure.</span>
            </h2>
            <div className="grid md:grid-cols-2 gap-8 mt-12">
              <div className="text-left p-6 rounded-lg border border-gray-800 bg-gray-950/50">
                <h3 className="text-lg font-semibold text-gray-400 mb-3">What Others Do</h3>
                <ul className="space-y-2 text-gray-500">
                  <li>• Static property attributes</li>
                  <li>• Owner contact info</li>
                  <li>• Marketing automation tools</li>
                  <li>• You guess who's motivated</li>
                </ul>
              </div>
              <div className="text-left p-6 rounded-lg border border-blue-500/50 bg-blue-950/20">
                <h3 className="text-lg font-semibold text-blue-400 mb-3">What Snap Does</h3>
                <ul className="space-y-2 text-gray-300">
                  <li>• Tracks government enforcement behavior</li>
                  <li>• Converts violations to pressure scores</li>
                  <li>• Detects escalation patterns</li>
                  <li>• Shows you who's under real pressure</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-8 rounded-lg border border-gray-800 bg-gray-900/30">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 text-blue-500 mb-6">
                <Target className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">Track Enforcement Behavior</h3>
              <p className="text-gray-400">
                Live municipal enforcement data from hundreds of counties
              </p>
            </div>
            <div className="text-center p-8 rounded-lg border border-gray-800 bg-gray-900/30">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 text-blue-500 mb-6">
                <Brain className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">AI Pressure Scoring</h3>
              <p className="text-gray-400">
                SnapScore™ ranks properties by enforcement pressure intensity
              </p>
            </div>
            <div className="text-center p-8 rounded-lg border border-gray-800 bg-gray-900/30">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 text-blue-500 mb-6">
                <TrendingUp className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">Focus Where It Matters</h3>
              <p className="text-gray-400">
                See escalation patterns and repeat violations — not just property attributes
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What Snap Does */}
      <section className="bg-gray-900/50 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
              What Snap Does
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                "Tracks government enforcement behavior in real-time",
                "Converts violations into pressure scores (SnapScore™)",
                "Detects escalation patterns, not just distress signals",
                "Shows when pressure is increasing",
                "Filters by violation type, enforcement dates, repeat offenders",
                "Covers hundreds of counties across major U.S. markets"
              ].map((feature, idx) => (
                <div key={idx} className="flex items-start gap-3 p-4 rounded-lg border border-gray-800 bg-gray-950/50">
                  <Check className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-300">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6">
              <div className="text-4xl font-bold text-blue-500 mb-2">220,000+</div>
              <div className="text-gray-400">Properties Tracked</div>
            </div>
            <div className="p-6">
              <div className="text-4xl font-bold text-blue-500 mb-2">100s</div>
              <div className="text-gray-400">Counties Covered</div>
            </div>
            <div className="p-6">
              <div className="text-4xl font-bold text-blue-500 mb-2">Live</div>
              <div className="text-gray-400">Municipal Data</div>
            </div>
          </div>
          <p className="text-gray-500 mt-8 italic">
            Built using live municipal enforcement data
          </p>
        </div>
      </section>

      {/* Qualification Section */}
      <section className="bg-gray-900/50 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8">
              {/* NOT for you */}
              <div className="p-8 rounded-lg border border-red-900/50 bg-red-950/20">
                <h3 className="text-2xl font-bold mb-6 text-red-400">Snap is NOT for you if:</h3>
                <ul className="space-y-4">
                  {[
                    "You're a beginner looking for guaranteed deals",
                    "You think Zillow is \"good enough\"",
                    "You want 10,000 generic names to cold call"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-400">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* IS for you */}
              <div className="p-8 rounded-lg border border-blue-500/50 bg-blue-950/20">
                <h3 className="text-2xl font-bold mb-6 text-blue-400">Snap IS for you if:</h3>
                <ul className="space-y-4">
                  {[
                    "You're done chasing dead-end cold call lists",
                    "You want real seller distress, not surface data",
                    "You're ready for accuracy and high-signal leads",
                    "You understand leverage and want to focus where pressure is real"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Key Details
          </h2>
          <div className="space-y-6">
            <div className="p-6 rounded-lg border border-gray-800 bg-gray-900/30">
              <h3 className="text-xl font-semibold mb-3 text-blue-400">How often is data updated?</h3>
              <p className="text-gray-400">
                Data refreshed on a rolling basis, typically every 30–90 days depending on jurisdiction.
                Snap reflects the most recent enforcement data available.
              </p>
            </div>
            <div className="p-6 rounded-lg border border-gray-800 bg-gray-900/30">
              <h3 className="text-xl font-semibold mb-3 text-blue-400">What markets are covered?</h3>
              <p className="text-gray-400">
                Hundreds of counties across major U.S. markets including Florida, Texas, Ohio, Georgia,
                Arizona, and more. New jurisdictions added regularly.
              </p>
            </div>
            <div className="p-6 rounded-lg border border-gray-800 bg-gray-900/30">
              <h3 className="text-xl font-semibold mb-3 text-blue-400">Does Snap include skip tracing?</h3>
              <p className="text-gray-400">
                Snap focuses on identifying pressure. Owner contact info can be added via export or
                third-party services.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing & Email Capture */}
      <section id="early-access" className="bg-gradient-to-b from-blue-950/20 to-transparent py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto">
            {!submitted ? (
              <div className="p-8 rounded-lg border border-blue-500/50 bg-gray-900/50 backdrop-blur">
                <div className="text-center mb-8">
                  <h2 className="text-3xl md:text-4xl font-bold mb-4">Early Access</h2>
                  <div className="text-5xl font-bold text-blue-500 mb-2">$119<span className="text-2xl text-gray-400">/month</span></div>
                  <p className="text-gray-400 mb-1">First 100 customers only</p>
                  <p className="text-sm text-gray-500">No contracts, cancel anytime</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Input
                      type="email"
                      placeholder="Your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-gray-950 border-gray-700 text-white"
                    />
                  </div>
                  <div>
                    <Input
                      type="text"
                      placeholder="Your name (optional)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-gray-950 border-gray-700 text-white"
                    />
                  </div>
                  <div>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger className="bg-gray-950 border-gray-700 text-white">
                        <SelectValue placeholder="I am a..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wholesaler">Wholesaler</SelectItem>
                        <SelectItem value="investor">Investor</SelectItem>
                        <SelectItem value="agent">Real Estate Agent</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSubmitting ? "Submitting..." : "Get Early Access"}
                  </Button>
                </form>
              </div>
            ) : (
              <div className="p-8 rounded-lg border border-green-500/50 bg-gray-900/50 backdrop-blur text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 text-green-500 mb-4">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold mb-2">You're on the list!</h3>
                <p className="text-gray-400">
                  We'll contact you within 24 hours to get you started.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-6">
          Start Closing Deals Based on Real Pressure
        </h2>
        <a href="#early-access">
          <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-8 py-6">
            Get Early Access - $119/month
          </Button>
        </a>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-950 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-gray-500 text-sm">
              © 2026 Snap Ignite. All rights reserved.
            </div>
            <div className="flex gap-6 text-sm">
              <Link to="/pricing" className="text-gray-400 hover:text-white">
                Pricing
              </Link>
              <Link to="/how-snap-works" className="text-gray-400 hover:text-white">
                How It Works
              </Link>
              <Link to="/auth" className="text-gray-400 hover:text-white">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
