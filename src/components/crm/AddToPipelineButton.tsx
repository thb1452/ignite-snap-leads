import { Button, type ButtonProps } from "@/components/ui/button";
import { Briefcase, Check, Loader2 } from "lucide-react";
import { useAddToPipeline, useLeads } from "@/hooks/useLeads";
import { useNavigate } from "react-router-dom";

interface AddToPipelineButtonProps extends Omit<ButtonProps, "onClick"> {
  propertyId: string;
  source?: string;
  label?: string;
}

export function AddToPipelineButton({
  propertyId,
  source = "manual",
  label = "Add to Pipeline",
  variant = "outline",
  size = "sm",
  className,
  ...rest
}: AddToPipelineButtonProps) {
  const navigate = useNavigate();
  const { data: leads } = useLeads();
  const { mutate, isPending } = useAddToPipeline();

  const existing = leads?.find((l) => l.property_id === propertyId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (existing) {
      navigate(`/crm/leads/${existing.id}`);
      return;
    }
    mutate(
      { propertyId, source },
      {
        onSuccess: (lead) => {
          if (lead?.id) navigate(`/crm/leads/${lead.id}`);
        },
      },
    );
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={isPending}
      {...rest}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : existing ? (
        <Check className="h-4 w-4" />
      ) : (
        <Briefcase className="h-4 w-4" />
      )}
      {existing ? "In Pipeline" : label}
    </Button>
  );
}
