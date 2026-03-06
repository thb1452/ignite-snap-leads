

## Plan: Full System Audit as Downloadable PDF

Create a standalone HTML page at `/audit-report` that renders the complete Snap Ignite system audit in a print-optimized layout. The user can then use their browser's "Print → Save as PDF" to get a clean PDF document.

### What gets built

1. **New page**: `src/pages/AuditReport.tsx` — a full-page, print-optimized report containing all 13 sections from the audit (Platform Overview, Database Overview, Data Pipeline, Backend Architecture, Core Algorithms, Feature System, Subscription System, Frontend Architecture, Security, Known Issues, Growth Infrastructure, Competitive Moat, System Metrics).

2. **New route**: Add `/audit-report` to `App.tsx` (admin-protected).

3. **Print styling**: Add `@media print` CSS rules to hide navigation/sidebar and render clean pages with proper margins, page breaks, and table formatting.

4. **Print button**: A "Download as PDF" button at the top that triggers `window.print()`.

### Technical approach

- Static content page — no API calls needed, all data is hardcoded from the audit results already gathered.
- Uses existing UI components (Card, Table, Badge) for consistent styling.
- Print media query strips chrome, forces white background, and sets A4-friendly margins.
- Protected behind admin role check.

