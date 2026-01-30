import { FolderOpen, Building2 } from "lucide-react";

interface ListsHeaderProps {
  listCount: number;
  totalProperties: number;
}

export function ListsHeader({ listCount, totalProperties }: ListsHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 bg-muted/50 rounded-xl border">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Lists</h1>
        <p className="text-muted-foreground mt-0.5">
          Organize and manage your lead collections
        </p>
      </div>

      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <FolderOpen className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{listCount}</p>
            <p className="text-xs text-muted-foreground">Lists</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-secondary">
            <Building2 className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{totalProperties.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Properties</p>
          </div>
        </div>
      </div>
    </div>
  );
}
