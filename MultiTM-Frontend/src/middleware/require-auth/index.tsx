import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";

interface RequireAuthProps {
  nonLoggedInPages?: boolean;
  loggedInPages?: boolean;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({
  nonLoggedInPages,
  loggedInPages,
}) => {
    const { user, loading } = useAuth();
    const isAuthenticated = !!user;

  // Show a loading indicator while session/token verification is pending
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // 1. Guest-only pages (e.g., /login, /register)
  if (nonLoggedInPages) {
    if (isAuthenticated) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Outlet />;
  }

  // 2. Protected pages (e.g., /chat, /profile)
  if (loggedInPages) {
    if (isAuthenticated) {
      return <Outlet />;
    }
    return <Navigate to="/login" replace />;
  }

  // 3. Universal / All-state pages
  return <Outlet />;
};

export default RequireAuth;