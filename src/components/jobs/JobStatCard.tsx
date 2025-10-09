import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface JobStatCardProps {
  title: string;
  value: number;
  hint?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export function JobStatCard({ title, value, hint, variant = 'default' }: JobStatCardProps) {
  const variantClasses = {
    default: 'text-foreground',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    error: 'text-red-600',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {title}
          {hint && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{hint}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${variantClasses[variant]}`}>
          {value.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}
