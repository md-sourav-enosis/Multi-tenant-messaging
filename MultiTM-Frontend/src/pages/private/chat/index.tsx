import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Inbox, LoaderCircle, Search, Users } from "lucide-react";
import type { User } from "../../../api/accounts";
import {
    createOrOpenConversation,
    getApiErrorMessage,
    getInboxWebSocketUrl,
    searchChatUsers,
    type ChatUser,
    type Conversation,
} from "../../../api/chat";
import {
    inboxQueryKey,
    sortConversations,
    useInboxQuery,
} from "../../../api/chat/queries";
import { useAuth } from "../../../contexts/useAuth";
import AppHeader from "../../../components/AppHeader";
import ConversationRow from "../../../components/ConversationRow";

function getUserName(user: User | ChatUser): string {
    if ("display_name" in user) {
        return user.display_name;
    }

    const name = `${user.first_name} ${user.last_name}`.trim();
    return name || user.username || user.email;
}

export default function ChatPage() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const inboxQuery = useInboxQuery();
    const inbox = inboxQuery.data ?? [];
    const inboxLoading = inboxQuery.isPending;
    const inboxError = inboxQuery.error
        ? getApiErrorMessage(inboxQuery.error, "Could not load your inbox.")
        : null;
    const [query, setQuery] = useState("");
    const [users, setUsers] = useState<ChatUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [startingConversation, setStartingConversation] = useState<
        string | null
    >(null);
    const [conversationError, setConversationError] = useState<string | null>(
        null,
    );
    const [searchOpen, setSearchOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function closeSearch(event: MouseEvent) {
            if (
                searchRef.current &&
                !searchRef.current.contains(event.target as Node)
            ) {
                setSearchOpen(false);
            }
        }

        function closeSearchOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") setSearchOpen(false);
        }

        document.addEventListener("mousedown", closeSearch);
        document.addEventListener("keydown", closeSearchOnEscape);
        return () => {
            document.removeEventListener("mousedown", closeSearch);
            document.removeEventListener("keydown", closeSearchOnEscape);
        };
    }, []);

    useEffect(() => {
        void queryClient.invalidateQueries({
            queryKey: inboxQueryKey,
        });
    }, [queryClient]);

    useEffect(() => {
        let reconnectTimer: number | undefined;
        let reconnectAttempt = 0;
        let disposed = false;
        let inboxSocket: WebSocket | null = null;

        function connectInboxSocket() {
            if (disposed) return;

            const socket = new WebSocket(getInboxWebSocketUrl());
            inboxSocket = socket;

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
                                const withoutUpdated = current.filter(
                                    (item) => item.id !== updated.id,
                                );

                                return sortConversations([
                                    updated,
                                    ...withoutUpdated,
                                ]);
                            },
                        );
                        return;
                    }

                    void queryClient.invalidateQueries({
                        queryKey: inboxQueryKey,
                    });
                } catch {
                    void queryClient.invalidateQueries({
                        queryKey: inboxQueryKey,
                    });
                }
            };
            socket.onerror = () => socket.close();
            socket.onclose = () => {
                if (disposed) return;

                const delay = Math.min(2000 * 2 ** reconnectAttempt, 10000);
                reconnectAttempt += 1;
                reconnectTimer = window.setTimeout(connectInboxSocket, delay);
            };
        }

        connectInboxSocket();

        return () => {
            disposed = true;
            if (reconnectTimer !== undefined) {
                window.clearTimeout(reconnectTimer);
            }
            inboxSocket?.close();
            inboxSocket = null;
        };
    }, [queryClient]);

    useEffect(() => {
        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 2) {
            return;
        }

        const controller = new AbortController();
        const timeout = window.setTimeout(async () => {
            try {
                setLoading(true);
                setSearchError(null);
                setUsers(
                    await searchChatUsers(trimmedQuery, controller.signal),
                );
            } catch (error: unknown) {
                if (!controller.signal.aborted) {
                    setSearchError(
                        getApiErrorMessage(error, "Could not search users."),
                    );
                    setUsers([]);
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 300);

        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [query]);

    async function handleStartConversation(selectedUser: ChatUser) {
        try {
            setStartingConversation(selectedUser.id);
            setConversationError(null);
            const conversation = await createOrOpenConversation(
                selectedUser.id,
            );
            navigate(`/chat/${conversation.id}`, {
                state: { from: "/dashboard" },
            });
        } catch (error: unknown) {
            setConversationError(
                getApiErrorMessage(error, "Could not start the conversation."),
            );
        } finally {
            setStartingConversation(null);
        }
    }

    return (
        <main className="min-h-screen bg-[#f4f7f7] text-[#1d2939]">
            <AppHeader user={user} onLogout={logout} />

            <section className="mx-auto max-w-3xl px-5 pb-16 pt-20 sm:px-8 sm:pt-24">
                <div className="flex items-start gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-[#126b5b] text-[#f7fbf9] shadow-[0_8px_20px_rgb(18_107_91_/_18%)]">
                        <Users size={22} />
                    </div>
                    <div>
                        <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#678079]">
                            New conversation
                        </p>
                        <h2 className="text-[clamp(26px,4vw,38px)] font-semibold leading-tight tracking-[-0.02em] text-[#152c2a]">
                            Who would you like to reach?
                        </h2>
                        <p className="mt-2 max-w-2xl leading-relaxed text-[#61726e]">
                            Search by name or email. People from every tenant
                            are available when you select them directly.
                        </p>
                    </div>
                </div>

                <div ref={searchRef} className="relative mt-8">
                    <label className="flex items-center gap-3 rounded-[14px] border border-[#d9e4e0] bg-white px-[17px] text-[#6e817b] shadow-[0_12px_35px_rgb(38_78_68_/_8%)] outline-0 transition focus-within:border-[#419b88] focus-within:ring-4 focus-within:ring-[#419b88]/15">
                        <Search size={20} aria-hidden="true" />
                        <input
                            className="w-full border-0 bg-transparent py-[18px] text-[#18312e] outline-0 placeholder:text-[#8a9b96]"
                            value={query}
                            onFocus={() => setSearchOpen(true)}
                            onChange={(event) => {
                                const nextQuery = event.target.value;
                                setQuery(nextQuery);
                                setSearchOpen(nextQuery.trim().length >= 2);
                                if (nextQuery.trim().length < 2) {
                                    setUsers([]);
                                    setSearchError(null);
                                    setLoading(false);
                                }
                            }}
                            placeholder="Search by name or email"
                            aria-label="Search users by name or email"
                        />
                        {loading && (
                            <LoaderCircle
                                className="animate-spin"
                                size={18}
                                aria-label="Searching"
                            />
                        )}
                    </label>

                    {searchOpen && query.trim().length >= 2 && (
                        <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-[#e2ebe8] bg-white p-2 shadow-[0_16px_40px_rgb(38_78_68_/_16%)]">
                            {searchError ? (
                                <p className="m-0 rounded-lg bg-[#fff0ed] px-3.5 py-3 text-[13px] text-[#a13b35]">
                                    {searchError}
                                </p>
                            ) : loading ? (
                                <div className="grid min-h-20 place-items-center text-[#126b5b]">
                                    <LoaderCircle
                                        className="animate-spin"
                                        size={22}
                                    />
                                </div>
                            ) : users.length === 0 ? (
                                <div className="grid min-h-20 place-items-center text-center text-sm text-[#91a39e]">
                                    No users found for &quot;{query.trim()}
                                    &quot;.
                                </div>
                            ) : (
                                users.map((candidate) => (
                                    <article
                                        className="flex flex-wrap items-start gap-3.5 rounded-[11px] p-3.5 first:pt-3.5 not-first:border-t not-first:border-[#e8efed] sm:flex-nowrap"
                                        key={candidate.id}
                                    >
                                        <div className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[#d9eee8] font-extrabold text-[#126b5b]">
                                            {getUserName(candidate)
                                                .charAt(0)
                                                .toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="m-0 text-[15px] font-semibold text-[#203b37]">
                                                {getUserName(candidate)}
                                            </h3>
                                            <p className="my-0.5 truncate text-[13px] text-[#71817d]">
                                                {candidate.email}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            className="ml-[56px] inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border border-[#cbe9e0] bg-[#edf8f4] px-3 py-2 text-[13px] font-bold text-[#126b5b] transition hover:border-[#9fc9bd] hover:bg-[#d9eee8] sm:ml-0 disabled:cursor-wait disabled:opacity-60"
                                            onClick={() => {
                                                setSearchOpen(false);
                                                void handleStartConversation(
                                                    candidate,
                                                );
                                            }}
                                            disabled={
                                                startingConversation !== null
                                            }
                                        >
                                            {startingConversation ===
                                            candidate.id ? (
                                                <LoaderCircle
                                                    className="animate-spin"
                                                    size={17}
                                                />
                                            ) : (
                                                <ArrowRight size={17} />
                                            )}
                                            {startingConversation ===
                                            candidate.id
                                                ? "Opening"
                                                : "Message"}
                                        </button>
                                    </article>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {searchError && (
                    <p className="mt-3 rounded-[9px] bg-[#fff0ed] px-3.5 py-3 text-[13px] text-[#a13b35]">
                        {searchError}
                    </p>
                )}
                {conversationError && (
                    <p className="mt-3 rounded-[9px] bg-[#fff0ed] px-3.5 py-3 text-[13px] text-[#a13b35]">
                        {conversationError}
                    </p>
                )}
                <section className="mt-10">
                    <div className="mb-3 flex items-end justify-between gap-4">
                        <div>
                            <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#678079]">
                                Your inbox
                            </p>
                            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#152c2a]">
                                Recent conversations
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate("/inbox")}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#cbe9e0] bg-[#edf8f4] px-3 py-2 text-xs font-bold text-[#126b5b] transition hover:bg-[#d9eee8]"
                        >
                            <Inbox size={15} />
                            Open inbox
                        </button>
                    </div>
                    {inboxError && (
                        <p className="rounded-[9px] bg-[#fff0ed] px-3.5 py-3 text-[13px] text-[#a13b35]">
                            {inboxError}
                        </p>
                    )}
                    <div className="rounded-2xl border border-[#e2ebe8] bg-white/70 p-2">
                        {inboxLoading ? (
                            <div className="grid min-h-[120px] place-items-center text-[#126b5b]">
                                <LoaderCircle
                                    className="animate-spin"
                                    size={24}
                                />
                            </div>
                        ) : inbox.length === 0 && !inboxError ? (
                            <div className="grid min-h-[120px] place-items-center text-sm text-[#91a39e]">
                                No conversations yet.
                            </div>
                        ) : (
                            inbox
                                .slice(0, 5)
                                .map((conversation) => (
                                    <ConversationRow
                                        key={conversation.id}
                                        conversation={conversation}
                                        currentUser={user}
                                        showTenant
                                        onOpen={() =>
                                            navigate(
                                                `/chat/${conversation.id}`,
                                                {
                                                    state: {
                                                        from: "/dashboard",
                                                    },
                                                },
                                            )
                                        }
                                    />
                                ))
                        )}
                    </div>
                </section>
            </section>
        </main>
    );
}
