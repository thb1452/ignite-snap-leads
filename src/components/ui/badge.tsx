import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border font-bold transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        "score-low": "border-transparent bg-score-low text-score-low-foreground hover:scale-105",
        "score-medium": "border-transparent bg-score-medium text-score-medium-foreground hover:scale-105 shadow-md",
        "score-high": "border-transparent bg-score-high text-score-high-foreground hover:scale-105 shadow-lg animate-pulse",
      },
      size: {
        default: "h-8 w-8 text-xs px-2.5 py-0.5",
        sm: "h-6 w-6 text-xs",
        md: "h-12 w-12 text-base",
        lg: "h-16 w-16 text-xl",
        xl: "h-20 w-20 text-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
