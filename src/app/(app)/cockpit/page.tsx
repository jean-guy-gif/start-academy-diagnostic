import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Coins,
  FileSignature,
  FileText,
  Hammer,
  Info,
  Layers,
  ListChecks,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { requireRole } from "@/lib/auth/require-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { getCockpitData } from "@/lib/cockpit/cockpit-service";
import type {
  CockpitAlert,
  CockpitPipelineItem,
  CockpitStage,
} from "@/lib/cockpit/cockpit.types";
import { formatPriceEuros } from "@/lib/pricing/training-pricing";
import {
  listRecentActivity,
  type ActivityLogRecord,
} from "@/lib/activity/activity-log-service";
import {
  getAiMonthlyBudgetStatus,
  getAiUsageSummary,
  getRecentAiGenerations,
  type AiGenerationRecord,
  type AiMonthlyBudgetStatus,
  type AiUsageSummary,
} from "@/lib/ai/ai-monitoring-service";
import { countSupportsAwaitingQualityReview } from "@/lib/training-support/support-quality-service";
import { countSessionsAwaitingPostTrainingReview } from "@/lib/post-training/post-training-service";

// `dynamic = 'force-dynamic'` hérité du layout `(app)/layout.tsx`.

export const metadata = {
  title: "Cockpit — Start Academy",
};

const STAGE_LABEL: Record<CockpitStage, string> = {
  diagnostic_in_progress: "Diagnostic en cours",
  recommendation_done: "Recommandation prête",
  proposal_to_send: "Proposition à envoyer",
  awaiting_validation: "En attente validation",
  dates_to_position: "Dates à positionner",
  dates_proposed: "Dates proposées",
  collection_open: "Collecte ouverte",
  collection_complete: "Collecte terminée",
  support_to_generate: "Support à générer",
  support_designing: "Support designé",
  ready_for_training: "Prêt pour formation",
  delivered: "Formation réalisée",
  post_training: "Bilan envoyé",
};

const STAGE_BADGE: Record<CockpitStage, string> = {
  diagnostic_in_progress:
    "border-amber-300 bg-amber-50 text-amber-800",
  recommendation_done: "border-[#3ea9ff] bg-[#eaf5ff] text-[#00527a]",
  proposal_to_send: "border-[#3ea9ff] bg-[#eaf5ff] text-[#00527a]",
  awaiting_validation: "border-amber-300 bg-amber-50 text-amber-800",
  dates_to_position: "border-amber-300 bg-amber-50 text-amber-800",
  dates_proposed: "border-[#3ea9ff] bg-[#eaf5ff] text-[#00527a]",
  collection_open: "border-[#3ea9ff] bg-[#eaf5ff] text-[#00527a]",
  collection_complete: "border-emerald-300 bg-emerald-50 text-emerald-700",
  support_to_generate: "border-amber-300 bg-amber-50 text-amber-800",
  support_designing: "border-amber-300 bg-amber-50 text-amber-800",
  ready_for_training: "border-emerald-300 bg-emerald-50 text-emerald-700",
  delivered: "border-emerald-300 bg-emerald-50 text-emerald-700",
  post_training: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
};

