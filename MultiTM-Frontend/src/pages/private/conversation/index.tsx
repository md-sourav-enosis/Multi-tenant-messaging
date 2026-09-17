import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ChevronRight, LoaderCircle, Send } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { User } from "../../../api/accounts";
import {
    getApiErrorMessage,
    getChatWebSocketUrl,
    getConversationMessages,
    getInbox,
    markConversationRead,
    type ChatMessage,
    type ChatUser,
    type Conversation,
} from "../../../api/chat";
import { useAuth } from "../../../contexts/useAuth";
import AppHeader from "../../../components/AppHeader";

function getParticipantName(participant?: User | ChatUser): string {
    if (!participant) return "Conversation";
    if ("display_name" in participant) return participant.display_name;
    return (
        `${participant.first_name} ${participant.last_name}`.trim() ||
        participant.email
    );
}

function getParticipantTenant(participant?: User | ChatUser): string {
    if (!participant) return "";
    return "tenant_name" in participant
        ? participant.tenant_name
        : participant.tenant.name;
}

function getTokenClaims(): Record<string, string> {
    const token = localStorage.getItem("accessToken");
    if (!token) return {};

    try {
        const payload = token.split(".")[1];
        if (!payload) return {};
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(
            atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
        ) as Record<string, string>;
    } catch {
        return {};
    }
}

function normalizeIdentity(value?: string | number): string | undefined {
    return value === undefined || value === null
        ? undefined
        : String(value).trim().toLowerCase();
}

function isMessageMine(
    message: ChatMessage,
    currentUser: User | null,
): boolean {
    if (!currentUser) return false;
    const claims = getTokenClaims();
    const currentIdentities = new Set(
        [
            currentUser.id,
            currentUser.email,
            currentUser.username,
            claims.sub,
            claims.username,
            claims.email,
        ]
            .map(normalizeIdentity)
            .filter((value): value is string => Boolean(value)),
    );

    const senderIdentities = [
        message.sender_id,
        message.sender_email,
        message.sender_username,
        typeof message.sender === "string" ? message.sender : undefined,
        typeof message.sender === "object" ? message.sender.id : undefined,
        typeof message.sender === "object" && "email" in message.sender
            ? message.sender.email
            : undefined,
    ]
        .map(normalizeIdentity)
        .filter((value): value is string => Boolean(value));

    return senderIdentities.some((identity) => currentIdentities.has(identity));
}

