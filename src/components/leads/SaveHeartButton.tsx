import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface SaveHeartButtonProps {
  isSaved: boolean;
  onToggle: () => void;
  className?: string;
  size?: "sm" | "md";
}

export function SaveHeartButton({ isSaved, onToggle, className, size = "sm" }: SaveHeartButtonProps) {
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "p-1 rounded-full transition-all",
        isSaved
          ? "text-red-500 hover:text-red-600"
          : "text-muted-foreground/50 hover:text-red-400",
        className
      )}
      aria-label={isSaved ? "Remove from saved" : "Save property"}
    >
      <Heart
        className={cn(iconSize, "transition-all", isSaved && "fill-current")}
      />
    </button>
  );
}
