import { Navigate, useLocation } from "react-router-dom";

export default function LeadsRedirect() {
  const location = useLocation();
  return <Navigate to={`/properties${location.search}`} replace />;
}
