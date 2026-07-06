import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileWithRole, Role } from "@/lib/auth/roles";
import { signOutAction } from "@/app/login/actions";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  commercial: "Commercial",
  trainer: "Formateur",
  client_viewer: "Dirigeant",
  participant: "Collaborateur",
};

function initialsFromProfile(profile: ProfileWithRole | null): string {
  if (!profile) return "??";
  const source =
    profile.full_name?.trim() ||
    profile.email?.split("@")[0] ||
    "Start Academy";
  const parts = source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "SA";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "SA";
}

interface TopbarProps {
  profile: ProfileWithRole | null;
}

export function Topbar({ profile }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6 print:hidden">
      <div className="flex items-center gap-2 md:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#00527a] text-white font-heading font-bold">
          SA
        </div>
        <Link
          href="/"
          className="font-heading text-base font-bold tracking-wide text-[#00527a]"
        >
          START ACADEMY
        </Link>
      </div>

      <div className="hidden md:block">
        <p className="font-heading text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Plateforme interne · Diagnostic & Parcours
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/diagnostics/new"
          className={cn(
            buttonVariants({ size: "sm" }),
            "bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 h-9 px-4"
          )}
        >
          <PlusCircle className="h-4 w-4" />
          Nouveau diagnostic
        </Link>

        {profile ? (
          <div className="flex items-center gap-3">
            <div className="hidden text-right md:block">
              <p className="text-sm font-medium leading-tight text-foreground">
                {profile.full_name ?? profile.email ?? "Compte"}
              </p>
              <p className="text-xs leading-tight text-muted-foreground">
                {ROLE_LABEL[profile.role]}
              </p>
            </div>
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-[#00527a] text-white text-xs font-semibold">
                {initialsFromProfile(profile)}
              </AvatarFallback>
            </Avatar>
            <form action={signOutAction}>
              <button
                type="submit"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "h-9 px-3 text-xs"
                )}
              >
                Déconnexion
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 px-3 text-xs"
            )}
          >
            Connexion
          </Link>
        )}
      </div>
    </header>
  );
}
