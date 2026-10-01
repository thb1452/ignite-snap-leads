import ResearchMarketingPage from "@/components/ResearchMarketingPage";

export default function OffMarketPropertyLeads() {
  return <ResearchMarketingPage {...{
  "title": "Research Beyond Property Listings",
  "description": "Investigate documented municipal activity alongside ownership and property research. A record does not establish whether a property is for sale.",
  "path": "/off-market-property-leads",
  "heading": "Research Beyond Property Listings",
  "introduction": "Investigate documented municipal activity alongside ownership and property research. A record does not establish whether a property is for sale.",
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
