import { useQuery } from "@tanstack/react-query";
import { getInbox, type Conversation } from "./index";

export const inboxQueryKey = ["chat", "inbox"] as const;

function getActivity(conversation: Conversation): number {
    const value =
        conversation.updated_at ??
        conversation.last_activity ??
        (typeof conversation.last_message === "object"
            ? conversation.last_message?.created_at
            : undefined);
    return value ? new Date(value).getTime() : 0;
}

export function sortConversations(
    conversations: Conversation[],
): Conversation[] {
    return [...conversations].sort(
        (left, right) => getActivity(right) - getActivity(left),
    );
}

export function useInboxQuery() {
    return useQuery({
        queryKey: inboxQueryKey,
        queryFn: async () => sortConversations(await getInbox()),
        staleTime: 30_000,
    });
}
