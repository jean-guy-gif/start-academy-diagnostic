import type { ProfileWithRole } from "@/lib/auth/roles";
import { AppSidebar } from "./app-sidebar";
import { Topbar } from "./topbar";

interface ShellProps {
  children: React.ReactNode;
  profile: ProfileWithRole | null;
}

export function Shell({ children, profile }: ShellProps) {
  return (
    <div className="flex min-h-screen bg-muted/30">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar profile={profile} />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
