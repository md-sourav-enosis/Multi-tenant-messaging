// src/pages/public/register/index.tsx
import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
    getPublicTenants,
    registerUser,
    type Tenant,
} from "../../../api/accounts";
import { useAuth } from "../../../contexts/useAuth";

export const RegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [tenantMode, setTenantMode] = useState<"join" | "create">("join");

    const [formData, setFormData] = useState({
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        tenant_id: "",
        tenant_name: "",
    });

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        getPublicTenants()
            .then((data) => {
                setTenants(data);
                if (data.length > 0) {
                    setFormData((prev) => ({ ...prev, tenant_id: data[0].id }));
                }
            })
            .catch((err) => console.error("Failed to load tenants", err));
    }, []);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await registerUser({
                email: formData.email,
                password: formData.password,
                first_name: formData.first_name,
                last_name: formData.last_name,
                tenant_mode: tenantMode,
                tenant_id:
                    tenantMode === "join" ? formData.tenant_id : undefined,
                tenant_name:
                    tenantMode === "create" ? formData.tenant_name : undefined,
            });

            // Auto login user after registration
            await login(formData.email, formData.password);
            navigate("/dashboard");
        } catch (err: any) {
            const respData = err.response?.data;
            if (respData) {
                const firstKey = Object.keys(respData)[0];
                const val = respData[firstKey];
                setError(
                    Array.isArray(val)
                        ? val[0]
                        : typeof val === "string"
                          ? val
                          : "Registration failed.",
                );
            } else {
                setError("Registration failed. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#f4f7f7] px-5 py-10 text-[#1d2939] sm:px-8">
            <div className="w-full max-w-xl rounded-2xl border border-[#dfeae6] bg-white p-6 shadow-[0_18px_55px_rgb(38_78_68_/_10%)] sm:p-8">
                <div className="mb-7 text-center">
                    <div className="mx-auto mb-4 grid size-12 place-items-center rounded-[14px] bg-[#126b5b] text-xl font-bold text-white shadow-[0_8px_20px_rgb(18_107_91_/_18%)]">
                        M
                    </div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#678079]">
                        Multi-tenant messaging
                    </p>
                    <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#152c2a]">
                        Create your account
                    </h2>
                    <p className="mt-1 text-sm text-[#71817d]">
                        Join an organization or create a new one
                    </p>
                </div>

                {error && (
                    <div className="mb-5 rounded-[9px] border border-[#f3c9c3] bg-[#fff0ed] p-3 text-sm text-[#a13b35]">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#51645f]">
                                First Name
                            </label>
                            <input
                                type="text"
                                name="first_name"
                                value={formData.first_name}
                                onChange={handleChange}
                                required
                                className="w-full rounded-xl border border-[#d9e4e0] bg-[#fbfdfc] px-3.5 py-3 text-sm text-[#18312e] outline-0 focus:border-[#419b88] focus:ring-4 focus:ring-[#419b88]/15"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#51645f]">
                                Last Name
                            </label>
                            <input
                                type="text"
                                name="last_name"
                                value={formData.last_name}
                                onChange={handleChange}
                                required
                                className="w-full rounded-xl border border-[#d9e4e0] bg-[#fbfdfc] px-3.5 py-3 text-sm text-[#18312e] outline-0 focus:border-[#419b88] focus:ring-4 focus:ring-[#419b88]/15"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#51645f]">
                            Email Address
                        </label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="w-full rounded-xl border border-[#d9e4e0] bg-[#fbfdfc] px-3.5 py-3 text-sm text-[#18312e] outline-0 focus:border-[#419b88] focus:ring-4 focus:ring-[#419b88]/15"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#51645f]">
                            Password
                        </label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            minLength={8}
                            className="w-full rounded-xl border border-[#d9e4e0] bg-[#fbfdfc] px-3.5 py-3 text-sm text-[#18312e] outline-0 focus:border-[#419b88] focus:ring-4 focus:ring-[#419b88]/15"
                        />
                    </div>

                    <div className="border-t border-[#e8efed] pt-4">
                        <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#51645f]">
                            Organization Options
                        </label>
                        <div className="flex gap-4 mb-3">
                            <label className="flex cursor-pointer items-center text-sm text-[#38524b]">
                                <input
                                    type="radio"
                                    name="tenantMode"
                                    checked={tenantMode === "join"}
                                    onChange={() => setTenantMode("join")}
                                    className="mr-2"
                                />
                                Join Existing
                            </label>
                            <label className="flex cursor-pointer items-center text-sm text-[#38524b]">
                                <input
                                    type="radio"
                                    name="tenantMode"
                                    checked={tenantMode === "create"}
                                    onChange={() => setTenantMode("create")}
                                    className="mr-2"
                                />
                                Create New
                            </label>
                        </div>

                        {tenantMode === "join" ? (
                            <div>
                                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#678079]">
                                    Select Tenant
                                </label>
                                <select
                                    name="tenant_id"
                                    value={formData.tenant_id}
                                    onChange={handleChange}
                                    required
                                    className="w-full rounded-xl border border-[#d9e4e0] bg-white px-3.5 py-3 text-sm text-[#18312e] outline-0 focus:border-[#419b88] focus:ring-4 focus:ring-[#419b88]/15"
                                >
                                    {tenants.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div>
                                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#678079]">
                                    New Tenant Name
                                </label>
                                <input
                                    type="text"
                                    name="tenant_name"
                                    value={formData.tenant_name}
                                    onChange={handleChange}
                                    placeholder="e.g. Stark Industries"
                                    required
                                    className="w-full rounded-xl border border-[#d9e4e0] bg-[#fbfdfc] px-3.5 py-3 text-sm text-[#18312e] outline-0 focus:border-[#419b88] focus:ring-4 focus:ring-[#419b88]/15"
                                />
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 w-full cursor-pointer rounded-xl bg-[#126b5b] py-3 font-bold text-white transition hover:bg-[#0d5548] disabled:cursor-wait disabled:opacity-50"
                    >
                        {loading ? "Registering..." : "Sign Up"}
                    </button>
                </form>

                <p className="pt-2 text-center text-xs text-[#71817d]">
                    Already have an account?{" "}
                    <Link
                        to="/login"
                        className="font-bold text-[#126b5b] hover:underline"
                    >
                        Sign In
                    </Link>
                </p>
            </div>
        </main>
    );
};

export default RegisterPage;
