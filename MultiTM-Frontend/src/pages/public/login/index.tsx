// src/pages/public/login/index.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/useAuth";

export const LoginPage: React.FC = () => {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            await login(email, password);
            navigate("/dashboard");
        } catch (err: unknown) {
            let message = "Failed to log in. Check credentials.";

            if (typeof err === "object" && err !== null && "message" in err) {
                message = (err as { message: string }).message;
            } else if (typeof err === "string") {
                message = err;
            }

            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#f4f7f7] px-5 py-10 text-[#1d2939] sm:px-8">
            <div className="w-full max-w-md rounded-2xl border border-[#dfeae6] bg-white p-6 shadow-[0_18px_55px_rgb(38_78_68_/_10%)] sm:p-8">
                <div className="mb-7 text-center">
                    <div className="mx-auto mb-4 grid size-12 place-items-center rounded-[14px] bg-[#126b5b] text-xl font-bold text-white shadow-[0_8px_20px_rgb(18_107_91_/_18%)]">
                        M
                    </div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#678079]">
                        Multi-tenant messaging
                    </p>
                    <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#152c2a]">
                        Welcome back
                    </h2>
                    <p className="mt-1 text-sm text-[#71817d]">
                        Sign in to continue to your conversations
                    </p>
                </div>

                {error && (
                    <div className="mb-5 rounded-[9px] border border-[#f3c9c3] bg-[#fff0ed] p-3 text-sm text-[#a13b35]">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#51645f]">
                            Email Address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full rounded-xl border border-[#d9e4e0] bg-[#fbfdfc] px-3.5 py-3 text-sm text-[#18312e] outline-0 transition placeholder:text-[#9aaba6] focus:border-[#419b88] focus:ring-4 focus:ring-[#419b88]/15"
                            placeholder="alice@acme.com"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#51645f]">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full rounded-xl border border-[#d9e4e0] bg-[#fbfdfc] px-3.5 py-3 text-sm text-[#18312e] outline-0 transition placeholder:text-[#9aaba6] focus:border-[#419b88] focus:ring-4 focus:ring-[#419b88]/15"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full cursor-pointer rounded-xl bg-[#126b5b] py-3 font-bold text-white transition hover:bg-[#0d5548] disabled:cursor-wait disabled:opacity-50"
                    >
                        {submitting ? "Signing in..." : "Sign In"}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate("/register")}
                        className="mt-2 w-full cursor-pointer rounded-xl border border-[#cbe9e0] bg-[#edf8f4] py-3 font-bold text-[#126b5b] transition hover:bg-[#d9eee8]"
                    >
                        Create an Account
                    </button>
                </form>
            </div>
        </main>
    );
};

export default LoginPage;
