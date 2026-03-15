import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { ListEnrichment } from "@/pages/ListEnrichment";

export default function EnrichGate() {
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (isAdmin === false) {
      toast({
        title: "Coming Soon!",
        description: "Scan is coming soon!",
      });
      navigate("/properties", { replace: true });
    }
  }, [isAdmin, navigate, toast]);

  if (!isAdmin) return null;

  return <ListEnrichment />;
}
