import ResearchMarketingPage from "@/components/ResearchMarketingPage";

export default function CodeEnforcementData() {
  return <ResearchMarketingPage {...{
  "title": "Code Enforcement Data",
  "description": "Review code enforcement records with the issuing agency, event date, and resolution status in view.",
  "path": "/code-enforcement-data",
  "heading": "Code Enforcement Data",
  "introduction": "Review code enforcement records with the issuing agency, event date, and resolution status in view.",
  "sections": [
    {
      "title": "Understand the source",
      "body": "Review the issuing agency, source document, field meaning, and event date before interpreting a record."
    },
    {
      "title": "Verify the property",
      "body": "Confirm the address or parcel match and current case status. Several cases can concern one property."
    },
    {
      "title": "Check customer availability",
      "body": "Customer access, unlocks, exports, and purchases remain paused. No customer-ready market is currently approved."
    }
  ]
}} />;
}
