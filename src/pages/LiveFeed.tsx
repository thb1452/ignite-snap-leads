import ResearchMarketingPage from "@/components/ResearchMarketingPage";

export default function LiveFeed() {
  return <ResearchMarketingPage title="Enforcement Record Updates" description="Customer record updates are paused while Snap Ignite verifies market availability." path="/live-feed" heading="Record updates are paused" introduction="There is no verified customer live feed available during relaunch preparation." sections={[
    { title: "Source events", body: "The filing date describes the event reported by an agency. It is not necessarily when Snap received a record." },
    { title: "Record updates", body: "An imported update may concern an old case. We do not label ingestion as a new enforcement filing." },
    { title: "Market availability", body: "Update frequency depends on the source. No real-time feed or customer-ready market is currently promised." },
  ]} />;
}
