import { Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useSavedProperties } from "@/hooks/useSavedProperties";
import { useNavigate } from "react-router-dom";

export function SavedPropertiesCard() {
  const { savedCount, isLoading } = useSavedProperties();
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-red-200 dark:border-red-800/40"
      onClick={() => navigate("/saved")}
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
            <Heart className="h-4 w-4 text-red-500 fill-current" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">My Saved Properties</h3>
            <p className="text-xs text-muted-foreground">Your favorited leads</p>
          </div>
        </div>
        <div className="text-2xl font-bold">
          {isLoading ? "..." : savedCount.toLocaleString()}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {savedCount === 1 ? "property" : "properties"} saved
        </p>
      </CardContent>
    </Card>
  );
}
