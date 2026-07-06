"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  PlusCircle,
  CalendarDays,
  Boxes,
  Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Cockpit",
    href: "/cockpit",
    icon: Compass,
  },
  {
    label: "Diagnostics",
    href: "/diagnostics",
    icon: ClipboardList,
  },
  {
    label: "Nouveau diagnostic",
    href: "/diagnostics/new",
    icon: PlusCircle,
  },
  {
    label: "Sessions",
    href: "/sessions",
    icon: CalendarDays,
  },
  {
    label: "Modules",
    href: "/settings/modules",
    icon: Boxes,
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar md:text-sidebar-foreground print:hidden">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#00527a] text-white font-heading font-bold">
          SA
        </div>
        <Link
          href="/"
          className="font-heading text-lg font-bold tracking-wide text-[#00527a]"
        >
          START ACADEMY
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/cockpit" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <p className="text-xs text-muted-foreground">
          v0.1 — MVP diagnostic
        </p>
      </div>
    </aside>
  );
}
