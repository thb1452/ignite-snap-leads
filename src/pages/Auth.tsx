import { AuthForm } from "@/components/auth/AuthForm";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function Auth() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Only redirect if user is logged in and roles are loaded
    if (!loading && user && roles.length > 0) {
      if (roles.includes('va')) {
        navigate('/va-dashboard');
      } else if (roles.includes('admin')) {
        navigate('/leads');
      } else {
        navigate('/leads');
      }
    }
  }, [user, roles, loading, navigate]);

  // Show auth form if not logged in or still loading
  return <AuthForm />;
}
