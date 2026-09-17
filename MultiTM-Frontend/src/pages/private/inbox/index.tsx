import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, LoaderCircle, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
    getApiErrorMessage,
    getInboxWebSocketUrl,
    downloadConversationExport,
    requestConversationExport,
    setConversationStarred,
    waitForConversationExport,
    type Conversation,
} from "../../../api/chat";
import {
    inboxQueryKey,
    sortConversations,
    useInboxQuery,
} from "../../../api/chat/queries";
import AppHeader from "../../../components/AppHeader";
import { useAuth } from "../../../contexts/useAuth";
import ConversationRow from "../../../components/ConversationRow";

type Filter = "all" | "unread" | "starred";

export default function InboxPage() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const inboxQuery = useInboxQuery();
    const conversations = inboxQuery.data ?? [];
    const loading = inboxQuery.isPending;
    const error = inboxQuery.error
        ? getApiErrorMessage(inboxQuery.error, "Could not load your inbox.")
        : null;
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [localStars, setLocalStars] = useState<Set<string>>(new Set());
    const [updatingStars, setUpdatingStars] = useState<Set<string>>(new Set());
    const [exportStatus, setExportStatus] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const exportAbortRef = useRef<AbortController | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    useEffect(() => () => exportAbortRef.current?.abort(), []);

    useEffect(() => {
        let reconnectTimer: number | undefined;
        let reconnectAttempt = 0;
        let disposed = false;

        function connect() {
            if (disposed) return;
            const socket = new WebSocket(getInboxWebSocketUrl());
            socketRef.current = socket;
            socket.onopen = () => {
                reconnectAttempt = 0;
            };
            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as {
                        type?: string;
                        conversation?: Conversation;
                    };
                    if (data.type === "inbox_update" && data.conversation) {
                        const incomingConversation = data.conversation;
                        queryClient.setQueryData<Conversation[]>(
                            inboxQueryKey,
                            (current = []) => {
                                const existing = current.find(
                                    (item) =>
                                        item.id === incomingConversation.id,
                                );
                                const updated = existing
                                    ? { ...existing, ...incomingConversation }
                                    : incomingConversation;
                                return sortConversations([
                                    updated,
                                    ...current.filter(
                                        (item) => item.id !== updated.id,
                                    ),
                                ]);
                            },
                        );
                        setLocalStars((current) => {
                            const next = new Set(current);
                            if (incomingConversation.starred)
                                next.add(incomingConversation.id);
                            else next.delete(incomingConversation.id);
                            return next;
                        });
                    } else {
                        void queryClient.invalidateQueries({
                            queryKey: inboxQueryKey,
                        });
                    }
                } catch {
                    void queryClient.invalidateQueries({
                        queryKey: inboxQueryKey,
                    });
                }
            };
            socket.onerror = () => socket.close();
            socket.onclose = () => {
                if (disposed) return;
                reconnectTimer = window.setTimeout(
                    connect,
                    Math.min(2000 * 2 ** reconnectAttempt++, 10000),
                );
            };
        }

        connect();
        return () => {
            disposed = true;
            if (reconnectTimer !== undefined)
                window.clearTimeout(reconnectTimer);
            socketRef.current?.close();
            socketRef.current = null;
        };
    }, [queryClient]);

    useEffect(() => {
        setLocalStars(
            new Set(
                conversations
                    .filter((conversation) => conversation.starred)
                    .map((conversation) => conversation.id),
            ),
        );
    }, [conversations]);

    useEffect(() => {
        void queryClient.invalidateQueries({
            queryKey: inboxQueryKey,
        });
    }, [queryClient]);

    const visibleConversations = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const filteredByView = conversations.filter((conversation) => {
            const starred =
                localStars.has(conversation.id) ||
                Boolean(conversation.starred);
            return (
                filter === "all" ||
                (filter === "unread"
                    ? Boolean(conversation.unread_count)
                    : starred)
            );
        });

        return filteredByView.filter((conversation) => {
            const participant =
                conversation.participant ??
                conversation.other_user ??
                conversation.participants?.find((item) => item.id !== user?.id);
            const name = participant
                ? "display_name" in participant
                    ? participant.display_name.toLowerCase()
                    : `${participant.first_name} ${participant.last_name} ${participant.email}`.toLowerCase()
                : `${conversation.participant_name ?? ""} ${conversation.participant_email ?? ""}`.toLowerCase();
            const preview =
                typeof conversation.last_message === "string"
                    ? conversation.last_message.toLowerCase()
                    : (conversation.last_message?.text.toLowerCase() ?? "");
            return (
                !normalizedQuery ||
                name.includes(normalizedQuery) ||
                preview.includes(normalizedQuery)
            );
        });
    }, [conversations, filter, localStars, query, user]);

    async function toggleStar(conversation: Conversation) {
        const wasStarred =
            localStars.has(conversation.id) || Boolean(conversation.starred);
        const nextStarred = !wasStarred;
        setUpdatingStars((current) => new Set(current).add(conversation.id));
        setLocalStars((current) => {
            const next = new Set(current);
            if (nextStarred) next.add(conversation.id);
            else next.delete(conversation.id);
            return next;
        });
        queryClient.setQueryData<Conversation[]>(
            inboxQueryKey,
            (current = []) =>
                current.map((item) =>
                    item.id === conversation.id
                        ? { ...item, starred: nextStarred }
                        : item,
                ),
        );

        try {
            await setConversationStarred(conversation.id, nextStarred);
        } catch (toggleError: unknown) {
            setLocalStars((current) => {
                const next = new Set(current);
                if (wasStarred) next.add(conversation.id);
                else next.delete(conversation.id);
                return next;
            });
            queryClient.setQueryData<Conversation[]>(
                inboxQueryKey,
                (current = []) =>
                    current.map((item) =>
                        item.id === conversation.id
                            ? { ...item, starred: wasStarred }
                            : item,
                    ),
            );
        } finally {
            setUpdatingStars((current) => {
                const next = new Set(current);
                next.delete(conversation.id);
                return next;
            });
        }
    }

    async function exportConversations() {
        const controller = new AbortController();
        exportAbortRef.current = controller;
        setExporting(true);
        setExportStatus("Preparing export...");

        try {
            const task = await requestConversationExport();
            setExportStatus("Generating export...");
            const downloadUrl = await waitForConversationExport(
                task,
                controller.signal,
            );
            setExportStatus("Downloading export...");
            await downloadConversationExport(downloadUrl);
            setExportStatus("Export downloaded.");
        } catch (exportError: unknown) {
            if (
                exportError instanceof DOMException &&
                exportError.name === "AbortError"
            )
                return;
            setExportStatus(
                getApiErrorMessage(
                    exportError,
                    "Could not export conversations.",
                ),
            );
        } finally {
            if (exportAbortRef.current === controller)
                exportAbortRef.current = null;
            setExporting(false);
        }
    }

    return (
        <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#f4f7f7] text-[#1d2939]">
            <AppHeader user={user} onLogout={logout} />
            <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-5 pb-6 pt-20 sm:px-8 sm:pt-24">
                <div className="mb-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => navigate("/dashboard")}
                            className="grid size-9 place-items-center rounded-lg border border-[#d9e4e0] bg-white text-[#126b5b] hover:bg-[#edf8f4]"
                            aria-label="Back to dashboard"
                        >
                            <ArrowLeft size={17} />
                        </button>
                        <div>
                            <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#678079]">
                                Messages
                            </p>
                            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#152c2a]">
                                Inbox
                            </h1>
                        </div>
                    </div>
                    <span className="text-xs text-[#71817d]">
                        {visibleConversations.length} shown
                    </span>
                </div>

                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#d9e4e0] bg-white px-4 py-3">
                    <div>
                        <p className="m-0 text-sm font-semibold text-[#203b37]">
                            Conversation export
                        </p>
                        {exportStatus && (
                            <p className="m-0 text-xs text-[#71817d]">
                                {exportStatus}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => void exportConversations()}
                        disabled={exporting}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#126b5b] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#0d5548] disabled:cursor-wait disabled:opacity-60"
                    >
                        {exporting ? (
                            <LoaderCircle className="animate-spin" size={15} />
                        ) : (
                            <Download size={15} />
                        )}
                        {exporting ? "Exporting..." : "Export"}
                    </button>
                </div>

                <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#d9e4e0] bg-white px-4 text-[#6e817b] shadow-sm focus-within:border-[#419b88] focus-within:ring-4 focus-within:ring-[#419b88]/15">
                    <Search size={18} />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search conversations"
                        aria-label="Search conversations"
                        className="w-full bg-transparent py-3 text-sm text-[#18312e] outline-0 placeholder:text-[#8a9b96]"
                    />
                </div>
                <div className="mb-4 flex gap-2">
                    {(["all", "unread", "starred"] as Filter[]).map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => setFilter(item)}
                            className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-bold capitalize transition ${filter === item ? "bg-[#126b5b] text-white" : "bg-white text-[#51645f] hover:bg-[#edf8f4]"}`}
                        >
                            {item}
                        </button>
                    ))}
                </div>

                {error && (
                    <p className="mb-3 rounded-[9px] bg-[#fff0ed] px-3.5 py-3 text-[13px] text-[#a13b35]">
                        {error}
                    </p>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[#e2ebe8] bg-white/70 p-2">
                    {loading ? (
                        <div className="grid min-h-[180px] place-items-center text-[#126b5b]">
                            <LoaderCircle className="animate-spin" size={25} />
                        </div>
                    ) : visibleConversations.length === 0 ? (
                        <div className="grid min-h-[180px] place-items-center text-sm text-[#91a39e]">
                            No matching conversations.
                        </div>
                    ) : (
                        visibleConversations.map((conversation) => {
                            const starred =
                                localStars.has(conversation.id) ||
                                Boolean(conversation.starred);
                            return (
                                <ConversationRow
                                    key={conversation.id}
                                    conversation={conversation}
                                    currentUser={user}
                                    showStar
                                    starred={starred}
                                    starDisabled={updatingStars.has(
                                        conversation.id,
                                    )}
                                    onToggleStar={() =>
                                        void toggleStar(conversation)
                                    }
                                    onOpen={() =>
                                        navigate(
                                            `/chat/${conversation.id}`,
                                            { state: { from: "/inbox" } },
                                        )
                                    }
                                />
                            );
                        })
                    )}
                </div>
            </section>
        </main>
    );
}
