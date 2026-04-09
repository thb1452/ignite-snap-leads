import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/externalClient";
import { PAYG_PRICE_DISPLAY } from "@/lib/pricing";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Lock,
  Unlock,
  Users,
  TrendingUp,
  AlertTriangle,
  Search,
  Zap,
  Menu,
  X,
  Sparkles,
  MapPin,
  Eye,
  DollarSign,
  Download,
  Bell,
  Shield,
  Star,
  Droplets,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/* ── Mock Property Card ─────────────────────────────── */
function PropertyCardMock({ unlocked }: { unlocked: boolean }) {
  return (
    <div
      className="bg-landing-surface/80 border border-landing-surface rounded-xl p-5 w-full max-w-sm shadow-xl"
      role="figure"
      aria-label={unlocked ? "Example unlocked property card" : "Example locked property card with blurred address"}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {unlocked ? <Unlock className="w-4 h-4 text-landing-accent" /> : <Lock className="w-4 h-4 text-landing-text-muted" />}
          <span className="text-xs font-semibold uppercase tracking-wider text-landing-text-muted">
            {unlocked ? "Unlocked" : "Locked"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${unlocked ? "bg-landing-accent" : "bg-landing-warning"}`} />
          <span className="text-xs font-bold text-landing-accent">SnapScore 87</span>
        </div>
      </div>

      <p className={`text-lg font-bold mb-1 ${!unlocked ? "select-none" : ""}`}>
        {unlocked ? (
          "1423 Main St"
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="blur-[4px] select-none pointer-events-none" aria-hidden="true">1423</span>
            <span>Main St</span>
          </span>
        )}
      </p>
      <p className="text-sm text-landing-text-muted mb-4">Austin, TX 78701</p>

      <div className="bg-landing-bg/60 rounded-lg p-3 mb-4 border border-landing-accent/20">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-landing-accent" />
          <span className="text-xs font-semibold text-landing-accent">AI Investor Brief</span>
        </div>
        <p className="text-xs text-landing-text-muted leading-relaxed">
          Water disconnected since Feb 2026. 3 open violations including structural. Owner non-responsive to city notices.{" "}
          <span className="text-red-500 font-semibold">CALL NOW.</span>
        </p>
      </div>

      {unlocked ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-3.5 h-3.5 text-landing-text-muted" />
            <span className="text-landing-text">James Crawford (Owner)</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-landing-text-muted">📞</span>
            <span className="text-landing-text">(512) 555-0192</span>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg text-xs flex-1">Export Lead</Button>
            <Button size="sm" variant="outline" className="border-landing-surface text-landing-text text-xs flex-1">Save ❤️</Button>
          </div>
        </div>
      ) : (
        <Button className="w-full bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold">
          <Lock className="w-4 h-4 mr-2" />
          Unlock for {PAYG_PRICE_DISPLAY}
        </Button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   LANDING PAGE
   ════════════════════════════════════════════════════════ */
export default function Landing() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroFlipped, setHeroFlipped] = useState(false);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) navigate("/properties", { replace: true });
    });
  }, [navigate]);

  // Auto-flip hero card demo
  useEffect(() => {
    const interval = setInterval(() => setHeroFlipped((p) => !p), 4000);
    return () => clearInterval(interval);
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  return (
    <div className="landing-theme min-h-screen bg-landing-bg text-landing-text overflow-x-hidden">
      <SEOHead
        title="Snap Ignite | Find Distressed Properties Before Your Competition"
        description="Stop cold calling clean houses. Snap Ignite shows properties already showing distress with code violations, water shutoffs, and enforcement pressure. AI writes the deal brief. 3 free unlocks."
        canonical="https://snapignite.com/"
      />

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Snap Ignite",
            url: "https://snapignite.com",
            description: "Find distressed properties before your competition. Track code violations, water shutoffs, and enforcement pressure across 3,800+ cities. AI writes the deal brief.",
            applicationCategory: "BusinessApplication",
            offers: [
              { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD", description: "3 free unlocks, browse all properties, AI investor briefs" },
              { "@type": "Offer", name: "Pay As You Go", price: "0.67", priceCurrency: "USD", description: "Per credit, no subscription needed" },
              { "@type": "Offer", name: "Starter", price: "49", priceCurrency: "USD", description: "750 credits/month" },
              { "@type": "Offer", name: "Pro", price: "99", priceCurrency: "USD", description: "1,500 credits/month" },
              { "@type": "Offer", name: "Elite", price: "199", priceCurrency: "USD", description: "3,000 credits/month" },
            ],
            publisher: { "@type": "Organization", name: "Snap Intelligence LLC" },
          }),
        }}
      />

      {/* ─── NAV ──────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-landing-surface/50 bg-landing-bg/80 backdrop-blur-xl" aria-label="Main navigation">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-baseline gap-1" aria-label="Snap Ignite home">
            <span className="text-2xl font-bold tracking-tight flex items-baseline gap-1">
              <span className="text-landing-accent">SNAP</span>
              <svg viewBox="0 0 24 24" className="h-5 w-5 -mx-0.5 self-center" aria-hidden="true">
                <path d="M13.5 2 4 13h6l-1.5 9L18 11h-6L13.5 2Z" fill="#22c55e" />
              </svg>
              <span className="text-landing-text">ignite</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {[
              { id: "how-it-works", label: "How It Works" },
              { id: "pricing", label: "Pricing" },
              { id: "faq", label: "FAQ" },
            ].map((nav) => (
              <button key={nav.id} onClick={() => scrollTo(nav.id)} className="text-landing-text-muted hover:text-landing-text transition text-sm">
                {nav.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-landing-text-muted hover:text-landing-text"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Link to="/auth?mode=signin">
              <Button variant="ghost" className="text-landing-text-muted hover:text-landing-text hover:bg-landing-surface/50 text-sm">Sign In</Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button className="hidden sm:flex bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-sm">
                Start Free <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-landing-surface/50 bg-landing-bg/95 backdrop-blur-xl"
            >
              <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
                {[
                  { id: "how-it-works", label: "How It Works" },
                  { id: "pricing", label: "Pricing" },
                  { id: "faq", label: "FAQ" },
                ].map((nav) => (
                  <button key={nav.id} onClick={() => scrollTo(nav.id)} className="text-left py-3 text-landing-text-muted hover:text-landing-text transition border-b border-landing-surface/30">
                    {nav.label}
                  </button>
                ))}
                <Link to="/auth?mode=signup" className="w-full">
                  <Button className="mt-2 w-full bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold">
                    Start Free <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ─── HERO ─────────────────────────────────────────── */}
      <section className="relative pt-28 pb-20 overflow-hidden" aria-labelledby="hero-heading">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle, rgba(56,178,172,0.3) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="absolute inset-0 bg-gradient-to-br from-landing-primary/20 via-landing-bg/80 to-landing-bg" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
              className="space-y-6"
            >
              <motion.p variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="text-landing-accent font-semibold tracking-widest text-sm uppercase">
                The Deal-Finding Tool for Wholesalers & Investors
              </motion.p>

              <motion.h1 id="hero-heading" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="text-3xl md:text-5xl font-bold leading-tight">
                Find Homes Already Showing Distress{" "}
                <span className="text-landing-accent">Before Your Competition Does</span>
              </motion.h1>

              <motion.p variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="text-lg text-landing-text-muted max-w-xl">
                Stop cold calling clean houses. Snap Ignite shows you properties with active code violations, water shutoffs, and enforcement pressure across <strong className="text-landing-text">3,800+ cities</strong> and writes a plain-English deal brief so you know who to call first.
              </motion.p>

              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="flex flex-col sm:flex-row gap-3">
                <Link to="/auth?mode=signup">
                  <Button
                    size="lg"
                    onClick={() => trackEvent("hero_cta_click", { location: "hero" })}
                    className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-8 py-6 shadow-lg hover:shadow-[0_0_30px_rgba(56,178,172,0.3)] transition-shadow"
                  >
                    Start Free <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => scrollTo("how-it-works")}
                  className="border-landing-surface text-landing-text hover:bg-landing-surface/50 text-lg px-8 py-6 bg-transparent"
                >
                  See How It Works <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>

              <motion.p variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="text-sm text-landing-text-muted flex items-center gap-2">
                <Check className="w-4 h-4 text-landing-accent" />
                Free signup · 3 free unlocks · No credit card required
              </motion.p>
            </motion.div>

            {/* Animated card flip */}
            <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, duration: 0.6 }} className="flex justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={heroFlipped ? "unlocked" : "locked"}
                  initial={{ opacity: 0, rotateY: -90 }}
                  animate={{ opacity: 1, rotateY: 0 }}
                  exit={{ opacity: 0, rotateY: 90 }}
                  transition={{ duration: 0.5 }}
                >
                  <PropertyCardMock unlocked={heroFlipped} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── WHAT YOU GET ─────────────────────────────────── */}
      <section className="py-16 bg-landing-surface/30" aria-labelledby="offer-heading">
        <div className="container mx-auto px-4">
          <h2 id="offer-heading" className="text-3xl md:text-4xl font-bold text-center mb-4">
            See the Distress Before You Pay a Dime
          </h2>
          <p className="text-lg text-landing-text-muted text-center mb-12 max-w-2xl mx-auto">
            Browse every property. Read the AI deal brief. Unlock only the addresses worth calling.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { icon: Users, title: "Free Signup", desc: "No credit card. Start finding distressed properties in 30 seconds." },
              { icon: Sparkles, title: "3 Free Unlocks", desc: "Sample 3 full records on us. Address, violations, and deal brief so you can see the quality before you spend." },
              { icon: Eye, title: "AI Deal Brief", desc: "Every property gets a plain-English signal: what's wrong, how bad it is, and whether to call now." },
              { icon: Lock, title: "Pay Only for What You Want", desc: "Street number hidden until you decide it's worth it. Unlock one at a time or subscribe for bulk." },
            ].map((item, i) => (
              <div key={i} className="bg-landing-bg/50 border border-landing-surface rounded-xl p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-landing-accent/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-6 h-6 text-landing-accent" />
                </div>
                <h3 className="text-base font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-landing-text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────── */}
      <section id="how-it-works" className="py-20" aria-labelledby="hiw-heading">
        <div className="container mx-auto px-4">
          <h2 id="hiw-heading" className="text-3xl md:text-4xl font-bold text-center mb-4">How It Works</h2>
          <p className="text-lg text-landing-text-muted text-center mb-16">Three steps from search to warmer conversations</p>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { step: "01", icon: Search, title: "Find Distressed Properties", desc: "Filter by city, distress score, violation type, or enforcement pressure. See every property with an active problem, free." },
              { step: "02", icon: Eye, title: "Read the Deal Brief", desc: "AI writes a plain-English signal for every property: what's wrong, how serious it is, and whether the owner has a reason to sell." },
              { step: "03", icon: Unlock, title: "Unlock & Call", desc: `Use a free unlock, pay ${PAYG_PRICE_DISPLAY} one-time, or subscribe. Get the full address, export the lead, and start a conversation with someone who already has a reason to talk.` },
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative"
              >
                {i < 2 && <div className="hidden md:block absolute top-12 right-0 w-full h-0.5 bg-gradient-to-r from-landing-accent/50 to-transparent translate-x-1/2" />}
                <div className="bg-landing-surface/40 border border-landing-surface rounded-xl p-8 relative hover:-translate-y-1 transition-transform duration-300">
                  <div className="text-5xl font-bold text-landing-accent/15 absolute top-4 right-4" aria-hidden="true">{s.step}</div>
                  <div className="w-12 h-12 rounded-full bg-landing-accent flex items-center justify-center text-landing-bg mb-6">
                    <s.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{s.title}</h3>
                  <p className="text-landing-text-muted">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TRUST / STATS ────────────────────────────────── */}
      <section className="py-16 bg-landing-surface/30" aria-labelledby="trust-heading">
        <div className="container mx-auto px-4">
          <h2 id="trust-heading" className="sr-only">Platform Coverage</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto text-center">
            {[
              { value: "500K+", label: "Distressed Properties" },
              { value: "3,800+", label: "Cities Covered" },
              { value: "Weekly", label: "Fresh Signals" },
              { value: "AI", label: "Deal Briefs on Every Lead" },
            ].map((stat, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <div className="text-3xl md:text-4xl font-bold text-landing-accent">{stat.value}</div>
                <div className="text-sm text-landing-text-muted mt-1">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ──────────────────────────────────────── */}
      <section id="pricing" className="py-20" aria-labelledby="pricing-heading">
        <div className="container mx-auto px-4">
          <h2 id="pricing-heading" className="text-3xl md:text-4xl font-bold text-center mb-4">Simple, Transparent Pricing</h2>
          <p className="text-lg text-landing-text-muted text-center mb-14 max-w-xl mx-auto">
            You're not buying data. You're buying warmer leads and better conversations. One deal pays for years of Snap Ignite.
          </p>

          {/* Subscription tiers */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto mb-8">
            {[
              { name: "Free", price: "$0", suffix: "/forever", features: ["3 unlocks total, never expire", "Browse all properties", "AI investor briefs", "SnapScore ranking"], cta: "Start Free", highlighted: false },
              { name: "Pay As You Go", price: PAYG_PRICE_DISPLAY, suffix: "/credit", features: ["No monthly fee", "1 credit = 1 unlock + export", "Credits never expire", "No commitment"], cta: "Start Free", highlighted: false, badge: "No Subscription Needed" },
              { name: "Starter", price: "$49", suffix: "/mo", features: ["750 credits/month", "Code violation data", "Basic filters", "CSV export"], cta: "Start Free", highlighted: false },
              { name: "Pro", price: "$99", suffix: "/mo", features: ["1,500 credits/month", "Pressure Level™ filters", "Priority support", "All Starter features"], cta: "Start Free", highlighted: true, badge: "Most Popular" },
              { name: "Elite", price: "$199", suffix: "/mo", features: ["3,000 credits/month", "Water shutoff data", "API access (coming soon)", "Full platform access"], cta: "Start Free", highlighted: false },
              { name: "Enterprise", price: "Custom", suffix: "", features: ["25,000+ addresses", "API access", "Dedicated account manager", "Custom contract"], cta: "Contact Us", highlighted: false, isEnterprise: true },
            ].map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className={`relative rounded-xl p-6 ${
                  plan.highlighted
                    ? "bg-landing-bg border-2 border-landing-accent shadow-lg shadow-landing-accent/20"
                    : "bg-landing-bg/50 border border-landing-surface"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-landing-accent text-landing-bg text-xs font-semibold rounded-full whitespace-nowrap">
                    {plan.badge}
                  </div>
                )}
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold mb-2">{plan.name}</h3>
                  <div className="mb-1">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    {plan.suffix && <span className="text-landing-text-muted">{plan.suffix}</span>}
                  </div>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-landing-accent shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to={(plan as any).isEnterprise ? "mailto:hello@snapignite.com" : "/auth?mode=signup"}>
                  <Button
                    className={`w-full text-sm ${
                      plan.highlighted
                        ? "bg-landing-accent hover:bg-landing-accent/90 text-landing-bg"
                        : "bg-landing-surface hover:bg-landing-surface/80 text-landing-text border border-landing-surface"
                    }`}
                    size="sm"
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Bulk Credits */}
          <div className="max-w-4xl mx-auto mt-16">
            <h3 className="text-2xl font-bold text-center mb-2">Bulk Credits</h3>
            <p className="text-landing-text-muted text-center mb-8">Buy once, use anytime. No subscription required.</p>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                { credits: "5,000", price: "$750", per: "$0.15/credit" },
                { credits: "10,000", price: "$1,300", per: "$0.13/credit" },
                { credits: "20,000", price: "$2,200", per: "$0.11/credit" },
              ].map((pkg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className="rounded-xl p-6 bg-landing-bg/50 border border-landing-surface text-center"
                >
                  <p className="text-2xl font-bold mb-1">{pkg.credits} credits</p>
                  <p className="text-3xl font-bold text-landing-accent mb-1">{pkg.price}</p>
                  <p className="text-sm text-landing-text-muted mb-4">{pkg.per}</p>
                  <Link to="/auth?mode=signup">
                    <Button className="w-full bg-landing-accent hover:bg-landing-accent/90 text-landing-bg">Get Started</Button>
                  </Link>
                </motion.div>
              ))}
            </div>
            <p className="text-center text-sm text-landing-text-muted mt-4">
              Need 25,000+?{" "}
              <a href="mailto:hello@snapignite.com" className="text-landing-accent hover:underline">Contact us</a> for Enterprise pricing.
            </p>
          </div>
        </div>
      </section>

      {/* ─── WHY SNAP IGNITE ──────────────────────────────── */}
      <section className="py-20 bg-landing-surface/30" aria-labelledby="why-heading">
        <div className="container mx-auto px-4">
          <h2 id="why-heading" className="text-3xl md:text-4xl font-bold text-center mb-4">Why Investors Choose Snap Ignite</h2>
          <p className="text-lg text-landing-text-muted text-center mb-14 max-w-2xl mx-auto">
            Every lead comes from real municipal enforcement records, not scraped, not estimated. You're calling homeowners who already have a visible reason to sell.
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Problem */}
            <div className="bg-landing-bg/50 border border-landing-surface rounded-xl p-8">
              <div className="flex items-center gap-2 mb-4">
                <X className="w-5 h-5 text-red-400" />
                <h3 className="text-xl font-bold">The Old Way</h3>
              </div>
              <div className="space-y-3 text-sm text-landing-text-muted">
                {["Cold calling random homeowners with no reason to sell", "Same lists every other investor already bought", "No insight into whether the owner is actually motivated", "Paying upfront for data that leads nowhere"].map((item, i) => (
                  <div key={i} className="flex items-center gap-2"><X className="w-3.5 h-3.5 text-red-400 shrink-0" />{item}</div>
                ))}
              </div>
            </div>
            {/* Solution */}
            <div className="bg-landing-bg/50 border border-landing-accent/30 rounded-xl p-8 ring-1 ring-landing-accent/10">
              <div className="flex items-center gap-2 mb-4">
                <Check className="w-5 h-5 text-landing-accent" />
                <h3 className="text-xl font-bold">Snap Ignite</h3>
              </div>
              <div className="space-y-3 text-sm text-landing-text-muted">
                {[
                  "Only properties already showing signs of distress",
                  "Fresh enforcement signals updated weekly",
                  "AI deal brief tells you who to call first, free",
                  `Unlock only the addresses worth calling at ${PAYG_PRICE_DISPLAY} each`,
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-landing-accent shrink-0" />{item}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SOCIAL PROOF ─────────────────────────────────── */}
      <section className="py-20" aria-labelledby="proof-heading">
        <div className="container mx-auto px-4">
          <p className="text-landing-accent font-semibold tracking-widest text-sm uppercase text-center mb-4">Real Results</p>
          <h2 id="proof-heading" className="text-3xl md:text-4xl font-bold text-center mb-4">Real results from investors using Snap Ignite</h2>
          <p className="text-lg text-landing-text-muted text-center mb-14 max-w-2xl mx-auto">
            These results come from focusing on the right properties, not more outreach.
          </p>
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                initials: "JM",
                name: "Jake Martinez",
                role: "Wholesaler",
                location: "Phoenix, AZ",
                headline: "3 deals in 6 weeks and I stopped wasting time.",
                body: "I used to call 100+ people a week and get nowhere. Now I only reach out to properties with real problems. The conversations are completely different.",
                metric: "3 contracts in 6 weeks",
              },
              {
                initials: "SR",
                name: "Sarah Reynolds",
                role: "Acquisition Manager",
                location: "Southeast",
                headline: "We stopped convincing people. We started negotiating.",
                body: "Before Snap, we were chasing homeowners and trying to create motivation. Now we talk to owners who already know there's an issue.",
                metric: "40% higher contact-to-contract rate",
              },
              {
                initials: "ML",
                name: "Marcus Lee",
                role: "Real Estate Investor",
                location: "",
                headline: "This is the first time leads actually made sense.",
                body: "I didn't know who to call before. It felt like guessing. Snap showed me exactly where to focus.",
                metric: "First deal closed in under 30 days",
              },
            ].map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-landing-bg/60 border border-landing-surface rounded-2xl p-8 hover:-translate-y-1 hover:shadow-lg hover:shadow-landing-accent/5 transition-all duration-300"
              >
                {/* Result Headline */}
                <h3 className="text-xl font-bold mb-5 leading-snug">{t.headline}</h3>

                {/* User Identity */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-full bg-landing-accent/15 flex items-center justify-center text-landing-accent font-bold text-sm shrink-0">
                    {t.initials}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{t.name}</div>
                    <div className="text-xs text-landing-text-muted">
                      {t.role}{t.location ? `, ${t.location}` : ""}
                    </div>
                  </div>
                </div>

                {/* Body */}
                <p className="text-sm text-landing-text-muted leading-relaxed mb-5">{t.body}</p>

                {/* Metric */}
                <div className="pt-4 border-t border-landing-surface">
                  <span className="text-landing-accent font-bold text-base">{t.metric}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────── */}
      <section id="faq" className="py-20 bg-landing-surface/30" aria-labelledby="faq-heading">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 id="faq-heading" className="text-3xl md:text-4xl font-bold text-center mb-12">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="space-y-4">
              {[
                { q: "Do I need a subscription to use Snap Ignite?", a: "No. Sign up free and browse every distressed property with AI deal briefs. Pay only for the addresses you actually want to call at $0.67 each, or subscribe for a better rate." },
                { q: "What are the 3 free unlocks?", a: "Every new account gets 3 free unlocks so you can see the quality before you spend. Each unlock reveals the full address, violation data, and deal brief. No credit card needed." },
                { q: "What happens when I unlock a property?", a: "You get the complete street address, full violation history, AI deal brief, and the ability to export or save the lead. You're ready to make the call." },
                { q: "How does Pay As You Go work?", a: `Pay ${PAYG_PRICE_DISPLAY} per credit. No subscription, no commitment. 1 credit = 1 unlock + 1 export. Credits never expire.` },
                { q: "Where does the data come from?", a: "All data is sourced directly from municipalities through public records requests. These are real enforcement actions including code violations, fines, and water shutoffs, not estimates or scraped data." },
                { q: "How is this different from other lead lists?", a: "Most lead lists give you every homeowner in a zip code. Snap Ignite only shows you properties already under enforcement pressure. You're calling people with a visible reason to sell, not random homeowners." },
              ].map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="bg-landing-bg/50 border border-landing-surface rounded-lg px-6 data-[state=open]:border-landing-accent/50">
                  <AccordionTrigger className="text-left font-semibold hover:text-landing-accent py-5 text-sm md:text-base">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-landing-text-muted pb-5 text-sm">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ────────────────────────────────────── */}
      <section className="py-20 relative overflow-hidden" aria-labelledby="cta-heading">
        <div className="absolute inset-0 bg-gradient-to-t from-landing-accent/10 to-transparent" />
        <div className="container mx-auto px-4 relative z-10 text-center">
          <h2 id="cta-heading" className="text-3xl md:text-5xl font-bold mb-4">Stop cold calling clean houses.</h2>
          <p className="text-lg text-landing-text-muted mb-8 max-w-xl mx-auto">
            Find homeowners already showing signs of distress. Sign up free. 3 unlocks on us. No credit card required.
          </p>
          <Link to="/auth?mode=signup">
            <Button
              size="lg"
              className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-10 py-6 shadow-lg hover:shadow-[0_0_30px_rgba(56,178,172,0.3)] transition-shadow"
            >
              Start Free <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────── */}
      <footer className="py-12 border-t border-landing-surface bg-landing-bg">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <span className="text-xl font-bold tracking-tight">
                <span className="text-landing-accent">SNAP</span>
                <span className="text-landing-text"> IGNITE</span>
              </span>
              <p className="text-landing-text-muted text-sm mt-4">
                The deal-finding tool for wholesalers and real estate investors.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm">Product</h4>
              <ul className="space-y-2 text-sm text-landing-text-muted">
                <li><button onClick={() => scrollTo("how-it-works")} className="hover:text-landing-text transition">How It Works</button></li>
                <li><button onClick={() => scrollTo("pricing")} className="hover:text-landing-text transition">Pricing</button></li>
                <li><button onClick={() => scrollTo("faq")} className="hover:text-landing-text transition">FAQ</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm">Company</h4>
              <ul className="space-y-2 text-sm text-landing-text-muted">
                <li><Link to="/about" className="hover:text-landing-text transition">About</Link></li>
                <li><a href="mailto:hello@snapignite.com" className="hover:text-landing-text transition">Contact</a></li>
                <li><Link to="/blog" className="hover:text-landing-text transition">Blog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm">Legal</h4>
              <ul className="space-y-2 text-sm text-landing-text-muted">
                <li><Link to="/privacy" className="hover:text-landing-text transition">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-landing-text transition">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-landing-surface flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <p className="text-landing-text-muted text-sm">© 2026 Snap Ignite. All rights reserved.</p>
              <p className="text-landing-text-muted text-xs mt-1">Snap Intelligence LLC · 1621 Central Ave, Cheyenne, WY 82001</p>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/auth?mode=signin">
                <Button variant="ghost" size="sm" className="text-landing-text-muted hover:text-landing-text">Sign In</Button>
              </Link>
              <Link to="/auth?mode=signup">
                <Button size="sm" className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg">Start Free</Button>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
