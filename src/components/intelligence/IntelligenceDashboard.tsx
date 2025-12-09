import { OpportunityFunnel } from "./OpportunityFunnel";
import { HotProperties } from "./HotProperties";
import { JurisdictionStats } from "./JurisdictionStats";

interface IntelligenceDashboardProps {
  onPropertyClick?: (propertyId: string) => void;
}

export function IntelligenceDashboard({ onPropertyClick }: IntelligenceDashboardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <OpportunityFunnel />
      <HotProperties onPropertyClick={onPropertyClick} />
      <JurisdictionStats />
    </div>
  );
}

export { OpportunityFunnel } from "./OpportunityFunnel";
export { HotProperties } from "./HotProperties";
export { JurisdictionStats } from "./JurisdictionStats";
export { DistressSignals } from "./DistressSignals";
