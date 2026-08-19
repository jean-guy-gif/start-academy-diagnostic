"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";

import type { Pricing, Proposal } from "@/lib/ai/proposal-schema";
import {
  applyCommercialDiscount,
  removeCommercialDiscount,
} from "@/lib/pricing/apply-commercial-discount";
import {
  addModuleToProgram,
  removeModuleFromProgram,
  reorderModuleInProgram,
  updateModuleDurationInProgram,
  updateModuleTextInProgram,
} from "@/lib/proposals/edit-program";
import { formatPriceEuros } from "@/lib/pricing/training-pricing";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  CatalogueModulePicker,
  buildProposalModuleFromCatalog,
} from "./catalog-module-picker";

/**
 * Composant d'édition inline de la proposition — lot B2 PR-2 UI.
 *
 * Branché depuis `proposal-view.tsx` via toggle « Modifier ». Utilise
 * les moteurs purs de PR-1 :
 *   • `edit-program` pour les modules (add/remove/reorder/duration/text)
 *   • `applyCommercialDiscount` / `removeCommercialDiscount` pour la remise
 *
 * Contrat produit :
 *   • coût pédagogique JAMAIS éditable (lecture seule) — recalculé
 *     automatiquement quand une durée change.
 *   • prise en charge / reste à charge recalculés en direct via la
 *     fonction pure `applyCommercialDiscount` — pas de round-trip serveur.
 *   • indicateur `dirty` visible dès qu'une modification a lieu.
 *   • bouton « Revenir à la version générée » restaure la snapshot
 *     initiale (celle du `proposal` passé en prop au montage).
 */

export interface ProposalEditorProps {
  proposal: Proposal;
  onSave: (edited: Proposal) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
  /** Prix horaire par participant — nécessaire pour recalcul coût. */
  pricePerHourPerParticipant: number;
}

