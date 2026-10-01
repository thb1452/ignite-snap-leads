import ResearchMarketingPage from "@/components/ResearchMarketingPage";

/** Legacy city-only URLs cannot identify same-name jurisdictions safely.
 * Do not resolve them to the first directory match or imply approved customer access.
 */
export default function CityViolations() {
  return <ResearchMarketingPage
    title="Market Availability Not Confirmed"
    description="Check current Snap Ignite availability. This market is not confirmed for customer access."
    path="/code-violations"
    heading="This market is not confirmed for customer access"
    introduction="We have paused market coverage pages while we verify the available records and source dates. Please include both city and state when asking about availability."
    sections={[
      { title: "Check availability", body: "Use the availability page for the current release status. A research directory entry is not a coverage guarantee." },
      { title: "Confirm the jurisdiction", body: "Include the city and state when asking about a market so same-name cities cannot be confused." },
      { title: "No notification enrolled", body: "This page does not subscribe you to market alerts. Contact hello@snapignite.com if you have a coverage question." },
    ]}
  />;
}