export default async function CockpitPage() {
  const profile = await requireRole(INTERNAL_APP_ROLES);
  const isAdmin = profile.role === "admin";

  // T-11 (2026-07-09) — cloisonnement cockpit + blocs IA admin-only.
  // Le budget IA est celui de Start Academy (indicateur d'entreprise) ;
  // `getRecentAiGenerations` exposerait les IDs de dossiers tiers.
  // On ne les appelle même pas pour un non-admin — pas de données
  // vides, pas de round-trip inutile.
  const [
    data,
    recentActivity,
    supportsAwaitingQuality,
    postTrainingAwaiting,
    aiUsage,
    recentAiCalls,
    aiBudget,
  ] = await Promise.all([
    getCockpitData(profile),
    listRecentActivity(profile, 10),
    countSupportsAwaitingQualityReview(profile),
    countSessionsAwaitingPostTrainingReview(profile),
    isAdmin ? getAiUsageSummary() : Promise.resolve(null),
    isAdmin ? getRecentAiGenerations(5) : Promise.resolve(null),
    isAdmin ? getAiMonthlyBudgetStatus() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-heading text-xs uppercase tracking-[0.18em] text-[#3ea9ff]">
            Cockpit interne · Start Academy
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold leading-tight text-[#00527a]">
            Pilotage des formations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vue opérationnelle interne — tous les dossiers en cours,
            alertes système et prochaines actions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/diagnostics/new"
            className={cn(
              buttonVariants({ size: "default" }),
              "bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 h-10 px-4"
            )}
          >
            <PlusCircle className="h-4 w-4" />
            Nouveau diagnostic
          </Link>
          <Link
            href="/sessions"
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              "h-10 px-4"
            )}
          >
            <CalendarDays className="h-4 w-4" />
            Voir les sessions
          </Link>
        </div>
      </div>

      {/* A. Vue synthèse */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ClipboardList}
          label="Diagnostics en cours"
          value={data.overview.diagnosticsInProgress}
        />
        <KpiCard
          icon={FileText}
          label="Propositions à finaliser"
          value={data.overview.proposalsToFinalize}
        />
        <KpiCard
          icon={FileSignature}
          label="En attente validation"
          value={data.overview.proposalsSent}
        />
        <KpiCard
          icon={CalendarClock}
          label="Dates à positionner"
          value={data.overview.datesToPosition}
        />
        <KpiCard
          icon={Users}
          label="Collectes incomplètes"
          value={data.overview.collectionsIncomplete}
        />
        <KpiCard
          icon={Hammer}
          label="Supports à générer"
          value={data.overview.supportsToGenerate}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Supports à valider"
          value={supportsAwaitingQuality}
          accent={supportsAwaitingQuality > 0 ? "amber" : undefined}
        />
        <KpiCard
          icon={TrendingUp}
          label="Suivis post-formation à compléter"
          value={postTrainingAwaiting}
          accent={postTrainingAwaiting > 0 ? "amber" : undefined}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Formations prêtes / réalisées"
          value={data.overview.formationsReady}
          accent="emerald"
        />
        <KpiCard
          icon={Layers}
          label="Total dossiers actifs"
          value={data.overview.totalActiveDossiers}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Diagnostics avec alertes"
          value={data.overview.diagnosticsWithAlerts}
          accent={
            data.overview.diagnosticsWithAlerts > 0 ? "amber" : undefined
          }
        />
      </section>

      {/* D. Alertes */}
      {data.alerts.length > 0 ? (
        <section className="space-y-2">
          {data.alerts.map((a) => (
            <AlertBanner key={a.id} alert={a} />
          ))}
        </section>
      ) : null}

      {/* C. Actions prioritaires */}
      <Card className="border-border/60 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-[#3ea9ff]" />
            <CardTitle className="font-heading text-xl text-[#00527a]">
              À traiter aujourd&apos;hui ({data.priorityActions.length})
            </CardTitle>
          </div>
          <CardDescription>
            Actions identifiées comme prioritaires sur l&apos;ensemble
            des dossiers actifs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.priorityActions.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              Rien à traiter dans l&apos;immédiat. Bien joué — passez
              en mode revue pipeline ci-dessous.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.priorityActions.map((action) => (
                <li
                  key={`${action.pipelineItemId}-${action.code}`}
                  className="flex flex-col gap-1 py-2 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {action.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {action.clientName ?? "Client à compléter"}
                    </p>
                  </div>
                  {action.href ? (
                    <Link
                      href={action.href}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-8 px-3 text-xs"
                      )}
                    >
                      Ouvrir
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* F. Usage IA / OpenRouter — admin-only (T-11, 2026-07-09).
          Budget IA = indicateur d'entreprise Start Academy, pas
          d'individu ; `getRecentAiGenerations` exposerait les IDs
          de dossiers tiers. */}
      {isAdmin && aiUsage && recentAiCalls && aiBudget && (
        <AiUsageBlock
          summary={aiUsage}
          recentCalls={recentAiCalls}
          budget={aiBudget}
        />
      )}

      {/* E. Activité récente */}
      <Card className="border-border/60 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#3ea9ff]" />
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Activité récente
            </CardTitle>
          </div>
          <CardDescription>
            10 dernières actions tous dossiers confondus — journal interne
            Start Academy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              Pas encore d&apos;activité enregistrée. Les actions
              apparaîtront ici dès la première écriture.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recentActivity.map((entry) => (
                <RecentActivityRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* B. Pipeline formation */}
      <Card className="border-border/60 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#3ea9ff]" />
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Pipeline formation ({data.pipeline.length})
            </CardTitle>
          </div>
          <CardDescription>
            Tous les dossiers actifs, triés par dernière mise à jour.
            Cliquer sur une ligne pour ouvrir la session ou le diagnostic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.pipeline.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              Aucun dossier actif. Créer un diagnostic pour démarrer.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Pers.</TableHead>
                    <TableHead className="text-right">Durée</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Reste à charge</TableHead>
                    <TableHead>Étape</TableHead>
                    <TableHead>Prochaine action</TableHead>
                    <TableHead>Maj.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pipeline.map((item) => (
                    <PipelineRow key={item.id} item={item} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: "emerald" | "amber";
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-white p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-[10px] uppercase tracking-[0.12em]">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "mt-2 font-heading text-3xl font-bold leading-none",
          accent === "emerald"
            ? "text-emerald-600"
            : accent === "amber"
            ? "text-amber-600"
            : "text-[#00527a]"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PipelineRow({ item }: { item: CockpitPipelineItem }) {
  const detailHref =
    item.sessionId !== null
      ? `/sessions/${item.sessionId}`
      : item.diagnosticId !== null
      ? `/diagnostics/${item.diagnosticId}/recommendation`
      : null;
  return (
    <TableRow>
      <TableCell>
        {detailHref ? (
          <Link
            href={detailHref}
            className="font-medium text-foreground hover:text-[#00527a]"
          >
            {item.clientName ?? "Client à compléter"}
          </Link>
        ) : (
          <span className="font-medium text-foreground">
            {item.clientName ?? "Client à compléter"}
          </span>
        )}
        {item.director ? (
          <p className="text-xs text-muted-foreground">{item.director}</p>
        ) : null}
      </TableCell>
      <TableCell className="text-right text-sm">
        {item.expectedParticipants ?? "—"}
      </TableCell>
      <TableCell className="text-right text-sm">
        {item.totalDurationHours !== null
          ? `${item.totalDurationHours} h`
          : "—"}
      </TableCell>
      <TableCell className="text-right text-sm">
        {item.totalBudget !== null
          ? formatPriceEuros(item.totalBudget)
          : "—"}
      </TableCell>
      <TableCell className="text-right text-sm">
        {item.estimatedRemainingCost !== null
          ? formatPriceEuros(item.estimatedRemainingCost)
          : "—"}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("text-[10px]", STAGE_BADGE[item.stage])}
        >
          {STAGE_LABEL[item.stage]}
        </Badge>
      </TableCell>
      <TableCell>
        {item.nextAction.href ? (
          <Link
            href={item.nextAction.href}
            className="text-xs font-medium text-[#00527a] hover:underline"
          >
            {item.nextAction.label}
            <ArrowRight className="ml-1 inline h-3 w-3" />
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">
            {item.nextAction.label}
          </span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(item.updatedAt).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        })}
      </TableCell>
    </TableRow>
  );
}

function AiUsageBlock({
  summary,
  recentCalls,
  budget,
}: {
  summary: AiUsageSummary;
  recentCalls: AiGenerationRecord[];
  budget: AiMonthlyBudgetStatus;
}) {
  const noData = summary.calls7Days === 0 && recentCalls.length === 0;
  const formatEur = (eur: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 4,
    }).format(eur);
  const fallbackPct = Math.round(summary.fallbackRate7Days * 100);
  return (
    <Card className="border-border/60 bg-white">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-[#3ea9ff]" />
          <CardTitle className="font-heading text-xl text-[#00527a]">
            Usage IA
          </CardTitle>
        </div>
        <CardDescription>
          Suivi interne des appels OpenRouter — coûts estimés, taux de
          fallback heuristique, dernières erreurs. Aucune donnée client
          stockée ici, uniquement les méta-données techniques.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <BudgetMonthlyBlock budget={budget} formatEur={formatEur} />

        {noData ? (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            Aucun appel IA enregistré pour le moment.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                icon={Sparkles}
                label="Appels IA aujourd'hui"
                value={summary.callsToday}
              />
              <KpiCard
                icon={Sparkles}
                label="Appels IA 7 jours"
                value={summary.calls7Days}
              />
              <div className="rounded-lg border border-border/60 bg-white p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Coins className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-[0.12em]">
                    Coût estimé 7 jours
                  </span>
                </div>
                <p className="mt-2 font-heading text-2xl font-bold leading-none text-[#00527a]">
                  {formatEur(summary.estimatedCost7DaysEur)}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Estimation non-contractuelle.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-white p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-[10px] uppercase tracking-[0.12em]">
                    Fallback heuristique
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-2 font-heading text-2xl font-bold leading-none",
                    fallbackPct > 30
                      ? "text-amber-600"
                      : "text-[#00527a]"
                  )}
                >
                  {fallbackPct}%
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {summary.errorCount7Days} erreur
                  {summary.errorCount7Days > 1 ? "s" : ""} sur 7 jours.
                  {summary.rateLimited7Days > 0 ? (
                    <>
                      {" "}· {summary.rateLimited7Days} bloqué
                      {summary.rateLimited7Days > 1 ? "s" : ""} rate limit.
                    </>
                  ) : null}
                </p>
              </div>
            </div>

            {summary.lastError ? (
              <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <div>
                  <p className="font-medium">
                    Dernière erreur — {summary.lastError.route ?? "route inconnue"}
                  </p>
                  <p className="text-xs">
                    {summary.lastError.message ?? "Sans détail."}
                  </p>
                  <p className="mt-1 text-[10px] text-amber-900/70">
                    {new Date(summary.lastError.createdAt).toLocaleString(
                      "fr-FR"
                    )}
                  </p>
                </div>
              </div>
            ) : null}

            {recentCalls.length > 0 ? (
              <ul className="space-y-1.5">
                {recentCalls.map((call) => (
                  <RecentAiCallRow key={call.id} call={call} />
                ))}
              </ul>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const BUDGET_STATUS_TONE: Record<AiMonthlyBudgetStatus["status"], string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-300",
  exceeded: "bg-red-50 text-red-700 border-red-300",
  not_configured: "bg-muted text-muted-foreground border-border",
};

const BUDGET_STATUS_LABEL: Record<AiMonthlyBudgetStatus["status"], string> = {
  ok: "OK",
  warning: "Attention",
  exceeded: "Dépassé",
  not_configured: "Non configuré",
};

function BudgetMonthlyBlock({
  budget,
  formatEur,
}: {
  budget: AiMonthlyBudgetStatus;
  formatEur: (eur: number) => string;
}) {
  const tone = BUDGET_STATUS_TONE[budget.status];
  const label = BUDGET_STATUS_LABEL[budget.status];
  const showAlert = budget.status === "warning" || budget.status === "exceeded";
  const alertMessage =
    budget.status === "exceeded"
      ? "Budget IA mensuel dépassé."
      : "Budget IA mensuel proche d'être atteint.";
  const percent = budget.percentUsed ?? 0;
  // Barre de progression bornée à 100 % côté visuel, mais on affiche
  // bien le pourcentage réel à droite (qui peut dépasser 100).
  const barWidth = Math.min(100, Math.max(0, percent));

  return (
    <div className={cn("rounded-lg border bg-white p-4", tone)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4" />
          <span className="text-[10px] uppercase tracking-[0.12em]">
            Budget IA mensuel
          </span>
          <Badge
            variant="secondary"
            className={cn("h-5 px-2 text-[10px] font-medium", tone)}
          >
            {label}
          </Badge>
        </div>
        {budget.status === "not_configured" ? null : (
          <p className="text-[10px] text-muted-foreground">
            Seuil d&apos;alerte : {budget.warningThresholdPercent}%
          </p>
        )}
      </div>

      {budget.status === "not_configured" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Définir <code>AI_MONTHLY_BUDGET_EUR</code> dans
          l&apos;environnement pour suivre une enveloppe mensuelle.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Budget
              </p>
              <p className="font-heading text-base font-semibold text-foreground">
                {budget.budgetEur !== null ? formatEur(budget.budgetEur) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Dépensé
              </p>
              <p className="font-heading text-base font-semibold text-foreground">
                {formatEur(budget.spentEur)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Reste estimé
              </p>
              <p className="font-heading text-base font-semibold text-foreground">
                {budget.remainingEur !== null
                  ? formatEur(budget.remainingEur)
                  : "—"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full transition-all",
                  budget.status === "exceeded"
                    ? "bg-red-500"
                    : budget.status === "warning"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                )}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className="text-xs font-medium text-foreground">
              {percent.toFixed(1)}%
            </span>
          </div>

          {showAlert ? (
            <div
              className={cn(
                "mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                tone
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
              <span>{alertMessage}</span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const AI_STATUS_TONE: Record<
  AiGenerationRecord["status"],
  string
> = {
  success: "bg-emerald-50 text-emerald-700",
  fallback: "bg-amber-50 text-amber-800",
  partial: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-red-700",
  rate_limited: "bg-orange-50 text-orange-800",
};

function RecentAiCallRow({ call }: { call: AiGenerationRecord }) {
  const when = new Date(call.createdAt).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const duration =
    call.durationMs !== null ? `${(call.durationMs / 1000).toFixed(2)}s` : "—";
  const tokens =
    call.totalTokens !== null ? `${call.totalTokens.toLocaleString("fr-FR")} tok` : "—";
  const cost =
    call.costEstimate !== null
      ? new Intl.NumberFormat("fr-FR", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 4,
        }).format(call.costEstimate)
      : "—";
  return (
    <li className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-sm">
      <Badge
        variant="secondary"
        className={cn(
          "h-5 px-2 text-[10px] font-medium",
          AI_STATUS_TONE[call.status]
        )}
      >
        {call.status}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {call.route ?? call.purpose ?? "route inconnue"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {when} · {call.source ?? "?"} · {call.model ?? "—"}
        </p>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <p>{duration} · {tokens}</p>
        <p className="font-medium text-foreground">{cost}</p>
      </div>
    </li>
  );
}

const ACTIVITY_SEVERITY_TONE: Record<
  ActivityLogRecord["severity"],
  string
> = {
  info: "bg-[#eaf5ff] text-[#00527a]",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-red-700",
};

function RecentActivityRow({ entry }: { entry: ActivityLogRecord }) {
  const href =
    entry.sessionId !== null
      ? `/sessions/${entry.sessionId}`
      : entry.diagnosticId !== null
      ? `/diagnostics/${entry.diagnosticId}/recommendation`
      : null;
  const when = new Date(entry.createdAt).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const meta = [
    when,
    entry.actorName ?? null,
    entry.actorRole ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-sm">
      <Badge
        variant="secondary"
        className={cn(
          "h-5 px-2 text-[10px] font-medium",
          ACTIVITY_SEVERITY_TONE[entry.severity]
        )}
      >
        {entry.severity}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {entry.eventLabel}
        </p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      {href ? (
        <Link
          href={href}
          className="text-xs font-medium text-[#00527a] hover:underline"
        >
          Ouvrir
          <ArrowRight className="ml-1 inline h-3 w-3" />
        </Link>
      ) : null}
    </li>
  );
}

function AlertBanner({ alert }: { alert: CockpitAlert }) {
  const palette =
    alert.severity === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : alert.severity === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-[#3ea9ff]/40 bg-[#eaf5ff] text-[#00527a]";
  const Icon =
    alert.severity === "error"
      ? AlertTriangle
      : alert.severity === "warning"
      ? AlertTriangle
      : Info;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border px-3 py-2 text-sm",
        palette
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <div className="flex-1">
        <p className="font-medium">{alert.title}</p>
        <p className="text-xs">{alert.message}</p>
      </div>
      {alert.href ? (
        <Link
          href={alert.href}
          className="text-xs font-medium underline hover:no-underline"
        >
          Ouvrir
        </Link>
      ) : null}
    </div>
  );
}
