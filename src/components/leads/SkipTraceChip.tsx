import { Phone, Mail, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SkipTraceChipProps {
  phoneCount: number;
  emailCount: number;
  status?: "success" | "partial" | "no_match" | "pending";
  className?: string;
}

export function SkipTraceChip({ phoneCount, emailCount, status, className }: SkipTraceChipProps) {
  if (phoneCount === 0 && emailCount === 0 && !status) {
    return null;
  }

  // Determine chip variant
  const variant = status || (phoneCount > 0 ? "success" : emailCount > 0 ? "partial" : "no_match");

  const chipClasses = cn(
    "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
    {
      "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400": variant === "success",
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400": variant === "partial",
      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400": variant === "no_match",
      "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400": variant === "pending",
    },
    className
  );

  if (variant === "pending") {
    return (
      <span className={chipClasses}>
        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        Processing...
      </span>
    );
  }

  if (variant === "no_match") {
    return (
      <span className={chipClasses}>
        <AlertCircle className="w-3 h-3" />
        No match
      </span>
    );
  }

  return (
    <span className={chipClasses}>
      {phoneCount > 0 && (
        <>
          <Phone className="w-3 h-3" />
          <span>{phoneCount}</span>
        </>
      )}
      {emailCount > 0 && (
        <>
          <Mail className="w-3 h-3" />
          <span>{emailCount}</span>
        </>
      )}
    </span>
  );
}
