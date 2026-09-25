import ResearchMarketingPage from "@/components/ResearchMarketingPage";

export default function HowInvestorsFindDistressedProperties() {
  return <ResearchMarketingPage {...{
  "title": "How Investors Research Properties",
  "description": "Use municipal records as one part of property research. An enforcement action is not proof of financial distress or a desire to sell.",
  "path": "/how-investors-find-distressed-properties",
  "heading": "How Investors Research Properties",
  "introduction": "Use municipal records as one part of property research. An enforcement action is not proof of financial distress or a desire to sell.",
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
