import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Menu,
  Play,
  Star,
  Shield,
  RefreshCw
} from "lucide-react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Animated counter component
function AnimatedCounter({ end, suffix = "", prefix = "", duration = 2000 }: { end: number; suffix?: string; prefix?: string; duration?: number }) {
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
  
  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

// Scarcity badge component
function ScarcityBadge({ variant = "default" }: { variant?: "default" | "compact" }) {
  const spotsLeft = 423;
  
  if (variant === "compact") {
    return (
      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30">
        <Lock className="w-3 h-3 mr-1" />
        {spotsLeft} of 500 spots remaining
      </Badge>
    );
  }
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400"
    >
      <Lock className="w-4 h-4" />
      <span className="text-sm font-medium">{spotsLeft} of 500 spots remaining</span>
    </motion.div>
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
    setMobileMenuOpen(false);
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
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-landing-bg/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight">
              <span className="text-landing-accent">SNAP</span>
              <span className="text-landing-text"> IGNITE</span>
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
            <Button 
              variant="ghost" 
              size="icon"
              className="md:hidden text-landing-text-muted hover:text-landing-text"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            
            <Link to="/auth?mode=signin">
              <Button variant="ghost" className="text-landing-text-muted hover:text-landing-text hover:bg-white/5">
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
              className="md:hidden border-t border-white/5 bg-landing-bg/95 backdrop-blur-xl"
            >
              <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
                <button onClick={() => scrollToSection('features')} className="text-left py-3 text-landing-text-muted hover:text-landing-text transition border-b border-white/5">Features</button>
                <button onClick={() => scrollToSection('how-it-works')} className="text-left py-3 text-landing-text-muted hover:text-landing-text transition border-b border-white/5">How It Works</button>
                <button onClick={() => scrollToSection('pricing')} className="text-left py-3 text-landing-text-muted hover:text-landing-text transition border-b border-white/5">Pricing</button>
                <button onClick={() => scrollToSection('faq')} className="text-left py-3 text-landing-text-muted hover:text-landing-text transition">FAQ</button>
                <Button onClick={() => scrollToSection('pricing')} className="mt-2 w-full bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold">
                  See Plans <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ============ HERO SECTION - REDESIGNED ============ */}
      <section className="relative min-h-screen pt-24 pb-20 flex items-center overflow-hidden">
        {/* Hero gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-sky-950/50 via-landing-bg to-landing-bg" />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-landing-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-900/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Headline + CTA */}
            <div className="space-y-6">
              <ScarcityBadge />
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight"
              >
                Find Motivated Sellers{" "}
                <span className="text-landing-accent">Before</span>{" "}
                Your Competition Does
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-xl text-landing-text-muted max-w-xl leading-relaxed"
              >
                Snap Ignite tracks municipal pressure signals—code violations, 
                water shutoffs, escalating fines—to show you which property owners 
                are ready to sell <span className="text-landing-text font-medium">NOW</span>.
              </motion.p>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <Button 
                  size="lg"
                  onClick={() => scrollToSection('pricing')}
                  className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-8 py-6 h-auto"
                >
                  See Available Plans
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <Button 
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-white/5 hover:bg-white/10 text-landing-text font-semibold text-lg px-8 py-6 h-auto"
                >
                  <Play className="w-5 h-5 mr-2 fill-current" />
                  Watch 2-min Demo
                </Button>
              </motion.div>
              
              {/* Trust signals */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex flex-wrap gap-6 text-sm text-landing-text-muted pt-4"
              >
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-landing-success" />
                  No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-landing-success" />
                  14-day free trial
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-landing-success" />
                  Cancel anytime
                </div>
              </motion.div>
            </div>
            
            {/* Right: Dashboard Preview with Stats Overlay */}
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="relative"
            >
              {/* Dashboard mockup */}
              <div className="relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-white/10 shadow-2xl overflow-hidden backdrop-blur-xl">
                {/* Window controls */}
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <div className="text-xs text-landing-text-muted">Intelligence Dashboard</div>
                </div>
                
                <div className="p-5 space-y-4">
                  {/* Mock map area */}
                  <div className="bg-slate-900/50 rounded-xl h-44 relative overflow-hidden border border-white/5">
                    {/* Grid lines */}
                    <div className="absolute inset-0 opacity-10">
                      <div className="absolute inset-0" style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)',
                        backgroundSize: '40px 40px'
                      }} />
                    </div>
                    {/* Animated pins */}
                    {[...Array(15)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.8 + i * 0.08, type: "spring", stiffness: 200 }}
                        className="absolute"
                        style={{
                          left: `${15 + Math.random() * 70}%`,
                          top: `${15 + Math.random() * 70}%`,
                        }}
                      >
                        <div className="w-3 h-3 rounded-full bg-landing-accent shadow-lg shadow-landing-accent/50 animate-pulse" />
                      </motion.div>
                    ))}
                    <div className="absolute bottom-3 left-3 text-xs text-landing-text-muted bg-slate-900/70 px-2 py-1 rounded">
                      Live enforcement data
                    </div>
                  </div>
                  
                  {/* Mock property rows */}
                  <div className="space-y-2">
                    {[
                      { address: "1247 Oak St", score: 87, type: "Code Violation", color: "text-red-400" },
                      { address: "892 Pine Ave", score: 72, type: "Water Shutoff", color: "text-orange-400" },
                      { address: "3456 Elm Rd", score: 65, type: "Multiple Violations", color: "text-amber-400" },
                    ].map((property, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.2 + i * 0.15 }}
                        className="bg-slate-800/50 rounded-lg px-4 py-3 flex items-center justify-between border border-white/5 hover:border-white/10 transition-colors"
                      >
                        <div>
                          <div className="text-sm font-medium text-landing-text">{property.address}</div>
                          <div className="text-xs text-landing-text-muted">{property.type}</div>
                        </div>
                        <div className={`text-xl font-bold ${property.color}`}>
                          {property.score}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Floating stats overlay */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="absolute -bottom-6 -left-6 right-6 bg-gradient-to-r from-landing-surface to-slate-800 rounded-xl p-4 border border-white/10 shadow-xl"
              >
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-landing-accent">270K+</div>
                    <div className="text-xs text-landing-text-muted">Properties</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-landing-accent">900+</div>
                    <div className="text-xs text-landing-text-muted">Counties</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-landing-accent">16K+</div>
                    <div className="text-xs text-landing-text-muted">Weekly Updates</div>
                  </div>
                </div>
              </motion.div>
              
              {/* Glow effect */}
              <div className="absolute -inset-4 bg-landing-accent/10 rounded-3xl blur-3xl -z-10" />
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
          <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
            <ChevronDown className="w-8 h-8 text-landing-text-muted/50" />
          </motion.div>
        </motion.div>
      </section>

      {/* ============ SOCIAL PROOF SECTION - REDESIGNED ============ */}
      <section className="py-20 bg-slate-900/50">
        <div className="container mx-auto px-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Trusted by <span className="text-landing-accent">87 Operators</span> Nationwide
            </h2>
          </motion.div>
          
          {/* Testimonial Cards with Metrics */}
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-16">
            {[
              {
                initials: "JM",
                name: "Jake M.",
                role: "Wholesaler, Phoenix AZ",
                quote: "Found 3 deals in my first 6 weeks that I never would have seen with PropStream. The SnapScore ranking is the difference—I'm not guessing anymore, I know which owners are actually motivated.",
                metric: "3 deals",
                metricLabel: "closed in 6 weeks",
                color: "bg-emerald-500/10 text-emerald-400"
              },
              {
                initials: "SR",
                name: "Sarah R.",
                role: "Acquisition Manager, Southeast Portfolio",
                quote: "We switched from BatchLeads and the data freshness is night and day. Seeing violation escalation patterns before they peak gives us a real timing advantage in competitive markets.",
                metric: "40%",
                metricLabel: "improvement in contact-to-contract rate",
                color: "bg-blue-500/10 text-blue-400"
              },
              {
                initials: "MT",
                name: "Marcus T.",
                role: "Fix & Flip Investor, Dallas-Fort Worth",
                quote: "I was skeptical about another data tool, but the enforcement focus is different. Water shutoff data alone has surfaced properties no one else was calling on.",
                metric: "1 deal",
                metricLabel: "paid for 2 years of subscription",
                color: "bg-purple-500/10 text-purple-400"
              }
            ].map((testimonial, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                {/* Author */}
                <div className="flex items-center gap-3 mb-5">
                  <Avatar className="h-12 w-12 bg-landing-accent/20 border border-landing-accent/30">
                    <AvatarFallback className="text-landing-accent font-semibold">
                      {testimonial.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold text-landing-text">{testimonial.name}</div>
                    <div className="text-sm text-landing-text-muted">{testimonial.role}</div>
                  </div>
                </div>
                
                {/* Quote */}
                <blockquote className="text-landing-text-muted mb-5 leading-relaxed text-sm italic">
                  "{testimonial.quote}"
                </blockquote>
                
                {/* Metric Highlight */}
                <div className={`p-4 rounded-xl ${testimonial.color.split(' ')[0]}`}>
                  <div className={`text-2xl font-bold ${testimonial.color.split(' ')[1]}`}>
                    {testimonial.metric}
                  </div>
                  <div className="text-sm text-landing-text-muted">{testimonial.metricLabel}</div>
                </div>
              </motion.div>
            ))}
          </div>
          
          {/* Social proof stats bar */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-wrap justify-center gap-8 md:gap-16 py-8 px-6 bg-slate-800/50 rounded-2xl border border-white/5 max-w-4xl mx-auto"
          >
            <div className="text-center">
              <div className="text-4xl font-bold text-landing-accent">
                <AnimatedCounter end={87} />
              </div>
              <div className="text-landing-text-muted text-sm mt-1">Active Users</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-landing-accent">
                <AnimatedCounter end={2.4} suffix="M+" prefix="$" />
              </div>
              <div className="text-landing-text-muted text-sm mt-1">in Deals Closed</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-landing-accent">4.8/5</div>
              <div className="text-landing-text-muted text-sm mt-1">User Rating</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-landing-accent">99%</div>
              <div className="text-landing-text-muted text-sm mt-1">Data Freshness</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ============ PROBLEM SECTION ============ */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              The Problem With "Motivated Seller" Lists
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-landing-text-muted"
            >
              Everyone's working the same stale data. Here's what that costs you:
            </motion.p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: Users,
                title: "Same Lists, Same Competition",
                description: "By the time a property hits your lead list, it's already been called 47 times. You're not finding deals—you're racing against everyone else who bought the same data."
              },
              {
                icon: Clock,
                title: "Timing Blindness",
                description: "Traditional filters show you distress signals from months ago. The motivated seller who was desperate last month? Already sold. The one getting desperate now? Invisible to your current tools."
              },
              {
                icon: Phone,
                title: "Volume Over Intelligence",
                description: "The current playbook: blast through more calls, send more mailers, hope something sticks. It's exhausting, expensive, and your competition does the exact same thing."
              }
            ].map((problem, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-slate-800/30 border border-white/5 rounded-2xl p-8 hover:border-red-500/20 transition-colors"
              >
                <div className="w-14 h-14 rounded-xl bg-red-500/10 flex items-center justify-center mb-6">
                  <problem.icon className="w-7 h-7 text-red-400" />
                </div>
                <h3 className="text-xl font-bold mb-3">{problem.title}</h3>
                <p className="text-landing-text-muted leading-relaxed">{problem.description}</p>
              </motion.div>
            ))}
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center mt-16 p-8 bg-gradient-to-r from-landing-primary/30 to-sky-900/30 border border-sky-700/30 rounded-2xl"
          >
            <p className="text-xl text-landing-text">
              What if you could see which properties are under pressure <span className="text-landing-accent font-semibold">RIGHT NOW</span>—before the motivation peaks and everyone else notices?
            </p>
          </motion.div>
        </div>
      </section>

      {/* ============ FEATURES SECTION ============ */}
      <section id="features" className="py-24 bg-slate-900/50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              Enforcement Intelligence That Finds Motivated Sellers <span className="text-landing-accent">First</span>
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-landing-text-muted"
            >
              Snap Ignite tracks municipal pressure signals most platforms completely miss—code violations, escalating fines, water shutoffs, and compliance deadlines. We don't just show you distress. We show you timing.
            </motion.p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-6 max-w-6xl mx-auto mb-12">
            {[
              {
                icon: Target,
                title: "SnapScore AI Motivation Ranking",
                description: "Not all violations are equal. Our AI analyzes violation type, escalation velocity, fine accumulation, and timeline pressure to rank properties by actual seller motivation—not just distress indicators.",
                highlight: true
              },
              {
                icon: BarChart3,
                title: "The 30-Day Window",
                description: "While competitors refresh monthly (or slower), Snap Ignite delivers 16,000+ new property updates every week. You see escalation patterns as they develop—catching the critical window when sellers shift from \"annoyed\" to \"motivated.\""
              },
              {
                icon: Map,
                title: "Multiple Pressure Signals, One View",
                description: "Code violations. Water shutoffs. Accumulating fines. Compliance deadlines. We aggregate enforcement data from 900+ counties so you see the full picture of municipal pressure on any property."
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`bg-slate-800/50 border rounded-2xl p-8 transition-all hover:-translate-y-1 ${
                  feature.highlight 
                    ? 'border-landing-accent/50 ring-2 ring-landing-accent/20 shadow-lg shadow-landing-accent/10' 
                    : 'border-white/5 hover:border-white/10'
                }`}
              >
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${
                  feature.highlight ? 'bg-landing-accent/20' : 'bg-landing-accent/10'
                }`}>
                  <feature.icon className="w-7 h-7 text-landing-accent" />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-landing-text-muted leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
          
          {/* Feature pills */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto"
          >
            {[
              { icon: Filter, label: "Violation Type Filtering" },
              { icon: Download, label: "Export to CSV" },
              { icon: Building2, label: "County-Level Coverage" },
              { icon: Users, label: "Owner Information" },
              { icon: Search, label: "Saved Searches" },
              { icon: Users, label: "Team Collaboration" }
            ].map((pill, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-800/50 border border-white/5 text-sm">
                <Check className="w-4 h-4 text-landing-accent" />
                {pill.label}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ============ HOW IT WORKS - REDESIGNED ============ */}
      <section id="how-it-works" className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              From Enforcement Data to Deals in <span className="text-landing-accent">3 Steps</span>
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-landing-text-muted"
            >
              While competitors show you stale data, Snap Ignite reveals who's under pressure NOW
            </motion.p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: "1",
                title: "Filter by Pressure Signals",
                description: "Select counties, violation types, and SnapScore thresholds. Build lists based on municipal pressure, not guesswork."
              },
              {
                step: "2",
                title: "Identify High-Priority Properties",
                description: "SnapScore AI ranks properties by motivation timing. Focus on sellers most likely to move NOW."
              },
              {
                step: "3",
                title: "Export & Contact",
                description: "Download targeted CSV lists and reach out while pressure is fresh. No cold calling—just timely solutions."
              }
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative text-center"
              >
                {/* Connector line */}
                {i < 2 && (
                  <div className="hidden md:block absolute top-12 left-1/2 w-full h-0.5 bg-gradient-to-r from-landing-accent/50 to-landing-accent/10" />
                )}
                
                {/* Step number */}
                <div className="relative z-10 w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 bg-landing-accent/20 rounded-full blur-xl" />
                  <div className="relative w-full h-full rounded-full bg-landing-accent flex items-center justify-center text-landing-bg text-3xl font-bold shadow-lg shadow-landing-accent/30">
                    {step.step}
                  </div>
                </div>
                
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-landing-text-muted leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ COMPETITOR COMPARISON TABLE ============ */}
      <section className="py-24 bg-slate-900/50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              Why Snap Ignite Beats Traditional Lead Lists
            </motion.h2>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto overflow-x-auto"
          >
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-5 px-4 font-medium text-landing-text-muted">Feature</th>
                  <th className="text-center py-5 px-6">
                    <div className="inline-flex flex-col items-center gap-1">
                      <span className="font-bold text-landing-accent text-lg">Snap Ignite</span>
                      <Badge className="bg-landing-accent/20 text-landing-accent border-landing-accent/30 text-xs">Recommended</Badge>
                    </div>
                  </th>
                  <th className="text-center py-5 px-6">
                    <span className="font-medium text-landing-text-muted">PropStream</span>
                  </th>
                  <th className="text-center py-5 px-6">
                    <span className="font-medium text-landing-text-muted">BatchLeads</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: "Enforcement Data Focus", snap: true, prop: false, batch: false },
                  { feature: "AI Motivation Scoring", snap: true, prop: false, batch: false },
                  { feature: "Weekly Data Refresh", snap: true, prop: false, batch: false },
                  { feature: "Water Shutoff Tracking", snap: true, prop: false, batch: false },
                  { feature: "Escalation Pattern Alerts", snap: true, prop: false, batch: false },
                  { feature: "User Limit for Data Advantage", snap: true, prop: false, batch: false },
                  { feature: "Skip Trace Integration", snap: "soon", prop: true, batch: true },
                  { feature: "CRM Built-in", snap: false, prop: true, batch: true },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-4 px-4 font-medium">{row.feature}</td>
                    <td className="py-4 px-6 text-center">
                      {row.snap === true ? (
                        <Check className="w-5 h-5 text-landing-success mx-auto" />
                      ) : row.snap === false ? (
                        <X className="w-5 h-5 text-landing-text-muted/50 mx-auto" />
                      ) : (
                        <span className="text-xs text-amber-400">Coming Soon</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {row.prop ? (
                        <Check className="w-5 h-5 text-landing-text-muted/50 mx-auto" />
                      ) : (
                        <X className="w-5 h-5 text-landing-text-muted/50 mx-auto" />
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {row.batch ? (
                        <Check className="w-5 h-5 text-landing-text-muted/50 mx-auto" />
                      ) : (
                        <X className="w-5 h-5 text-landing-text-muted/50 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* ============ WHO IT'S FOR SECTION ============ */}
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
              className="bg-gradient-to-br from-emerald-500/10 to-emerald-900/10 border border-emerald-500/20 rounded-2xl p-8"
            >
              <h3 className="text-2xl font-bold mb-6 text-emerald-400 flex items-center gap-2">
                <Check className="w-6 h-6" />
                Built For You If...
              </h3>
              <ul className="space-y-4">
                {[
                  "You value timing over volume—you'd rather contact 50 motivated sellers than cold call 500 random leads",
                  "You're tired of competing on who can make the most dials and want an actual information advantage",
                  "You operate in markets where enforcement activity creates real seller pressure",
                  "You're willing to invest in intelligence, not just data",
                  "You understand that exclusivity (our 500-user cap) protects your competitive advantage"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
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
              className="bg-gradient-to-br from-red-500/10 to-red-900/10 border border-red-500/20 rounded-2xl p-8"
            >
              <h3 className="text-2xl font-bold mb-6 text-red-400 flex items-center gap-2">
                <X className="w-6 h-6" />
                Not the Right Fit If...
              </h3>
              <ul className="space-y-4">
                {[
                  "You're brand new to real estate investing and need basic education first",
                  "Your strategy is pure volume—blast through thousands of calls regardless of quality",
                  "You're looking for the cheapest possible data source",
                  "You need comprehensive CRM, dialer, and marketing tools in one platform",
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
            Still not sure? Our Starter plan at $119/month lets you test the intelligence advantage with 5 counties and 2,500 monthly exports. No annual commitment required.
          </motion.p>
        </div>
      </section>

      {/* ============ PRICING SECTION - REDESIGNED ============ */}
      <section id="pricing" className="py-24 bg-slate-900/50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold mb-4"
            >
              Choose Your Intelligence Advantage
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-landing-text-muted mb-8"
            >
              No hidden fees. No per-record charges. All plans include our full 270,000+ property database.
            </motion.p>
            
            {/* Billing Toggle */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-1 p-1.5 bg-slate-800 rounded-xl border border-white/5"
            >
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                  billingCycle === 'monthly' 
                    ? 'bg-landing-accent text-landing-bg shadow-lg' 
                    : 'text-landing-text-muted hover:text-landing-text'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  billingCycle === 'annual' 
                    ? 'bg-landing-accent text-landing-bg shadow-lg' 
                    : 'text-landing-text-muted hover:text-landing-text'
                }`}
              >
                Annual
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">
                  Save 20%
                </span>
              </button>
            </motion.div>
          </div>
          
          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-12">
            {[
              {
                name: "Starter",
                price: pricing.starter[billingCycle],
                description: "For focused local operators",
                features: [
                  "2,500 monthly exports",
                  "5 county coverage (you choose)",
                  "Basic SnapScore filtering",
                  "Weekly data refresh",
                  "1 user seat",
                  "Email support"
                ],
                highlighted: false
              },
              {
                name: "Professional",
                price: pricing.professional[billingCycle],
                description: "For growing acquisition operations",
                features: [
                  "10,000 monthly exports",
                  "25 county coverage",
                  "Advanced SnapScore filters",
                  "Violation type filtering",
                  "Rolling 30-day intelligence",
                  "3 user seats",
                  "Priority email support"
                ],
                highlighted: true,
                badge: "Most Popular"
              },
              {
                name: "Enterprise",
                price: pricing.enterprise[billingCycle],
                description: "For serious multi-market teams",
                features: [
                  "25,000 monthly exports",
                  "All 900+ counties",
                  "Full SnapScore AI suite",
                  "Escalation pattern alerts",
                  "API access (coming soon)",
                  "10 user seats",
                  "Dedicated account manager"
                ],
                highlighted: false
              }
            ].map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative bg-gradient-to-br rounded-2xl p-8 transition-all hover:-translate-y-1 ${
                  plan.highlighted 
                    ? 'from-slate-800 to-slate-900 border-2 border-landing-accent shadow-2xl shadow-landing-accent/20' 
                    : 'from-slate-800/50 to-slate-900/50 border border-white/5 hover:border-white/10'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-landing-accent text-landing-bg font-semibold px-4 py-1 shadow-lg">
                      {plan.badge}
                    </Badge>
                  </div>
                )}
                
                <div className="text-center mb-8">
                  <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1 mb-2">
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-landing-text-muted">/month</span>
                  </div>
                  <p className="text-landing-text-muted text-sm">{plan.description}</p>
                </div>
                
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-3">
                      <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${plan.highlighted ? 'text-landing-accent' : 'text-emerald-400'}`} />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Link to="/auth?mode=signup">
                  <Button 
                    className={`w-full font-semibold ${
                      plan.highlighted 
                        ? 'bg-landing-accent hover:bg-landing-accent/90 text-landing-bg' 
                        : 'bg-white/5 hover:bg-white/10 text-landing-text border border-white/10'
                    }`}
                  >
                    Get Started
                  </Button>
                </Link>
              </motion.div>
            ))}
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center text-landing-text-muted space-y-2"
          >
            <p>All plans include 14-day free trial • No credit card required to start</p>
            <p className="text-sm flex items-center justify-center gap-2">
              <Lock className="w-4 h-4" />
              Limited to 500 total users to protect data advantage
            </p>
          </motion.div>
        </div>
      </section>

      {/* ============ FAQ SECTION ============ */}
      <section id="faq" className="py-24">
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
            
            <Accordion type="single" collapsible className="space-y-3">
              {[
                {
                  question: "How is Snap Ignite different from PropStream or BatchLeads?",
                  answer: "PropStream and BatchLeads are lead list tools that pull from the same public records everyone else uses. Snap Ignite is an enforcement intelligence platform—we specifically track code violations, water shutoffs, fines, and compliance deadlines that indicate real-time seller pressure. Our SnapScore AI doesn't just show you distressed properties; it ranks them by motivation timing so you know WHO to call and WHEN."
                },
                {
                  question: "Why the 500-user limit?",
                  answer: "The value of intelligence decreases when everyone has it. If 5,000 investors all see the same \"hot\" properties, you're back to competing on call volume. We cap access at 500 users to ensure the intelligence advantage stays valuable for those who have it. Once we hit 500, we'll open a waitlist for future spots."
                },
                {
                  question: "What counties do you cover?",
                  answer: "We currently cover 900+ counties across the United States, focusing on markets with active enforcement and investor activity. Coverage is expanding monthly. Enterprise users get access to all available counties; Starter and Professional users select their priority markets."
                },
                {
                  question: "How fresh is the data?",
                  answer: "We process 16,000+ new property updates every week. Most enforcement data appears in Snap Ignite within 7-14 days of the violation being recorded—compared to 30-90 days (or longer) with traditional data providers."
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
                    className="bg-slate-800/30 border border-white/5 rounded-xl px-6 data-[state=open]:border-landing-accent/30"
                  >
                    <AccordionTrigger className="text-left font-semibold hover:text-landing-accent py-5 hover:no-underline">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-landing-text-muted pb-5 leading-relaxed">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA SECTION ============ */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-landing-accent/10 via-transparent to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-landing-accent/10 rounded-full blur-3xl" />
        
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
              Join 87 operators already using enforcement intelligence to find motivated sellers first.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-8"
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
                className="bg-landing-accent hover:bg-landing-accent/90 text-landing-bg font-semibold text-lg px-12 py-6 h-auto shadow-xl shadow-landing-accent/20"
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

      {/* ============ FOOTER ============ */}
      <footer className="py-12 border-t border-white/5 bg-landing-bg">
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
          
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
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
