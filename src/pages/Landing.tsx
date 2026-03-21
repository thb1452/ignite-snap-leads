import { useState, useEffect, useRef } from "react";
import SEOHead from "@/components/SEOHead";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";


import {
  ArrowRight,
  Check,
  X,
  ChevronDown,
  Lock,
  Unlock,
  Users,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Filter,
  Download,
  Search,
  Zap,
  Menu,
  Droplets,
  Bell,
  Sparkles,
  MapPin,
  CreditCard,
  Eye,
  DollarSign,
  FileText,
  Shield,
  Star,
} from "lucide-react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Animated counter
function AnimatedCounter({ end, suffix = "", duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let startTime: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isInView, end, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── Mock Property Card ───────────────────────────────
function PropertyCardMock({ unlocked }: { unlocked: boolean }) {
  return (
    <div className="bg-landing-surface/80 border border-landing-surface rounded-xl p-5 w-full max-w-sm shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {unlocked ? (
            <Unlock className="w-4 h-4 text-landing-accent" />
          ) : (
            <Lock className="w-4 h-4 text-landing-text-muted" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-landing-text-muted">
            {unlocked ? "Unlocked" : "Locked"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${unlocked ? 'bg-landing-accent' : 'bg-landing-warning'}`} />
          <span className="text-xs font-bold text-landing-accent">SnapScore 87</span>
        </div>
      </div>

      {/* Address */}
      <p className={`text-lg font-bold mb-1 ${!unlocked ? 'select-none' : ''}`}>
        {unlocked ? "1423 Main St" : (
          <span className="inline-flex items-center gap-2">
            <span className="blur-[4px] select-none pointer-events-none">1423</span>
            <span>Main St</span>
          </span>
        )}
      </p>
      <p className="text-sm text-landing-text-muted mb-4">Austin, TX 78701</p>

      {/* AI Insight */}
      <div className="bg-landing-bg/60 rounded-lg p-3 mb-4 border border-landing-accent/20">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-landing-accent" />
          <span className="text-xs font-semibold text-landing-accent">AI Investor Brief</span>
        </div>
        <p className="text-xs text-landing-text-muted leading-relaxed">
          Water disconnected since Feb 2026. 3 open violations including structural. Owner non-responsive to city notices. <span className="text-landing-warning font-semibold">HIGH OPPORTUNITY.</span>
        </p>
      </div>

      {/* Contact / CTA */}
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
            <Button size="sm" className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg text-xs flex-1">
              Export Lead
            </Button>
            <Button size="sm" variant="outline" className="border-landing-surface text-landing-text text-xs flex-1">
              Save ❤️
            </Button>
          </div>
        </div>
      ) : (
        <Button className="w-full bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold">
          <Lock className="w-4 h-4 mr-2" />
          Unlock for $0.97
        </Button>
      )}
    </div>
  );
}

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroFlipped, setHeroFlipped] = useState(false);

  // Auto-flip hero card demo
  useEffect(() => {
    const interval = setInterval(() => setHeroFlipped((p) => !p), 4000);
    return () => clearInterval(interval);
  }, []);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  return (
    <div className="min-h-screen bg-landing-bg text-landing-text overflow-x-hidden">
      <SEOHead
        title="Snap Ignite | Find Motivated Sellers Before the MLS"
        description="See AI investor briefs for free. Pay only for the address. Snap Ignite tracks code violations, water shutoffs, and enforcement across 3,800+ cities."
        canonical="https://snapignite.com/"
      />

      {/* ─── 1. Navigation ────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-landing-surface/50 bg-landing-bg/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight flex items-baseline gap-1">
              <span className="text-landing-accent">SNAP</span>
              <svg viewBox="0 0 24 24" className="h-5 w-5 -mx-0.5 self-center" aria-hidden="true">
                <path d="M13.5 2 4 13h6l-1.5 9L18 11h-6L13.5 2Z" fill="#22c55e" />
              </svg>
              <span className="text-landing-text">ignite</span>
            </span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {["features", "how-it-works", "pricing", "faq"].map((id) => (
              <button key={id} onClick={() => scrollToSection(id)} className="text-landing-text-muted hover:text-landing-text transition capitalize">
                {id.replace(/-/g, " ").replace("how it works", "How It Works")}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-landing-text-muted hover:text-landing-text"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Link to="/auth?mode=signin">
              <Button variant="ghost" className="text-landing-text-muted hover:text-landing-text hover:bg-landing-surface/50">Sign In</Button>
            </Link>
            <Link to="/auth">
              <Button
                className="hidden sm:flex bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold"
              >
                Start Free <ArrowRight className="w-4 h-4 ml-2" />
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
                {["features", "how-it-works", "pricing", "faq"].map((id) => (
                  <button key={id} onClick={() => scrollToSection(id)} className="text-left py-3 text-landing-text-muted hover:text-landing-text transition border-b border-landing-surface/30 capitalize">
                    {id.replace(/-/g, " ")}
                  </button>
                ))}
                <Link to="/auth" className="w-full">
                  <Button className="mt-2 w-full bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold">
                    Start Free <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ─── 2. Hero ─────────────────────────────────────── */}
      <section className="relative pt-28 pb-20 overflow-hidden">
        <div className="absolute inset-0 animate-dot-grid opacity-20" style={{ backgroundImage: "radial-gradient(circle, rgba(56,178,172,0.3) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="absolute inset-0 bg-gradient-to-br from-landing-primary/20 via-landing-bg/80 to-landing-bg" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            {/* Left – text */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
              className="space-y-6"
            >
              <motion.p variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="text-landing-accent font-semibold tracking-widest text-sm uppercase">
                Enforcement Intelligence Platform
              </motion.p>

              <motion.h1 variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="text-3xl md:text-5xl font-bold leading-tight">
                Find motivated sellers before they hit the MLS.{" "}
                <span className="text-landing-accent">See insights free. Pay only for the address.</span>
              </motion.h1>

              <motion.p variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="text-lg text-landing-text-muted max-w-xl">
                Snap Ignite tracks active code violations, water shutoffs, and city enforcement across 3,800+ cities. AI writes a 2-sentence investor brief for every property.
              </motion.p>

              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="flex flex-col sm:flex-row gap-3">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                  <Link to="/auth">
                    <Button
                      size="lg"
                      onClick={() => trackEvent("hero_cta_click", { location: "hero" })}
                      className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-8 py-6 shadow-lg hover:shadow-[0_0_30px_rgba(56,178,172,0.3)] transition-shadow"
                    >
                      Start Free — No Credit Card <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </Link>
                </motion.div>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => scrollToSection("how-it-works")}
                  className="border-landing-surface text-landing-text hover:bg-landing-surface/50"
                >
                  See How It Works
                </Button>
              </motion.div>

              <motion.p variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} className="text-sm text-landing-text-muted flex items-center gap-2">
                <Users className="w-4 h-4 text-landing-accent" />
                3 free unlocks included. No subscription needed to browse.
              </motion.p>
            </motion.div>

            {/* Right – animated card flip */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="flex justify-center"
            >
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

      {/* ─── 3. Problem / Solution ────────────────────────── */}
      <section className="py-20 bg-landing-surface/30">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Problem */}
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="bg-landing-bg/50 border border-landing-surface rounded-xl p-8">
              <div className="flex items-center gap-2 mb-4">
                <X className="w-5 h-5 text-red-400" />
                <h3 className="text-xl font-bold">The Old Way</h3>
              </div>
              <p className="text-landing-text-muted mb-6">
                Every expired list you chase is already cold. Tax records, pre-foreclosures, driving for dollars — everyone has them.
              </p>
              <div className="space-y-3 text-sm text-landing-text-muted">
                {["Generic lists everyone has", "Data weeks or months stale", "No insight into seller motivation"].map((item, i) => (
                  <div key={i} className="flex items-center gap-2"><X className="w-3.5 h-3.5 text-red-400 shrink-0" />{item}</div>
                ))}
              </div>
            </motion.div>

            {/* Solution */}
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="bg-landing-bg/50 border border-landing-accent/30 rounded-xl p-8 ring-1 ring-landing-accent/10">
              <div className="flex items-center gap-2 mb-4">
                <Check className="w-5 h-5 text-landing-accent" />
                <h3 className="text-xl font-bold">Snap Ignite</h3>
              </div>
              <p className="text-landing-text-muted mb-6">
                Full AI insights free. No subscription needed to see what's hot. Pay only when you want the address.
              </p>
              <div className="space-y-3 text-sm text-landing-text-muted">
                {["AI brief + blurred preview — free", "Active enforcement data, updated weekly", "Pay-per-address: $0.97 per unlock"].map((item, i) => (
                  <div key={i} className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-landing-accent shrink-0" />{item}</div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 4. How It Works (3 Steps) ────────────────────── */}
      <section id="how-it-works" className="py-24">
        <div className="container mx-auto px-4">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-3xl md:text-4xl font-bold text-center mb-4">
            How It Works
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-xl text-landing-text-muted text-center mb-16">
            From browsing to closing — in three steps
          </motion.p>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: "01",
                icon: Eye,
                title: "Browse for Free",
                description: "See map & list of distressed properties. SnapScore + AI brief + blurred address — all free.",
              },
              {
                step: "02",
                icon: Zap,
                title: "Find a Hot Lead",
                description: 'AI insight: "Water cut off. 3 violations. Owner not responding. HIGH OPPORTUNITY."',
              },
              {
                step: "03",
                icon: Unlock,
                title: "Unlock the Address",
                description: "Pay $5 one-time, use a credit, or subscribe. Get full address, owner contact, and export.",
              },
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative"
              >
                {i < 2 && (
                  <div className="hidden md:block absolute top-12 right-0 w-full h-0.5 bg-gradient-to-r from-landing-accent/50 to-transparent translate-x-1/2" />
                )}
                <div className="bg-landing-surface/40 border border-landing-surface rounded-xl p-8 relative hover:-translate-y-1 transition-transform duration-300">
                  <div className="text-5xl font-bold text-landing-accent/15 absolute top-4 right-4">{s.step}</div>
                  <div className="w-12 h-12 rounded-full bg-landing-accent flex items-center justify-center text-landing-bg mb-6">
                    <s.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{s.title}</h3>
                  <p className="text-landing-text-muted">{s.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 5. Pricing ────────────────────────────────── */}
      <section id="pricing" className="py-24 bg-landing-surface/30">
        <div className="container mx-auto px-4">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-3xl md:text-4xl font-bold text-center mb-4">
            Simple, Transparent Pricing
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-xl text-landing-text-muted text-center mb-4">
            Only pay for what's actually in your market. No wasted spend.
          </motion.p>
          <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.15 }} className="text-sm text-landing-text-muted text-center mb-16">
            One deal pays for 10,000 addresses.
          </motion.p>

          {/* Pricing tiers */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto mb-8">
            {[
              {
                name: "Free",
                price: "$0",
                suffix: "/forever",
                features: ["3 unlocks + 3 exports", "Browse all properties", "AI investor briefs", "SnapScore ranking"],
                cta: "Start Free",
                highlighted: false,
                badge: undefined,
                borderClass: "",
              },
              {
                name: "Pay As You Go",
                price: "$0.97",
                suffix: "/address",
                features: ["No monthly fee", "1 unlock = 1 export", "Credits never expire", "No commitment"],
                cta: "Buy Addresses",
                highlighted: false,
                badge: "No Subscription Needed",
                borderClass: "border-2 border-[hsl(var(--landing-warning))]",
              },
              {
                name: "Starter",
                price: "$49",
                suffix: "/mo",
                features: ["150 addresses/month", "150 exports/month", "Code violation data", "Basic filters"],
                cta: "Get Starter",
                highlighted: false,
                badge: undefined,
                borderClass: "",
              },
              {
                name: "Pro",
                price: "$99",
                suffix: "/mo",
                features: ["400 addresses/month", "400 exports/month", "Pressure Level™ filters", "Priority support"],
                cta: "Get Pro",
                highlighted: true,
                badge: "Most Popular",
                savingsBadge: "Save $289 vs Pay As You Go",
                borderClass: "",
              },
              {
                name: "Elite",
                price: "$199",
                suffix: "/mo",
                features: ["1,000 addresses/month", "1,000 exports/month", "Water shutoff data", "All Pro features"],
                cta: "Get Elite",
                highlighted: false,
                badge: undefined,
                savingsBadge: "Save $771 vs Pay As You Go",
                borderClass: "",
              },
              {
                name: "Enterprise",
                price: "Custom",
                suffix: "",
                features: ["25,000+ addresses", "API access", "Dedicated account manager", "Custom contract"],
                cta: "Contact Us",
                highlighted: false,
                badge: undefined,
                borderClass: "",
                isEnterprise: true,
              },
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
                    : plan.borderClass
                      ? `bg-landing-bg/50 ${plan.borderClass}`
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
                  {(plan as any).savingsBadge && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[10px] font-semibold">
                      <Sparkles className="w-2.5 h-2.5" />
                      {(plan as any).savingsBadge}
                    </div>
                  )}
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-landing-accent shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to={(plan as any).isEnterprise ? "mailto:hello@snapignite.com" : "/auth"}>
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
                {!plan.name.includes("Free") && !plan.name.includes("Enterprise") && !plan.name.includes("Pay") && (
                  <p className="text-[10px] text-center text-landing-text-muted mt-2">1 unlock = 1 export. Always.</p>
                )}
                {plan.name === "Pay As You Go" && (
                  <p className="text-[10px] text-center text-landing-text-muted mt-2">Credits never expire. Buy exactly what you need.</p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 6. Features Grid ─────────────────────────────── */}
      <section id="features" className="py-24">
        <div className="container mx-auto px-4">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-3xl md:text-4xl font-bold text-center mb-4">
            Everything You Need to Find Deals Faster
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-xl text-landing-text-muted text-center mb-16">
            Bold benefits. Not feature fluff.
          </motion.p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {[
              { icon: Sparkles, title: "AI Investor Briefs", desc: "2-sentence plain-English analysis on every property.", highlight: true },
              { icon: Eye, title: "Blurred Address Preview", desc: "See the insight before paying. Street name, score, AI brief — free." },
              { icon: DollarSign, title: "Pay As You Go", desc: "$0.97 per address, no commitment. Only pay for what you use." },
              { icon: TrendingUp, title: "Subscriptions", desc: "150–1,000 addresses/month. Best value for regular users." },
              { icon: Search, title: "Scan Your List", desc: "Upload addresses, get AI insights + SnapScore back.", comingSoon: true },
              { icon: Bell, title: "Real-Time Notifications", desc: "Alerts when new violations hit saved properties." },
              { icon: Download, title: "CSV Export", desc: "Build targeted lists and export instantly." },
            ].map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className={`bg-landing-surface/50 border rounded-xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(56,178,172,0.15)] ${
                  (f as any).highlight ? "border-landing-accent/50 ring-2 ring-landing-accent/20" : "border-landing-surface"
                }`}
              >
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${(f as any).highlight ? "bg-landing-accent/20" : "bg-landing-accent/10"}`}>
                  <f.icon className="w-6 h-6 text-landing-accent" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold">{f.title}</h3>
                  {(f as any).comingSoon && (
                    <span className="inline-flex items-center rounded-full bg-landing-surface px-2 py-0.5 text-[10px] font-semibold text-landing-text-muted">Coming Soon</span>
                  )}
                </div>
                <p className="text-sm text-landing-text-muted">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 7. Social Proof Carousel ─────────────────────── */}
      <section className="py-24 bg-landing-surface/30">
        <div className="container mx-auto px-4">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-3xl md:text-4xl font-bold text-center mb-16">
            What Investors Are Saying
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                initials: "JM", name: "Jake M.", role: "Wholesaler, Phoenix AZ",
                quote: "The SnapScore ranking changed how I prioritize my week. I work a smaller list and get better results because every property has an active enforcement case behind it.",
                result: "3 contracts in 6 weeks",
              },
              {
                initials: "SR", name: "Sarah R.", role: "Acquisition Manager, Southeast Portfolio",
                quote: "We're seeing enforcement escalation patterns 4-6 weeks before they show up anywhere else. That timing window is where we find our edge.",
                result: "40% improvement in contact-to-contract rate",
              },
              {
                initials: "MT", name: "Marcus T.", role: "Fix & Flip Operator, Dallas-Fort Worth",
                quote: "Water shutoff data alone flagged properties in my market that had zero visibility anywhere else. That's a real intelligence advantage.",
                result: "First deal paid for 2 years of subscription",
              },
            ].map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="bg-landing-surface/50 border border-landing-surface rounded-xl p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-landing-accent/20 flex items-center justify-center text-landing-accent font-bold">{t.initials}</div>
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-sm text-landing-text-muted">{t.role}</div>
                  </div>
                </div>
                <blockquote className="text-landing-text-muted mb-4 italic">"{t.quote}"</blockquote>
                <div className="text-landing-accent font-semibold text-sm">{t.result}</div>
              </motion.div>
            ))}
          </div>

          {/* Social proof stat */}
          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center text-landing-text-muted text-sm mt-10">
            <span className="text-landing-accent font-semibold"><AnimatedCounter end={347} /></span> addresses unlocked this week
          </motion.p>
        </div>
      </section>

      {/* ─── 8. Map Preview ───────────────────────────────── */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-3xl md:text-4xl font-bold text-center mb-4">
            See Enforcement Pressure on the Map
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-xl text-landing-text-muted text-center mb-12">
            Blurred pins show approximate location. Unlock to reveal exact address.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto bg-landing-surface/40 border border-landing-surface rounded-2xl overflow-hidden relative"
          >
            {/* Simulated map */}
            <div className="aspect-[16/9] bg-gradient-to-br from-landing-primary/40 via-landing-surface/60 to-landing-bg relative">
              {/* Fake map pins */}
              {[
                { top: "25%", left: "30%", score: 92 },
                { top: "40%", left: "55%", score: 78 },
                { top: "60%", left: "35%", score: 65 },
                { top: "35%", left: "70%", score: 87 },
                { top: "55%", left: "60%", score: 71 },
                { top: "20%", left: "50%", score: 95 },
              ].map((pin, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="absolute"
                  style={{ top: pin.top, left: pin.left }}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-landing-bg border-2 border-landing-bg/50 shadow-lg cursor-pointer ${
                    pin.score >= 80 ? "bg-red-500" : pin.score >= 60 ? "bg-landing-warning" : "bg-landing-accent"
                  }`}>
                    {pin.score}
                  </div>
                  <div className="w-8 h-8 rounded-full absolute inset-0 animate-ping opacity-20 bg-landing-accent" />
                </motion.div>
              ))}

              {/* CTA overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-landing-bg/80 via-transparent to-transparent flex items-end justify-center pb-8">
                <Link to="/auth">
                  <Button
                    className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold shadow-xl"
                  >
                    <MapPin className="w-4 h-4 mr-2" /> Reveal Full Addresses — $5 or 1 Credit
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>

          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center text-landing-text-muted text-sm mt-4">
            <span className="text-landing-accent font-semibold">42</span> investors unlocked addresses today
          </motion.p>
        </div>
      </section>

      {/* ─── 9. Start Free CTA ─────────────────────────── */}
      <section id="start-free" className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-landing-accent/10 to-transparent" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-landing-accent/10 border border-landing-accent/30 text-landing-accent text-sm font-medium mb-6">
              <Unlock className="w-4 h-4" />
              Free to Browse — Pay Only for Addresses
            </motion.div>

            <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-3xl md:text-5xl font-bold mb-4">
              Start finding motivated sellers today
            </motion.h2>

            <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-lg text-landing-text-muted mb-3 max-w-2xl mx-auto">
              Browse every property free. See AI insights, SnapScores, and violation data — no credit card required.
            </motion.p>
            <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.15 }} className="text-sm text-landing-text-muted mb-10">
              3 free unlocks included. No subscription needed.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>
              <Link to="/auth">
                <Button
                  size="lg"
                  className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-10 py-6 shadow-lg hover:shadow-[0_0_30px_rgba(56,178,172,0.3)] transition-shadow"
                >
                  Start Free — No Credit Card Required <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 🔟 FAQ ───────────────────────────────────────── */}
      <section id="faq" className="py-24 bg-landing-surface/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-3xl md:text-4xl font-bold text-center mb-12">
              Frequently Asked Questions
            </motion.h2>

            <Accordion type="single" collapsible className="space-y-4">
              {[
                { q: "Do I need a subscription to use Snap?", a: "No. Browse insights free. Pay only for addresses you want to unlock." },
                { q: "How does the free tier work?", a: "AI insights, SnapScore, and blurred address previews are always free. You get 3 free unlocks to try it out. After that, pay $5 per unlock, buy a credit pack, or subscribe." },
                { q: "What happens when I unlock a property?", a: "You get the full street address, owner contact information (where available), and the ability to export or save the lead." },
                { q: "How do credits work?", a: "One-time purchase, never expire. 1 credit = 1 unlock. Buy packs of 20, 50, or 200." },
                { q: "Can I cancel anytime?", a: "Yes — all plans are month-to-month. No contracts, no cancellation fees." },
                { q: "I only do 1–2 deals/month. Should I subscribe?", a: "Not necessarily. Just buy individual unlocks at $5 each or grab a small credit pack. Subscribe when volume makes it worth it." },
              ].map((faq, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                  <AccordionItem value={`item-${i}`} className="bg-landing-bg/50 border border-landing-surface rounded-lg px-6 data-[state=open]:border-landing-accent/50">
                    <AccordionTrigger className="text-left font-semibold hover:text-landing-accent py-6">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-landing-text-muted pb-6">{faq.a}</AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────── */}
      <footer className="py-12 border-t border-landing-surface bg-landing-bg">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <span className="text-xl font-bold tracking-tight">
                <span className="text-landing-accent">SNAP</span>
                <span className="text-landing-text"> IGNITE</span>
              </span>
              <p className="text-landing-text-muted text-sm mt-4">
                The enforcement intelligence platform for serious real estate investors.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-landing-text-muted">
                <li><button onClick={() => scrollToSection("features")} className="hover:text-landing-text transition">Features</button></li>
                <li><button onClick={() => scrollToSection("pricing")} className="hover:text-landing-text transition">Pricing</button></li>
                <li><button onClick={() => scrollToSection("faq")} className="hover:text-landing-text transition">FAQ</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-landing-text-muted">
                <li><a href="/about" className="hover:text-landing-text transition">About</a></li>
                <li><a href="mailto:hello@snapignite.com" className="hover:text-landing-text transition">Contact</a></li>
                <li><a href="/blog" className="hover:text-landing-text transition">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
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
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="text-landing-text-muted hover:text-landing-text">Sign In</Button>
              </Link>
              <Link to="/auth">
                <Button size="sm" className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg">
                  Start Free
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
