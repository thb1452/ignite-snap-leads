import { UserSearch } from "lucide-react";

interface OwnerContactSectionProps {
  propertyId: string;
  isUnlocked: boolean;
}

export function OwnerContactSection({ propertyId, isUnlocked }: OwnerContactSectionProps) {
  if (!isUnlocked) return null;

  return (
    <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <UserSearch className="h-4 w-4 shrink-0" />
        <span className="font-medium">Owner Contact Info</span>
        <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full">Coming Soon</span>
      </div>
      <p className="text-xs text-muted-foreground/70 mt-1.5">
        Skip tracing will be available here — owner name, phone, and email.
      </p>
    </div>
  );
}
