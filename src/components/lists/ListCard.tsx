import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Eye, Download, MoreHorizontal, Trash2, FolderOpen, Loader2 } from "lucide-react";

interface ListCardProps {
  list: {
    id: string;
    name: string;
    property_count: number;
    created_at: string;
  };
  isExporting: boolean;
  onExport: () => void;
  onDelete: () => void;
}

export function ListCard({ list, isExporting, onExport, onDelete }: ListCardProps) {
  const navigate = useNavigate();

  return (
    <Card className="group hover:shadow-lg hover:border-primary/20 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg font-semibold truncate">
                {list.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Created {new Date(list.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Badge 
            variant="secondary" 
            className="shrink-0 font-semibold tabular-nums"
          >
            {list.property_count.toLocaleString()} {list.property_count === 1 ? "property" : "properties"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {/* Placeholder for future description/tags */}
        <div className="h-1" />
      </CardContent>

      <CardFooter className="pt-3 border-t flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => navigate(`/lists/${list.id}`)}
          >
            <Eye className="h-4 w-4 mr-2" />
            View
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={onExport}
            disabled={isExporting || list.property_count === 0}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/lists/${list.id}`)}>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={onExport}
              disabled={list.property_count === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete List
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  );
}
