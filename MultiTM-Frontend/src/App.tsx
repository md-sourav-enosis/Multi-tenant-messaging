// src/App.tsx
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import PageRoutes from "./routes";

const queryClient = new QueryClient();

export function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <PageRoutes />
                </AuthProvider>
            </BrowserRouter>
        </QueryClientProvider>
    );
}

export default App;
