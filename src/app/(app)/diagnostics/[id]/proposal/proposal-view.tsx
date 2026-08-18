"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  CalendarCheck2,
  CheckCircle2,
  Cpu,
  FileText,
  HardDrive,
  Loader2,
  Mail,
  MessageSquareText,
  Sparkles,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  generateProposal,
  getProposalByDiagnosticId,
  type ProposalErrorContext,
  type StoredProposal,
} from "@/lib/proposals/proposal-service";
import { getDiagnosticSummary } from "@/lib/diagnostics/diagnostic-service";
import { createTrainingSession } from "@/lib/sessions/session-service";
import { formatPriceEuros } from "@/lib/pricing/training-pricing";
import { AgeficePresentielCoverageBadgeView } from "@/components/funding/agefice-presentiel-coverage-badge";
import { decideFundingNotesRender } from "@/lib/pricing/decide-funding-notes-render";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "generating" }
  | { kind: "ready"; stored: StoredProposal; warnings: string[] }
  | {
      kind: "error";
      message: string;
      /**
       * Contexte d'échec preflight (session/lecture/…). Permet de
       * rendre un CTA dédié : bouton « Recharger la page » quand
       * `action === 'reload'`, « Réessayer » sinon.
       */
      errorContext?: ProposalErrorContext;
    };

const REGEN_TOAST_MS = 6_000;

interface Props {
  diagnosticId: string;
}

