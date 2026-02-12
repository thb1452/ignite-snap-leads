import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
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
  Menu
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

// Scarcity badge component
function ScarcityBadge() {
  const spotsLeft = 423; // This would come from database
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-landing-warning/20 border border-landing-warning/40 text-landing-warning animate-glow-pulse"
    >
      <Lock className="w-4 h-4" />
      <span className="text-sm font-medium">{spotsLeft} of 500 spots left</span>
    </motion.div>
  );
}

const showcaseSlides = [
  { src: "/images/screenshot-map.png", alt: "Live Enforcement Map", address: "1247 Oakridge DR NW, Atlanta", score: 87, feature: "Live Enforcement Map" },
  { src: "/images/screenshot-leads.png", alt: "Scored Lead Lists", address: "580 Montego DR SE, Grand Rapids", score: 72, feature: "Scored Lead Pipeline" },
  { src: "/images/screenshot-detail.png", alt: "Property Detail View", address: "3301 Peachtree RD NE, Atlanta", score: 94, feature: "Deep Property Intel" },
  { src: "/images/screenshot-filters.png", alt: "Pressure Level Filters", address: "Filter by enforcement pressure", score: null, feature: "Smart Pressure Filters" },
  { src: "/images/screenshot-categories.png", alt: "Violation Categories", address: "7 categories incl. water shutoffs", score: null, feature: "Violation Category Breakdown" },
];

function ShowcaseCarousel() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % showcaseSlides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const goPrev = () => setCurrent((prev) => (prev - 1 + showcaseSlides.length) % showcaseSlides.length);
  const goNext = () => setCurrent((prev) => (prev + 1) % showcaseSlides.length);
  const slide = showcaseSlides[current];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="relative group/carousel">
        {/* Arrows */}
        <button
          onClick={goPrev}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-landing-bg/70 backdrop-blur border border-landing-surface flex items-center justify-center text-landing-text-muted hover:text-landing-text hover:bg-landing-surface transition opacity-0 group-hover/carousel:opacity-100"
          aria-label="Previous slide"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button
          onClick={goNext}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-landing-bg/70 backdrop-blur border border-landing-surface flex items-center justify-center text-landing-text-muted hover:text-landing-text hover:bg-landing-surface transition opacity-0 group-hover/carousel:opacity-100"
          aria-label="Next slide"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>

        {/* Slide image */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.4 }}
          >
            <div className="rounded-2xl border border-landing-surface overflow-hidden shadow-2xl">
              <img src={slide.src} alt={slide.alt} className="w-full h-auto object-cover object-top" loading="lazy" />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Caption */}
      <div className="text-center mt-6 space-y-1">
        <p className="text-lg font-semibold text-landing-text">{slide.feature}</p>
        <p className="text-sm text-landing-text-muted">
          {slide.address}
          {slide.score !== null && (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-landing-accent/15 text-landing-accent text-xs font-bold">
              SnapScore {slide.score}
            </span>
          )}
        </p>
      </div>

      {/* Dots + slide counter */}
      <div className="flex items-center justify-center gap-3 mt-5">
        {showcaseSlides.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              i === current ? "bg-landing-accent w-7" : "bg-landing-surface hover:bg-landing-text-muted"
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
        <span className="text-xs text-landing-text-muted ml-2">{current + 1}/{showcaseSlides.length}</span>
      </div>
    </div>
  );
}

