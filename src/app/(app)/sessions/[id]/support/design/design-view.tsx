"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  Cloud,
  Cpu,
  FileDown,
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
import { cn } from "@/lib/utils";
import {
  DesignedSlideCard,
  TrainerNoteCard,
} from "@/components/training-support/designed-slide";
import {
  generateDesignedSupport,
  getDesignedSupportBySessionId,
  updateDesignedSupportStatus,
  type DesignedSupportStatus,
  type StoredDesignedSupport,
} from "@/lib/training-support/designed-support-service";
import { SupportQualityValidation } from "./support-quality-validation";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "generating" }
  | { kind: "ready"; stored: StoredDesignedSupport; warnings: string[] }
  | { kind: "error"; message: string };

interface Props {
  sessionId: string;
}

export function DesignView({ sessionId }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    getDesignedSupportBySessionId(sessionId).then((result) => {
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
  }, [sessionId]);

  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const runGeneration = useCallback(async () => {
    setStatus({ kind: "generating" });
    setStatusError(null);
    const result = await generateDesignedSupport(sessionId);
    if (!result.data) {
      setStatus({
        kind: "error",
        message: result.error ?? "La génération a échoué.",
      });
      return;
    }
    setStatus({
      kind: "ready",
      stored: result.data.stored,
      warnings: result.data.warnings,
    });
  }, [sessionId]);

  const updateStatus = useCallback(
    async (next: DesignedSupportStatus) => {
      if (status.kind !== "ready" || statusUpdating) return;
      setStatusUpdating(true);
      setStatusError(null);
      const result = await updateDesignedSupportStatus(status.stored.id, next);
      setStatusUpdating(false);
      if (!result.data) {
        setStatusError(result.error ?? "Mise à jour du statut impossible.");
        return;
      }
      setStatus({
        kind: "ready",
        stored: result.data,
        warnings: status.warnings,
      });
      if (result.error) setStatusError(result.error);
    },
    [status, statusUpdating]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <Link
          href={`/sessions/${sessionId}/support`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-[#00527a]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour au support pédagogique
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-[#00527a]">
              Support designé
            </h1>
            <p className="text-muted-foreground">
              Slides 16:9 conformes à la charte Start Academy. Claude propose
              la narration, React impose le design.
            </p>
          </div>
          {status.kind === "ready" && <SourceBadge stored={status.stored} />}
        </div>
      </div>

      {status.kind === "loading" && (
        <Card className="border-border/60 bg-white">
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement du déroulé…
          </CardContent>
        </Card>
      )}

      {status.kind === "idle" && (
        <Card className="border-border/60 bg-white">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Pas encore de support designé
              </CardTitle>
            </div>
            <CardDescription>
              Transformez le support pédagogique en déroulé visuel premium.
              OpenRouter est utilisé si configuré, sinon un moteur heuristique
              local prend le relais. La charte Start Academy est imposée par
              le code — chaque génération reste cohérente.
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
              Générer le support designé
              <ArrowRight className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {status.kind === "generating" && (
        <Card className="border-border/60 bg-white">
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Design en cours — quelques secondes…
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
        </div>
      )}

      {status.kind === "ready" && (
        <>
          <DesignReady
            sessionId={sessionId}
            stored={status.stored}
            warnings={status.warnings}
            onRegenerate={runGeneration}
            onUpdateStatus={updateStatus}
            statusUpdating={statusUpdating}
            statusError={statusError}
          />
          <SupportQualityValidation
            sessionId={sessionId}
            designedSupportId={status.stored.id}
            trainingSupportId={status.stored.trainingSupportId ?? null}
          />
        </>
      )}
    </div>
  );
}

const DESIGN_STATUS_LABEL: Record<DesignedSupportStatus, string> = {
  draft: "Brouillon",
  validated: "Validé",
  archived: "Archivé",
};

const DESIGN_STATUS_TONE: Record<DesignedSupportStatus, string> = {
  draft: "border-[#3ea9ff]/40 bg-[#eaf5ff] text-[#00527a]",
  validated: "border-emerald-300 bg-emerald-50 text-emerald-700",
  archived: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

function SourceBadge({ stored }: { stored: StoredDesignedSupport }) {
  const isLlm = stored.source === "llm";
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
          stored.persistedInSupabase
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-amber-300 bg-amber-50 text-amber-800"
        )}
      >
        {stored.persistedInSupabase ? (
          <Cloud className="h-3 w-3" />
        ) : (
          <HardDrive className="h-3 w-3" />
        )}
        {stored.persistedInSupabase
          ? "Design persisté Supabase"
          : "Design en cache local"}
      </Badge>
      <Badge
        variant="outline"
        className={cn(
          "flex items-center gap-1 text-xs",
          DESIGN_STATUS_TONE[stored.status]
        )}
      >
        Statut : {DESIGN_STATUS_LABEL[stored.status]}
      </Badge>
    </div>
  );
}

interface ReadyProps {
  sessionId: string;
  stored: StoredDesignedSupport;
  warnings: string[];
  onRegenerate: () => void;
  onUpdateStatus: (next: DesignedSupportStatus) => Promise<void>;
  statusUpdating: boolean;
  statusError: string | null;
}

function DesignReady({
  sessionId,
  stored,
  warnings,
  onRegenerate,
  onUpdateStatus,
  statusUpdating,
  statusError,
}: ReadyProps) {
  const design = stored.design;
  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
          <div>
            <p className="font-medium">Notes du moteur</p>
            <ul className="list-disc space-y-0.5 pl-5 text-amber-800/80">
              {warnings.map((w, idx) => (
                <li key={`w-${idx}`}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Card className="border-border/60 bg-white">
        <CardHeader className="space-y-3">
          <CardTitle className="font-heading text-2xl text-[#00527a]">
            {design.designTitle}
          </CardTitle>
          <CardDescription>{design.designSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Stat label="Slides" value={String(design.slides.length)} />
          <Stat
            label="Intention visuelle"
            value={design.visualIntent}
          />
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Score de confiance
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={design.confidenceScore} className="h-2 flex-1" />
              <span className="font-heading text-base font-bold text-[#00527a]">
                {Math.round(design.confidenceScore)}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {design.designWarnings.length > 0 && (
        <Card className="border-border/60 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="font-heading text-base text-[#00527a]">
              Avertissements design
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm text-foreground/80">
              {design.designWarnings.map((w, idx) => (
                <li key={`dw-${idx}`}>· {w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Livrable final mis en avant — PDF designé = action prioritaire. */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[#3ea9ff]/30 bg-gradient-to-br from-[#eaf5ff] via-white to-[#3ea9ff]/15 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-heading text-[11px] font-semibold uppercase tracking-[0.35em] text-[#3ea9ff]">
            Livrable final
          </p>
          <p className="mt-1 font-heading text-lg font-semibold text-[#00527a]">
            Exporter le support designé en PDF Start Academy
          </p>
          <p className="mt-1 text-xs text-[#00527a]/70">
            A4 paysage, une slide par page, couleurs charte conservées.
          </p>
        </div>
        <Link
          href={`/sessions/${sessionId}/support/design/print`}
          className={cn(
            buttonVariants({ size: "lg" }),
            "h-11 px-5 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
          )}
        >
          <FileDown className="h-4 w-4" />
          Exporter PDF designé
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold text-[#00527a]">
          Aperçu des slides ({design.slides.length})
        </h2>
        <div className="space-y-6">
          {design.slides.map((slide) => (
            <div key={`slide-${slide.slideNumber}`} className="space-y-2">
              <DesignedSlideCard
                slide={slide}
                total={design.slides.length}
                deckTitle={design.designTitle}
              />
              <TrainerNoteCard slide={slide} />
            </div>
          ))}
        </div>
      </section>

      {statusError && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
          <p>{statusError}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onRegenerate}
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
          )}
        >
          <Sparkles className="h-4 w-4" />
          Régénérer
        </button>
        <div className="flex flex-col gap-2 sm:flex-row">
          {stored.status !== "validated" && stored.status !== "archived" && (
            <button
              type="button"
              onClick={() => onUpdateStatus("validated")}
              disabled={statusUpdating}
              className={cn(
                buttonVariants({ size: "default" }),
                "h-10 px-4 bg-emerald-600 text-white hover:bg-emerald-700",
                statusUpdating && "opacity-60 cursor-not-allowed"
              )}
            >
              {statusUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Valider le design
            </button>
          )}
          {stored.status === "validated" && (
            <button
              type="button"
              onClick={() => onUpdateStatus("draft")}
              disabled={statusUpdating}
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "h-10 px-4 border-emerald-300 text-emerald-700 hover:bg-emerald-50",
                statusUpdating && "opacity-60 cursor-not-allowed"
              )}
            >
              {statusUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Repasser en brouillon
            </button>
          )}
          {stored.status !== "archived" ? (
            <button
              type="button"
              onClick={() => onUpdateStatus("archived")}
              disabled={statusUpdating}
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "h-10 px-4 border-border text-muted-foreground hover:bg-muted/40",
                statusUpdating && "opacity-60 cursor-not-allowed"
              )}
            >
              <Archive className="h-4 w-4" />
              Archiver
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onUpdateStatus("draft")}
              disabled={statusUpdating}
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "h-10 px-4 border-border text-muted-foreground hover:bg-muted/40",
                statusUpdating && "opacity-60 cursor-not-allowed"
              )}
            >
              <Archive className="h-4 w-4" />
              Dé-archiver
            </button>
          )}
          <Link
            href={`/sessions/${sessionId}/support/design/print`}
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              "h-10 px-4 border-[#3ea9ff]/40 text-[#00527a] hover:bg-[#eaf5ff]"
            )}
          >
            <FileDown className="h-4 w-4" />
            Re-exporter PDF
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Génération du {new Date(stored.generatedAt).toLocaleString("fr-FR")} · cache
        local
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-base font-semibold text-[#00527a]">
        {value}
      </p>
    </div>
  );
}
