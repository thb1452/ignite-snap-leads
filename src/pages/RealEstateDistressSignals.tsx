import ResearchMarketingPage from "@/components/ResearchMarketingPage";

export default function RealEstateDistressSignals() {
  return <ResearchMarketingPage {...{
  "title": "Understanding Municipal Enforcement Signals",
  "description": "Learn what code violations, notices, and utility records do and do not establish about a property.",
  "path": "/real-estate-distress-signals",
  "heading": "Understand the record before interpreting the signal",
  "introduction": "A violation, fine, repeat notice, or utility action can guide further investigation. None of these alone proves financial distress or willingness to sell.",
  "sections": [
    {
      "title": "Code violations and notices",
      "body": "Check what was cited, when it was filed, and whether the agency recorded a resolution. The import date is not the filing date."
    },
    {
      "title": "Fines and repeated cases",
      "body": "Review the actual case history and amounts. Repeated records may be updates or duplicates rather than new enforcement actions."
    },
    {
      "title": "Utility and other records",
      "body": "Utility disconnections may have several explanations. Do not infer vacancy, abandonment, finances, or seller intent without corroborating evidence."
    }
  ]
}} />;
}
