import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};
