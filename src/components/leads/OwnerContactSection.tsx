import { User, Phone, Mail, MapPin, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePropertyContacts } from "@/hooks/usePropertyContacts";
import { formatContactName } from "@/utils/formatContactName";

interface OwnerContactSectionProps {
  propertyId: string;
  isUnlocked: boolean;
}

export function OwnerContactSection({ propertyId, isUnlocked }: OwnerContactSectionProps) {
  const { data: contacts, isLoading } = usePropertyContacts(propertyId);

  if (!isUnlocked) return null;

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Fetching owner info...</span>
        </div>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  // Filter to contacts that have at least a name
  const validContacts = contacts?.filter(c => c.name) ?? [];

  if (validContacts.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Contact not available</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <h3 className="font-semibold text-foreground text-sm">👤 Owner Contact</h3>
      {validContacts.map((contact, idx) => (
        <div key={contact.id || idx} className="space-y-2">
          {contact.name && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">
                {formatContactName(contact.name)} <span className="text-muted-foreground font-normal">(Owner)</span>
              </span>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <a
                href={`tel:${contact.phone}`}
                className="text-sm text-primary hover:underline font-medium"
              >
                {formatPhone(contact.phone)}
              </a>
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <a
                href={`mailto:${contact.email}`}
                className="text-sm text-primary hover:underline"
              >
                {contact.email}
              </a>
            </div>
          )}
          {idx < validContacts.length - 1 && (
            <div className="border-t my-2" />
          )}
        </div>
      ))}
    </div>
  );
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}
