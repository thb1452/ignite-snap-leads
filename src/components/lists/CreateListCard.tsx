import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";

interface CreateListCardProps {
  onClick: () => void;
}

export function CreateListCard({ onClick }: CreateListCardProps) {
  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 bg-muted/30 hover:bg-primary/5 transition-all duration-200 flex flex-col items-center justify-center min-h-[180px]"
    >
      <div className="p-3 rounded-full bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
        <Plus className="h-6 w-6" />
      </div>
      <p className="mt-3 font-semibold text-foreground">Create New List</p>
      <p className="text-sm text-muted-foreground mt-1">
        Start organizing your leads
      </p>
    </Card>
  );
}
