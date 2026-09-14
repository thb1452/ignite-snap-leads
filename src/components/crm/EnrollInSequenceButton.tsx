import { Button } from "@/components/ui/button";
import { Pause } from "lucide-react";

interface Props {
  leadId: string;
  defaultPhone?: string | null;
}

export function EnrollInSequenceButton(_props: Props) {
  return (
    <div className="space-y-1">
      <Button variant="outline" size="sm" disabled>
        <Pause className="h-4 w-4 mr-1" />Messaging on hold
      </Button>
      <p className="text-xs text-muted-foreground">
        CRM intake does not enroll contacts in SMS. Enrollment is held while connections are verified.
      </p>
    </div>
  );
}