export default function Landing() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pricing = {
    starter: { monthly: 119, annual: 99 },
    professional: { monthly: 249, annual: 199 },
    enterprise: { monthly: 499, annual: 399 },
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
              See Plans
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
                  See Plans
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-landing-primary/20 via-landing-bg to-landing-bg" />
        <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-landing-accent/5 rounded-full blur-3xl" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid lg:grid-cols-5 gap-12 items-center">
            {/* Left side - Copy (60%) */}
            <div className="lg:col-span-3 space-y-8">
              <ScarcityBadge />
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-landing-accent font-semibold tracking-wide uppercase text-sm"
              >
                Enforcement Intelligence Platform
              </motion.p>
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight"
              >
                Know Which Properties Are Under Pressure—
                <span className="text-landing-accent">Before Anyone Else</span>
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-xl text-landing-text-muted max-w-2xl"
              >
                Track code violations, water shutoffs, and escalation patterns. Our SnapScore AI ranks properties by enforcement pressure severity so you act on early signals.
              </motion.p>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <Button 
                  size="lg"
                  onClick={() => scrollToSection('pricing')}
                  className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-8 py-6"
                >
                  See Available Plans
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </motion.div>
              
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-landing-text-muted text-sm flex items-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Limited to 500 operators. No credit card required to view pricing.
              </motion.p>
              
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="text-landing-text-muted text-xs"
              >
                Trusted by wholesalers, flippers, and acquisition teams nationwide
              </motion.p>
            </div>
            
            {/* Right side - Dashboard mockup (40%) */}
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="lg:col-span-2 relative"
            >
              <div className="relative rounded-2xl border border-landing-surface shadow-2xl overflow-hidden">
                <video
                  src="/demo-video.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-auto rounded-2xl"
                />
              </div>
              
              {/* Floating glow effect */}
              <div className="absolute -inset-4 bg-landing-accent/10 rounded-3xl blur-2xl -z-10 animate-pulse-soft" />
            </motion.div>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ChevronDown className="w-8 h-8 text-landing-text-muted" />
          </motion.div>
        </motion.div>
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
                description: "The current playbook: blast through more data, chase more leads, hope something sticks. It's exhausting, expensive, and everyone else is doing the same thing."
              }
            ].map((problem, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-landing-bg/50 border border-landing-surface rounded-xl p-8"
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
            className="max-w-3xl mx-auto text-center mt-16 p-8 bg-landing-primary/20 border border-landing-primary/30 rounded-xl"
          >
            <p className="text-xl text-landing-text">
              What if you could see which properties are under pressure <span className="text-landing-accent font-semibold">RIGHT NOW</span>—before everyone else notices?
            </p>
          </motion.div>
        </div>
      </section>

      {/* Platform Showcase Section */}
      <section className="py-24 bg-landing-bg">
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
          
          {/* Screenshot Carousel */}
          <ShowcaseCarousel />
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
          <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
            {[
              {
                icon: Target,
                title: "SnapScore Enforcement Intensity",
                description: "Not all violations are equal. Our system analyzes violation type, municipal priority, duration, and agency involvement to rank properties by enforcement intensity.",
                highlight: true
              },
              {
                icon: BarChart3,
                title: "The 30-Day Window",
                description: "Municipal enforcement moves fast. A code violation today becomes a lien next month. Snap Ignite tracks escalation patterns weekly so you see pressure building—not after it's resolved or sold."
              },
              {
                icon: Map,
                title: "Multiple Pressure Signals, One View",
                description: "Code violations. Water shutoffs. Accumulating fines. Compliance deadlines. We aggregate enforcement data across counties so you see the full picture of municipal pressure on any property."
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`bg-landing-surface/50 border rounded-xl p-8 ${
                  feature.highlight ? 'border-landing-accent/50 ring-2 ring-landing-accent/20' : 'border-landing-surface'
                }`}
              >
                <div className={`w-14 h-14 rounded-lg flex items-center justify-center mb-6 ${
                  feature.highlight ? 'bg-landing-accent/20' : 'bg-landing-accent/10'
                }`}>
                  <feature.icon className="w-7 h-7 text-landing-accent" />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-landing-text-muted">{feature.description}</p>
              </motion.div>
            ))}
          </div>
          
          {/* Supporting Features Pills */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto"
          >
            {[
              { icon: Filter, label: "Violation Type Filtering" },
              { icon: Download, label: "Export to CSV" },
              { icon: Building2, label: "County-Level Coverage" }
            ].map((pill, i) => (
              <div 
                key={i}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-landing-surface border border-landing-surface text-sm"
              >
                <Check className="w-4 h-4 text-landing-accent" />
                {pill.label}
              </div>
            ))}
          </motion.div>
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
                description: "Export your targeted list while the data is fresh. You're not chasing stale leads—you're acting on current enforcement signals."
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
                  "You value timing over volume—you'd rather work 50 high-pressure properties than chase 500 stale records",
                  "You're tired of competing on the same data and want an actual information advantage",
                  "You operate in markets where enforcement activity creates real opportunity",
                  "You're willing to invest in intelligence, not just data",
                  "You understand that exclusivity (our 500-user cap) protects your competitive advantage"
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
                Not the Right Fit If...
              </h3>
              <ul className="space-y-4">
                {[
                  "You're brand new to real estate and need basic education first",
                  "Your strategy is pure volume—quantity over quality",
                  "You're looking for the cheapest possible data source",
                  "You need CRM, dialer, and marketing tools in one platform",
                  "You're not comfortable with a tool that requires some learning curve"
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
            Still not sure? Our Starter plan at $119/month lets you test the intelligence advantage with 2,500 monthly exports. No annual commitment required.
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
              Simple, Transparent Pricing
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
            
            {/* Billing Toggle */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-4 p-1 bg-landing-surface rounded-lg"
            >
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-md transition ${
                  billingCycle === 'monthly' 
                    ? 'bg-landing-accent text-landing-bg' 
                    : 'text-landing-text-muted hover:text-landing-text'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-4 py-2 rounded-md transition flex items-center gap-2 ${
                  billingCycle === 'annual' 
                    ? 'bg-landing-accent text-landing-bg' 
                    : 'text-landing-text-muted hover:text-landing-text'
                }`}
              >
                Annual
                <span className="text-xs px-2 py-0.5 rounded-full bg-landing-success/20 text-landing-success">
                  Save 20%
                </span>
              </button>
            </motion.div>
          </div>
          
          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
            {[
              {
                name: "Starter",
                price: pricing.starter[billingCycle],
                description: "For market exploration & local operators",
                features: [
                  "2,500 monthly exports",
                  "All properties, all counties",
                  "Code violation data",
                  "Basic filters (location, category, search)",
                  "Weekly data refresh",
                  "Email support"
                ],
                tagline: "Built for visibility, not prioritization.",
                highlighted: false
              },
              {
                name: "Professional",
                price: pricing.professional[billingCycle],
                description: "For active acquisition & deal sourcing",
                features: [
                  "10,000 monthly exports",
                  "All Starter features",
                  "Pressure Level™ filtering (prioritize higher-enforcement properties)",
                  "Priority email support"
                ],
                tagline: "Built to identify what matters first.",
                highlighted: true,
                badge: "Most Popular"
              },
              {
                name: "Enterprise",
                price: pricing.enterprise[billingCycle],
                description: "For multi-market teams & advanced operators",
                features: [
                  "25,000 monthly exports",
                  "All Professional features",
                  "SnapScore™ filtering (multi-signal prioritization)",
                  "Water shutoff data",
                  "API access (coming soon)"
                ],
                tagline: "Built for maximum signal, urgency, and scale.",
                highlighted: false
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
                  {billingCycle === 'annual' && (
                    <p className="text-sm text-landing-text-muted">billed annually</p>
                  )}
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
                
                <Link to={`/auth?mode=signup&plan=${plan.name.toLowerCase()}`}>
                  <Button 
                    className={`w-full ${
                      plan.highlighted 
                        ? 'bg-landing-accent hover:bg-landing-accent/90 text-landing-bg' 
                        : 'bg-landing-surface hover:bg-landing-surface/80 text-landing-text border border-landing-surface'
                    }`}
                  >
                    Get Started
                  </Button>
                </Link>
              </motion.div>
            ))}
          </div>
          
          {/* Scarcity Reminder */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-landing-warning/10 border border-landing-warning/30 text-landing-warning">
              <Lock className="w-5 h-5" />
              <span className="font-medium">Limited to 500 total users to protect data advantage</span>
            </div>
          </motion.div>
          
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

      {/* Testimonials Section */}
      <section className="py-24">
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
                quote: "Found 3 deals in my first 6 weeks that I never would have seen with PropStream. The SnapScore ranking is the difference—I'm not guessing anymore, I know which owners are actually motivated.",
                result: "3 deals closed in 6 weeks"
              },
              {
                initials: "SR",
                name: "Sarah R.",
                role: "Acquisition Manager, Southeast Portfolio",
                quote: "We switched from BatchLeads and the data freshness is night and day. Seeing violation escalation patterns before they peak gives us a real timing advantage in competitive markets.",
                result: "40% improvement in contact-to-contract rate"
              },
              {
                initials: "MT",
                name: "Marcus T.",
                role: "Fix & Flip Investor, Dallas-Fort Worth",
                quote: "I was skeptical about another data tool, but the enforcement focus is different. Water shutoff data alone has surfaced properties no one else was calling on.",
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
                  question: "How is Snap Ignite different from PropStream or BatchLeads?",
                  answer: "PropStream and BatchLeads pull from the same public records everyone else uses. Snap Ignite is an enforcement intelligence platform—we specifically track code violations, water shutoffs, fines, and compliance deadlines. Our SnapScore AI ranks properties by enforcement pressure severity, not just distress indicators."
                },
                {
                  question: "Why the 500-user limit?",
                  answer: "The value of intelligence decreases when everyone has it. If 5,000 users all see the same high-pressure properties, the advantage disappears. We cap access at 500 users to protect the data advantage. Once we hit 500, we'll open a waitlist."
                },
                {
                  question: "What counties do you cover?",
                  answer: "We cover counties across the United States where we've established FOIA data pipelines. Coverage is expanding as we add more municipal sources. All users get access to all available counties."
                },
                {
                  question: "How fresh is the data?",
                  answer: "Most enforcement data appears in Snap Ignite within 7-14 days of the violation being recorded—compared to 30-90 days (or longer) with traditional data providers. We update weekly."
                },
                {
                  question: "Do you include owner contact information?",
                  answer: "Yes, we include available owner information with property records. For skip tracing beyond basic records, we recommend pairing Snap Ignite with a dedicated skip tracing service—we focus on intelligence, not trying to be an all-in-one platform."
                },
                {
                  question: "Can I cancel anytime?",
                  answer: "Monthly plans can be cancelled anytime—no long-term commitment required. Annual plans are billed upfront for the full year at a 20% discount. We don't do contracts or cancellation fees."
                },
                {
                  question: "Is there a free trial?",
                  answer: "We don't offer a free trial because our data has real value and we protect it for paying users. However, our Starter plan at $119/month is designed as a low-risk way to test the platform, and we offer a 30-day money-back guarantee if you don't see value."
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
              Ready to See Properties Before the Competition?
            </motion.h2>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-landing-text-muted mb-8"
            >
              Join operators using enforcement intelligence to surface opportunities first.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-landing-warning/10 border border-landing-warning/30 text-landing-warning mb-8"
            >
              <Lock className="w-5 h-5" />
              <span className="font-medium">423 of 500 spots remaining. Once we hit capacity, new users join the waitlist.</span>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <Button 
                size="lg"
                onClick={() => scrollToSection('pricing')}
                className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-12 py-6"
              >
                Choose Your Plan
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
              Questions? Email us at <a href="mailto:support@snapignite.com" className="text-landing-accent hover:underline">support@snapignite.com</a>
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
                Enforcement intelligence for real estate investors.
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
                <li><a href="#" className="hover:text-landing-text transition">About</a></li>
                <li><a href="mailto:support@snapignite.com" className="hover:text-landing-text transition">Contact</a></li>
                <li><a href="#" className="hover:text-landing-text transition">Blog</a></li>
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
                onClick={() => scrollToSection('pricing')}
                className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
