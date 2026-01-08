import { OpportunityFunnel } from "./OpportunityFunnel";
import { HotProperties } from "./HotProperties";
import { JurisdictionStats } from "./JurisdictionStats";
import { BatchInsightsButton } from "./BatchInsightsButton";

interface IntelligenceDashboardProps {
  onPropertyClick?: (propertyId: string) => void;
}

export function IntelligenceDashboard({ onPropertyClick }: IntelligenceDashboardProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <OpportunityFunnel />
        <HotProperties onPropertyClick={onPropertyClick} />
        <JurisdictionStats />
        <BatchInsightsButton />
      </div>
    </div>
  );
}

export { OpportunityFunnel } from "./OpportunityFunnel";
export { HotProperties } from "./HotProperties";
export { JurisdictionStats } from "./JurisdictionStats";
export { DistressSignals } from "./DistressSignals";
export { BatchInsightsButton } from "./BatchInsightsButton";
