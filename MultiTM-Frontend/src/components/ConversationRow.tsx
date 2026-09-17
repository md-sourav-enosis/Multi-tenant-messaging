import { ArrowRight, Star } from "lucide-react";
import type { User } from "../api/accounts";
import type { ChatMessage, ChatUser, Conversation } from "../api/chat";

interface ConversationRowProps {
    conversation: Conversation;
    currentUser: User | null;
    onOpen: () => void;
    showTenant?: boolean;
    showStar?: boolean;
    starred?: boolean;
    starDisabled?: boolean;
    onToggleStar?: () => void;
}

function getParticipant(
    conversation: Conversation,
    currentUser: User | null,
): User | ChatUser | undefined {
    return (
        conversation.participant ??
        conversation.other_user ??
        conversation.participants?.find((item) => item.id !== currentUser?.id)
    );
}

function getName(conversation: Conversation, currentUser: User | null): string {
    const participant = getParticipant(conversation, currentUser);
    if (participant) {
        if ("display_name" in participant) return participant.display_name;
        return (
            `${participant.first_name} ${participant.last_name}`.trim() ||
            participant.email
        );
    }
    return (
        conversation.participant_name ??
        conversation.participant_email ??
        "Conversation"
    );
}

function getTenant(
    conversation: Conversation,
    currentUser: User | null,
): string {
    const participant = getParticipant(conversation, currentUser);
    if (!participant) return conversation.tenant_name ?? "";
    return "tenant_name" in participant
        ? participant.tenant_name
        : participant.tenant.name;
}

function getPreview(message?: string | ChatMessage | null): string {
    if (!message) return "No messages yet";
    return typeof message === "string" ? message : message.text;
}

function getActivityTimestamp(conversation: Conversation): string | undefined {
    return (
        conversation.updated_at ??
        conversation.last_activity ??
        (typeof conversation.last_message === "object"
            ? conversation.last_message?.created_at
            : undefined)
    );
}

function formatTime(value?: string): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function ConversationRow({
    conversation,
    currentUser,
    onOpen,
    showTenant = false,
    showStar = false,
    starred = false,
    starDisabled = false,
    onToggleStar,
}: ConversationRowProps) {
    const name = getName(conversation, currentUser);
    const tenant = getTenant(conversation, currentUser);

    return (
        <div className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-[#edf8f4]">
            <button
                type="button"
                onClick={onOpen}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
            >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#d9eee8] font-extrabold text-[#126b5b]">
                    {name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                        <strong className="truncate text-sm text-[#203b37]">
                            {name}
                        </strong>
                        {showTenant && tenant && (
                            <span className="shrink-0 rounded-full bg-[#edf8f4] px-2 py-0.5 text-[10px] font-bold text-[#126b5b]">
                                {tenant}
                            </span>
                        )}
                    </span>
                    <span className="block truncate text-xs text-[#71817d]">
                        {getPreview(conversation.last_message)}
                    </span>
                </span>
                <span className="shrink-0 self-center text-[10px] text-[#91a39e]">
                    {formatTime(getActivityTimestamp(conversation))}
                </span>
                {!!conversation.unread_count && (
                    <span className="rounded-full bg-[#126b5b] px-2 py-0.5 text-xs font-bold text-white">
                        {conversation.unread_count}
                    </span>
                )}
            </button>
            {showStar && onToggleStar && (
                <button
                    type="button"
                    onClick={onToggleStar}
                    disabled={starDisabled}
                    className={`cursor-pointer rounded-lg p-2 transition hover:bg-[#fff7dc] disabled:cursor-wait disabled:opacity-50 ${starred ? "text-[#d49a20]" : "text-[#9aada7]"}`}
                    aria-label={
                        starred ? "Unstar conversation" : "Star conversation"
                    }
                >
                    <Star size={17} fill={starred ? "currentColor" : "none"} />
                </button>
            )}
            <ArrowRight size={16} className="shrink-0 text-[#71918a]" />
        </div>
    );
}
