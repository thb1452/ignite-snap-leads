import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJurisdictions } from "@/hooks/useJurisdictions";

interface JurisdictionFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function JurisdictionFilter({ value, onChange }: JurisdictionFilterProps) {
  const { data: jurisdictions, isLoading } = useJurisdictions();

  return (
    <div className="space-y-2">
      <Label htmlFor="jurisdiction-filter">Jurisdiction</Label>
      <Select
        value={value || "all"}
        onValueChange={(val) => onChange(val === "all" ? null : val)}
      >
        <SelectTrigger id="jurisdiction-filter">
          <SelectValue placeholder={isLoading ? "Loading..." : "All Jurisdictions"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Jurisdictions</SelectItem>
          {jurisdictions?.map((jurisdiction) => (
            <SelectItem key={jurisdiction.id} value={jurisdiction.id}>
              {jurisdiction.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
