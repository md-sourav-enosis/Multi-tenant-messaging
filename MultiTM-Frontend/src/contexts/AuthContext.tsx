import React, { useEffect, useState } from "react";
import { getUserProfile, type User } from "../api/accounts";
import {
    loginUser as cognitoLogin,
    logoutUser as cognitoLogout,
} from "../services/cognitoService";
import { AuthContext } from "./auth-context";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        let isMounted = true;

        const restoreSession = async () => {
            try {
                const token = localStorage.getItem("accessToken");
                if (!token) {
                    if (isMounted) setUser(null);
                    return;
                }

                const profile = await getUserProfile();
                if (isMounted) setUser(profile);
            } catch (err) {
                console.error("Session restoration failed:", err);
                if (isMounted) {
                    cognitoLogout();
                    setUser(null);
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        void restoreSession();

        return () => {
            isMounted = false;
        };
    }, []);

    const login = async (email: string, password: string) => {
        await cognitoLogin(email, password);
        const profile = await getUserProfile();
        setUser(profile);
    };

    const logout = () => {
        cognitoLogout();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};