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
  ClipboardCheck,
  Cloud,
  Cpu,
  FileDown,
  Hammer,
  HardDrive,
  Lightbulb,
  Loader2,
  Presentation,
  Sparkles,
  Target,
  Wrench,
  Zap,
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
  generateTrainingSupport,
  getTrainingSupportBySessionId,
  updateTrainingSupportStatus,
  type StoredTrainingSupport,
  type SupportStatus,
} from "@/lib/training-support/training-support-service";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "generating" }
  | { kind: "ready"; stored: StoredTrainingSupport; warnings: string[] }
  | { kind: "error"; message: string };

interface Props {
  sessionId: string;
}

export function SupportView({ sessionId }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    getTrainingSupportBySessionId(sessionId).then((result) => {
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
    const result = await generateTrainingSupport(sessionId);
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
    async (next: SupportStatus) => {
      if (status.kind !== "ready" || statusUpdating) return;
      setStatusUpdating(true);
      setStatusError(null);
      const result = await updateTrainingSupportStatus(status.stored.id, next);
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
          href={`/sessions/${sessionId}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-[#00527a]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour à la session
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-[#00527a]">
              Support de formation
            </h1>
            <p className="text-muted-foreground">
              Session <code className="text-foreground/80">{sessionId}</code>
            </p>
          </div>
          {status.kind === "ready" && <HeaderBadges stored={status.stored} />}
        </div>
      </div>

      {status.kind === "loading" && (
        <Card className="border-border/60 bg-white">
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement du support…
          </CardContent>
        </Card>
      )}

      {status.kind === "idle" && (
        <Card className="border-border/60 bg-white">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <Presentation className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Pas encore de support généré
              </CardTitle>
            </div>
            <CardDescription>
              Le support de formation est assemblé à partir du diagnostic, de
              la recommandation, de la proposition et des cas concrets
              remontés par les collaborateurs. OpenRouter est utilisé si
              configuré, sinon un moteur heuristique local prend le relais.
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
              Générer le support
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
        <SupportDetails
          stored={status.stored}
          warnings={status.warnings}
          onRegenerate={runGeneration}
          onUpdateStatus={updateStatus}
          statusUpdating={statusUpdating}
          statusError={statusError}
        />
      )}
    </div>
  );
}

const STATUS_LABEL: Record<SupportStatus, string> = {
  draft: "Brouillon",
  validated: "Validé",
  archived: "Archivé",
};

const STATUS_TONE: Record<SupportStatus, string> = {
  draft: "border-[#3ea9ff]/40 bg-[#eaf5ff] text-[#00527a]",
  validated: "border-emerald-300 bg-emerald-50 text-emerald-700",
  archived: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

function HeaderBadges({ stored }: { stored: StoredTrainingSupport }) {
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
          ? "Support persisté Supabase"
          : "Support en cache local"}
      </Badge>
      <Badge
        variant="outline"
        className={cn("flex items-center gap-1 text-xs", STATUS_TONE[stored.status])}
      >
        Statut : {STATUS_LABEL[stored.status]}
      </Badge>
    </div>
  );
}

interface DetailsProps {
  stored: StoredTrainingSupport;
  warnings: string[];
  onRegenerate: () => void;
  onUpdateStatus: (next: SupportStatus) => Promise<void>;
  statusUpdating: boolean;
  statusError: string | null;
}

function SupportDetails({
  stored,
  warnings,
  onRegenerate,
  onUpdateStatus,
  statusUpdating,
  statusError,
}: DetailsProps) {
  const s = stored.support;
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
          <CardTitle className="font-heading text-2xl text-[#00527a]">
            {s.supportTitle}
          </CardTitle>
          <CardDescription>{s.sessionSummary}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Stat label="Public cible" value={s.targetAudience} />
          <Stat label="Durée totale" value={`${s.totalDurationHours} h`} />
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Score de confiance
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={s.confidenceScore} className="h-2 flex-1" />
              <span className="font-heading text-base font-bold text-[#00527a]">
                {Math.round(s.confidenceScore)}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-[#3ea9ff]" />
            <CardTitle className="font-heading text-lg text-[#00527a]">
              Intention pédagogique
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-foreground/80">
          {s.pedagogicalIntent}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold text-[#00527a]">
          Modules ({s.modules.length})
        </h2>
        {s.modules.map((mod, idx) => (
          <ModuleCard key={`${idx}-${mod.moduleTitle}`} index={idx + 1} module={mod} />
        ))}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <BulletCard
          title="Notes formateur"
          items={s.facilitatorNotes}
          emptyHint="Aucune note spécifique."
          icon={Lightbulb}
        />
        <BulletCard
          title="Préparation participants"
          items={s.participantPreparation}
          emptyHint="Aucune préparation spécifique demandée."
          icon={ClipboardCheck}
        />
      </div>

      <BulletCard
        title="Matériel nécessaire"
        items={s.materialsNeeded}
        emptyHint="Aucun matériel spécifique."
        icon={Wrench}
      />

      {s.missingInformation.length > 0 && (
        <Card className="border-border/60 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="font-heading text-base text-[#00527a]">
              Informations manquantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm text-foreground/80">
              {s.missingInformation.map((m, idx) => (
                <li key={`${idx}-mi`}>· {m}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
          Régénérer le support
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
              Valider le support
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
            href={`/sessions/${stored.sessionId}/support/design`}
            className={cn(
              buttonVariants({ size: "default" }),
              "h-10 px-5 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
            )}
          >
            <Sparkles className="h-4 w-4" />
            Créer le support designé
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={`/sessions/${stored.sessionId}/support/print`}
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              "h-10 px-4 border-border text-muted-foreground hover:bg-muted/40"
            )}
          >
            <FileDown className="h-4 w-4" />
            Export PDF brut
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Génération du {new Date(stored.generatedAt).toLocaleString("fr-FR")}
        {stored.diagnosticId && (
          <>
            {" "}· diagnostic : <code>{stored.diagnosticId}</code>
          </>
        )}
      </p>
    </div>
  );
}

function ModuleCard({
  index,
  module,
}: {
  index: number;
  module: StoredTrainingSupport["support"]["modules"][number];
}) {
  return (
    <Card className="border-border/60 bg-white">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="font-heading text-lg text-[#00527a]">
            {index}. {module.moduleTitle}
          </CardTitle>
          <Badge variant="secondary" className="bg-[#eaf5ff] text-[#00527a]">
            {module.durationHours} h
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Block
          icon={Target}
          label="Problématique"
          body={module.problemStatement}
        />
        <Block
          icon={Lightbulb}
          label="Prise de conscience"
          body={module.awarenessSequence}
        />

        <div>
          <BlockLabel icon={Wrench} label="Fondamentaux" />
          <ul className="mt-1.5 space-y-1 text-foreground/80">
            {module.fundamentals.map((f, idx) => (
              <li key={`${idx}-f`}>· {f}</li>
            ))}
          </ul>
        </div>

        <Separator />

        <div>
          <BlockLabel icon={Zap} label="Accélérateur IA" />
          <p className="mt-1.5 text-foreground/80">
            {module.aiAccelerator.objective}
          </p>
          {module.aiAccelerator.tools.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {module.aiAccelerator.tools.map((tool, idx) => (
                <Badge
                  key={`${idx}-tool`}
                  variant="outline"
                  className="border-[#3ea9ff]/40 text-[#00527a]"
                >
                  {tool}
                </Badge>
              ))}
            </div>
          )}
          {module.aiAccelerator.examplePrompts.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Prompts d&apos;exemple
              </p>
              <ul className="mt-1 space-y-1.5">
                {module.aiAccelerator.examplePrompts.map((p, idx) => (
                  <li
                    key={`${idx}-p`}
                    className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 font-mono text-xs text-foreground/80"
                  >
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Separator />

        <div>
          <BlockLabel icon={Hammer} label="Exercice métier" />
          <p className="mt-1.5 font-medium text-foreground">
            {module.concreteBusinessExercise.title}
          </p>
          <p className="mt-1 text-foreground/80">
            {module.concreteBusinessExercise.context}
          </p>
          <ol className="mt-2 space-y-1 text-foreground/80">
            {module.concreteBusinessExercise.instructions.map((ins, idx) => (
              <li key={`${idx}-ins`}>{idx + 1}. {ins}</li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-semibold">Livrable attendu :</span>{" "}
            {module.concreteBusinessExercise.expectedOutput}
          </p>
        </div>

        {module.realCasesToUse.length > 0 ? (
          <div>
            <BlockLabel icon={ClipboardCheck} label="Cas réels à utiliser" />
            <ul className="mt-1.5 space-y-1 text-foreground/80">
              {module.realCasesToUse.map((c, idx) => (
                <li key={`${idx}-rc`}>· {c}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-amber-800">
            Aucun cas réel collaborateur disponible — exercice générique métier
            utilisé.
          </p>
        )}

        <Separator />

        <div className="grid gap-3 sm:grid-cols-3">
          <Block icon={ClipboardCheck} label="Clôture" body={module.stepClosing} compact />
          <Block icon={Target} label="Action terrain" body={module.fieldAction} compact />
          <Block icon={Zap} label="Indicateur" body={module.progressIndicator} compact />
        </div>
      </CardContent>
    </Card>
  );
}

function Block({
  icon: Icon,
  label,
  body,
  compact,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <div className={cn(compact && "rounded-md border border-border/60 bg-muted/10 p-3")}>
      <BlockLabel icon={Icon} label={label} />
      <p
        className={cn(
          "mt-1.5 text-foreground/80",
          compact && "text-xs"
        )}
      >
        {body}
      </p>
    </div>
  );
}

function BlockLabel({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
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

function BulletCard({
  title,
  items,
  emptyHint,
  icon: Icon,
}: {
  title: string;
  items: string[];
  emptyHint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-border/60 bg-white">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#3ea9ff]" />
          <CardTitle className="font-heading text-base text-[#00527a]">
            {title}
          </CardTitle>
        </div>
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
