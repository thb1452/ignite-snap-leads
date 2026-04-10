import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Send, Loader2 } from "lucide-react";
import { format } from "date-fns";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  in_progress: "default",
  added: "outline",
  rejected: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  added: "Available",
  rejected: "Not Available",
};

export function MarketRequestSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [marketName, setMarketName] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["market-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const submitMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from("market_requests")
        .insert({ market_name: name.trim(), user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Request received! We'll email you when ${marketName.trim()} is available.`);
      setMarketName("");
      queryClient.invalidateQueries({ queryKey: ["market-requests", user?.id] });
    },
    onError: () => {
      toast.error("Failed to submit request. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = marketName.trim();
    if (!trimmed) return;
    if (trimmed.length < 3 || trimmed.length > 100) {
      toast.error("Please enter a valid city and state (3–100 characters).");
      return;
    }
    submitMutation.mutate(trimmed);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Request a New Market
        </CardTitle>
        <CardDescription>
          Don't see your area? Tell us where you need data coverage and we'll prioritize it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="e.g. Austin, TX"
            value={marketName}
            onChange={(e) => setMarketName(e.target.value)}
            maxLength={100}
            className="flex-1"
          />
          <Button type="submit" disabled={submitMutation.isPending || !marketName.trim()} size="sm">
            {submitMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Submit</span>
          </Button>
        </form>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading requests…</p>
        ) : requests.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Your Requests
            </p>
            <ul className="divide-y divide-border rounded-md border">
              {requests.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium">{r.market_name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "MMM d, yyyy")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
