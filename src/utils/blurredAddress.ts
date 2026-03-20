import { formatAddress, formatCity } from "./formatAddress";

interface PropertyForBlur {
  address: string;
  street_number?: string | null;
  street_name?: string | null;
  city: string;
  state: string;
  zip: string;
}

/**
 * Returns a display-ready address string.
 * - Unlocked: full address (e.g. "123 Main ST, Austin, TX 78701")
 * - Locked: street name only (e.g. "Main ST, Austin, TX 78701")
 */
export function formatBlurredAddress(
  property: PropertyForBlur,
  isUnlocked: boolean
): string {
  if (isUnlocked) {
    return `${formatAddress(property.address)}, ${formatCity(property.city)}, ${property.state} ${property.zip}`;
  }

  // Use street_name if available; otherwise strip leading numbers from address
  const streetName = property.street_name
    ? formatAddress(property.street_name)
    : formatAddress(property.address.replace(/^\s*\d+\S*\s+/, ""));

  return `${streetName}, ${formatCity(property.city)}, ${property.state} ${property.zip}`;
}

/**
 * Returns just the street portion for display.
 * - Unlocked: full street (e.g. "123 Main ST")
 * - Locked: street name only (e.g. "Main ST")
 */
export function formatBlurredStreet(
  property: PropertyForBlur,
  isUnlocked: boolean
): string {
  if (isUnlocked) {
    return formatAddress(property.address);
  }

  const streetName = property.street_name
    ? formatAddress(property.street_name)
    : formatAddress(property.address.replace(/^\s*\d+\S*\s+/, ""));

  return streetName;
}
