import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText, Sparkles } from "lucide-react";

import type { ResumeEntryPointDecision } from "@/lib/diagnostics/decide-resume-entry-point";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  diagnosticId: string;
  status: string | null;
  agencyName: string | null;
  director: string | null;
  decision: ResumeEntryPointDecision;
}

const CHAPTER_LABEL: Record<number, string> = {
  3: "Prospection & entrées vendeurs",
  4: "RDV vendeur",
  5: "Mandats & exclusivité",
  6: "Commercialisation & suivi vendeur",
  7: "Acquéreurs",
  8: "Visites, offres & transformation",
  9: "Base de données & e-réputation",
  10: "Outils & IA",
  11: "Management, pilotage & vision",
};

export function ResumeView({
  diagnosticId,
  status,
  agencyName,
  director,
  decision,
}: Props) {
  const percent =
    decision.totalCount === 0
      ? 0
      : Math.round((decision.savedCount / decision.totalCount) * 100);
  const complete = decision.nextQuestionIndex === null;

  // CTA « Reprendre » — le new-flow lit `?resume=<id>` pour hydrater
  // son état à partir du diagnostic existant et démarrer sur la
  // première question sans réponse. Si tout est répondu, la vue
  // propose plutôt les CTAs aval (audit / recommandation).
  const resumeHref = `/diagnostics/new?resume=${encodeURIComponent(diagnosticId)}`;

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
        <h1 className="font-heading text-3xl font-bold text-[#00527a]">
          Diagnostic — reprise
        </h1>
        <p className="text-muted-foreground">
          {agencyName ? (
            <>
              Agence <span className="font-medium text-foreground">{agencyName}</span>
              {director ? (
                <>
                  {" "}
                  · Dirigeant <span className="font-medium">{director}</span>
                </>
              ) : null}
            </>
          ) : (
            <>
              Diagnostic <code className="text-foreground/80">{diagnosticId}</code>
            </>
          )}
        </p>
      </div>

      <Card className="border-border/60 bg-white">
        <CardHeader className="space-y-2">
          <CardTitle className="font-heading text-xl text-[#00527a]">
            Avancement du questionnaire
          </CardTitle>
          <CardDescription>
            {decision.savedCount} réponse{decision.savedCount > 1 ? "s" : ""}{" "}
            sur {decision.totalCount} — {percent}%
            {status ? (
              <>
                {" "}· statut <code className="text-foreground/80">{status}</code>
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Barre de progression sobre — pas d'animation, pas de dépendance
              graphique. Le user cherche l'info, pas un WOW-effect. */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-[#3ea9ff]"
              style={{ width: `${percent}%` }}
            />
          </div>

          {decision.perChapter.length > 0 && (
            <ul className="mt-4 grid gap-2 md:grid-cols-2">
              {decision.perChapter.map((c) => {
                const chapterPercent =
                  c.total === 0
                    ? 0
                    : Math.round((c.answered / c.total) * 100);
                return (
                  <li
                    key={c.chapter}
                    className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-foreground/90">
                      {CHAPTER_LABEL[c.chapter] ?? `Chapitre ${c.chapter}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.answered} / {c.total} ({chapterPercent}%)
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/diagnostics/${diagnosticId}/audit`}
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
          )}
        >
          <FileText className="h-4 w-4" />
          Voir l&apos;audit
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {complete ? (
            <Link
              href={`/diagnostics/${diagnosticId}/recommendation`}
              className={cn(
                buttonVariants({ size: "default" }),
                "h-10 px-5 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
              )}
            >
              <Sparkles className="h-4 w-4" />
              Passer à la recommandation
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              href={resumeHref}
              className={cn(
                buttonVariants({ size: "default" }),
                "h-10 px-5 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
              )}
            >
              Reprendre le diagnostic
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
