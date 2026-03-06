

## Plan: Fix FAQ Language + Build SEO Landing Pages

### Task 1: Fix FAQ Data Freshness Language (2 min)

Update the "How fresh is the data?" answer in **two places**:
- `index.html` (JSON-LD structured data, line 106)
- `src/pages/Landing.tsx` (visible FAQ section, line 1034)

**New text:**
> "Enforcement records appear in Snap Ignite as municipal sources update. Most jurisdictions refresh monthly, ensuring you're working with current enforcement signals — not the stale, outdated lists traditional providers deliver 30–90 days late."

---

### Task 2: Create SEO Landing Pages (3 pages)

Build keyword-targeted pages that rank for high-intent investor searches. Each page will follow a consistent template: hero with H1 keyword, value props, stats from the platform, CTA to sign up.

**Pages to create:**

| Route | Target Keyword | H1 |
|---|---|---|
| `/code-violation-leads` | code violation leads | Code Violation Leads for Real Estate Investors |
| `/distressed-property-data` | distressed property data | Distressed Property Data Powered by Enforcement Intelligence |
| `/code-enforcement-data` | code enforcement data | Code Enforcement Data Across 4,500+ Cities |

**Each page includes:**
- Keyword-optimized `<title>` and meta description (via `document.title` or react-helmet equivalent)
- H1 → H2 → H3 heading hierarchy with semantic keywords
- 3–4 content sections (what it is, how it works, coverage, CTA)
- Internal links to `/pricing` and `/auth`
- Consistent footer matching Landing page
- JSON-LD `WebPage` structured data

**Route registration** in `App.tsx` — public routes (no auth required), lazy-loaded.

### Task 3: Update `robots.txt` and add `sitemap.xml`

- Add a `sitemap.xml` to `/public` listing all public pages (landing, pricing, about, privacy, terms, blog, and the 3 new SEO pages)
- Update `robots.txt` to reference the sitemap

---

### Files to create
- `src/pages/CodeViolationLeads.tsx`
- `src/pages/DistressedPropertyData.tsx`
- `src/pages/CodeEnforcementData.tsx`
- `public/sitemap.xml`

### Files to edit
- `index.html` (line 106 — FAQ answer)
- `src/pages/Landing.tsx` (line 1034 — FAQ answer)
- `src/App.tsx` (add 3 lazy routes)
- `public/robots.txt` (add sitemap reference)

