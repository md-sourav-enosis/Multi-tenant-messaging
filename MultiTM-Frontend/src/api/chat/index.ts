import axios, { type AxiosInstance } from "axios";
import api from "../request";
import { API_ENDPOINTS } from "../../constants/api-endpoints";
import type { User } from "../accounts";

export interface Conversation {
    id: string;
    participants?: Array<User | ChatUser>;
    participant?: User | ChatUser;
    other_user?: User | ChatUser;
    participant_name?: string;
    participant_email?: string;
    tenant_name?: string;
    last_message?: string | ChatMessage | null;
    last_activity?: string;
    updated_at?: string;
    unread_count?: number;
    starred?: boolean;
}

export interface ChatUser {
    id: string;
    display_name: string;
    email: string;
    tenant_name: string;
}

export interface ChatMessage {
    id: string;
    text: string;
    sender_id?: string | number;
    sender_email?: string;
    sender_username?: string;
    sender?: ChatUser | User | string;
    created_at?: string;
    is_read?: boolean;
    read?: boolean;
}

export interface ExportTask {
    task_id: string;
    status_url: string;
    download_url: string;
}

interface ExportStatus {
    status: "PENDING" | "STARTED" | "SUCCESS" | "FAILURE";
    detail?: string;
    download_url?: string;
}

interface PaginatedUsers {
    results: ChatUser[];
}

export async function searchChatUsers(
    query: string,
    signal?: AbortSignal,
    authenticatedApi?: AxiosInstance,
): Promise<ChatUser[]> {
    const apiInstance = authenticatedApi ?? api;
    const { data } = await apiInstance.get<ChatUser[] | PaginatedUsers>(
        API_ENDPOINTS.CHAT_USER_SEARCH,
        { params: { q: query }, signal },
    );

    return Array.isArray(data) ? data : data.results;
}

export async function createOrOpenConversation(
    userId: string,
    authenticatedApi?: AxiosInstance,
): Promise<Conversation> {
    const apiInstance = authenticatedApi ?? api;
    const { data } = await apiInstance.post<Conversation>(
        API_ENDPOINTS.CHAT_CONVERSATIONS,
        { user_id: userId },
    );

    return data;
}

export async function getInbox(
    authenticatedApi?: AxiosInstance,
): Promise<Conversation[]> {
    const apiInstance = authenticatedApi ?? api;
    const { data } = await apiInstance.get<Conversation[]>(
        API_ENDPOINTS.CHAT_INBOX,
    );

    return data;
}

export async function getConversationMessages(
    conversationId: string,
    signal?: AbortSignal,
    authenticatedApi?: AxiosInstance,
): Promise<ChatMessage[]> {
    const apiInstance = authenticatedApi ?? api;
    const { data } = await apiInstance.get<ChatMessage[]>(
        `/chat/conversations/${conversationId}/messages/`,
        { signal },
    );

    return data;
}

export async function markConversationRead(
    conversationId: string,
    authenticatedApi?: AxiosInstance,
): Promise<void> {
    const apiInstance = authenticatedApi ?? api;
    await apiInstance.post(`/chat/conversations/${conversationId}/read/`);
}

export async function setConversationStarred(
    conversationId: string,
    starred: boolean,
    authenticatedApi?: AxiosInstance,
): Promise<Conversation> {
    const apiInstance = authenticatedApi ?? api;
    const action = starred ? "star" : "unstar";
    const endpoint = `/chat/conversations/${conversationId}/${action}`;

    try {
        const { data } = await apiInstance.post<Conversation>(`${endpoint}/`);
        return data;
    } catch (error: unknown) {
        if (!axios.isAxiosError(error) || error.response?.status !== 404) {
            throw error;
        }

        const { data } = await apiInstance.post<Conversation>(endpoint);
        return data;
    }
}

export async function requestConversationExport(
    authenticatedApi?: AxiosInstance,
): Promise<ExportTask> {
    const apiInstance = authenticatedApi ?? api;
    const { data } = await apiInstance.post<ExportTask>("/chat/exports/");
    return data;
}

export async function waitForConversationExport(
    task: ExportTask,
    signal?: AbortSignal,
    authenticatedApi?: AxiosInstance,
): Promise<string> {
    const apiInstance = authenticatedApi ?? api;

    while (!signal?.aborted) {
        const { data } = await apiInstance.get<ExportStatus>(
            normalizeApiEndpoint(task.status_url),
            { signal },
        );

        if (data.status === "SUCCESS") {
            return normalizeApiEndpoint(data.download_url ?? task.download_url);
        }

        if (data.status === "FAILURE") {
            throw new Error(data.detail ?? "Export failed.");
        }

        await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(resolve, 1000);
            signal?.addEventListener(
                "abort",
                () => {
                    window.clearTimeout(timeout);
                    reject(new DOMException("Export cancelled", "AbortError"));
                },
                { once: true },
            );
        });
    }

    throw new DOMException("Export cancelled", "AbortError");
}

export async function downloadConversationExport(
    downloadUrl: string,
    authenticatedApi?: AxiosInstance,
): Promise<void> {
    const apiInstance = authenticatedApi ?? api;
    const response = await apiInstance.get<Blob>(
        normalizeApiEndpoint(downloadUrl),
        {
        responseType: "blob",
        },
    );
    const objectUrl = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "conversations.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

function normalizeApiEndpoint(endpoint: string): string {
    if (/^https?:\/\//i.test(endpoint)) return endpoint;

    const configuredApiUrl = import.meta.env.VITE_API_URL;
    if (!configuredApiUrl) return endpoint;

    const basePath = new URL(configuredApiUrl, window.location.origin).pathname
        .replace(/\/$/, "");
    const normalizedEndpoint = endpoint.startsWith("/")
        ? endpoint
        : `/${endpoint}`;

    if (basePath && normalizedEndpoint === basePath) return "/";
    if (basePath && normalizedEndpoint.startsWith(`${basePath}/`)) {
        return normalizedEndpoint.slice(basePath.length);
    }

    return normalizedEndpoint;
}

export function getChatWebSocketUrl(conversationId: string): string {
    return getWebSocketUrl(`/ws/chat/${conversationId}/`);
}

export function getInboxWebSocketUrl(): string {
    return getWebSocketUrl("/ws/chat/inbox/");
}

function getWebSocketUrl(path: string): string {
    const configuredApiUrl = import.meta.env.VITE_API_URL;
    const apiOrigin = configuredApiUrl
        ? new URL(configuredApiUrl, window.location.origin)
        : window.location;
    const protocol = apiOrigin.protocol === "https:" ? "wss" : "ws";
    const token = encodeURIComponent(
        localStorage.getItem("accessToken") ??
            localStorage.getItem("access_token") ??
            localStorage.getItem("id_token") ??
            "",
    );
    return `${protocol}://${apiOrigin.host}${path}?token=${token}`;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError<{ detail?: string; message?: string }>(error)) {
        return (
            error.response?.data?.detail ??
            error.response?.data?.message ??
            fallback
        );
    }

    return error instanceof Error ? error.message : fallback;
}
