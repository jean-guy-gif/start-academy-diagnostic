"use client";

import { Printer } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Client Component minimal — le seul élément de la page audit qui
 * nécessite du JS runtime. Tout le reste rend côté serveur.
 *
 * Masqué en @media print (classe `print:hidden`).
 *
 * `disabled` (audit-print-fix) : passé à `true` quand l'audit est
 * sous le seuil de complétude ({AUDIT_COMPLETENESS_THRESHOLD_PERCENT} %).
 * Empêche l'impression tant que la restitution n'est pas honnête.
 */
export interface PrintButtonProps {
  disabled?: boolean;
}

export function PrintButton({ disabled = false }: PrintButtonProps = {}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        if (typeof window !== "undefined") window.print();
      }}
      className={cn(
        buttonVariants({ variant: "outline", size: "default" }),
        "print:hidden h-10 gap-2 border-primary/20 text-primary hover:bg-secondary",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent"
      )}
      data-testid="audit-print-button"
    >
      <Printer className="h-4 w-4" />
      Imprimer / PDF
    </button>
  );
}
