

## Assessment

This strategy is sharp. You already have 3 of the 7 pages built (`/code-violation-leads`, `/distressed-property-data`, `/code-enforcement-data`). The remaining 4 static pages are straightforward. The programmatic city pages are the real power play.

**One tension to flag:** Your in-app positioning says "not a leads tool" and uses "properties" / "professionals." But SEO pages *should* use investor language because that is what people search for. This is fine -- marketing pages speak Google's language, the product speaks its own. Just keep them separate.

## Plan: Build Remaining SEO Pages + Programmatic City Framework

### Task 1: Create 4 New Static SEO Pages

Each follows the same template as existing pages (nav, hero H1, 3-4 content sections, stats, CTA, footer, JSON-LD).

| Route | Target Keyword | H1 |
|---|---|---|
| `/municipal-enforcement-data` | municipal enforcement data | Municipal Enforcement Data for Real Estate Professionals |
| `/off-market-property-leads` | off market property leads | Off-Market Property Leads Powered by Enforcement Intelligence |
| `/real-estate-distress-signals` | real estate distress signals | Real Estate Distress Signals: The Enforcement Layer Most Investors Miss |
| `/how-investors-find-distressed-properties` | how investors find distressed properties | How Investors Find Distressed Properties in 2026 |

**Files to create:** 4 new page components in `src/pages/`

### Task 2: Register Routes + Update Sitemap

- Add 4 lazy-loaded public routes in `App.tsx`
- Add all 4 URLs to `public/sitemap.xml`

### Task 3: Programmatic City Pages (the 4,000-page engine)

This is the high-leverage move. Build a single dynamic route that pulls real jurisdiction data from the database.

**Route:** `/code-violations/:citySlug` (e.g., `/code-violations/miami`)

**How it works:**
- Create `src/pages/CityViolations.tsx` -- a single template page
- On mount, extract `citySlug` from URL params, query the `jurisdictions` table for matching city
- Display: city name, state, property count, violation stats, enforcement pressure summary
- Include JSON-LD `WebPage` schema with city-specific data
- Dynamic `<title>`: "Code Violations in Miami, FL | Snap Ignite"
- CTA to sign up and access the full data
- If city not found, show a generic "coverage expanding" page with CTA

**For Google discoverability**, create a city index page at `/code-violations` that lists all tracked cities as internal links (pulled from `jurisdictions` table). This acts as a crawlable directory.

**Files to create:**
- `src/pages/CityViolations.tsx` (dynamic template)
- `src/pages/CityViolationsIndex.tsx` (directory of all cities)

**Files to edit:**
- `src/App.tsx` (add routes)
- `public/sitemap.xml` (add static pages; note: for 4,000+ city pages, you'd eventually want a dynamic sitemap via edge function, but the index page handles crawlability for now)

### Summary of All Changes

| Action | Files |
|---|---|
| Create 4 static SEO pages | `src/pages/MunicipalEnforcementData.tsx`, `OffMarketPropertyLeads.tsx`, `RealEstateDistressSignals.tsx`, `HowInvestorsFindDistressedProperties.tsx` |
| Create city template + index | `src/pages/CityViolations.tsx`, `src/pages/CityViolationsIndex.tsx` |
| Register 7 new routes | `src/App.tsx` |
| Update sitemap | `public/sitemap.xml` |

