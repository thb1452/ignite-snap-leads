import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, AlertTriangle, Home, Flame, Wrench, Scale, Eye, Info } from "lucide-react";

export default function HowSnapWorks() {
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-8 p-6">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-ink-900">How Snap Works</h1>
          <p className="text-lg text-ink-600">
            Snap is a <strong>Municipal Enforcement Intelligence Platform</strong> that aggregates, 
            normalizes, and analyzes public enforcement data across jurisdictions.
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
              <li>Ingests public enforcement data (CSV, PDFs, FOIA responses, portals)</li>
              <li>Cleans and normalizes it into a consistent format</li>
              <li>Scores enforcement intensity using objective metrics</li>
              <li>Generates factual summaries of enforcement activity</li>
            </ol>
            <div className="mt-4 p-4 bg-brand/5 border border-brand/20 rounded-lg">
              <p className="text-sm font-medium text-brand">
                <strong>Data Source:</strong> Snap provides derivative intelligence from public municipal records—
                code violations, utility enforcement actions, and compliance citations that are part of the public record.
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
              An enforcement intensity metric based on municipal data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p className="text-ink-700">
                SnapScore quantifies: <strong>"How much municipal enforcement activity is documented at this address?"</strong>
              </p>
              <p className="text-sm text-ink-600">
                It measures enforcement duration, municipal priority classification, number of agencies involved, 
                and data recency—not property condition or owner motivation.
              </p>
            </div>

            {/* Score Ranges */}
            <div className="space-y-3">
              <h3 className="font-semibold text-ink-900">Enforcement Intensity Levels</h3>
              <div className="grid gap-3">
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <Badge className="bg-score-red text-score-red-foreground mt-1">75-100</Badge>
                  <div>
                    <h4 className="font-semibold text-ink-900">Critical (High Enforcement Activity)</h4>
                    <p className="text-sm text-ink-600">
                      Multiple high-priority citations, extended duration, or escalated enforcement actions.
                      Indicates significant municipal attention to this property.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <Badge className="bg-score-orange text-score-orange-foreground mt-1">50-74</Badge>
                  <div>
                    <h4 className="font-semibold text-ink-900">High (Elevated Enforcement Activity)</h4>
                    <p className="text-sm text-ink-600">
                      Active enforcement cases with medium-priority classifications or multiple departments involved.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <Badge className="bg-score-yellow text-score-yellow-foreground mt-1">25-49</Badge>
                  <div>
                    <h4 className="font-semibold text-ink-900">Moderate (Standard Enforcement Activity)</h4>
                    <p className="text-sm text-ink-600">
                      Routine enforcement citations or recently opened cases.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <Badge className="bg-score-blue text-score-blue-foreground mt-1">0-24</Badge>
                  <div>
                    <h4 className="font-semibold text-ink-900">Low (Minimal Enforcement Activity)</h4>
                    <p className="text-sm text-ink-600">
                      Minor citations or recently resolved enforcement cases.
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
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Duration Factor (Max 30pts)</h4>
                  <p className="text-xs text-ink-600">
                    +3 points per month of active enforcement. Measures how long cases have remained open.
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Enforcement Priority (Max 60pts)</h4>
                  <p className="text-xs text-ink-600">
                    Based on municipal classification: High-priority = 40pts, medium = 15pts, low = 5pts.
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Repeat Activity (Max 25pts)</h4>
                  <p className="text-xs text-ink-600">
                    3+ citations indicates a pattern of recurring enforcement at this address.
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Multi-Agency (Max 25pts)</h4>
                  <p className="text-xs text-ink-600">
                    Multiple municipal departments involved signals broader enforcement attention.
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Escalation Status (Max 30pts)</h4>
                  <p className="text-xs text-ink-600">
                    Cases escalated to legal proceedings or condemnation orders.
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <h4 className="font-medium text-sm text-ink-900 mb-1">Recency Weighting (Max 40pts)</h4>
                  <p className="text-xs text-ink-600">
                    Recent enforcement activity (last 7-30 days) indicates current data.
                  </p>
                </div>
              </div>
            </div>

            {/* What SnapScore Does NOT Measure */}
            <div className="p-4 bg-muted/50 border rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium text-ink-900 mb-2">What SnapScore Does NOT Measure</p>
                  <ul className="text-sm text-ink-600 space-y-1">
                    <li>• Owner motivation or willingness to sell</li>
                    <li>• Property value or condition beyond what's cited</li>
                    <li>• Financial status of property owners</li>
                    <li>• Probability of any particular outcome</li>
                  </ul>
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
              AI-generated enforcement activity summaries
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-ink-700">
              SnapInsight summarizes enforcement records in plain language. It answers:
              <strong> "What enforcement activity is documented at this property?"</strong>
            </p>

            <div className="grid gap-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-semibold text-sm text-green-900 mb-2">✓ Good SnapInsight Example</h4>
                <p className="text-sm text-green-800 italic">
                  "Active enforcement exceeds 180-day threshold. Multiple municipal agencies involved. 
                  Structural safety citation issued."
                </p>
                <p className="text-xs text-green-700 mt-2">
                  Factual, enforcement-focused, based on documented citations.
                </p>
              </div>

              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="font-semibold text-sm text-red-900 mb-2">✗ What We Don't Show</h4>
                <p className="text-sm text-red-800 italic line-through">
                  "Tenant complained of rats. Illegal occupancy reported."
                </p>
                <p className="text-xs text-red-700 mt-2">
                  Raw city notes are never shown—only factual enforcement summaries.
                </p>
              </div>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Data Privacy: Raw municipal notes are stored internally but NEVER exposed to users.
                Only AI-generated, enforcement-focused summaries appear in the interface.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Violation Categories */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-brand" />
              Enforcement Categories
            </CardTitle>
            <CardDescription>
              Normalized categories based on municipal classification systems
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <Flame className="h-5 w-5 text-red-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-ink-900">Fire</h4>
                  <p className="text-sm text-ink-600">
                    Fire damage, smoke damage citations. High municipal priority.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <Home className="h-5 w-5 text-orange-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-ink-900">Structural</h4>
                  <p className="text-sm text-ink-600">
                    Foundation issues, roof damage, unsafe structure citations.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-ink-900">Safety</h4>
                  <p className="text-sm text-ink-600">
                    Health hazards, dangerous conditions citations.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <Wrench className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-ink-900">Utility</h4>
                  <p className="text-sm text-ink-600">
                    Electrical, plumbing, water service, HVAC citations.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <Home className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-ink-900">Exterior</h4>
                  <p className="text-sm text-ink-600">
                    Paint, siding, fencing, landscaping maintenance citations.
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

        {/* Use Cases */}
        <Card>
          <CardHeader>
            <CardTitle>Who Uses Snap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-ink-900 mb-2">Real Estate Professionals</h4>
                <p className="text-sm text-ink-600">
                  Use enforcement data as one input among many in property research and due diligence.
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-ink-900 mb-2">Municipal Staff</h4>
                <p className="text-sm text-ink-600">
                  Track enforcement patterns across jurisdictions and identify properties requiring attention.
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-ink-900 mb-2">Property Managers</h4>
                <p className="text-sm text-ink-600">
                  Monitor portfolio compliance status across multiple properties and municipalities.
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-ink-900 mb-2">Researchers</h4>
                <p className="text-sm text-ink-600">
                  Study code enforcement patterns, efficacy, and geographic distribution.
                </p>
              </div>
            </div>

            {/* Disclaimers */}
            <div className="mt-6 pt-4 border-t space-y-2">
              <p className="text-xs text-ink-500">
                SnapInsights and SnapScore are derived from public enforcement records and do not constitute 
                property valuations, predictions, or allegations about property owners.
              </p>
              <p className="text-xs text-ink-500">
                Snap is designed for research and analysis purposes. Users should conduct independent 
                due diligence and consult appropriate professionals for specific decisions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
