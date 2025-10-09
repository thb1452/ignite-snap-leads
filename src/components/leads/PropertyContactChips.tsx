import { Phone, Mail, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PropertyContactChipsProps {
  contactCount: number;
  hasPhone: boolean;
  hasEmail: boolean;
  isTracing?: boolean;
}

export function PropertyContactChips({
  contactCount,
  hasPhone,
  hasEmail,
  isTracing,
}: PropertyContactChipsProps) {
  if (isTracing) {
    return (
      <Badge variant="secondary" className="gap-1">
        <span className="animate-pulse">⏳</span>
        <span className="text-xs">Tracing...</span>
      </Badge>
    );
  }

  if (contactCount === 0) {
    return null;
  }

  if (hasPhone && hasEmail) {
    return (
      <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
        <Phone className="h-3 w-3" />
        <Mail className="h-3 w-3" />
        <span className="text-xs font-medium">{contactCount}</span>
      </Badge>
    );
  }

  if (hasPhone) {
    return (
      <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
        <Phone className="h-3 w-3" />
        <span className="text-xs font-medium">{contactCount}</span>
      </Badge>
    );
  }

  if (hasEmail) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Mail className="h-3 w-3" />
        <span className="text-xs font-medium">{contactCount}</span>
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1">
      <AlertCircle className="h-3 w-3" />
      <span className="text-xs">No match</span>
    </Badge>
  );
}
