"use client";

import { Printer } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Client Component minimal — le seul élément de la page audit qui
 * nécessite du JS runtime. Tout le reste rend côté serveur.
 *
 * Masqué en @media print (classe `print:hidden`).
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
      className={cn(
        buttonVariants({ variant: "outline", size: "default" }),
        "print:hidden h-10 gap-2 border-primary/20 text-primary hover:bg-secondary"
      )}
    >
      <Printer className="h-4 w-4" />
      Imprimer / PDF
    </button>
  );
}
