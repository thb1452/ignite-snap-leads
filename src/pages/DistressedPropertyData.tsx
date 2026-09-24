import ResearchMarketingPage from "@/components/ResearchMarketingPage";

export default function DistressedPropertyData() {
  return <ResearchMarketingPage {...{
  "title": "Property Research with Municipal Enforcement Data",
  "description": "Understand how municipal enforcement records can inform property research. Coverage and customer access are under review.",
  "path": "/distressed-property-data",
  "heading": "A clearer source trail for property research",
  "introduction": "Code violations and other municipal records add context to a property investigation. Review the evidence before drawing conclusions about distress.",
  "sections": [
    {
      "title": "Source context",
      "body": "Use the issuing agency, source document, and event date to understand what a record actually says."
    },
    {
      "title": "Property matching",
      "body": "An address or parcel match needs verification. Several cases may refer to the same property; case counts are not property counts."
    },
    {
      "title": "Research workflow",
      "body": "Compare the source evidence with your own observations and ownership research. Unlocks and exports remain paused during the relaunch review."
    }
  ]
}} />;
}