export function ProposalView({ diagnosticId }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  // Toast horodaté après un PUT réussi. `null` = pas de toast en cours.
  // Auto-effacé après REGEN_TOAST_MS.
  const [lastRegeneratedAt, setLastRegeneratedAt] = useState<string | null>(
    null
  );
  useEffect(() => {
    if (!lastRegeneratedAt) return;
    const t = setTimeout(() => setLastRegeneratedAt(null), REGEN_TOAST_MS);
    return () => clearTimeout(t);
  }, [lastRegeneratedAt]);

  useEffect(() => {
    let cancelled = false;
    getProposalByDiagnosticId(diagnosticId).then((result) => {
      if (cancelled) return;
      if (result.data) {
        setStatus({ kind: "ready", stored: result.data, warnings: [] });
      } else {
        setStatus({ kind: "idle" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [diagnosticId]);

  const runGeneration = useCallback(async () => {
    setStatus({ kind: "generating" });
    const result = await generateProposal(diagnosticId);
    if (!result.data) {
      setStatus({
        kind: "error",
        message: result.error ?? "La génération a échoué.",
        errorContext: result.errorContext,
      });
      return;
    }
    setStatus({
      kind: "ready",
      stored: result.data.stored,
      warnings: result.data.warnings,
    });
    // Toast horodaté — la date visible en tête (SourceBadge) reflète
    // désormais `stored.generatedAt` frais côté serveur.
    setLastRegeneratedAt(result.data.stored.generatedAt);
  }, [diagnosticId]);

  const handleReloadPage = useCallback(() => {
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  const handleCreateSession = useCallback(async () => {
    if (creatingSession) return;
    if (status.kind !== "ready") return;
    setCreatingSession(true);
    setSessionError(null);

    const summary = await getDiagnosticSummary(diagnosticId);
    if (!summary.data) {
      setSessionError(
        summary.error ??
          "Impossible de retrouver le diagnostic — la session ne peut pas être créée."
      );
      setCreatingSession(false);
      return;
    }

    const pricing = status.stored.proposal.pricing;
    const sessionResult = await createTrainingSession({
      diagnosticId,
      clientId: summary.data.diagnostic.clientId,
      recommendationId: status.stored.recommendationId ?? null,
      expectedParticipants:
        pricing.participantCount ?? summary.data.diagnostic.expectedParticipants ?? null,
      notes: status.stored.proposal.proposalTitle,
    });

    setCreatingSession(false);

    if (!sessionResult.data) {
      setSessionError(sessionResult.error ?? "Création de session impossible.");
      return;
    }

    router.push(`/sessions/${sessionResult.data.id}`);
  }, [creatingSession, diagnosticId, router, status]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <Link
          href={`/diagnostics/${diagnosticId}/recommendation`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-[#00527a]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour à la recommandation
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-[#00527a]">
              Proposition commerciale
            </h1>
            <p className="text-muted-foreground">
              Diagnostic <code className="text-foreground/80">{diagnosticId}</code>
            </p>
          </div>
          {status.kind === "ready" && (
            <div className="flex flex-col items-end gap-1">
              <SourceBadge stored={status.stored} />
              <p
                className="text-[11px] text-muted-foreground"
                data-testid="proposal-header-generated-at"
              >
                Générée le{" "}
                {new Date(status.stored.generatedAt).toLocaleString("fr-FR")}
              </p>
            </div>
          )}
        </div>
      </div>

      {lastRegeneratedAt && (
        <div
          role="status"
          data-testid="regen-toast"
          className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          Proposition régénérée à{" "}
          {new Date(lastRegeneratedAt).toLocaleTimeString("fr-FR")}
        </div>
      )}

      {status.kind === "loading" && (
        <Card className="border-border/60 bg-white">
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement de la proposition…
          </CardContent>
        </Card>
      )}

      {status.kind === "idle" && (
        <Card className="border-border/60 bg-white">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Pas encore de proposition générée
              </CardTitle>
            </div>
            <CardDescription>
              À partir de la recommandation validée, génère le programme,
              la tarification, le mail dirigeant et le package de
              communication interne. Aucun email n&apos;est envoyé : tout
              reste à relire avant diffusion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              onClick={runGeneration}
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 h-11 px-5"
              )}
            >
              <Sparkles className="h-4 w-4" />
              Générer la proposition
              <ArrowRight className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {status.kind === "generating" && (
        <Card className="border-border/60 bg-white">
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Génération en cours — quelques secondes…
          </CardContent>
        </Card>
      )}

      {status.kind === "error" && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-red-700" />
            <div>
              <p className="font-medium">La génération a échoué</p>
              <p className="text-red-800/80">{status.message}</p>
            </div>
          </div>
          {status.errorContext?.action === "reload" ? (
            <button
              type="button"
              onClick={handleReloadPage}
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
              )}
            >
              Recharger la page
            </button>
          ) : status.errorContext?.action === "analyze" ? (
            <Link
              href={`/diagnostics/${diagnosticId}/recommendation`}
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
              )}
            >
              Lancer l&apos;analyse
            </Link>
          ) : (
            <button
              type="button"
              onClick={runGeneration}
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
              )}
            >
              Réessayer
            </button>
          )}
        </div>
      )}

      {status.kind === "ready" && (
        <ProposalDetails
          stored={status.stored}
          warnings={status.warnings}
          onRegenerate={runGeneration}
          onCreateSession={handleCreateSession}
          creatingSession={creatingSession}
          sessionError={sessionError}
        />
      )}
    </div>
  );
}

function SourceBadge({ stored }: { stored: StoredProposal }) {
  const isLlm = stored.source === "llm";
  return (
    <Badge
      variant="outline"
      className={cn(
        "flex items-center gap-1",
        isLlm
          ? "border-[#3ea9ff]/40 bg-[#eaf5ff] text-[#00527a]"
          : "border-amber-300 bg-amber-50 text-amber-800"
      )}
    >
      {isLlm ? <Brain className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
      {isLlm
        ? `Source : OpenRouter · ${stored.model ?? "modèle inconnu"}`
        : "Source : Moteur local"}
    </Badge>
  );
}

interface DetailsProps {
  stored: StoredProposal;
  warnings: string[];
  onRegenerate: () => void;
  onCreateSession: () => void;
  creatingSession: boolean;
  sessionError: string | null;
}

function ProposalDetails({
  stored,
  warnings,
  onRegenerate,
  onCreateSession,
  creatingSession,
  sessionError,
}: DetailsProps) {
  const p = stored.proposal;
  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
          <div>
            <p className="font-medium">Notes du moteur</p>
            <ul className="list-disc space-y-0.5 pl-5 text-amber-800/80">
              {warnings.map((w, idx) => (
                <li key={`${idx}-${w.slice(0, 20)}`}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Card className="border-border/60 bg-white">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <CardTitle className="font-heading text-2xl text-[#00527a]">
              {p.proposalTitle}
            </CardTitle>
          </div>
          <CardDescription>{p.executiveSummary}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label="Durée totale" value={`${p.trainingProgram.totalDurationHours} h`} />
            <Stat label="Format suggéré" value={p.trainingProgram.suggestedFormat} />
            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Score de confiance
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Progress value={p.confidenceScore} className="h-2 flex-1" />
                <span className="font-heading text-base font-bold text-[#00527a]">
                  {Math.round(p.confidenceScore)}%
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <CardTitle className="font-heading text-xl text-[#00527a]">
            Programme de formation ({p.trainingProgram.modules.length} module
            {p.trainingProgram.modules.length > 1 ? "s" : ""})
          </CardTitle>
          <CardDescription>{p.trainingProgram.targetAudience}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {p.trainingProgram.pedagogicalObjectives.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Objectifs pédagogiques
              </p>
              <ul className="space-y-1 text-sm text-foreground/80">
                {p.trainingProgram.pedagogicalObjectives.map((o, idx) => (
                  <li key={`${idx}-obj`}>· {o}</li>
                ))}
              </ul>
            </div>
          )}

          <ol className="space-y-3">
            {p.trainingProgram.modules.map((m, idx) => (
              <li
                key={`${idx}-${m.title}`}
                className="rounded-lg border border-border/60 bg-muted/10 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-heading text-base font-semibold text-[#00527a]">
                    {idx + 1}. {m.title}
                  </p>
                  <Badge variant="secondary" className="bg-[#eaf5ff] text-[#00527a]">
                    {m.durationHours} h
                  </Badge>
                </div>
                <Separator className="my-3" />
                <p className="text-sm text-foreground/80">{m.whyThisModule}</p>
                {m.themes.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-semibold">Thèmes :</span>{" "}
                    {m.themes.join(", ")}
                  </p>
                )}
                {m.businessUseCases.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Cas métier
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {m.businessUseCases.map((u, ui) => (
                        <li key={`${ui}-uc`}>· {u}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {m.expectedOutcomes.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-semibold">Bénéfices attendus :</span>{" "}
                    {m.expectedOutcomes.join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <PricingCard pricing={p.pricing} />

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="h-5 w-5 text-[#3ea9ff]" />
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Guide des prochaines étapes
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {p.nextStepsGuide.steps.map((step, idx) => (
              <li
                key={`${idx}-${step.title}`}
                className="rounded-lg border border-border/60 bg-muted/10 p-4"
              >
                <p className="font-heading text-base font-semibold text-[#00527a]">
                  {idx + 1}. {step.title}
                </p>
                <p className="mt-1 text-sm text-foreground/80">{step.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-semibold">Action :</span>{" "}
                  {step.actionRequired}
                </p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#3ea9ff]" />
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Mail dirigeant (à relire)
            </CardTitle>
          </div>
          <CardDescription>
            Aucun envoi automatique : ce mail est un brouillon à valider.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-2 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Objet
            </p>
            <p className="font-medium text-foreground">
              {p.executiveEmail.subject}
            </p>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Corps
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/85">
              {p.executiveEmail.body}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#3ea9ff]" />
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Package communication interne
            </CardTitle>
          </div>
          <CardDescription>
            Pour aider le dirigeant à diffuser la formation à son équipe.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <CommBlock
            label="WhatsApp"
            value={p.internalCommunicationPack.whatsappMessage}
          />
          <CommBlock
            label="Email interne"
            value={p.internalCommunicationPack.internalEmail}
          />
          <CommBlock
            label="Pitch réunion équipe"
            value={p.internalCommunicationPack.teamMeetingPitch}
          />
          <CommBlock
            label="Post LinkedIn"
            value={p.internalCommunicationPack.linkedinPost}
          />
        </CardContent>
      </Card>

      {p.missingInformation.length > 0 && (
        <Card className="border-border/60 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="font-heading text-base text-[#00527a]">
              Informations manquantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm text-foreground/80">
              {p.missingInformation.map((m, idx) => (
                <li key={`${idx}-mi`}>· {m}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onRegenerate}
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
          )}
        >
          <Sparkles className="h-4 w-4" />
          Régénérer la proposition
        </button>
        <button
          type="button"
          onClick={onCreateSession}
          disabled={creatingSession}
          className={cn(
            buttonVariants({ size: "default" }),
            "h-10 px-5 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90",
            creatingSession && "opacity-60 cursor-not-allowed"
          )}
        >
          {creatingSession && <Loader2 className="h-4 w-4 animate-spin" />}
          Créer la session
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {sessionError && (
        <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-red-700" />
          <p>{sessionError}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Génération du {new Date(stored.generatedAt).toLocaleString("fr-FR")}
        {stored.recommendationId && (
          <>
            {" "}· recommandation : <code>{stored.recommendationId}</code>
          </>
        )}
      </p>
    </div>
  );
}

function PricingCard({ pricing }: { pricing: StoredProposal["proposal"]["pricing"] }) {
  // Décision de rendu des notes par participant — fonction pure
  // (decide-funding-notes-render). Cette variable gouverne à la fois
  // le rendu ci-dessous ET le garde-fou anti « liste vide » (aucun
  // conteneur / puce n'est produit si shouldRender=false).
  const fundingNotesDecision = decideFundingNotesRender(pricing.fundingNotes);
  return (
    <Card className="border-border/60 bg-white">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-heading text-xl text-[#00527a]">
            Tarification
          </CardTitle>
          {/* Composant partagé — plus jamais de JSX badge inline
              ici. Le test structural
              `proposal-view-uses-shared-badge.contract.test.ts` échoue
              si cet import disparaît (correctif 1 lot fiabilité). */}
          <AgeficePresentielCoverageBadgeView
            kind={pricing.ageficePresentielCoverage}
          />
        </div>
        {pricing.pricingNote && (
          <CardDescription className="text-amber-800">
            {pricing.pricingNote}
          </CardDescription>
        )}
        {/* Notes par cas participant — micro-PR OPCO note visible.
            Rendu ssi la fonction pure `decideFundingNotesRender` dit
            shouldRender=true. Contract test structural (proposal-view-
            renders-funding-notes.contract.test.ts) refuse tout rendu
            inline sans passer par cette décision. */}
        {fundingNotesDecision.shouldRender && (
          <ul
            data-testid="funding-notes-list"
            className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50/50 px-4 py-2 text-xs text-amber-900"
          >
            {fundingNotesDecision.notes.map((note, idx) => (
              <li key={idx} className="flex gap-2">
                <span aria-hidden>•</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        )}
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <Stat
          label="Coût / participant"
          value={
            pricing.costPerParticipant !== null
              ? formatPriceEuros(pricing.costPerParticipant)
              : "À valider"
          }
        />
        <Stat
          label="Participants"
          value={
            pricing.participantCount !== null
              ? String(pricing.participantCount)
              : "À confirmer"
          }
        />
        <Stat
          label="Coût pédagogique total"
          value={
            pricing.totalEstimatedCost !== null
              ? formatPriceEuros(pricing.totalEstimatedCost)
              : "À calculer"
          }
        />
        {pricing.estimatedFundingTotal !== null &&
        pricing.estimatedFundingTotal > 0 ? (
          <>
            <Stat
              label={
                pricing.eligibleParticipantCount
                  ? `Prise en charge potentielle (${pricing.eligibleParticipantCount} éligible${pricing.eligibleParticipantCount > 1 ? "s" : ""})`
                  : "Prise en charge potentielle"
              }
              value={formatPriceEuros(pricing.estimatedFundingTotal)}
            />
            <Stat
              label="Reste à charge estimatif"
              value={
                pricing.estimatedRemainingCost !== null
                  ? formatPriceEuros(pricing.estimatedRemainingCost)
                  : "—"
              }
            />
          </>
        ) : null}
      </CardContent>
      {pricing.fundingDisclaimer ? (
        <p className="mx-6 mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {pricing.fundingDisclaimer}
        </p>
      ) : null}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-xl font-bold text-[#00527a]">
        {value}
      </p>
    </div>
  );
}

function CommBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <MessageSquareText className="h-3.5 w-3.5" />
        {label}
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/85">
        {value}
      </pre>
    </div>
  );
}

// Local indicator badge that the proposal is cached locally (no Supabase
// persistence in MVP). Kept inline as a small visual marker in case future
// versions add server-side persistence — for now we show it discreetly in
// the source area.
export function CacheBadge() {
  return (
    <Badge
      variant="outline"
      className="border-amber-300 bg-amber-50 text-amber-800"
    >
      <HardDrive className="h-3 w-3" />
      Cache local
    </Badge>
  );
}
