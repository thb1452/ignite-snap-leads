import { useState, useEffect, useRef } from "react";
import SEOHead from "@/components/SEOHead";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { TrialSignupModal } from "@/components/trial/TrialSignupModal";

import { TopPressureProperties } from "@/components/live-feed/TopPressureProperties";

import { 
  Target, 
  Clock, 
  Map, 
  Phone, 
  ArrowRight, 
  Check, 
  X, 
  ChevronDown,
  Lock,
  Users,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Filter,
  Download,
  Building2,
  Search,
  Zap,
  Menu,
  Droplets,
  Bell
} from "lucide-react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Animated counter component
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
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [isInView, end, duration]);
  
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}


export default function Landing() {
  const billingCycle = 'monthly' as const;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [selectedTrialTier, setSelectedTrialTier] = useState('starter');

  const openTrialModal = (tier: string) => {
    setSelectedTrialTier(tier);
    setTrialModalOpen(true);
  };

  const pricing = {
    starter: { monthly: 79 },
    professional: { monthly: 149 },
    enterprise: { monthly: 299 },
  };

  const scrollToSection = (id: string) => {
    // Close menu first on mobile to avoid animation interference
    setMobileMenuOpen(false);
    // Small delay to let menu close animation start before scrolling
    setTimeout(() => {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-landing-bg text-landing-text overflow-x-hidden">
      <SEOHead title="Snap Ignite | Enforcement Intelligence Platform" description="Snap Ignite tracks municipal enforcement signals — code violations, water shutoffs, and escalating fines — across 3,800+ cities nationwide, updated monthly." canonical="https://snapignite.com/" />
      {/* Navigation */}
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
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollToSection('features')} className="text-landing-text-muted hover:text-landing-text transition">
              Features
            </button>
            <button onClick={() => scrollToSection('how-it-works')} className="text-landing-text-muted hover:text-landing-text transition">
              How It Works
            </button>
            <button onClick={() => scrollToSection('pricing')} className="text-landing-text-muted hover:text-landing-text transition">
              Pricing
            </button>
            <button onClick={() => scrollToSection('faq')} className="text-landing-text-muted hover:text-landing-text transition">
              FAQ
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {/* Mobile menu button */}
            <Button 
              variant="ghost" 
              size="icon"
              className="md:hidden text-landing-text-muted hover:text-landing-text"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            
            <Link to="/auth?mode=signin">
              <Button variant="ghost" className="text-landing-text-muted hover:text-landing-text hover:bg-landing-surface/50">
                Sign In
              </Button>
            </Link>
            <Button 
              onClick={() => scrollToSection('pricing')}
              className="hidden sm:flex bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
        
        {/* Mobile Navigation Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-landing-surface/50 bg-landing-bg/95 backdrop-blur-xl"
            >
              <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
                <button 
                  onClick={() => scrollToSection('features')} 
                  className="text-left py-3 text-landing-text-muted hover:text-landing-text transition border-b border-landing-surface/30"
                >
                  Features
                </button>
                <button 
                  onClick={() => scrollToSection('how-it-works')} 
                  className="text-left py-3 text-landing-text-muted hover:text-landing-text transition border-b border-landing-surface/30"
                >
                  How It Works
                </button>
                <button 
                  onClick={() => scrollToSection('pricing')} 
                  className="text-left py-3 text-landing-text-muted hover:text-landing-text transition border-b border-landing-surface/30"
                >
                  Pricing
                </button>
                <button 
                  onClick={() => scrollToSection('faq')} 
                  className="text-left py-3 text-landing-text-muted hover:text-landing-text transition"
                >
                  FAQ
                </button>
                <Button 
                  onClick={() => scrollToSection('pricing')}
                  className="mt-2 w-full bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold"
                >
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-28 pb-24 overflow-hidden">
        {/* Animated dot grid background */}
        <div 
          className="absolute inset-0 animate-dot-grid opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(56,178,172,0.3) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-landing-primary/20 via-landing-bg/80 to-landing-bg" />
        
        <div className="container mx-auto px-4 relative z-10 max-w-3xl">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="space-y-8"
          >
            {/* Label */}
            <motion.p
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="text-landing-accent font-semibold tracking-widest text-sm uppercase"
            >
              Enforcement Intelligence Platform
            </motion.p>

            {/* Headline */}
            <motion.h1 
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight"
            >
              See Enforcement Pressure Before It Becomes{' '}
              <span className="text-landing-accent">Public Knowledge</span>
            </motion.h1>
            
            {/* Subtext */}
            <motion.p
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="text-lg md:text-xl text-landing-text-muted max-w-2xl"
            >
              Snap Ignite tracks municipal pressure signals most platforms completely miss — code violations, escalating fines, water shutoffs, and enforcement escalations. We don't just show you violations. We show you pressure patterns.
            </motion.p>

            {/* Positioning blockquote */}
            <motion.blockquote
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="border-l-2 border-landing-accent/40 pl-5 text-landing-text-muted text-base md:text-lg max-w-2xl"
            >
              Snap Ignite is a municipal enforcement intelligence platform. Not a leads tool. Not a list service. An intelligence layer that shows you where enforcement pressure is building — before it resolves or hits the market.
            </motion.blockquote>
            
            {/* CTA */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="flex flex-col items-start gap-4"
            >
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} className="w-full sm:w-auto">
                <Button 
                  size="lg"
                  onClick={() => {
                    trackEvent('hero_cta_click', { location: 'hero' });
                    scrollToSection('pricing');
                  }}
                  className="w-full sm:w-auto bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-8 py-6 shadow-lg hover:shadow-[0_0_30px_rgba(56,178,172,0.3)] transition-shadow"
                >
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </motion.div>
              
              <p className="text-landing-text-muted text-sm">
                3 day free trial · 500 property exports · Then $79/month · Cancel anytime
              </p>
            </motion.div>

            {/* Demo Video */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8 } } }}
              className="relative mt-4"
            >
              <div className="relative rounded-2xl border border-landing-surface shadow-2xl overflow-hidden">
                <video
                  src="/demo-video.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  aria-label="Snap Ignite platform demo showing enforcement intelligence dashboard with violation tracking and SnapScore rankings"
                  className="w-full h-auto rounded-2xl"
                />
              </div>
              <div className="absolute -inset-4 bg-landing-accent/10 rounded-3xl blur-2xl -z-10 animate-pulse-soft" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Live Stats Bar */}
      <section className="py-6 bg-landing-surface/20 backdrop-blur-xl border-y border-landing-accent/20 animate-gradient-border">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {[
              { end: 500000, label: 'Properties Tracked', suffix: '+' },
              { end: 3800, label: 'Cities Covered', suffix: '+' },
              { end: 488636, label: 'Violations Monitored', suffix: '+' },
            ].map((stat) => (
              <div key={stat.label} className="text-center py-3">
                <div className="text-2xl md:text-4xl font-bold text-landing-text tabular-nums">
                  <AnimatedCounter end={stat.end} suffix={stat.suffix} />
                </div>
                <div className="text-xs md:text-sm text-landing-text-muted mt-1">{stat.label}</div>
              </div>
            ))}
            <div className="text-center py-3">
              <div className="text-2xl md:text-4xl font-bold text-landing-text">
                Monthly
              </div>
              <div className="text-xs md:text-sm text-landing-text-muted mt-1">Updated Monthly</div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Agitation Section */}
      <section className="py-24 bg-landing-surface/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              The Problem With Traditional Property Data
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-landing-text-muted"
            >
              Everyone's working the same stale data. Here's what you're missing:
            </motion.p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                icon: Users,
                title: "Same Data, Same Competition",
                description: "By the time a property shows up in traditional databases, everyone's already seen it. You're not finding opportunities—you're competing for leftovers."
              },
              {
                icon: Clock,
                title: "Timing Blindness",
                description: "Traditional filters show you distress signals from months ago. The property under pressure last month? Already sold. The one facing escalation now? Invisible to your current tools."
              },
              {
                icon: Phone,
                title: "Volume Over Intelligence",
                description: "The current playbook: blast through more data, chase more records, hope something sticks. It's exhausting, expensive, and everyone else is doing the same thing."
              }
            ].map((problem, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-landing-bg/50 border border-landing-surface rounded-xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(56,178,172,0.15)]"
              >
                <div className="w-14 h-14 rounded-lg bg-red-500/10 flex items-center justify-center mb-6">
                  <problem.icon className="w-7 h-7 text-red-400" />
                </div>
                <h3 className="text-xl font-bold mb-3">{problem.title}</h3>
                <p className="text-landing-text-muted">{problem.description}</p>
              </motion.div>
            ))}
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center mt-16 p-8 bg-landing-primary/20 border border-landing-accent/30 rounded-xl animate-gradient-border"
          >
            <p className="text-xl text-landing-text">
              What if you could see which properties are under pressure <span className="text-landing-accent font-semibold">RIGHT NOW</span>—before everyone else notices?
            </p>
          </motion.div>
        </div>
      </section>

      {/* Platform Showcase Section */}
      <section className="pt-24 pb-12 bg-landing-bg">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              See the Platform in Action
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-landing-text-muted"
            >
              Real enforcement data, real-time intelligence, real results.
            </motion.p>
          </div>
          
          {/* Platform Videos */}
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <p className="text-center mb-3 text-sm font-medium text-landing-text-muted">
                Instant intelligence on every property
              </p>
              <div className="rounded-2xl border border-landing-surface shadow-2xl overflow-hidden">
                <video
                  src="/videos/platform-intel.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="none"
                  className="w-full h-auto"
                />
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
            >
              <p className="text-center mb-3 text-sm font-medium text-landing-text-muted">
                See enforcement pressure mapped in real time
              </p>
              <div className="rounded-2xl border border-landing-surface shadow-2xl overflow-hidden">
                <video
                  src="/videos/platform-map.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="none"
                  className="w-full h-auto"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section id="features" className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              Enforcement Intelligence That Surfaces Opportunity <span className="text-landing-accent">First</span>
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-landing-text-muted"
            >
              Snap Ignite tracks municipal pressure signals most platforms completely miss—code violations, escalating fines, water shutoffs, and compliance deadlines. We don't just show you violations. We show you pressure patterns.
            </motion.p>
          </div>
          
          {/* Core Features */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: Map,
                title: "3,800+ Cities",
                description: "Nationwide coverage from small towns to major metros.",
                highlight: false
              },
              {
                icon: Target,
                title: "SnapScore AI",
                description: "Ranks every property by enforcement intensity — violation type, duration, and escalation.",
                highlight: true
              },
              {
                icon: Droplets,
                title: "Water Shutoff Tracking",
                description: "See hidden pressure signals unavailable anywhere else. Available in Elite tier.",
                highlight: false
              },
              {
                icon: Clock,
                title: "Updated Monthly",
                description: "Fresh enforcement data every 30 days — not stale records from last quarter.",
                highlight: false
              },
              {
                icon: Filter,
                title: "Violation Type Filtering",
                description: "Filter by open, vacancy, exterior, structural, and more.",
                highlight: false
              },
              {
                icon: Download,
                title: "Export to CSV",
                description: "Build targeted lists and export instantly for your workflow.",
                highlight: false
              },
              {
                icon: Bell,
                title: "Real-time Alerts",
                description: "Get notified when enforcement pressure escalates on properties you track.",
                highlight: false
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className={`bg-landing-surface/50 border rounded-xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(56,178,172,0.15)] ${
                  feature.highlight ? 'border-landing-accent/50 ring-2 ring-landing-accent/20' : 'border-landing-surface'
                }`}
              >
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
                  feature.highlight ? 'bg-landing-accent/20' : 'bg-landing-accent/10'
                }`}>
                  <feature.icon className="w-6 h-6 text-landing-accent" />
                </div>
                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                <p className="text-sm text-landing-text-muted">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 bg-landing-surface/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              From Intelligence to Action in <span className="text-landing-accent">Minutes</span>
            </motion.h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: "01",
                title: "Filter by Your Criteria",
                description: "Select your target counties, violation types, and date range. Build lists based on the specific pressure signals in your market."
              },
              {
                step: "02",
                title: "Identify High-Priority Properties",
                description: "SnapScore AI ranks every property by enforcement pressure. Focus on the properties under pressure NOW—not the ones flagged six months ago."
              },
              {
                step: "03",
                title: "Act Before Competition",
                description: "Export your targeted list while the data is fresh. You're not chasing stale records—you're acting on current enforcement signals."
              }
            ].map((step, i) => (
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
                <div className="bg-landing-bg/50 border border-landing-surface rounded-xl p-8 relative">
                  <div className="text-5xl font-bold text-landing-accent/20 absolute top-4 right-4">
                    {step.step}
                  </div>
                  <div className="w-12 h-12 rounded-full bg-landing-accent flex items-center justify-center text-landing-bg font-bold text-xl mb-6">
                    {step.step}
                  </div>
                  <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                  <p className="text-landing-text-muted">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              Snap Ignite Isn't For Everyone
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-landing-text-muted"
            >
              We built this for serious operators who understand that better intelligence beats higher volume. Here's how to know if it's right for you:
            </motion.p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Built For You */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-landing-accent/10 border border-landing-accent/30 rounded-xl p-8"
            >
              <h3 className="text-2xl font-bold mb-6 text-landing-accent flex items-center gap-2">
                <Check className="w-6 h-6" />
                Built For You If...
              </h3>
              <ul className="space-y-4">
                {[
                  "You already use BatchData, similar tools, or work directly with county data and want better targeting",
                  "You value timing over volume — you'd rather work 50 high-pressure properties than chase 500 stale records",
                  "You're tired of competing on the same data and want an actual information advantage",
                  "You operate in markets where enforcement activity creates early visibility into property pressure",
                  "You're willing to invest in intelligence, not just data",
                  "You understand that better signal — not more volume — is the real edge"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-landing-accent flex-shrink-0 mt-0.5" />
                    <span className="text-landing-text">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Not For You */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-red-500/10 border border-red-500/30 rounded-xl p-8"
            >
              <h3 className="text-2xl font-bold mb-6 text-red-400 flex items-center gap-2">
                <X className="w-6 h-6" />
                Not For You If...
              </h3>
              <ul className="space-y-4">
                {[
                  "You're happy competing for the same stale records as everyone else",
                  "You prefer volume over signal",
                  "You don't believe enforcement data creates early visibility",
                  "You're not willing to invest in intelligence, just data",
                  "You're looking for a free list service"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <span className="text-landing-text-muted">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center text-landing-text-muted mt-12 max-w-2xl mx-auto"
          >
            Still not sure? Our Starter plan at $79/month gives you enforcement intelligence without the noise. Cancel anytime.
          </motion.p>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-landing-surface/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              Add Enforcement Intelligence to Your Stack
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-landing-text-muted mb-8"
            >
              No hidden fees. No per-record charges. No surprises.
            </motion.p>
            
          </div>
          
          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
            {[
              {
                name: "Starter",
                price: pricing.starter[billingCycle],
                description: "Built for operators who want enforcement intelligence without the noise.",
                features: [
                  "5,000 monthly enforcement reports",
                  "3,800+ cities nationwide",
                  "Code violation data",
                  "Basic filters (location, category, search)",
                  "Monthly data refresh",
                  "Email support"
                ],
                tagline: "Enforcement intelligence without the noise.",
                highlighted: false,
                badge: undefined
              },
              {
                name: "Pro",
                price: pricing.professional[billingCycle],
                description: "For serious operators stacking enforcement data",
                features: [
                  "15,000 monthly enforcement reports",
                  "All Starter features",
                  "Pressure Level filtering (prioritize higher-enforcement properties)",
                  "Priority email support"
                ],
                tagline: "Built to identify what matters first.",
                highlighted: true,
                badge: "Most Popular"
              },
              {
                name: "Elite",
                price: pricing.enterprise[billingCycle],
                description: "For teams running enforcement-first strategies.",
                features: [
                  "25,000 monthly enforcement reports",
                  "All Pro features",
                  "Water shutoff data",
                ],
                tagline: "Built for maximum signal, urgency, and scale.",
                highlighted: false,
                isElite: true
              }
            ].map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative rounded-xl p-8 ${
                  plan.highlighted 
                    ? 'bg-landing-bg border-2 border-landing-accent shadow-lg shadow-landing-accent/20 scale-105' 
                    : 'bg-landing-bg/50 border border-landing-surface'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-landing-accent text-landing-bg text-sm font-semibold rounded-full">
                    {plan.badge}
                  </div>
                )}
                
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                  <div className="mb-2">
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-landing-text-muted">/month</span>
                  </div>
                  <p className="text-landing-text-muted mt-2">{plan.description}</p>
                  {plan.tagline && (
                    <p className="text-xs text-landing-accent mt-2 font-medium italic">{plan.tagline}</p>
                  )}
                </div>
                
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-landing-accent flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button
                  onClick={() => openTrialModal(plan.name.toLowerCase() === 'pro' ? 'professional' : plan.name.toLowerCase())}
                  className={`w-full ${
                    plan.highlighted 
                      ? 'bg-landing-accent hover:bg-landing-accent/90 text-landing-bg' 
                      : 'bg-landing-surface hover:bg-landing-surface/80 text-landing-text border border-landing-surface'
                  }`}
                >
                  Start 3-Day Free Trial
                </Button>
                <p className="text-xs text-center text-landing-text-muted mt-2">
                  Then ${plan.price}/month • Cancel anytime
                </p>
              </motion.div>
            ))}
          </div>
          
          {/* Money-Back Guarantee */}
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center text-landing-text-muted mt-8"
          >
            Not seeing value in the first 30 days? We'll refund your first month, no questions asked.
          </motion.p>
        </div>
      </section>

      {/* PropStream vs Snap Comparison Table */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-center mb-12"
            >
              What Traditional Data Platforms Give You vs. What Snap Gives You
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="overflow-hidden rounded-xl border border-landing-surface"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-landing-surface/50">
                    <th className="text-left py-4 px-6 font-semibold">Data Type</th>
                    <th className="text-center py-4 px-4 font-semibold">Traditional Data Platforms</th>
                    <th className="text-center py-4 px-4 font-semibold text-landing-accent">Snap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-landing-surface/50">
                  {[
                    { type: "Property records (160M+)", ps: true, snap: "partial", snapNote: "Use your existing platform" },
                    { type: "Ownership & equity data", ps: true, snap: "ref", snapNote: "Use your existing platform" },
                    { type: "Comparable sales", ps: true, snap: "ref", snapNote: "Use your existing platform" },
                    { type: "Code violations (systematic)", ps: "limited", snap: true, snapNote: "3,800+ cities" },
                    { type: "Enforcement pressure scoring", ps: false, snap: true, snapNote: "SnapScore AI" },
                    { type: "Water shutoff tracking", ps: false, snap: true, snapNote: "Elite tier" },
                    
                    { type: "Real-time escalation alerts", ps: false, snap: true, snapNote: "" },
                    { type: "Monthly data refresh", ps: false, snap: true, snapNote: "" },
                  ].map((row, i) => (
                    <tr key={i} className="bg-landing-bg/30">
                      <td className="py-3 px-6">{row.type}</td>
                      <td className="py-3 px-4 text-center">
                        {row.ps === true ? (
                          <Check className="w-5 h-5 text-green-400 mx-auto" />
                        ) : row.ps === "limited" ? (
                          <span className="text-yellow-400 text-xs">Limited</span>
                        ) : (
                          <X className="w-5 h-5 text-red-400/50 mx-auto" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.snap === true ? (
                          <div className="flex items-center justify-center gap-1">
                            <Check className="w-5 h-5 text-landing-accent" />
                            {row.snapNote && <span className="text-xs text-landing-text-muted">{row.snapNote}</span>}
                          </div>
                        ) : row.snap === "partial" || row.snap === "ref" ? (
                          <span className="text-xs text-landing-text-muted">{row.snapNote}</span>
                        ) : (
                          <X className="w-5 h-5 text-red-400/50 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center text-landing-text-muted mt-8 text-lg italic"
            >
              Use them together. Your existing platform shows you the market. Snap shows you where enforcement pressure is building.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Data Credibility Section */}
      <section className="py-16 bg-landing-bg">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center p-10 bg-landing-surface/40 border border-landing-surface rounded-xl"
          >
            <p className="text-2xl font-semibold text-landing-text mb-3">Sourced directly from municipal agencies and county jurisdictions.</p>
            <p className="text-lg text-landing-text-muted">Not scraped. Not aggregated. Primary source data.</p>
          </motion.div>
        </div>
      </section>

      {/* Live Enforcement Activity Section */}
      <section className="py-24 bg-landing-bg">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex items-center justify-center gap-3 mb-4"
            >
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <h2 className="text-3xl md:text-4xl font-bold">Live Enforcement Activity</h2>
            </motion.div>
            <p className="text-lg text-landing-text-muted">Watch enforcement actions as they're tracked across the platform.</p>
          </div>

          <div className="max-w-5xl mx-auto space-y-8">
            {/* Top Pressure Properties */}
            <TopPressureProperties />
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 bg-landing-surface/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              What Operators Are Saying
            </motion.h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-12">
            {[
              {
                initials: "JM",
                name: "Jake M.",
                role: "Wholesaler, Phoenix AZ",
                quote: "The SnapScore ranking changed how I prioritize my week. I'm not guessing which properties have real pressure anymore — I can see the enforcement intensity before I make a single call. I work a smaller list now and get better results because every property I'm looking at has an active enforcement case behind it.",
                result: "3 contracts in 6 weeks"
              },
              {
                initials: "SR",
                name: "Sarah R.",
                role: "Acquisition Manager, Southeast Portfolio",
                quote: "The data freshness is what sold me. We're seeing enforcement escalation patterns 4-6 weeks before they show up anywhere else. That timing window is where we find our edge — by the time a property appears in traditional databases, the pressure has usually already resolved.",
                result: "40% improvement in contact-to-contract rate"
              },
              {
                initials: "MT",
                name: "Marcus T.",
                role: "Fix & Flip Operator, Dallas-Fort Worth",
                quote: "I was skeptical because I've tried a lot of data tools. What's different here is the enforcement focus — it's not just violation counts, it's pressure patterns. Water shutoff data alone flagged properties in my market that had zero visibility anywhere else. That's a real intelligence advantage.",
                result: "First deal paid for 2 years of subscription"
              }
            ].map((testimonial, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-landing-surface/50 border border-landing-surface rounded-xl p-8"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-landing-accent/20 flex items-center justify-center text-landing-accent font-bold">
                    {testimonial.initials}
                  </div>
                  <div>
                    <div className="font-semibold">{testimonial.name}</div>
                    <div className="text-sm text-landing-text-muted">{testimonial.role}</div>
                  </div>
                </div>
                <blockquote className="text-landing-text-muted mb-4 italic">
                  "{testimonial.quote}"
                </blockquote>
                <div className="text-landing-accent font-semibold text-sm">
                  {testimonial.result}
                </div>
              </motion.div>
            ))}
          </div>
          
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 bg-landing-surface/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-center mb-12"
            >
              Frequently Asked Questions
            </motion.h2>
            
            <Accordion type="single" collapsible className="space-y-4">
              {[
                {
                  question: "Do I need PropStream to use Snap Ignite?",
                  answer: "No. Snap Ignite is a standalone enforcement intelligence platform. Many users also use PropStream or BatchLeads for ownership and equity data, and Snap fits naturally into that workflow — but it is not required."
                },
                {
                  question: "What cities do you cover?",
                  answer: "We cover 3,800+ cities across the United States where we've established FOIA data pipelines. Coverage is expanding as we add more municipal sources. All users get access to all available cities."
                },
                {
                  question: "How fresh is the data?",
                  answer: "Enforcement records appear in Snap Ignite as municipal sources update. Most jurisdictions refresh monthly, ensuring you're working with current enforcement signals — not the stale, outdated lists traditional providers deliver 30–90 days late."
                },
                {
                  question: "Do you include owner contact information?",
                  answer: "Snap Ignite focuses on enforcement intelligence, not contact data. Basic ownership records are available where public. For skip tracing, we recommend pairing Snap with a dedicated service — we build the signal layer, not the outreach layer."
                },
                {
                  question: "Can I cancel anytime?",
                  answer: "Yes — all plans are month-to-month and can be cancelled anytime. No contracts, no cancellation fees."
                },
                {
                  question: "Is there a free trial?",
                  answer: "Yes! Start a 3-day free trial — $0 due today. Enter your payment method at checkout and get 500 property exports to test data quality in your markets. Search unlimited properties, save favorites, and access all features for your selected tier. After 3 days your subscription begins automatically, or cancel anytime before then."
                }
              ].map((faq, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <AccordionItem 
                    value={`item-${i}`} 
                    className="bg-landing-bg/50 border border-landing-surface rounded-lg px-6 data-[state=open]:border-landing-accent/50"
                  >
                    <AccordionTrigger className="text-left font-semibold hover:text-landing-accent py-6">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-landing-text-muted pb-6">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-landing-accent/10 to-transparent" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-5xl font-bold mb-6"
            >
              See Enforcement Pressure Before It Becomes Public Knowledge
            </motion.h2>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-landing-text-muted mb-8"
            >
              500,000+ properties. 3,800+ cities. Updated monthly. Most of your competition is still waiting for listings.
            </motion.p>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <Button 
                size="lg"
                onClick={() => openTrialModal('starter')}
                className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-12 py-6"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>
            
            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="text-landing-text-muted mt-6"
            >
              Questions? Email us at <a href="mailto:hello@snapignite.com" className="text-landing-accent hover:underline">hello@snapignite.com</a>
            </motion.p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-landing-surface bg-landing-bg">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <span className="text-xl font-bold tracking-tight">
                <span className="text-landing-accent">SNAP</span>
                <span className="text-landing-text"> IGNITE</span>
              </span>
              <p className="text-landing-text-muted text-sm mt-4">
                The enforcement data layer serious operators use before the market catches up.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-landing-text-muted">
                <li><button onClick={() => scrollToSection('features')} className="hover:text-landing-text transition">Features</button></li>
                <li><button onClick={() => scrollToSection('pricing')} className="hover:text-landing-text transition">Pricing</button></li>
                <li><button onClick={() => scrollToSection('faq')} className="hover:text-landing-text transition">FAQ</button></li>
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
            <p className="text-landing-text-muted text-sm">
              © 2026 Snap Ignite. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="text-landing-text-muted hover:text-landing-text">
                  Sign In
                </Button>
              </Link>
              <Button 
                size="sm"
                onClick={() => openTrialModal('starter')}
                className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg"
              >
                Start Free Trial
              </Button>
            </div>
          </div>
        </div>
      </footer>

      {/* Trial Signup Modal */}
      <TrialSignupModal
        open={trialModalOpen}
        onOpenChange={setTrialModalOpen}
        selectedTier={selectedTrialTier}
      />
    </div>
  );
}
