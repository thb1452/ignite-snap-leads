

## Landing Page Redesign — Stats-Forward Hero + Motion

Your detailed spec is solid. Here's the implementation plan:

### Files to modify

**1. `tailwind.config.ts`** — Add two keyframes + animations:
- `dot-grid`: slow background-position shift for the hero grid pattern
- `gradient-border`: pulsing border color on the problem callout box

**2. `src/pages/Landing.tsx`** — Three changes:

#### A. Hero rewrite (lines 193–301)
Replace the current hero with:
- **Animated dot-grid background** (CSS `background-image` radial dots, `animate-dot-grid`)
- **Three giant stat counters** in a row (441,501+ / 4,520+ / 406,000+) with staggered framer-motion entrance and `AnimatedCounter` (already defined in the file)
- **Shorter headline**: "Enforcement Intelligence for 441k+ Properties"
- **Single-line subtext** replacing the two paragraphs + blockquote
- **CTA with hover scale/glow** via `motion.button` `whileHover`
- **Secondary anchor CTA**: "See the Platform in Action ↓" with `scrollToSection('features')` + `trackEvent`
- **FOMO pill**: "Early Access — First 200 Investors" with `animate-pulse-soft`
- **Trust line**: "Trusted by 400+ investors during pilot"
- Video stays in right column but visually secondary

#### B. Live Stats Bar (new section, inserted after hero at line 301, before Problem section)
- Full-width glassmorphism strip: `bg-landing-surface/20 backdrop-blur-xl border border-landing-accent/20 animate-gradient-border`
- Four counters in a grid (2x2 on mobile, 4-col on desktop): Properties Tracked, Cities Covered, Violations Monitored, Weekly Updates
- `useInView` + `trackEvent('stats_bar_visible')` for analytics

#### C. Motion enhancements (scattered)
- Feature cards (lines 487–504): add `transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(56,178,172,0.15)]`
- Problem callout box (line 365): add `animate-gradient-border` class
- Problem cards (line 350): add same hover lift effect

### What stays untouched
- Nav, pricing, FAQ, footer, mobile menu
- `AnimatedCounter` component (reused as-is from line 36)
- Color system, all sections below hero
- Platform videos section

### Performance notes
- Dot grid is pure CSS (`background-image: radial-gradient`), no canvas/JS
- All motion is CSS transforms or lightweight framer-motion — no new bundles
- Hero video keeps `autoPlay` but stats take visual priority

