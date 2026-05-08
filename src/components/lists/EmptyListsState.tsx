import { Button } from "@/components/ui/button";
import { FolderOpen, Plus } from "lucide-react";

interface EmptyListsStateProps {
  onCreateClick: () => void;
}

export function EmptyListsState({ onCreateClick }: EmptyListsStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="p-4 rounded-full bg-muted mb-4">
        <FolderOpen className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">No lists yet</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Group properties into focused lists — neighborhoods, markets, or active campaigns — to track how their enforcement signals evolve between visits. Use "Add All to List" from the Properties page to populate one fast.
      </p>
      <Button size="lg" onClick={onCreateClick}>
        <Plus className="h-5 w-5 mr-2" />
        Create Your First List
      </Button>
    </div>
  );
}
