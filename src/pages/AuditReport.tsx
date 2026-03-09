import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Printer, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AuditReport() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Screen-only toolbar */}
      <div className="print:hidden sticky top-0 z-50 bg-background border-b border-border px-6 py-3 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div className="flex-1" />
        <Button onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" /> Download as PDF
        </Button>
      </div>

      {/* Report content */}
      <div className="max-w-4xl mx-auto px-8 py-10 print:px-0 print:py-0 print:max-w-none space-y-8 print:space-y-4">
        {/* Title Page */}
        <div className="text-center py-12 print:py-8 border-b border-border print:break-after-page">
          <h1 className="text-4xl font-bold mb-2">Snap Ignite</h1>
          <h2 className="text-2xl text-muted-foreground mb-4">Full System Audit Report</h2>
          <p className="text-muted-foreground">Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <Badge variant="outline" className="mt-4">Confidential — Internal Use Only</Badge>
        </div>

        {/* 1. Platform Overview */}
        <Section title="1. Platform Overview">
          <p>Snap Ignite is a municipal enforcement intelligence platform that tracks code violations, water shutoffs, escalating fines, and other enforcement signals across residential properties nationwide.</p>
          <Table headers={["Metric", "Value"]} rows={[
            ["Total Properties Tracked", "441,501"],
            ["Total Violations", "406,000+"],
            ["Cities Covered", "4,500+"],
            ["Scoring Engine Version", "v7.1"],
            ["AI Engine", "v4.1 Hybrid (Gemini 3 Flash Preview)"],
            ["Subscription Tiers", "Starter ($79/mo) · Professional ($149/mo) · Elite ($299/mo)"],
            ["Trial Period", "3-day free trial"],
            ["Payment Processing", "Stripe (Test Mode)"],
          ]} />
        </Section>

        {/* 2. Database Overview */}
        <Section title="2. Database Overview">
          <p>Primary database hosted on Supabase (external instance: dqwolscmceelqpkfclgi). PostGIS enabled for spatial queries.</p>
          <Table headers={["Table", "Purpose", "Estimated Rows"]} rows={[
            ["properties", "Core property records with scoring, geo, and violation aggregates", "441,501"],
            ["clean_leads", "Normalized violation records linked to properties", "406,000+"],
            ["profiles", "User profiles linked to auth.users", "—"],
            ["user_roles", "RBAC role assignments (admin, user, va)", "—"],
            ["subscription_plans", "Tier definitions with feature gates", "3"],
            ["user_subscriptions", "Active user subscriptions with Stripe IDs", "—"],
            ["saved_properties", "User bookmarked properties", "—"],
            ["lead_lists / list_properties", "Custom property lists", "—"],
            ["credit_ledger", "Credit transaction log for exports", "—"],
            ["counties", "FOIA county tracking with assignment", "—"],
            ["foia_requests", "FOIA request lifecycle tracking", "—"],
            ["foia_profiles", "FOIA VA user profiles", "—"],
            ["press_accounts / press_rotation", "Press credential rotation system", "—"],
            ["geocoding_jobs", "Batch geocoding job tracking", "—"],
            ["jurisdictions", "City/county jurisdiction metadata", "—"],
            ["property_contacts", "Skip-traced contact data per property", "—"],
          ]} />
        </Section>

        {/* 3. Data Pipeline */}
        <Section title="3. Data Pipeline">
          <p>Data flows through a multi-stage pipeline: CSV upload → parsing → deduplication → property upsert → violation linking → scoring → insight generation → geocoding.</p>
          <SubSection title="Upload Flow">
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>CSV file uploaded via frontend (drag-drop or paste)</li>
              <li>Location detection identifies city/state/county columns</li>
              <li><code>process-upload</code> edge function parses, deduplicates, and upserts</li>
              <li>Property aggregates recalculated via database triggers</li>
              <li>Snap Score computed by v7.1 scoring engine</li>
              <li>AI insights generated asynchronously via <code>generate-insights</code></li>
              <li>Geocoding triggered via <code>geocode-properties</code></li>
            </ol>
          </SubSection>
          <SubSection title="Key Edge Functions">
            <Table headers={["Function", "Purpose"]} rows={[
              ["process-upload", "CSV parsing, dedup, property upsert"],
              ["generate-insights", "AI-powered enforcement analysis per property"],
              ["geocode-properties", "Batch geocoding with PostGIS point creation"],
              ["backfill-property-aggregates", "Recalculate violation counts and dates"],
              ["bulk-rescore", "Batch re-score properties with v7.1 engine"],
              ["export-csv", "Gated CSV export with credit deduction"],
              ["scheduled-rescore", "Automated periodic rescoring"],
              ["weekly-digest", "Email digest of new violations"],
            ]} />
          </SubSection>
        </Section>

        {/* 4. Backend Architecture */}
        <Section title="4. Backend Architecture">
          <p>Backend runs entirely on Supabase Edge Functions (Deno runtime) with PostgreSQL + PostGIS. No separate server.</p>
          <SubSection title="Auth & RBAC">
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Supabase Auth with email/password signup</li>
              <li>Role-based access via <code>user_roles</code> table (admin, user, va)</li>
              <li>RLS policies on all tables enforce row-level security</li>
              <li><code>has_role()</code> security-definer function prevents recursive RLS</li>
              <li>Client-side role caching with 5-minute TTL and retry logic</li>
            </ul>
          </SubSection>
          <SubSection title="Edge Function Count">
            <p>25+ edge functions deployed covering upload processing, scoring, geocoding, exports, Stripe webhooks, FOIA management, and administrative operations.</p>
          </SubSection>
        </Section>

        {/* 5. Core Algorithms */}
        <Section title="5. Core Algorithms">
          <SubSection title="Snap Score v7.1">
            <p>Composite 0–100 score computed from:</p>
            <Table headers={["Signal", "Weight"]} rows={[
              ["Violation count & recency", "High"],
              ["Open vs. closed ratio", "Medium"],
              ["Average days open", "Medium"],
              ["Escalation presence", "High"],
              ["Multi-department involvement", "Medium"],
              ["Repeat offender status", "High"],
              ["Distress signals (water shutoff, liens, condemnation)", "Very High"],
            ]} />
          </SubSection>
          <SubSection title="Opportunity Classification">
            <p>Properties classified into opportunity tiers: <Badge variant="outline">Diamond</Badge> <Badge variant="outline">Gold</Badge> <Badge variant="outline">Silver</Badge> <Badge variant="outline">Bronze</Badge> based on score thresholds and signal combinations.</p>
          </SubSection>
          <SubSection title="AI Insight Engine v4.1">
            <p>Hybrid AI engine using Google Gemini 3 Flash Preview. Generates natural-language enforcement narratives per property analyzing violation patterns, escalation risk, and investment opportunity signals.</p>
          </SubSection>
        </Section>

        {/* 6. Feature System */}
        <Section title="6. Feature System">
          <Table headers={["Feature", "Starter ($79/mo)", "Professional ($149/mo)", "Elite ($299/mo)"]} rows={[
            ["Monthly Enforcement Reports", "5,000", "15,000", "25,000"],
            ["Cities Nationwide", "3,800+", "3,800+", "3,800+"],
            ["Code Violation Data", "✓", "✓", "✓"],
            ["Basic Filters (location, category, search)", "✓", "✓", "✓"],
            ["Monthly Data Refresh", "✓", "✓", "✓"],
            ["Email Support", "✓", "Priority", "Priority"],
            ["Pressure Level Filtering", "—", "✓", "✓"],
            ["Water Shutoff Data", "—", "—", "✓"],
          ]} />
        </Section>

        {/* 7. Subscription System */}
        <Section title="7. Subscription System">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Stripe Checkout for payment collection (currently in Test Mode)</li>
            <li>Webhook handler (<code>stripe-webhook</code>) processes subscription lifecycle events</li>
            <li><code>user_subscriptions</code> table tracks active subscriptions with Stripe customer/subscription IDs</li>
            <li><code>verify-subscription</code> function validates subscription status</li>
            <li>3-day free trial automatically provisioned on signup</li>
            <li>Feature gates enforced via <code>useSubscriptionGate</code> and <code>useFeatureAccess</code> hooks</li>
            <li>Export quota tracked in <code>credit_ledger</code></li>
          </ul>
        </Section>

        {/* 8. Frontend Architecture */}
        <Section title="8. Frontend Architecture">
          <Table headers={["Layer", "Technology"]} rows={[
            ["Framework", "React 18 + TypeScript"],
            ["Build Tool", "Vite"],
            ["Styling", "Tailwind CSS + shadcn/ui"],
            ["State Management", "TanStack React Query"],
            ["Routing", "React Router v6"],
            ["Maps", "Leaflet + react-leaflet"],
            ["Charts", "Recharts"],
            ["Animations", "Framer Motion"],
            ["Forms", "React Hook Form + Zod"],
            ["Virtualization", "TanStack Virtual"],
          ]} />
          <SubSection title="Key Pages">
            <Table headers={["Route", "Purpose"]} rows={[
              ["/", "Landing page with feature showcase"],
              ["/properties", "Main leads explorer with map, filters, detail panel"],
              ["/upload", "CSV upload with location detection"],
              ["/lists", "Custom property lists management"],
              ["/settings", "Account, subscription, notifications"],
              ["/admin-console", "Admin dashboard with data health tools"],
              ["/va-dashboard", "VA workspace for county management"],
              ["/foia/*", "FOIA request management module"],
            ]} />
          </SubSection>
        </Section>

        {/* 9. Security */}
        <Section title="9. Security">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Row-Level Security (RLS) enabled on all user-facing tables</li>
            <li>Role checks via <code>has_role()</code> security-definer function</li>
            <li>No client-side admin checks — all role validation server-side via RLS</li>
            <li>Separate <code>user_roles</code> table (not on profiles) to prevent privilege escalation</li>
            <li>Edge functions validate JWT tokens and user identity</li>
            <li>Stripe webhook signature verification on payment events</li>
            <li>FOIA module has separate auth guard (<code>FoiaAuthGuard</code>)</li>
            <li>Export operations gated by subscription tier + credit balance</li>
            <li>Skip-trace consent logging with IP hash</li>
          </ul>
        </Section>

        {/* 10. Known Issues & Technical Debt */}
        <Section title="10. Known Issues & Technical Debt">
          <Table headers={["Issue", "Severity", "Status"]} rows={[
            ["~77K properties uncategorized (violation_types mapping gaps)", "Medium", "Identified"],
            ["Stripe in Test Mode — not yet live", "High", "Pending"],
            ["External Supabase instance (not Lovable Cloud)", "Low", "By design"],
            ["Some edge functions lack comprehensive error handling", "Medium", "Ongoing"],
            ["Geocoding depends on external API availability", "Low", "Acceptable"],
            ["AI insight generation can be slow for large batches", "Medium", "Mitigated with async processing"],
            ["Role cache (localStorage) has 5-min TTL — brief stale window", "Low", "Acceptable"],
          ]} />
        </Section>

        {/* 11. Growth Infrastructure */}
        <Section title="11. Growth Infrastructure">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>FOIA module for systematic public records acquisition</li>
            <li>VA onboarding pipeline with role assignment and county management</li>
            <li>Press credential rotation system for FOIA request distribution</li>
            <li>Batch processing for bulk rescoring and insight generation</li>
            <li>Weekly digest emails for user engagement</li>
            <li>Trial-to-paid conversion funnel with paywall gates</li>
            <li>Page tracking analytics via <code>usePageTracking</code></li>
            <li>Invitation system for team onboarding</li>
          </ul>
        </Section>

        {/* 12. Competitive Moat */}
        <Section title="12. Competitive Moat">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Data network effect:</strong> 441K+ properties with enforcement histories not available elsewhere</li>
            <li><strong>Scoring IP:</strong> Proprietary v7.1 algorithm combining 7+ signal categories</li>
            <li><strong>AI differentiation:</strong> Natural-language enforcement narratives unique to Snap Ignite</li>
            <li><strong>FOIA pipeline:</strong> Systematic data acquisition across jurisdictions</li>
            <li><strong>Geo-intelligence:</strong> PostGIS spatial queries for area-based opportunity mapping</li>
            <li><strong>Vertical specificity:</strong> Purpose-built for enforcement-driven real estate investment</li>
          </ul>
        </Section>

        {/* 13. System Metrics Summary */}
        <Section title="13. System Metrics Summary">
          <Table headers={["Metric", "Value"]} rows={[
            ["Total Properties", "441,501"],
            ["Total Violations", "406,000+"],
            ["Cities Covered", "3,800+"],
            ["Edge Functions Deployed", "25+"],
            ["Database Tables", "35+"],
            ["Frontend Routes", "30+"],
            ["React Components", "120+"],
            ["Custom Hooks", "35+"],
            ["Subscription Tiers", "3"],
            ["Scoring Signals", "7+ categories"],
            ["AI Model", "Gemini 3 Flash Preview"],
          ]} />
        </Section>

        {/* Footer */}
        <div className="text-center text-muted-foreground text-xs py-8 border-t border-border print:py-4">
          <p>Snap Ignite System Audit — Confidential</p>
          <p>© {new Date().getFullYear()} Snap Ignite. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Helper Components ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="print:shadow-none print:border print:break-inside-avoid-page">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-sm">{title}</h4>
      {children}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h, i) => (
              <th key={i} className="text-left py-2 px-3 font-semibold text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-3">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