function getMessageTime(value?: string): string {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ConversationPage() {
    const { conversationId } = useParams<{ conversationId: string }>();
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const returnPath =
        (location.state as { from?: string } | null)?.from === "/inbox"
            ? "/inbox"
            : "/dashboard";
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [messageText, setMessageText] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [socketState, setSocketState] = useState<
        "connecting" | "open" | "closed"
    >("connecting");
    const socketRef = useRef<WebSocket | null>(null);
    const endOfMessagesRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!conversationId) return;
        const id = conversationId;
        const controller = new AbortController();
        let lastReadRequestAt = 0;

        function syncReadState() {
            const now = Date.now();
            if (now - lastReadRequestAt < 1000) return;

            lastReadRequestAt = now;
            void markConversationRead(id).catch(() => {
                // The next focus or incoming message retries the read update.
            });
        }

        function handleVisibilityChange() {
            if (document.visibilityState === "visible") syncReadState();
        }

        async function loadConversation() {
            try {
                setLoading(true);
                setError(null);
                const [history, inbox] = await Promise.all([
                    getConversationMessages(id, controller.signal),
                    getInbox(),
                ]);
                setMessages(history);
                setConversation(inbox.find((item) => item.id === id) ?? null);
                syncReadState();
            } catch (loadError: unknown) {
                if (!controller.signal.aborted) {
                    setError(
                        getApiErrorMessage(
                            loadError,
                            "Could not load this conversation.",
                        ),
                    );
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", syncReadState);
        void loadConversation();
        return () => {
            controller.abort();
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
            window.removeEventListener("focus", syncReadState);
        };
    }, [conversationId]);

    useEffect(() => {
        if (!conversationId) return;
        const id = conversationId;
        let reconnectTimer: number | undefined;
        let reconnectAttempt = 0;
        let disposed = false;

        function connect() {
            if (disposed) return;

            setSocketState("connecting");
            const socket = new WebSocket(getChatWebSocketUrl(id));
            socketRef.current = socket;

            socket.onopen = () => {
                reconnectAttempt = 0;
                setSocketState("open");
            };
            socket.onclose = () => {
                if (disposed) return;

                setSocketState("closed");
                const delay = Math.min(1000 * 2 ** reconnectAttempt, 10000);
                reconnectAttempt += 1;
                reconnectTimer = window.setTimeout(connect, delay);
            };
            socket.onerror = () => socket.close();
            socket.onmessage = (event) => {
                try {
                    const incoming = JSON.parse(event.data) as ChatMessage;
                    void markConversationRead(id).catch(() => {
                        // The next incoming event or focus retries the update.
                    });
                    setMessages((current) =>
                        current.some((item) => item.id === incoming.id)
                            ? current
                            : [...current, incoming],
                    );
                } catch {
                    setError("Received an invalid message from the server.");
                }
            };
        }

        connect();

        return () => {
            disposed = true;
            if (reconnectTimer !== undefined) {
                window.clearTimeout(reconnectTimer);
            }
            socketRef.current?.close();
            socketRef.current = null;
        };
    }, [conversationId]);

    useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    function handleSend(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const text = messageText.trim();
        const socket = socketRef.current;
        if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;

        setSending(true);
        socket.send(JSON.stringify({ text }));
        setMessageText("");
        window.setTimeout(() => setSending(false), 250);
    }

    return (
        <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#f4f7f7] text-[#1d2939]">
            <AppHeader user={user} onLogout={logout} />

            <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-5 pb-6 pt-20 sm:px-8 sm:pt-24">
                <nav
                    aria-label="Conversation breadcrumb"
                    className="mb-4 flex items-center gap-1 text-sm"
                >
                    <button
                        type="button"
                        onClick={() => navigate(returnPath)}
                        className="font-semibold text-[#126b5b] hover:underline"
                    >
                        {returnPath === "/inbox" ? "Inbox" : "Dashboard"}
                    </button>
                    <ChevronRight size={16} className="text-[#9aada7]" />
                    <div className="min-w-0">
                        <span className="block truncate font-semibold text-[#203b37]">
                            {getParticipantName(
                                conversation?.participant ??
                                    conversation?.participants?.find(
                                        (participant) =>
                                            participant.id !== user?.id,
                                    ),
                            )}
                        </span>
                        {getParticipantTenant(
                            conversation?.participant ??
                                conversation?.participants?.find(
                                    (participant) =>
                                        participant.id !== user?.id,
                                ),
                        ) && (
                            <span className="block truncate text-xs text-[#71817d]">
                                {getParticipantTenant(
                                    conversation?.participant ??
                                        conversation?.participants?.find(
                                            (participant) =>
                                                participant.id !== user?.id,
                                        ),
                                )}
                            </span>
                        )}
                    </div>
                </nav>
                <div className="mb-3 flex items-center justify-between rounded-2xl border border-[#e2ebe8] bg-white/80 px-4 py-3">
                    <div>
                        <p className="m-0 text-sm font-semibold text-[#203b37]">
                            Messages
                        </p>
                        <p className="m-0 text-xs text-[#71817d]">
                            {socketState === "open"
                                ? "Live connection active"
                                : socketState === "connecting"
                                  ? "Connecting..."
                                  : "Connection unavailable"}
                        </p>
                    </div>
                    <span
                        className={`size-2 rounded-full ${socketState === "open" ? "bg-[#39a886]" : "bg-[#d99a55]"}`}
                        aria-label={socketState}
                    />
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-[#e2ebe8] bg-white/70 p-4 sm:p-6">
                    {loading ? (
                        <div className="grid flex-1 place-items-center text-[#126b5b]">
                            <LoaderCircle className="animate-spin" size={26} />
                        </div>
                    ) : error ? (
                        <div className="grid flex-1 place-items-center text-center text-sm text-[#a13b35]">
                            <p>{error}</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="grid flex-1 place-items-center text-center text-sm text-[#91a39e]">
                            <p>No messages yet. Start the conversation.</p>
                        </div>
                    ) : (
                        messages.map((message) => {
                            const isMine = isMessageMine(message, user);
                            return (
                                <div
                                    key={message.id}
                                    className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`w-fit max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${isMine ? "self-end rounded-br-sm bg-[#126b5b] text-white" : "self-start rounded-bl-sm bg-[#e7f1ee] text-[#203b37]"}`}
                                    >
                                        <p className="m-0 whitespace-pre-wrap break-words">
                                            {message.text}
                                        </p>
                                        <p
                                            className={`mt-1 mb-0 text-[10px] ${isMine ? "text-white/70" : "text-[#71817d]"}`}
                                        >
                                            {getMessageTime(message.created_at)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={endOfMessagesRef} />
                </div>

                {error && (
                    <p className="mt-3 rounded-[9px] bg-[#fff0ed] px-3.5 py-3 text-[13px] text-[#a13b35]">
                        {error}
                    </p>
                )}
                <form
                    onSubmit={handleSend}
                    className="mt-3 flex items-center gap-2 rounded-2xl border border-[#d9e4e0] bg-white p-2 shadow-[0_12px_35px_rgb(38_78_68_/_8%)]"
                >
                    <input
                        value={messageText}
                        onChange={(event) => setMessageText(event.target.value)}
                        placeholder={
                            socketState === "open"
                                ? "Write a message..."
                                : "Waiting for connection..."
                        }
                        disabled={socketState !== "open"}
                        className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-[#18312e] outline-0 placeholder:text-[#8a9b96]"
                        aria-label="Message text"
                    />
                    <button
                        type="submit"
                        disabled={
                            sending ||
                            !messageText.trim() ||
                            socketState !== "open"
                        }
                        className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#126b5b] text-white transition hover:bg-[#0d5548] disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Send message"
                    >
                        {sending ? (
                            <LoaderCircle className="animate-spin" size={18} />
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </form>
            </section>
        </main>
    );
}
