import ResearchMarketingPage from "@/components/ResearchMarketingPage";

export default function MunicipalEnforcementData() {
  return <ResearchMarketingPage {...{
  "title": "Municipal Enforcement Data",
  "description": "Municipal records can include citations, compliance notices, and agency actions. Their scope and update timing vary by source.",
  "path": "/municipal-enforcement-data",
  "heading": "Municipal Enforcement Data",
  "introduction": "Municipal records can include citations, compliance notices, and agency actions. Their scope and update timing vary by source.",
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
