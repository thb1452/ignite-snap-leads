import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import AvailabilityNotice from "@/components/AvailabilityNotice";
import { FREE_ACCOUNT_MESSAGE } from "@/lib/publicAvailability";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger, SheetClose } from "@/components/ui/sheet";
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
  Search,
  Menu,
  X,
  Sparkles,
  Eye,
  Bell,
  Shield,
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
      <p className="text-xs font-semibold text-landing-warning mb-4">Illustrative record — not live data or available coverage</p>
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
          Fictional example: a notice records a maintenance issue. Source report: February 2026. Current condition and owner intent are unknown.{" "}
          <span className="text-red-500 font-semibold">Review before outreach.</span>
        </p>
      </div>

      <p className="rounded-lg border border-landing-surface p-3 text-sm text-landing-text-muted">Illustration only · customer unlocks and exports are paused</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   LANDING PAGE
   ════════════════════════════════════════════════════════ */
export default function Landing() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroFlipped = false;

  // Redirect authenticated users to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) navigate("/properties", { replace: true });
    });
  }, [navigate]);

  // The product illustration is static; it does not imply live customer data.
  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 100);
  };

  return (
    <div className="landing-theme min-h-screen bg-landing-bg text-landing-text overflow-x-hidden">
      <SEOHead
        title="Snap Ignite | Enforcement Intelligence for Distressed Property Investors"
        description="Municipal enforcement intelligence for property research. Customer market access and purchases are paused during relaunch verification."
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
            description: "Municipal enforcement intelligence for property research. Customer market access and purchases are paused during relaunch verification.",
            applicationCategory: "BusinessApplication",
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
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden text-landing-text" aria-label="Open navigation"><Menu className="h-5 w-5" /></Button></SheetTrigger>
              <SheetContent className="landing-theme bg-landing-bg text-landing-text border-landing-surface">
                <SheetTitle className="text-landing-text">Snap Ignite navigation</SheetTitle>
                <SheetDescription className="text-landing-text-muted">Explore the workflow, pricing, and availability.</SheetDescription>
                <div className="flex flex-col gap-4 mt-8">
                  {[{ id: "how-it-works", label: "How it works" }, { id: "pricing", label: "Pricing" }, { id: "faq", label: "FAQ" }].map(item => <Button key={item.id} variant="ghost" className="justify-start" onClick={() => scrollTo(item.id)}>{item.label}</Button>)}
                  <SheetClose asChild><Link to="/code-violations" className="px-4 py-2">Market availability</Link></SheetClose>
                  <SheetClose asChild><Link to="/auth?mode=signup" className="px-4 py-2">Create free account</Link></SheetClose>
                </div>
              </SheetContent>
            </Sheet>
            <Link to="/auth?mode=signin">
              <Button variant="ghost" className="text-landing-text-muted hover:text-landing-text hover:bg-landing-surface/50 text-sm">Sign In</Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button className="hidden sm:flex bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-sm">
                Create Free Account <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>

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
                Enforcement Intelligence for Real Estate Investors
              </motion.p>

              <motion.h1 id="hero-heading" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="text-3xl md:text-5xl font-bold leading-tight">
                Monitor Municipal Pressure Signals {" "}
                <span className="text-landing-accent">With the Source in View</span>
              </motion.h1>

              <motion.p variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="text-lg text-landing-text-muted max-w-xl">
                Snap Ignite brings municipal enforcement records, source context, and your follow-up workflow together. Check the evidence and current status before deciding which properties deserve more research.
              </motion.p>

              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="flex flex-col sm:flex-row gap-3">
                <Link to="/auth?mode=signup">
                  <Button
                    size="lg"
                    onClick={() => trackEvent("hero_cta_click", { location: "hero" })}
                    className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-8 py-6 shadow-lg hover:shadow-[0_0_30px_rgba(56,178,172,0.3)] transition-shadow"
                  >
                    Create Free Account <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => scrollTo("how-it-works")}
                  className="border-landing-surface text-landing-text hover:bg-landing-surface/50 text-lg px-8 py-6 bg-transparent"
                >
                  See Monitoring Workflow <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>

              <motion.p variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="text-sm text-landing-text-muted flex items-center gap-2">
                <Check className="w-4 h-4 text-landing-accent" />
                Free account · No paid trial · Customer record access is paused
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

      <div className="container mx-auto px-4 pb-12 max-w-5xl"><AvailabilityNotice /></div>

      {/* ─── WHAT YOU GET ─────────────────────────────────── */}
      <section className="py-16 bg-landing-surface/30" aria-labelledby="offer-heading">
        <div className="container mx-auto px-4">
          <h2 id="offer-heading" className="text-3xl md:text-4xl font-bold text-center mb-4">
            Know What the Record Actually Says
          </h2>
          <p className="text-lg text-landing-text-muted text-center mb-12 max-w-2xl mx-auto">
            Our relaunch workflow is built around source evidence, careful review, and your next action. Customer access remains paused while this workflow is verified.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { icon: Shield, title: "Source-Backed Signals", desc: "See why a record exists: violation categories, open pressure, dates, and severity context before revealing the exact address." },
              { icon: Sparkles, title: "AI Investor Brief", desc: "Where available, summaries explain visible enforcement records. Always check them against the source; they do not establish owner intent." },
              { icon: Bell, title: "Market Monitoring", desc: "Review changes in an approved market using source dates. Refresh timing depends on the issuing agency." },
              { icon: Lock, title: "Controlled Unlocks", desc: "Customer unlocks and exports are paused until source access and delivery are verified." },
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
          <p className="text-lg text-landing-text-muted text-center mb-16">The workflow being prepared for approved customer markets</p>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { step: "01", icon: Search, title: "Scan Enforcement Pressure", desc: "Choose a city, then filter by SnapScore, violation category, recency, and open enforcement pressure to monitor the market pockets that matter." },
              { step: "02", icon: Eye, title: "Validate the Signal", desc: "Read the AI Investor Brief, violation timeline, and severity cues before spending anything. Separate visible pressure signals from noisy public records." },
              { step: "03", icon: Unlock, title: "Save Research and Follow Up", desc: `Save research context and a next action in your private pipeline. Unlocks, exports, and purchases remain paused during verification.` },
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
              { value: "Source", label: "Review the original context" },
              { value: "Dates", label: "Distinguish filing from receipt" },
              { value: "Status", label: "Check resolution and uncertainty" },
              { value: "Action", label: "Keep your next step visible" },
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
          <h2 id="pricing-heading" className="text-3xl md:text-4xl font-bold text-center mb-4">Plan Reference — Purchases Paused</h2>
          <p className="text-lg text-landing-text-muted text-center mb-14 max-w-xl mx-auto">
            These are the configured plan prices, not an offer of current data availability. No new purchases, free unlocks, or exports are available during the relaunch review.
          </p>

          {/* Subscription tiers */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto mb-8">
            {[
              { name: "Free", price: "$0", suffix: " account", features: ["No paid trial", "No card required", "Customer record access paused"], cta: "Create Free Account", highlighted: false },
              { name: "Pay As You Go", price: PAYG_PRICE_DISPLAY, suffix: "/credit", features: ["Reference price", "Purchases and unlocks paused"], cta: "View Availability", highlighted: false },
              { name: "Starter", price: "$49", suffix: "/mo", features: ["750 credits/month when available", "Purchases and access paused"], cta: "View Availability", highlighted: false },
              { name: "Pro", price: "$99", suffix: "/mo", features: ["1,500 credits/month when available", "Purchases and access paused"], cta: "View Availability", highlighted: true },
              { name: "Elite", price: "$199", suffix: "/mo", features: ["3,000 credits/month when available", "Signal coverage varies by market"], cta: "View Availability", highlighted: false },
              { name: "Enterprise", price: "Custom", suffix: "", features: ["Discuss requirements", "Subject to confirmed data availability"], cta: "Contact Us", highlighted: false, isEnterprise: true },
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
                {"badge" in plan && plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-landing-accent text-landing-bg text-xs font-semibold rounded-full whitespace-nowrap">
                    {String(plan.badge)}
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
                      <span>
                        {f}
                        {f === "Pressure Level™ filters" && (
                          <span className="block text-xs text-landing-text-muted mt-0.5">
                            Filter by active enforcement pressure from multiple departments
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link to={"isEnterprise" in plan && plan.isEnterprise ? "mailto:hello@snapignite.com" : plan.name === "Free" ? "/auth?mode=signup" : "/code-violations"}>
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
            <p className="text-landing-text-muted text-center mb-8">Reference prices only. Bulk credit purchases are paused.</p>
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
                  <Button disabled className="w-full bg-landing-accent text-landing-bg">Purchases paused</Button>
                </motion.div>
              ))}
            </div>
            <p className="text-center text-sm text-landing-text-muted mt-4">
              Monitoring multiple markets or need 25,000+ credits?{" "}
              <a href="mailto:hello@snapignite.com" className="text-landing-accent hover:underline">Contact us</a> for Enterprise pricing.
            </p>
          </div>
        </div>
      </section>

      {/* ─── WHY SNAP IGNITE ──────────────────────────────── */}
      <section className="py-20 bg-landing-surface/30" aria-labelledby="why-heading">
        <div className="container mx-auto px-4">
          <h2 id="why-heading" className="text-3xl md:text-4xl font-bold text-center mb-4">Built for Evidence and Follow-Through</h2>
          <p className="text-lg text-landing-text-muted text-center mb-14 max-w-2xl mx-auto">
            Snap Ignite is designed around enforcement pressure, freshness, and action history — the ingredients that make a data product feel proprietary instead of disposable.
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Problem */}
            <div className="bg-landing-bg/50 border border-landing-surface rounded-xl p-8">
              <div className="flex items-center gap-2 mb-4">
                <X className="w-5 h-5 text-red-400" />
                <h3 className="text-xl font-bold">Commodity Lead Lists</h3>
              </div>
              <div className="space-y-3 text-sm text-landing-text-muted">
                {["Reviewing broad homeowner lists with little context", "Using records without checking their source date", "No clear view into current municipal pressure", "Exporting bulk data before knowing which records deserve attention"].map((item, i) => (
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
                  "Municipal pressure signals ranked by SnapScore",
                  "Review source changes when the issuing agency supplies updates",
                  "AI Investor Brief explains visible signals without claiming owner intent",
                  `Keep property research and follow-up together in a private workflow`,
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-landing-accent shrink-0" />{item}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── MONITORING LOOP ───────────────────────────────── */}
      <section className="py-20" aria-labelledby="loop-heading">
        <div className="container mx-auto px-4">
          <p className="text-landing-accent font-semibold tracking-widest text-sm uppercase text-center mb-4">Monitoring Workflow</p>
          <h2 id="loop-heading" className="text-3xl md:text-4xl font-bold text-center mb-4">Build a weekly market intelligence habit</h2>
          <p className="text-lg text-landing-text-muted text-center mb-14 max-w-2xl mx-auto">
            Snap Ignite is designed for recurring review: choose a market, watch pressure signals, and unlock only when the public record supports action.
          </p>
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                label: "01",
                headline: "Monitor a city or market",
                body: "Start with the geography you care about, then use freshness, violation category, and SnapScore filters to keep review focused.",
                metric: "Market-first workflow",
              },
              {
                label: "02",
                headline: "Review pressure signals",
                body: "Use code violations, water shutoffs when available, repeat notices, and AI Investor Briefs to understand what changed in the record.",
                metric: "Evidence before outreach",
              },
              {
                label: "03",
                headline: "Unlock when ready to act",
                body: "Exact address and export rights stay gated until the signal is strong enough to spend a credit or subscription allowance.",
                metric: "Controlled unlock economy",
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
                <div className="w-11 h-11 rounded-full bg-landing-accent/15 flex items-center justify-center text-landing-accent font-bold text-sm shrink-0 mb-5">
                  {t.label}
                </div>
                <h3 className="text-xl font-bold mb-5 leading-snug">{t.headline}</h3>
                <p className="text-sm text-landing-text-muted leading-relaxed mb-5">{t.body}</p>
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
                { q: "Can I use customer records now?", a: "Customer record access, unlocks, exports, and new purchases are paused while we verify the relaunch. No customer market is currently approved for access." },
                { q: "Is creating an account free?", a: FREE_ACCOUNT_MESSAGE },
                { q: "What happened to the free unlock offer?", a: "Free unlocks are paused along with customer record access. Signing up does not promise immediate property access or enroll you in a paid trial." },
                { q: "Where does the data come from?", a: "We review municipal enforcement sources. Availability, field completeness, and update timing depend on the issuing agency. A record's receipt date is different from its event date." },
                { q: "Does a violation mean the owner wants to sell?", a: "No. A municipal record documents agency activity. Confirm the current status and property match, and do your own research before acting." },
                { q: "Which markets can I use?", a: "No customer market is currently approved. We will identify confirmed availability by city and state; a research directory entry is not customer coverage." },
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
          <h2 id="cta-heading" className="text-3xl md:text-5xl font-bold mb-4">Start with evidence. Keep your next action clear.</h2>
          <p className="text-lg text-landing-text-muted mb-8 max-w-xl mx-auto">
            Create a free account while we prepare customer access. Availability will be identified by market; no paid trial starts when you sign up.
          </p>
          <Link to="/auth?mode=signup">
            <Button
              size="lg"
              className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-10 py-6 shadow-lg hover:shadow-[0_0_30px_rgba(56,178,172,0.3)] transition-shadow"
            >
              Create Free Account <ArrowRight className="w-5 h-5 ml-2" />
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
                Municipal enforcement intelligence and a private research workflow for real estate investors.
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
                <Button size="sm" className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg">Create Free Account</Button>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
