"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  Cloud,
  Cpu,
  HardDrive,
  Loader2,
  Sparkles,
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
  analyzeDiagnostic,
  getRecommendationByDiagnosticId,
  type StoredRecommendation,
} from "@/lib/recommendations/recommendation-service";
import { formatPriceEuros } from "@/lib/pricing/training-pricing";
import { DiagnosticParticipantsEditor } from "@/components/diagnostics/diagnostic-participants-editor";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "analyzing" }
  | { kind: "ready"; stored: StoredRecommendation; warnings: string[] }
  | { kind: "error"; message: string };

interface Props {
  diagnosticId: string;
}

export function RecommendationView({ diagnosticId }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  // Charge une éventuelle recommandation existante au montage.
  useEffect(() => {
    let cancelled = false;
    getRecommendationByDiagnosticId(diagnosticId).then((result) => {
      if (cancelled) return;
      if (result.data) {
        setStatus({
          kind: "ready",
          stored: result.data,
          warnings: result.error ? [result.error] : [],
        });
      } else {
        setStatus({ kind: "idle" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [diagnosticId]);

  const runAnalysis = useCallback(async () => {
    setStatus({ kind: "analyzing" });
    const result = await analyzeDiagnostic(diagnosticId);
    if (!result.data) {
      setStatus({
        kind: "error",
        message: result.error ?? "L'analyse a échoué.",
      });
      return;
    }
    setStatus({
      kind: "ready",
      stored: result.data.stored,
      warnings: result.data.warnings,
    });
  }, [diagnosticId]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/diagnostics"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-[#00527a]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour aux diagnostics
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-[#00527a]">
              Recommandation IA
            </h1>
            <p className="text-muted-foreground">
              Diagnostic <code className="text-foreground/80">{diagnosticId}</code>
            </p>
          </div>
          {status.kind === "ready" && <SourceBadge stored={status.stored} />}
        </div>
      </div>

      {status.kind === "loading" && (
        <Card className="border-border/60 bg-white">
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement de la recommandation…
          </CardContent>
        </Card>
      )}

      {status.kind === "idle" && (
        <Card className="border-border/60 bg-white">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Aucune analyse pour ce diagnostic
              </CardTitle>
            </div>
            <CardDescription>
              Lancez l&apos;analyse pour générer la recommandation modulaire.
              Le moteur utilise OpenRouter si OPENROUTER_API_KEY est
              configurée côté serveur, sinon un moteur heuristique local.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              onClick={runAnalysis}
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 h-11 px-5"
              )}
            >
              <Sparkles className="h-4 w-4" />
              Analyser le besoin
              <ArrowRight className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {status.kind === "analyzing" && (
        <Card className="border-border/60 bg-white">
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyse en cours — quelques secondes…
          </CardContent>
        </Card>
      )}

      {status.kind === "error" && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-red-700" />
            <div>
              <p className="font-medium">L&apos;analyse a échoué</p>
              <p className="text-red-800/80">{status.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={runAnalysis}
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
            )}
          >
            Réessayer
          </button>
        </div>
      )}

      {status.kind === "ready" && (
        <RecommendationDetails
          stored={status.stored}
          warnings={status.warnings}
          onReanalyze={runAnalysis}
        />
      )}
    </div>
  );
}

function SourceBadge({ stored }: { stored: StoredRecommendation }) {
  const isLlm = stored.source === "llm";
  const isSupabase = stored.persistedInSupabase;
  return (
    <div className="flex flex-col items-end gap-1">
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
      <Badge
        variant="outline"
        className={cn(
          "flex items-center gap-1 text-xs",
          isSupabase
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-amber-300 bg-amber-50 text-amber-800"
        )}
      >
        {isSupabase ? (
          <Cloud className="h-3 w-3" />
        ) : (
          <HardDrive className="h-3 w-3" />
        )}
        {isSupabase ? "Persistée Supabase" : "Cache local"}
      </Badge>
    </div>
  );
}

interface DetailsProps {
  stored: StoredRecommendation;
  warnings: string[];
  onReanalyze: () => void;
}

const TOOL_MATURITY_LABEL: Record<string, string> = {
  low: "Faible",
  medium: "Intermédiaire",
  high: "Élevée",
};

const SKILL_LEVEL_LABEL: Record<string, string> = {
  beginner: "Débutant",
  intermediate: "Intermédiaire",
  advanced: "Avancé",
  mixed: "Mixte",
};

function RecommendationDetails({ stored, warnings, onReanalyze }: DetailsProps) {
  const rec = stored.recommendation;
  const proposalHref = `/diagnostics/${stored.diagnosticId}/proposal`;
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
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Synthèse client
            </CardTitle>
          </div>
          <CardDescription>{rec.clientSummary}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Stat label="Maturité outils" value={TOOL_MATURITY_LABEL[rec.toolMaturity]} />
          <Stat label="Niveau métier" value={SKILL_LEVEL_LABEL[rec.skillLevel]} />
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Score de confiance
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={rec.confidenceScore} className="h-2 flex-1" />
              <span className="font-heading text-base font-bold text-[#00527a]">
                {Math.round(rec.confidenceScore)}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <BulletCard
          title="Besoins détectés"
          items={rec.detectedNeeds}
          emptyHint="Aucun besoin spécifique détecté."
        />
        <BulletCard
          title="Problèmes de performance"
          items={rec.performanceIssues}
          emptyHint="Aucun problème de performance signalé."
        />
      </div>

      <DiagnosticParticipantsEditor diagnosticId={stored.diagnosticId} />

      <Card className="border-border/60 bg-white">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Modules recommandés ({rec.recommendedModules.length})
            </CardTitle>
            <CardDescription>
              Durée totale : {rec.totalDurationHours} h
              {rec.costPerParticipant !== null && (
                <> · {formatPriceEuros(rec.costPerParticipant)} / participant (tarif Start Academy, tout compris)</>
              )}
              {rec.costPerParticipant === null && (
                <> · tarif calculé automatiquement (tarif Start Academy, tout compris)</>
              )}
            </CardDescription>
          </div>
          {rec.requiredFoundations.length > 0 && (
            <Badge
              variant="outline"
              className="border-[#3ea9ff] bg-[#eaf5ff] text-[#00527a]"
            >
              {rec.requiredFoundations.length} socle{rec.requiredFoundations.length > 1 ? "s" : ""} prérequis
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {rec.recommendedModules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun module n&apos;a pu être retenu — consultez les informations
              manquantes ci-dessous.
            </p>
          ) : (
            <ol className="space-y-3">
              {rec.recommendedModules.map((module) => {
                const isFoundation = rec.requiredFoundations.includes(module.moduleId);
                return (
                  <li
                    key={module.moduleId}
                    className="rounded-lg border border-border/60 bg-muted/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-heading text-base font-semibold text-[#00527a]">
                          {module.priority}. {module.moduleName}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <code>{module.moduleId}</code>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-xs">
                        <Badge
                          variant="secondary"
                          className="bg-[#eaf5ff] text-[#00527a]"
                        >
                          {module.durationHours} h
                        </Badge>
                        {isFoundation && (
                          <Badge
                            variant="outline"
                            className="border-[#3ea9ff] text-[#00527a]"
                          >
                            Socle
                          </Badge>
                        )}
                        <PriorityTierBadge tier={module.priorityTier} />
                      </div>
                    </div>
                    <Separator className="my-3" />
                    <p className="text-sm text-foreground/80">{module.reason}</p>
                    {module.businessRatioTargeted && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-semibold">Ratio visé :</span>{" "}
                        {module.businessRatioTargeted}
                      </p>
                    )}
                    {module.useCases.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {module.useCases.map((uc, idx) => (
                          <li key={`${module.moduleId}-uc-${idx}`}>· {uc}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <CardTitle className="font-heading text-base text-[#00527a]">
            Argumentaire commercial
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-foreground/80">
          {rec.commercialExplanation}
        </CardContent>
      </Card>

      <BulletCard
        title="Informations manquantes"
        items={rec.missingInformation}
        emptyHint="Aucune information manquante."
        tone="amber"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onReanalyze}
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
          )}
        >
          <Sparkles className="h-4 w-4" />
          Relancer l&apos;analyse
        </button>
        <Link
          href={proposalHref}
          className={cn(
            buttonVariants({ size: "default" }),
            "h-10 px-5 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
          )}
        >
          Créer la proposition
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
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

function BulletCard({
  title,
  items,
  emptyHint,
  tone = "default",
}: {
  title: string;
  items: string[];
  emptyHint: string;
  tone?: "default" | "amber";
}) {
  return (
    <Card
      className={cn(
        "border-border/60",
        tone === "amber" ? "bg-amber-50/40" : "bg-white"
      )}
    >
      <CardHeader>
        <CardTitle className="font-heading text-base text-[#00527a]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-foreground/80">
            {items.map((item, idx) => (
              <li key={`${idx}-${item.slice(0, 20)}`}>· {item}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const PRIORITY_TIER_LABEL: Record<
  "essential" | "recommended" | "optional" | "later",
  { label: string; className: string }
> = {
  essential: {
    label: "Essentiel",
    className: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
  recommended: {
    label: "Recommandé",
    className: "border-[#3ea9ff] bg-[#eaf5ff] text-[#00527a]",
  },
  optional: {
    label: "Optionnel",
    className: "border-amber-300 bg-amber-50 text-amber-800",
  },
  later: {
    label: "Plus tard",
    className: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
  },
};

function PriorityTierBadge({
  tier,
}: {
  tier: "essential" | "recommended" | "optional" | "later" | null | undefined;
}) {
  // Backward-compat : si pas de tier (ancienne recommandation),
  // on n'affiche rien — la UI reste propre sans badge fantôme.
  if (!tier) return null;
  const meta = PRIORITY_TIER_LABEL[tier];
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}
