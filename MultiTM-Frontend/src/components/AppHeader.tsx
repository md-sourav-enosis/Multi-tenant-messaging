import type { ReactNode } from "react";
import type { User } from "../api/accounts";
import ProfileMenu from "./ProfileMenu";

interface AppHeaderProps {
    user: User | null;
    onLogout: () => void;
    leftContent?: ReactNode;
}

export default function AppHeader({
    user,
    onLogout,
    leftContent,
}: AppHeaderProps) {
    return (
        <header className="fixed inset-x-0 top-0 z-30 bg-[#f4f7f7]/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-1 sm:px-8 sm:py-4">
                {leftContent ?? <span aria-hidden="true" />}
                <ProfileMenu user={user} onLogout={onLogout} />
            </div>
        </header>
    );
}
