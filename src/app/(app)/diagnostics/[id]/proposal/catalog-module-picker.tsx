"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import type { ProfileTarget, TrainingModule } from "@/types";
import type { ProposalModule } from "@/lib/ai/proposal-schema";
import { moduleCatalog } from "@/lib/data/module-catalog";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Sélecteur de module depuis le catalogue Start Academy (79 modules).
 * Filtres :
 *   • profil ciblé (conseiller / manager / assistant / direction, ou tous)
 *   • famille (16 disponibles, dépendantes du profil sélectionné)
 *   • recherche texte libre (nom, famille, signal diagnostic)
 *
 * Impératif produit : Laurent doit être rapide devant un dirigeant
 * en rendez-vous — pas de scroll infini de 79 lignes, pas de dropdown
 * illisible. Interface plate, filtre live, click pour ajouter.
 *
 * Callback `onSelect(module)` — l'appelant construit le `ProposalModule`
 * final (via `buildProposalModuleFromCatalog`) et gère `addModuleToProgram`.
 */

export interface CatalogueModulePickerProps {
  /** IDs déjà présents dans le programme — filtrés pour éviter les doublons visibles. */
  excludedModuleIds: readonly string[];
  onSelect: (module: TrainingModule) => void;
  onClose: () => void;
}

const PROFILE_LABEL: Record<ProfileTarget | "all", string> = {
  all: "Tous profils",
  conseiller: "Conseiller",
  manager: "Manager",
  assistant: "Assistant(e)",
  direction: "Direction",
};

export function CatalogueModulePicker({
  excludedModuleIds,
  onSelect,
  onClose,
}: CatalogueModulePickerProps) {
  const [profile, setProfile] = useState<ProfileTarget | "all">("all");
  const [family, setFamily] = useState<string>("all");
  const [query, setQuery] = useState("");

  const excluded = useMemo(
    () => new Set(excludedModuleIds),
    [excludedModuleIds]
  );

  // Familles proposées : uniquement celles qui contiennent des modules
  // du profil sélectionné (évite les familles vides après filtrage).
  const familyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of moduleCatalog) {
      if (profile !== "all" && m.targetProfile !== profile) continue;
      set.add(m.family);
    }
    return ["all", ...[...set].sort()];
  }, [profile]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return moduleCatalog.filter((m) => {
      if (excluded.has(m.id)) return false;
      if (profile !== "all" && m.targetProfile !== profile) return false;
      if (family !== "all" && m.family !== family) return false;
      if (q.length === 0) return true;
      const haystack = [
        m.name,
        m.family,
        m.tools ?? "",
        ...(m.diagnosticSignals ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [excluded, profile, family, query]);

  // Reset family si elle disparaît après changement de profil.
  const familyValue = familyOptions.includes(family) ? family : "all";

  return (
    <div
      role="dialog"
      aria-label="Ajouter un module depuis le catalogue"
      className="rounded-lg border border-border/60 bg-white p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold text-[#00527a]">
          Ajouter un module
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          aria-label="Fermer le sélecteur"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col text-xs">
          <span className="mb-1 font-medium text-foreground/80">Profil</span>
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as ProfileTarget | "all")}
            className="h-9 rounded-md border border-border/60 bg-white px-2 text-sm"
          >
            {(Object.keys(PROFILE_LABEL) as (ProfileTarget | "all")[]).map(
              (p) => (
                <option key={p} value={p}>
                  {PROFILE_LABEL[p]}
                </option>
              )
            )}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1 font-medium text-foreground/80">Famille</span>
          <select
            value={familyValue}
            onChange={(e) => setFamily(e.target.value)}
            className="h-9 rounded-md border border-border/60 bg-white px-2 text-sm"
          >
            {familyOptions.map((f) => (
              <option key={f} value={f}>
                {f === "all" ? "Toutes familles" : f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1 font-medium text-foreground/80">Recherche</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="nom, famille, signal…"
              className="h-9 pl-7 text-sm"
            />
          </div>
        </label>
      </div>

      <p className="mb-2 text-[11px] text-muted-foreground">
        {filtered.length} module{filtered.length > 1 ? "s" : ""} disponible
        {filtered.length > 1 ? "s" : ""}
      </p>

      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {filtered.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "flex h-auto w-full items-start justify-between gap-2 rounded-md border-border/60 px-3 py-2 text-left"
              )}
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {m.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {m.family} · {PROFILE_LABEL[m.targetProfile]}
                  {typeof m.durationHours === "number" && m.durationHours > 0
                    ? ` · ${m.durationHours} h`
                    : ""}
                </span>
              </span>
              <span className="text-[11px] font-medium text-[#3ea9ff]">
                Ajouter
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
            Aucun module ne correspond aux filtres.
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * Convertit un `TrainingModule` du catalogue en `ProposalModule`
 * conforme au schéma Zod (title/durationHours/whyThisModule requis).
 * Fonction pure — pour permettre à `ProposalEditor` d'appeler
 * `addModuleToProgram(program, buildProposalModuleFromCatalog(m))`.
 */
export function buildProposalModuleFromCatalog(
  m: TrainingModule
): ProposalModule {
  return {
    title: m.name,
    durationHours: m.durationHours && m.durationHours > 0 ? m.durationHours : 1,
    whyThisModule:
      m.diagnosticSignals && m.diagnosticSignals.length > 0
        ? m.diagnosticSignals[0]
        : `Module ${m.family} ciblé ${m.targetProfile}.`,
    themes: [],
    businessUseCases: [],
    expectedOutcomes: [],
  };
}
