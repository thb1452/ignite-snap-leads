import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, AlertTriangle, Home, Flame, Wrench, Scale, Eye } from "lucide-react";

export default function HowSnapWorks() {
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-8 p-6">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-ink-900">How Snap Works</h1>
          <p className="text-lg text-ink-600">
            Snap is a <strong>Distressed Property Intelligence Platform</strong> that converts municipal enforcement
            pressure into investor-ready opportunity intelligence.
          </p>
        </div>

        {/* What Snap Actually Is */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-brand" />
              What Snap Actually Is
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-ink-700">
              Snap is <strong>not</strong> a lead list, skip tracer, or CRM. It's a system that:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-ink-700 ml-4">
              <li>Ingests chaotic city data (CSV, PDFs, FOIA dumps, portals)</li>
              <li>Cleans and normalizes it</li>
              <li>Scores it for distress and motivation</li>
              <li>Converts it into safe investor insight</li>
            </ol>
            <div className="mt-4 p-4 bg-brand/5 border border-brand/20 rounded-lg">
              <p className="text-sm font-medium text-brand">
                <strong>Legal Positioning:</strong> Snap provides derivative intelligence from public data—NOT raw
                municipal records. We transform, summarize, score, and interpret trends to shield you from data
                resale restrictions and privacy disputes.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SnapScore Explained */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-brand" />
              Understanding SnapScore
            </CardTitle>
            <CardDescription>
              SnapScore is a weighted probability indicator of legal, financial, and physical distress
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p className="text-ink-700">
                SnapScore answers one question: <strong>"If I spend my time here, am I more likely than average
                to find a motivated seller?"</strong>
              </p>
              <p className="text-sm text-ink-600">
                It's derived from violation age, repeat offenses, severity class, structural risk, fire risk,
                utility noncompliance, abandonment indicators, and multi-department enforcement.
              </p>
            </div>

            {/* Score Ranges */}
            <div className="space-y-3">
              <h3 className="font-semibold text-ink-900">Score Ranges</h3>
              <div className="grid gap-3">
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <Badge className="bg-score-red text-score-red-foreground mt-1">70-100</Badge>
                  <div>
                    <h4 className="font-semibold text-ink-900">Distressed (High Opportunity)</h4>
                    <p className="text-sm text-ink-600">
                      Severe violations, chronic neglect, legal escalation, or multi-system failures.
                      Owner likely facing financial pressure or capacity constraints.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <Badge className="bg-score-orange text-score-orange-foreground mt-1">40-69</Badge>
                  <div>
                    <h4 className="font-semibold text-ink-900">Value-Add (Moderate Opportunity)</h4>
                    <p className="text-sm text-ink-600">
                      Moderate violations or deferred maintenance patterns. Owner may be open to negotiation
                      but not under immediate pressure.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <Badge className="bg-score-blue text-score-blue-foreground mt-1">0-39</Badge>
                  <div>
                    <h4 className="font-semibold text-ink-900">Watch (Monitor)</h4>
                    <p className="text-sm text-ink-600">
                      Minor violations or recent issues. May develop into opportunity if unresolved.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Scoring Components */}
            <div className="space-y-3">
              <h3 className="font-semibold text-ink-900">How SnapScore is Calculated</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Time Pressure (Max 30pts)</h4>
                  <p className="text-xs text-ink-600">
                    +3 points per month open. Extended non-compliance suggests owner capacity constraints.
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Severity Matrix (Max 40pts)</h4>
                  <p className="text-xs text-ink-600">
                    Fire/structural = 40pts, moderate issues = 15pts, minor = 5pts. Measures capital required.
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Repeat Offender (Max 25pts)</h4>
                  <p className="text-xs text-ink-600">
                    3+ violations = pattern of systemic property management challenges.
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Multi-Department (Max 25pts)</h4>
                  <p className="text-xs text-ink-600">
                    Multiple city departments involved signals serious property deterioration.
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Legal Escalation (Max 30pts)</h4>
                  <p className="text-xs text-ink-600">
                    Cases escalated to legal proceedings indicate financial pressure on owner.
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Vacancy Signals (Max 25pts)</h4>
                  <p className="text-xs text-ink-600">
                    Abandonment, boarding, unsecured structures = immediate acquisition opportunities.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SnapInsight Explained */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-brand" />
              Understanding SnapInsight
            </CardTitle>
            <CardDescription>
              Investor-safe interpretation of property condition
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-ink-700">
              SnapInsight is <strong>NOT</strong> a description. It's an investor-safe interpretation that answers:
              <strong> "Why should I care about this property as an investor?"</strong>
            </p>

            <div className="grid gap-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-semibold text-sm text-green-900 mb-2">✓ Good SnapInsight Example</h4>
                <p className="text-sm text-green-800 italic">
                  "Property shows prolonged exterior compliance issues, suggesting deferred maintenance and
                  possible owner neglect."
                </p>
                <p className="text-xs text-green-700 mt-2">
                  Focuses on observable condition and owner situation.
                </p>
              </div>

              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="font-semibold text-sm text-red-900 mb-2">✗ Bad SnapInsight (Never Shown)</h4>
                <p className="text-sm text-red-800 italic line-through">
                  "Tenant complained of rats. Illegal occupancy reported."
                </p>
                <p className="text-xs text-red-700 mt-2">
                  Contains raw city language and tenant information—legal risk.
                </p>
              </div>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Legal Protection: Raw city notes are stored internally but NEVER exposed to users.
                Only AI-generated summaries appear in the UI.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Violation Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-brand" />
              Violation Types
            </CardTitle>
            <CardDescription>
              Normalized categories for investor understanding
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <Flame className="h-5 w-5 text-red-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-ink-900">Fire</h4>
                  <p className="text-sm text-ink-600">
                    Fire damage, smoke damage, charred structures. Requires immediate capital investment.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <Home className="h-5 w-5 text-orange-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-ink-900">Structural</h4>
                  <p className="text-sm text-ink-600">
                    Foundation issues, roof damage, unsafe structures. Capital expenditure pressure.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-ink-900">Safety</h4>
                  <p className="text-sm text-ink-600">
                    Health hazards, dangerous conditions. Legal escalation risk.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <Wrench className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-ink-900">Utility</h4>
                  <p className="text-sm text-ink-600">
                    Electrical, plumbing, water, gas, sewage. Building system failures.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <Home className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-ink-900">Exterior</h4>
                  <p className="text-sm text-ink-600">
                    Paint, siding, fencing, yard maintenance. Deferred maintenance signals.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <Scale className="h-5 w-5 text-purple-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-ink-900">Zoning</h4>
                  <p className="text-sm text-ink-600">
                    Land use violations, occupancy issues, zoning compliance.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Why Snap is Different */}
        <Card>
          <CardHeader>
            <CardTitle>Why Snap is Different</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-ink-700">
              Every competitor focuses on <strong>market reaction</strong>: MLS scraping, foreclosure lists,
              probate records, driving for dollars.
            </p>
            <p className="text-ink-700">
              Snap detects <strong>regulatory stress BEFORE market movement</strong>. You're upstream of:
            </p>
            <ul className="list-disc list-inside space-y-1 text-ink-600 ml-4">
              <li>PropStream (aggregates public records after distress is obvious)</li>
              <li>Batch (skip tracing tool, not opportunity detection)</li>
              <li>DealMachine (driving for dollars—reactive)</li>
              <li>REISift (MLS-based, market-lagging)</li>
            </ul>
            <div className="p-4 bg-brand/5 border border-brand/20 rounded-lg mt-4">
              <p className="font-semibold text-brand">
                Snap converts municipal enforcement pressure into investor opportunity intelligence.
              </p>
              <p className="text-sm text-ink-700 mt-2">
                This is asymmetric information. This is where real money lives.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
