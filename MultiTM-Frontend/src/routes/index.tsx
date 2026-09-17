// src/routes/index.tsx
import { lazy, Suspense } from "react";
import { useParams, useRoutes, Navigate, type RouteObject } from "react-router-dom";
import RequireAuth from "../middleware/require-auth";

const PageLoader = () => (
    <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
);

// Lazy-loaded routes
const LoginPage = lazy(() => import("../pages/public/login"));
const RegisterPage = lazy(() => import("../pages/public/register"));
const ChatPage = lazy(() => import("../pages/private/chat"));
const InboxPage = lazy(() => import("../pages/private/inbox"));
const ConversationPage = lazy(() => import("../pages/private/conversation"));

function LegacyConversationRedirect() {
    const { conversationId } = useParams();
    return <Navigate to={`/dashboard/${conversationId ?? ""}`} replace />;
}

// Guest-only routes (Redirects to /dashboard if logged in)
const nonLoggedInStateRoutes: RouteObject[] = [
    {
        element: <RequireAuth nonLoggedInPages={true} />,
        children: [
            { path: "/login", element: <LoginPage /> },
            { path: "/register", element: <RegisterPage /> },
        ],
    },
];

// Protected routes (Redirects to /login if unauthenticated)
const loggedInStateRoutes: RouteObject[] = [
    {
        element: <RequireAuth loggedInPages={true} />,
        children: [
            { path: "/dashboard", element: <ChatPage /> },
            { path: "/inbox", element: <InboxPage /> },
            { path: "/chat/:conversationId", element: <ConversationPage /> },
            { path: "/chat", element: <Navigate to="/dashboard" replace /> },
            { path: "/chat/:conversationId", element: <LegacyConversationRedirect /> },
            { path: "/test-users", element: <Navigate to="/dashboard" replace /> },
            { path: "/", element: <Navigate to="/dashboard" replace /> },
        ],
    },
];

const routes: RouteObject[] = [
    ...nonLoggedInStateRoutes,
    ...loggedInStateRoutes,
    { path: "*", element: <Navigate to="/dashboard" replace /> },
];

const PageRoutes = () => {
    const element = useRoutes(routes);
    return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
};

export default PageRoutes;