export function ProposalEditor({
  proposal: initialProposal,
  onSave,
  onCancel,
  pricePerHourPerParticipant,
}: ProposalEditorProps) {
  // Snapshot initiale conservée pour le bouton « Revenir ». `useState`
  // + valeur initiale = memoization naturelle (React ne re-init pas).
  const [snapshot] = useState<Proposal>(initialProposal);
  const [proposal, setProposal] = useState<Proposal>(initialProposal);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Remise — état d'édition, converti au moment de l'application via
  // `applyCommercialDiscount`. Les erreurs de validation (motif vide,
  // valeur négative) sont retournées par la fonction pure et rendues
  // inline.
  const [discountUnit, setDiscountUnit] = useState<"euros" | "percent">(
    initialProposal.pricing.commercialDiscount?.unit ?? "euros"
  );
  const [discountValue, setDiscountValue] = useState<string>(
    initialProposal.pricing.commercialDiscount
      ? String(
          initialProposal.pricing.commercialDiscount.unit === "percent"
            ? initialProposal.pricing.commercialDiscount.percentDisplay
            : initialProposal.pricing.commercialDiscount.valueEuros
        )
      : ""
  );
  const [discountReason, setDiscountReason] = useState<string>(
    initialProposal.pricing.commercialDiscount?.reason ?? ""
  );
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [discountWarning, setDiscountWarning] = useState<string | null>(
    initialProposal.pricing.commercialDiscount
      ? initialProposal.pricing.commercialDiscount.percentDisplay > 15
        ? `Remise de ${initialProposal.pricing.commercialDiscount.percentDisplay} % appliquée — à valider dirigeant.`
        : null
      : null
  );

  const isDirty = useMemo(
    () => JSON.stringify(snapshot) !== JSON.stringify(proposal),
    [snapshot, proposal]
  );

  /**
   * Recalcule `costPerParticipant`, `totalEstimatedCost` et efface la
   * remise appliquée (elle deviendrait incohérente après changement
   * de durée totale). L'utilisateur doit ré-appliquer la remise avec
   * son motif après avoir édité les modules.
   */
  function recomputeAfterDurationChange(nextProgram: Proposal["trainingProgram"]) {
    const totalHours = nextProgram.totalDurationHours;
    const count = proposal.pricing.participantCount ?? null;
    const costPerParticipant =
      totalHours > 0 ? totalHours * pricePerHourPerParticipant : null;
    const total =
      count !== null && costPerParticipant !== null
        ? costPerParticipant * count
        : null;
    setProposal({
      ...proposal,
      trainingProgram: nextProgram,
      pricing: {
        ...proposal.pricing,
        costPerParticipant,
        totalEstimatedCost: total,
        commercialDiscount: null,
        finalCost: null,
      },
    });
    setDiscountUnit("euros");
    setDiscountValue("");
    setDiscountReason("");
    setDiscountError(null);
    setDiscountWarning(null);
  }

  function handleAddModule(m: Parameters<typeof buildProposalModuleFromCatalog>[0]) {
    const module = buildProposalModuleFromCatalog(m);
    const next = addModuleToProgram(proposal.trainingProgram, module);
    recomputeAfterDurationChange(next);
    setPickerOpen(false);
  }

  function handleRemoveModule(idx: number) {
    const next = removeModuleFromProgram(proposal.trainingProgram, idx);
    recomputeAfterDurationChange(next);
  }

  function handleMoveModule(idx: number, direction: -1 | 1) {
    const target = idx + direction;
    const next = reorderModuleInProgram(proposal.trainingProgram, idx, target);
    setProposal({ ...proposal, trainingProgram: next });
  }

  function handleUpdateDuration(idx: number, hours: number) {
    const next = updateModuleDurationInProgram(
      proposal.trainingProgram,
      idx,
      hours
    );
    recomputeAfterDurationChange(next);
  }

  function handleUpdateTitle(idx: number, value: string) {
    setProposal({
      ...proposal,
      trainingProgram: updateModuleTextInProgram(
        proposal.trainingProgram,
        idx,
        "title",
        value
      ),
    });
  }

  function handleUpdateWhy(idx: number, value: string) {
    setProposal({
      ...proposal,
      trainingProgram: updateModuleTextInProgram(
        proposal.trainingProgram,
        idx,
        "whyThisModule",
        value
      ),
    });
  }

  function handleApplyDiscount() {
    const value = Number(discountValue);
    const result = applyCommercialDiscount(proposal.pricing, {
      unit: discountUnit,
      value,
      reason: discountReason,
    });
    if (result.error) {
      setDiscountError(result.error);
      setDiscountWarning(null);
      return;
    }
    setDiscountError(null);
    setDiscountWarning(result.warning);
    setProposal({ ...proposal, pricing: result.pricing });
  }

  function handleRemoveDiscount() {
    setProposal({
      ...proposal,
      pricing: removeCommercialDiscount(proposal.pricing),
    });
    setDiscountUnit("euros");
    setDiscountValue("");
    setDiscountReason("");
    setDiscountError(null);
    setDiscountWarning(null);
  }

  function handleReset() {
    setProposal(snapshot);
    setDiscountUnit(snapshot.pricing.commercialDiscount?.unit ?? "euros");
    setDiscountValue(
      snapshot.pricing.commercialDiscount
        ? String(
            snapshot.pricing.commercialDiscount.unit === "percent"
              ? snapshot.pricing.commercialDiscount.percentDisplay
              : snapshot.pricing.commercialDiscount.valueEuros
          )
        : ""
    );
    setDiscountReason(snapshot.pricing.commercialDiscount?.reason ?? "");
    setDiscountError(null);
    setDiscountWarning(null);
    setSaveError(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const result = await onSave(proposal);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error ?? "Sauvegarde impossible.");
    }
  }

  const pricing: Pricing = proposal.pricing;
  const program = proposal.trainingProgram;
  const effectiveCost =
    pricing.finalCost !== null
      ? pricing.finalCost
      : pricing.totalEstimatedCost;

  return (
    <div className="space-y-6">
      {/* Barre d'action : dirty + save + revert + cancel */}
      <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-md border border-border/60 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          {isDirty ? (
            <span
              data-testid="editor-dirty-indicator"
              className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Modifications non enregistrées
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Aucune modification en attente
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty || saving}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 gap-1.5",
              (!isDirty || saving) && "opacity-60 cursor-not-allowed"
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Revenir à la version générée
          </button>
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 gap-1.5"
            )}
          >
            <X className="h-3.5 w-3.5" />
            Fermer sans enregistrer
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isDirty || saving}
            className={cn(
              buttonVariants({ size: "sm" }),
              "h-9 gap-1.5 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90",
              (!isDirty || saving) && "opacity-60 cursor-not-allowed"
            )}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Enregistrer les modifications
          </button>
        </div>
      </div>

      {saveError && (
        <div
          role="alert"
          data-testid="editor-save-error"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {saveError}
        </div>
      )}

      {/* Résumé exécutif — texte libre */}
      <section className="rounded-lg border border-border/60 bg-white p-4">
        <label className="mb-2 flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Résumé du parcours
          </span>
          <Textarea
            value={proposal.executiveSummary}
            onChange={(e) =>
              setProposal({ ...proposal, executiveSummary: e.target.value })
            }
            rows={4}
            className="text-sm"
          />
        </label>
      </section>

      {/* Programme — modules */}
      <section className="rounded-lg border border-border/60 bg-white p-4">
        <header className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-heading text-sm font-semibold text-[#00527a]">
              Modules du parcours ({program.modules.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Total : {program.totalDurationHours} h
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 gap-1.5 border-[#3ea9ff]/40 text-[#00527a] hover:bg-[#eaf5ff]"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter depuis le catalogue
          </button>
        </header>

        {pickerOpen && (
          <div className="mb-4">
            <CatalogueModulePicker
              excludedModuleIds={[]}
              onSelect={handleAddModule}
              onClose={() => setPickerOpen(false)}
            />
          </div>
        )}

        <ol className="space-y-3">
          {program.modules.map((m, idx) => (
            <li
              key={idx}
              className="rounded-md border border-border/60 p-3"
            >
              <div className="mb-2 flex items-start gap-2">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => handleMoveModule(idx, -1)}
                    disabled={idx === 0}
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted",
                      idx === 0 && "opacity-40 cursor-not-allowed"
                    )}
                    aria-label="Monter"
                    data-testid={`module-up-${idx}`}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveModule(idx, 1)}
                    disabled={idx === program.modules.length - 1}
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted",
                      idx === program.modules.length - 1 &&
                        "opacity-40 cursor-not-allowed"
                    )}
                    aria-label="Descendre"
                    data-testid={`module-down-${idx}`}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex-1">
                  <Input
                    value={m.title}
                    onChange={(e) => handleUpdateTitle(idx, e.target.value)}
                    className="h-9 font-medium"
                    placeholder="Titre du module"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={m.durationHours}
                    onChange={(e) =>
                      handleUpdateDuration(idx, Number(e.target.value))
                    }
                    className="h-9 w-20 text-right"
                  />
                  <span className="text-xs text-muted-foreground">h</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveModule(idx)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10"
                    aria-label="Retirer le module"
                    data-testid={`module-remove-${idx}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <Textarea
                value={m.whyThisModule}
                onChange={(e) => handleUpdateWhy(idx, e.target.value)}
                rows={2}
                className="text-xs"
                placeholder="Pourquoi ce module ?"
              />
            </li>
          ))}
        </ol>

        {program.modules.length === 0 && (
          <p className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            Aucun module — ajoute-en depuis le catalogue.
          </p>
        )}
      </section>

      {/* Tarification — lecture seule + remise */}
      <section className="rounded-lg border border-border/60 bg-white p-4">
        <h3 className="mb-3 font-heading text-sm font-semibold text-[#00527a]">
          Tarification
        </h3>
        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Coût / participant
            </dt>
            <dd className="mt-0.5 font-medium">
              {pricing.costPerParticipant !== null
                ? formatPriceEuros(pricing.costPerParticipant)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Participants
            </dt>
            <dd className="mt-0.5 font-medium">
              {pricing.participantCount ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Coût pédagogique
            </dt>
            <dd className="mt-0.5 font-medium">
              {pricing.totalEstimatedCost !== null
                ? formatPriceEuros(pricing.totalEstimatedCost)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Montant final
            </dt>
            <dd
              data-testid="editor-final-cost"
              className="mt-0.5 font-semibold text-[#00527a]"
            >
              {effectiveCost !== null ? formatPriceEuros(effectiveCost) : "—"}
            </dd>
          </div>
        </dl>

        {/* Remise commerciale */}
        <div className="rounded-md border border-border/60 bg-muted/20 p-3">
          <p className="mb-2 text-xs font-medium text-foreground/80">
            Remise commerciale
          </p>
          <div className="mb-2 grid gap-2 sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={1}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="0"
                className="h-9 flex-1"
                data-testid="editor-discount-value"
              />
              <select
                value={discountUnit}
                onChange={(e) =>
                  setDiscountUnit(e.target.value as "euros" | "percent")
                }
                className="h-9 rounded-md border border-border/60 bg-white px-2 text-sm"
                data-testid="editor-discount-unit"
              >
                <option value="euros">€</option>
                <option value="percent">%</option>
              </select>
            </div>
            <Input
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="Motif (obligatoire)"
              className="h-9 sm:col-span-2"
              data-testid="editor-discount-reason"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApplyDiscount}
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-8 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
              )}
              data-testid="editor-apply-discount"
            >
              Appliquer la remise
            </button>
            {pricing.commercialDiscount && (
              <button
                type="button"
                onClick={handleRemoveDiscount}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-8"
                )}
                data-testid="editor-remove-discount"
              >
                Annuler la remise
              </button>
            )}
          </div>
          {discountError && (
            <p
              className="mt-2 text-xs text-destructive"
              data-testid="editor-discount-error"
            >
              {discountError}
            </p>
          )}
          {discountWarning && (
            <p
              className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900"
              data-testid="editor-discount-warning"
            >
              {discountWarning}
            </p>
          )}
          {pricing.commercialDiscount && (
            <p className="mt-2 text-xs text-foreground/70">
              Remise appliquée :{" "}
              <strong>{formatPriceEuros(pricing.commercialDiscount.valueEuros)}</strong>
              {" "}({pricing.commercialDiscount.percentDisplay}%) — motif :{" "}
              <em>{pricing.commercialDiscount.reason}</em>.
              {pricing.estimatedFundingTotal !== null && (
                <>
                  {" "}Prise en charge estimée{" "}
                  <strong>
                    {formatPriceEuros(pricing.estimatedFundingTotal)}
                  </strong>{" "}
                  (plafonnée au coût final), reste à charge{" "}
                  <strong>
                    {pricing.estimatedRemainingCost !== null
                      ? formatPriceEuros(pricing.estimatedRemainingCost)
                      : "—"}
                  </strong>
                  .
                </>
              )}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
