import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="grid h-full place-items-center text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Loading your workspace...
      </div>
    );
  }

  if (status === "guest") return <Navigate to="/login" replace />;

  return <Outlet />;
}
