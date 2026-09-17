// src/api/accounts.ts
import type { AxiosInstance } from "axios";
import api from "../request";
import { API_ENDPOINTS } from "../../constants/api-endpoints";

export interface Tenant {
    id: string;
    name: string;
}

export interface User {
    id: string;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    tenant: Tenant;
}

export interface RegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  tenant_mode: "join" | "create";
  tenant_id?: string;
  tenant_name?: string;
}

/**
 * Fetches seeded users along with their tenant details for testing.
 */
export async function getTestUsers(
    authenticatedApi?: AxiosInstance,
    signal?: AbortSignal,
): Promise<User[]> {
    const apiInstance = authenticatedApi ?? api;

    const { data } = await apiInstance.get<User[]>(API_ENDPOINTS.TEST_USERS, {
        signal,
    });

    return data;
}

/**
 * Fetches the currently authenticated user's profile from Django (/api/accounts/me/).
 */
export async function getUserProfile(
    authenticatedApi?: AxiosInstance,
    signal?: AbortSignal,
): Promise<User> {
    const apiInstance = authenticatedApi ?? api;

    const { data } = await apiInstance.get<User>(
        API_ENDPOINTS.ME ?? "/accounts/me/",
        { signal },
    );

    return data;
}

/**
 * Fetches existing tenants for public registration selection.
 */
export async function getPublicTenants(): Promise<Tenant[]> {
  const { data } = await api.get<Tenant[]>("/accounts/tenants/");
  return data;
}

/**
 * Registers a new user account.
 */
export async function registerUser(payload: RegisterPayload): Promise<void> {
  await api.post("/accounts/register/", payload);
}
