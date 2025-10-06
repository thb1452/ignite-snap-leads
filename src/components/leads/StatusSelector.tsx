import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StatusSelectorProps {
  onSelect: (status: string) => void;
  disabled?: boolean;
}

const STATUS_PRESETS = [
  { value: "Not Called", label: "📞 Not Called" },
  { value: "No Answer", label: "🔇 No Answer" },
  { value: "Left Voicemail", label: "📧 Left Voicemail" },
  { value: "Talked - Not Interested", label: "❌ Not Interested" },
  { value: "Talked - Interested", label: "✅ Interested" },
  { value: "Talked - Call Back Later", label: "⏰ Call Back Later" },
  { value: "Offer Sent", label: "📨 Offer Sent" },
  { value: "Under Contract", label: "📝 Under Contract" },
  { value: "Dead Lead", label: "💀 Dead Lead" },
];

export function StatusSelector({ onSelect, disabled }: StatusSelectorProps) {
  return (
    <Select onValueChange={onSelect} disabled={disabled}>
      <SelectTrigger className="rounded-xl border">
        <SelectValue placeholder="Update status..." />
      </SelectTrigger>
      <SelectContent>
        {STATUS_PRESETS.map((preset) => (
          <SelectItem key={preset.value} value={preset.value}>
            {preset.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
