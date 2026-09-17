import { useEffect, useRef } from "react";
import { ChevronDown, LogOut, UserCircle } from "lucide-react";
import type { User } from "../api/accounts";

interface ProfileMenuProps {
    user: User | null;
    onLogout: () => void;
}

function getDisplayName(user: User | null): string {
    if (!user) return "Your account";
    const name = `${user.first_name} ${user.last_name}`.trim();
    return name || user.username || user.email;
}

export default function ProfileMenu({ user, onLogout }: ProfileMenuProps) {
    const displayName = getDisplayName(user);
    const menuRef = useRef<HTMLDetailsElement>(null);

    useEffect(() => {
        function closeMenu(event: MouseEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node)
            ) {
                menuRef.current.open = false;
            }
        }

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                menuRef.current?.removeAttribute("open");
            }
        }

        document.addEventListener("mousedown", closeMenu);
        document.addEventListener("keydown", closeOnEscape);

        return () => {
            document.removeEventListener("mousedown", closeMenu);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, []);

    return (
        <details ref={menuRef} className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-[#d9e4e0] bg-white py-1.5 pl-1.5 pr-3 text-sm text-[#51645f] shadow-sm transition hover:border-[#9fc9bd] [&::-webkit-details-marker]:hidden">
                <span className="grid size-9 place-items-center rounded-full bg-[#d9eee8] text-[#126b5b]">
                    <UserCircle size={16} />
                </span>
                <span className="max-w-32 truncate font-semibold">
                    {displayName}
                </span>
                <ChevronDown size={12} className="text-[#71918a]" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-[#d9e4e0] bg-white p-2 shadow-[0_12px_35px_rgb(38_78_68_/_14%)]">
                <div className="border-b border-[#e8efed] px-3 py-2">
                    <p className="truncate text-sm font-semibold text-[#203b37]">
                        {displayName}
                    </p>
                    {user?.email && (
                        <p className="truncate text-xs text-[#71817d]">
                            {user.email}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onLogout}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#a13b35] transition hover:bg-[#fff0ed]"
                >
                    <LogOut size={12} />
                    Log out
                </button>
            </div>
        </details>
    );
}
