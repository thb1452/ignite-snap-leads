import ResearchMarketingPage from "@/components/ResearchMarketingPage";

export default function CityViolationsIndex() {
  return <ResearchMarketingPage
    title="Market Availability"
    description="Check Snap Ignite customer market availability. Markets are undergoing source and delivery verification before release."
    path="/code-violations"
    heading="Market availability"
    introduction="Customer coverage is being verified. No market is currently available for customer record access."
    sections={[
      { title: "No approved customer market yet", body: "We will identify each released market explicitly. We are not promising nationwide coverage or a release date." },
      { title: "Source dates matter", body: "Future coverage details will distinguish the source report date, individual event dates, and when Snap received the records." },
      { title: "Ask about a market", body: "Email hello@snapignite.com with your city and state. Sending a question does not enroll you in automatic alerts or guarantee coverage." },
    ]}
  />;
}
