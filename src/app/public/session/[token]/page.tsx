import {
  Badge,
} from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  CircleDashed,
  Compass,
  FileSignature,
  Layers,
  ListChecks,
  Mail,
  Paperclip,
  Sparkles,
  Target,
  UserCheck,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";

import { validatePublicToken } from "@/lib/public-access/public-token-service";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { listDateOptionsViaServiceRole } from "@/lib/sessions/session-date-options-server";
import { PublicShell } from "@/app/public/_components/public-shell";
import { PublicTokenError } from "@/app/public/_components/public-token-error";
import { DateChoiceList } from "./date-choice";
import {
  calculateCostPerParticipant,
  calculateTotalTrainingBudget,
  formatPriceEuros,
} from "@/lib/pricing/training-pricing";
import {
  DEFAULT_FUNDING_CONFIG,
  getActiveFundingConfig,
} from "@/lib/pricing/funding-config-service";
import {
  estimateTrainingFunding,
  FUNDING_DISCLAIMER,
} from "@/lib/pricing/training-funding";
import { listDiagnosticParticipants } from "@/lib/diagnostics/diagnostic-participants-service";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  created: "Session créée",
  awaiting_client_validation: "En attente de votre validation",
  dates_to_position: "Dates à positionner",
  dates_validated: "Dates validées",
  collection_open: "Collecte collaborateurs ouverte",
  data_collected: "Préparation collaborateurs collectée",
  support_generating: "Support en préparation",
  support_ready: "Support prêt",
  delivered: "Formation réalisée",
  report_sent: "Bilan envoyé",
};

const ACTIVE_TIMELINE_STEPS: Record<string, number> = {
  created: 0,
  awaiting_client_validation: 1,
  dates_to_position: 2,
  dates_validated: 3,
  collection_open: 3,
  data_collected: 4,
  support_generating: 4,
  support_ready: 5,
  delivered: 6,
  report_sent: 6,
};

const TIMELINE: Array<{ title: string; description: string }> = [
  {
    title: "Proposition présentée",
    description:
      "Votre interlocuteur Start Academy vous a remis la proposition issue du rendez-vous.",
  },
  {
    title: "Validation dirigeant",
    description:
      "Vous confirmez le principe de la formation auprès de Start Academy.",
  },
  {
    title: "Choix des dates",
    description:
      "Vous positionnez les créneaux de session avec votre interlocuteur Start Academy.",
  },
  {
    title: "Collecte collaborateurs",
    description:
      "Vos équipes renseignent leur cas concret, leurs outils et leurs objectifs.",
  },
  {
    title: "Préparation du support",
    description:
      "Start Academy ajuste le déroulé pédagogique avec les cas remontés.",
  },
  {
    title: "Formation",
    description:
      "Votre équipe est formée par votre formateur Start Academy.",
  },
  {
    title: "Plan d'action post-formation",
    description:
      "Mesure des indicateurs et ajustements terrain dans les semaines qui suivent.",
  },
];

const HOW_BUILT_STEPS: Array<{ title: string; description: string }> = [
  {
    title: "Échange avec votre interlocuteur Start Academy",
    description:
      "Votre commercial a animé le rendez-vous, posé les questions et noté les besoins concrets de votre équipe.",
  },
  {
    title: "Analyse des besoins et des priorités",
    description:
      "Start Academy synthétise les enjeux. L'IA assiste l'analyse — Start Academy garde la maîtrise pédagogique.",
  },
  {
    title: "Sélection des modules les plus pertinents",
    description:
      "Les modules sont choisis dans le catalogue Start Academy en fonction des signaux remontés en RDV.",
  },
  {
    title: "Préparation d'un support de formation personnalisé",
    description:
      "Un support pédagogique et un déroulé designé sont produits sur-mesure pour votre agence.",
  },
];

const DIRIGEANT_CHECKLIST: string[] = [
  "Valider le principe de la formation auprès de votre interlocuteur Start Academy.",
  "Confirmer la liste des participants concernés.",
  "Positionner les dates de session avec Start Academy.",
  "Transmettre le lien collaborateurs à votre équipe quand il sera disponible.",
  "Rassembler les documents utiles à mettre à disposition du formateur.",
  "Informer votre équipe du contexte et des objectifs de la formation.",
];

const COLLAB_FIELDS: Array<{ label: string; description: string }> = [
  {
    label: "Niveau IA estimé",
    description:
      "Pour adapter le rythme : débutant, intermédiaire, avancé.",
  },
  {
    label: "Outils utilisés aujourd'hui",
    description: "ChatGPT, CRM, plateformes vendeur — pour démarrer du concret.",
  },
  {
    label: "Problématique principale",
    description: "Le sujet qui les bloque vraiment sur le terrain.",
  },
  {
    label: "Objectif personnel pour la formation",
    description: "Ce que chacun veut savoir faire en sortant.",
  },
  {
    label: "Cas concret à travailler",
    description: "Un mandat, un vendeur, un acquéreur réel.",
  },
  {
    label: "Documents utiles (déposés plus tard)",
    description: "Annonces, scripts, exports CRM — optionnels mais précieux.",
  },
];

const DOCUMENT_SUGGESTIONS: string[] = [
  "Statistiques commerciales (mandats, exclusivités, délais de vente).",
  "Exports CRM ou tableaux de suivi vendeur.",
  "Exemples d'annonces immobilières actuelles.",
  "Supports de rendez-vous vendeur (R1, R2, restitution).",
  "Scripts ou mails actuels (prise de mandat, suivi, baisse de prix).",
  "Retours vendeurs ou acquéreurs (témoignages, objections récurrentes).",
  "Exemples de cas difficiles que vous voulez voir traités en formation.",
  "Supports internes existants (process, charte commerciale, fiches mandats).",
];

const SA_DELIVERABLES: Array<{ title: string; description: string }> = [
  {
    title: "Support pédagogique personnalisé",
    description:
      "Module par module : problématique, fondamentaux, exercice métier, action terrain.",
  },
  {
    title: "Support designé Start Academy",
    description:
      "Déroulé visuel slide par slide à la charte Start Academy, prêt à projeter.",
  },
  {
    title: "Exercices basés sur les cas réels",
    description:
      "Vos vrais mandats, vos vrais vendeurs — travaillés en salle.",
  },
  {
    title: "Prompts IA adaptés",
    description:
      "Prêts à projeter sur écran pendant la formation et réutilisables après.",
  },
  {
    title: "Plan d'action terrain",
    description:
      "Une action mesurable à appliquer la semaine suivant la formation.",
  },
  {
    title: "Synthèse formateur",
    description:
      "Compte-rendu pour le manager : ce qui est acquis, ce qui reste à travailler.",
  },
];

interface ModuleRow {
  name: string;
  durationHours: number | null;
  reason: string | null;
  useCases: string[];
  family: string | null;
  level: number | null;
}

interface SessionViewData {
  status: string | null;
  expectedParticipants: number | null;
  director: string | null;
  sector: string | null;
  teamTypology: string[];
  collaboratorsCount: number | null;
  diagnosticId: string | null;
  recommendationId: string | null;
  proposalTitle: string | null;
  detectedNeeds: string[];
  performanceIssues: string[];
  toolMaturity: string | null;
  skillLevel: string | null;
  totalDurationHours: number | null;
  costPerParticipant: number | null;
  totalEstimatedCost: number | null;
  /**
   * Tarif horaire par participant Start Academy — lu depuis
   * `funding_config` (seed PRICE_PER_HOUR_PER_PARTICIPANT). Affiché
   * en clair au dirigeant côté public/session pour transparence
   * (« 1 h = 84 € tout compris »).
   */
  pricePerHourPerParticipant: number;
  modules: ModuleRow[];
  commercialName: string | null;
  commercialEmail: string | null;
  hasActiveCollectionToken: boolean;
  // Synthèse financement — JAMAIS de détail individuel (production
  // N-1, prénom, statut individuel, montant par personne) exposé au
  // dirigeant. Seuls les agrégats anonymisés apparaissent.
  estimatedFundingTotal: number | null;
  estimatedRemainingCost: number | null;
  eligibleParticipantCount: number | null;
  fundingDisclaimer: string | null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

async function loadDirigeantView(
  sessionId: string
): Promise<SessionViewData> {
  const empty: SessionViewData = {
    status: null,
    expectedParticipants: null,
    director: null,
    sector: null,
    teamTypology: [],
    collaboratorsCount: null,
    diagnosticId: null,
    recommendationId: null,
    proposalTitle: null,
    detectedNeeds: [],
    performanceIssues: [],
    toolMaturity: null,
    skillLevel: null,
    totalDurationHours: null,
    costPerParticipant: null,
    totalEstimatedCost: null,
    pricePerHourPerParticipant:
      DEFAULT_FUNDING_CONFIG.pricePerHourPerParticipant,
    modules: [],
    commercialName: null,
    commercialEmail: null,
    hasActiveCollectionToken: false,
    estimatedFundingTotal: null,
    estimatedRemainingCost: null,
    eligibleParticipantCount: null,
    fundingDisclaimer: null,
  };

  const client = createSupabaseAdminClient();
  if (!client) return empty;

  const { data: session } = await client
    .from("training_sessions")
    .select(
      "client_id, diagnostic_id, recommendation_id, status, expected_participants, created_by"
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return empty;

  let director: string | null = null;
  let sector: string | null = null;
  let teamTypology: string[] = [];
  let collaboratorsCount: number | null = null;
  if (session.client_id) {
    const { data: clientRow } = await client
      .from("clients")
      .select("director, sector, team_typology, collaborators_count")
      .eq("id", session.client_id)
      .maybeSingle();
    if (clientRow) {
      director = clientRow.director;
      sector = clientRow.sector;
      teamTypology = clientRow.team_typology ?? [];
      collaboratorsCount = clientRow.collaborators_count;
    }
  }

  let detectedNeeds: string[] = [];
  let performanceIssues: string[] = [];
  let toolMaturity: string | null = null;
  let skillLevel: string | null = null;
  let totalDurationHours: number | null = null;
  let costPerParticipant: number | null = null;
  let modules: ModuleRow[] = [];

  // Tarif horaire Start Academy — source unique via `funding_config`
  // (seed PRICE_PER_HOUR_PER_PARTICIPANT). `getActiveFundingConfig()`
  // ne throw jamais, retombe sur `DEFAULT_FUNDING_CONFIG` si Supabase
  // indisponible.
  const fundingConfigForPricing = await getActiveFundingConfig();
  const pricePerHour = fundingConfigForPricing.pricePerHourPerParticipant;

  // On préfère la recommandation directement liée à la session ; à
  // défaut on remonte via le diagnostic.
  let recommendationId: string | null = session.recommendation_id ?? null;
  if (!recommendationId && session.diagnostic_id) {
    const { data: recoByDiag } = await client
      .from("recommendations")
      .select("id")
      .eq("diagnostic_id", session.diagnostic_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    recommendationId = recoByDiag?.id ?? null;
  }

  if (recommendationId) {
    const { data: reco } = await client
      .from("recommendations")
      .select(
        "detected_needs, performance_issues, tool_maturity, skill_level, total_duration_hours, cost_per_participant"
      )
      .eq("id", recommendationId)
      .maybeSingle();
    if (reco) {
      detectedNeeds = asStringArray(reco.detected_needs);
      performanceIssues = asStringArray(reco.performance_issues);
      toolMaturity = reco.tool_maturity;
      skillLevel = reco.skill_level;
      totalDurationHours = reco.total_duration_hours;
      // Règle tarifaire Start Academy : `pricePerHour` € / heure /
      // participant, tout compris (funding_config, seed
      // PRICE_PER_HOUR_PER_PARTICIPANT). On ignore volontairement
      // `reco.cost_per_participant` (historique potentiellement
      // incorrect) et on recalcule à partir de la durée — source
      // unique de vérité.
      costPerParticipant = calculateCostPerParticipant(
        totalDurationHours,
        pricePerHour
      );
    }

    const { data: recoModules } = await client
      .from("recommendation_modules")
      .select(
        "module_id, position, reason, duration_hours, use_cases"
      )
      .eq("recommendation_id", recommendationId)
      .order("position", { ascending: true });

    if (recoModules && recoModules.length > 0) {
      const ids = recoModules.map((m) => m.module_id);
      const { data: modulesRows } = await client
        .from("training_modules")
        .select("id, name, family, level")
        .in("id", ids);
      const moduleById = new Map(
        (modulesRows ?? []).map((m) => [m.id, m])
      );
      modules = recoModules.map((m) => {
        const tm = moduleById.get(m.module_id);
        return {
          name: tm?.name ?? m.module_id,
          durationHours: m.duration_hours,
          reason: m.reason,
          useCases: asStringArray(m.use_cases),
          family: tm?.family ?? null,
          level: tm?.level ?? null,
        };
      });
    }
  }

  let proposalTitle: string | null = null;
  const { data: support } = await client
    .from("training_supports")
    .select("title")
    .eq("session_id", sessionId)
    .maybeSingle();
  proposalTitle = support?.title ?? null;

  // Commercial associé : on lit `profiles` à partir de `session.created_by`.
  // Si rien ou si le profil n'a pas de nom/email, on bascule sur un
  // message générique côté UI.
  let commercialName: string | null = null;
  let commercialEmail: string | null = null;
  if (session.created_by) {
    const { data: prof } = await client
      .from("profiles")
      .select("full_name, email")
      .eq("id", session.created_by)
      .maybeSingle();
    if (prof) {
      commercialName = prof.full_name;
      commercialEmail = prof.email;
    }
  }

  // Détection (sans exposition d'URL) d'un token participant_collect
  // actif. On ne récupère QUE l'id et l'expiration — pas de
  // token_hash, pas de metadata.
  let hasActiveCollectionToken = false;
  const { data: collectToken } = await client
    .from("public_access_tokens")
    .select("id, expires_at")
    .eq("session_id", sessionId)
    .eq("access_type", "participant_collect")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (collectToken) {
    const stillValid =
      !collectToken.expires_at ||
      new Date(collectToken.expires_at).getTime() > Date.now();
    hasActiveCollectionToken = stillValid;
  }

  // -- Synthèse financement (anonymisée) ------------------------------
  // On lit la liste prévisionnelle des participants côté serveur via
  // service_role. On NE renvoie que des agrégats au composant —
  // aucune donnée individuelle (production N-1, statut, prénom)
  // n'est exposée au dirigeant.
  const totalEstimatedCost = calculateTotalTrainingBudget(
    totalDurationHours,
    session.expected_participants ?? null,
    pricePerHour
  );
  let estimatedFundingTotal: number | null = null;
  let estimatedRemainingCost: number | null = null;
  let eligibleParticipantCount: number | null = null;
  let fundingDisclaimer: string | null = null;
  if (session.diagnostic_id) {
    const diagParticipants = await listDiagnosticParticipants(
      session.diagnostic_id
    );
    if (diagParticipants.length > 0 && costPerParticipant !== null) {
      const summary = estimateTrainingFunding({
        participants: diagParticipants.map((p) => ({
          professionalStatus: p.professionalStatus,
          previousYearProduction: p.previousYearProduction,
        })),
        costPerParticipant,
        totalBudget: totalEstimatedCost,
      });
      // On expose UNIQUEMENT les agrégats — JAMAIS les détails
      // individuels (cf. consigne produit : synthèse anonymisée).
      estimatedFundingTotal = summary.estimatedFundingTotal;
      estimatedRemainingCost = summary.estimatedRemainingCost;
      eligibleParticipantCount = summary.eligibleParticipantCount;
      fundingDisclaimer = summary.disclaimer;
    }
  }

  return {
    status: session.status,
    expectedParticipants: session.expected_participants,
    director,
    sector,
    teamTypology,
    collaboratorsCount,
    diagnosticId: session.diagnostic_id,
    recommendationId,
    proposalTitle,
    detectedNeeds,
    performanceIssues,
    toolMaturity,
    skillLevel,
    totalDurationHours,
    costPerParticipant,
    totalEstimatedCost,
    pricePerHourPerParticipant: pricePerHour,
    modules,
    commercialName,
    commercialEmail,
    hasActiveCollectionToken,
    estimatedFundingTotal,
    estimatedRemainingCost,
    eligibleParticipantCount,
    fundingDisclaimer,
  };
}

// Fallback disclaimer affiché à l'écran si on a un total mais pas de
// disclaimer côté donnée (cas backward-compat ou ancien participant).
const FALLBACK_FUNDING_DISCLAIMER = FUNDING_DISCLAIMER;

const TOOL_MATURITY_LABEL: Record<string, string> = {
  low: "Maturité IA faible",
  medium: "Maturité IA intermédiaire",
  high: "Maturité IA avancée",
};

const SKILL_LEVEL_LABEL: Record<string, string> = {
  beginner: "Niveau débutant",
  intermediate: "Niveau intermédiaire",
  advanced: "Niveau avancé",
  mixed: "Niveaux mixtes",
};

function formatDuration(hours: number | null): string {
  if (hours === null || Number.isNaN(hours)) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours} h`;
}

function audienceFromTeamTypology(team: string[]): string | null {
  if (team.length === 0) return null;
  const labels: Record<string, string> = {
    conseiller: "Conseillers",
    manager: "Managers",
    assistant: "Assistants",
    direction: "Direction",
  };
  return team
    .map((t) => labels[t] ?? t)
    .filter(Boolean)
    .join(" · ");
}

export default async function PublicSessionPage({ params }: Props) {
  const { token } = await params;
  const validation = await validatePublicToken(token);

  if (!validation.valid) {
    return <PublicTokenError reason={validation.reason} />;
  }
  if (validation.accessType !== "client_session_view") {
    return <PublicTokenError reason="wrong_access_type" />;
  }

  const view = await loadDirigeantView(validation.sessionId);
  const statusLabel = view.status
    ? STATUS_LABEL[view.status] ?? view.status
    : null;
  const activeTimelineStep = view.status
    ? ACTIVE_TIMELINE_STEPS[view.status] ?? 0
    : 0;

  const audience = audienceFromTeamTypology(view.teamTypology);
  const clientName = validation.clientName ?? "Votre formation";

  const dateOptionsRaw = await listDateOptionsViaServiceRole(
    validation.sessionId
  );
  const dateOptionsForChoice = dateOptionsRaw.map((o) => ({
    id: o.id,
    title: o.title,
    startAt: o.startAt,
    endAt: o.endAt,
    location: o.location,
    format: o.format,
    status: o.status,
    selectedAt: o.selectedAt,
  }));

  return (
    <PublicShell>
      <div className="space-y-10">
        {/* A. Header premium */}
        <section className="space-y-2">
          <p className="font-heading text-xs uppercase tracking-[0.18em] text-[#3ea9ff]">
            Espace dirigeant · {clientName}
          </p>
          <h1 className="font-heading text-3xl font-bold leading-tight text-[#00527a] md:text-4xl">
            Votre parcours de formation personnalisé
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Un programme construit à partir de votre rendez-vous avec
            Start Academy.
          </p>
          {validation.recipientName ? (
            <p className="text-sm text-muted-foreground">
              Bonjour {validation.recipientName}, voici la synthèse de
              votre programme.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {statusLabel ? (
              <Badge className="bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]">
                {statusLabel}
              </Badge>
            ) : null}
            {view.toolMaturity ? (
              <Badge
                variant="outline"
                className="border-[#00527a]/30 text-[#00527a]"
              >
                {TOOL_MATURITY_LABEL[view.toolMaturity] ?? view.toolMaturity}
              </Badge>
            ) : null}
            {view.skillLevel ? (
              <Badge
                variant="outline"
                className="border-[#00527a]/30 text-[#00527a]"
              >
                {SKILL_LEVEL_LABEL[view.skillLevel] ?? view.skillLevel}
              </Badge>
            ) : null}
          </div>
        </section>

        {/* A bis. Pourquoi vous recevez ce guide */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Pourquoi vous recevez ce guide
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-foreground/80">
            <p>
              Ce guide fait suite au rendez-vous mené par votre
              interlocuteur Start Academy avec votre équipe.
            </p>
            <p>
              Pendant ce rendez-vous, votre commercial a réalisé le
              diagnostic — les questions, l&apos;écoute, la prise de
              notes. <strong>Vous n&apos;avez rien à compléter de votre
              côté&nbsp;:</strong> le diagnostic est déjà fait.
            </p>
            <p>
              À partir de ce diagnostic, Start Academy a construit une
              proposition adaptée à vos besoins. Cette page vous aide à
              comprendre ce qui a été préparé pour vous et à organiser
              les prochaines étapes avec votre interlocuteur.
            </p>
          </CardContent>
        </Card>

        {/* B. Résumé de la proposition */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                {view.proposalTitle ?? "Programme de formation"}
              </CardTitle>
            </div>
            <CardDescription>
              Synthèse rapide de votre parcours.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryStat
              label="Public cible"
              value={audience ?? "À préciser"}
            />
            <SummaryStat
              label="Durée totale"
              value={formatDuration(view.totalDurationHours)}
            />
            <SummaryStat
              label="Participants attendus"
              value={
                view.expectedParticipants !== null
                  ? `${view.expectedParticipants}`
                  : view.collaboratorsCount !== null
                  ? `${view.collaboratorsCount} (équipe)`
                  : "À confirmer"
              }
            />
            <SummaryStat
              label="Format recommandé"
              value="Présentiel ou hybride"
            />
            <SummaryStat
              label="Secteur"
              value={view.sector ?? "—"}
            />
            <SummaryStat
              label="Statut session"
              value={statusLabel ?? "—"}
            />
          </CardContent>
        </Card>

        {/* B ter. Budget & prise en charge potentielle —
            synthèse anonymisée, aucun détail individuel. */}
        {view.totalEstimatedCost !== null || view.costPerParticipant !== null ? (
          <Card className="border-border/60 bg-white">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#3ea9ff]" />
                <CardTitle className="font-heading text-xl text-[#00527a]">
                  Budget & prise en charge potentielle
                </CardTitle>
              </div>
              <CardDescription>
                Estimation basée sur la durée de formation et les profils
                renseignés par votre interlocuteur Start Academy.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryStat
                label="Coût pédagogique total"
                value={
                  view.totalEstimatedCost !== null
                    ? formatPriceEuros(view.totalEstimatedCost)
                    : "À calculer"
                }
              />
              <SummaryStat
                label="Coût par participant"
                value={
                  view.costPerParticipant !== null
                    ? `${formatPriceEuros(view.costPerParticipant)} (1 h = ${view.pricePerHourPerParticipant} €, tout compris)`
                    : "Calculé à la durée"
                }
              />
              {view.estimatedFundingTotal !== null &&
              view.estimatedFundingTotal > 0 ? (
                <>
                  <SummaryStat
                    label={
                      view.eligibleParticipantCount && view.eligibleParticipantCount > 0
                        ? `Participants potentiellement éligibles`
                        : "Éligibilité"
                    }
                    value={
                      view.eligibleParticipantCount !== null
                        ? `${view.eligibleParticipantCount}`
                        : "—"
                    }
                  />
                  <SummaryStat
                    label="Prise en charge potentielle estimée"
                    value={formatPriceEuros(view.estimatedFundingTotal)}
                  />
                  <SummaryStat
                    label="Reste à charge estimatif"
                    value={
                      view.estimatedRemainingCost !== null
                        ? formatPriceEuros(view.estimatedRemainingCost)
                        : "—"
                    }
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
                  La prise en charge potentielle sera estimée après
                  qualification des participants.
                </p>
              )}
            </CardContent>
            <p className="mx-6 mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {view.fundingDisclaimer ?? FALLBACK_FUNDING_DISCLAIMER}
            </p>
          </Card>
        ) : null}

        {/* B bis. Comment votre parcours a été construit */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Comment votre parcours a été construit
              </CardTitle>
            </div>
            <CardDescription>
              La démarche Start Academy, étape par étape.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {HOW_BUILT_STEPS.map((step, idx) => (
                <li
                  key={step.title}
                  className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/10 p-3"
                >
                  <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#00527a] text-xs font-bold text-white">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="font-heading text-sm font-semibold text-[#00527a]">
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* C. Pourquoi ce parcours */}
        {view.detectedNeeds.length > 0 || view.performanceIssues.length > 0 ? (
          <Card className="border-border/60 bg-white">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-[#3ea9ff]" />
                <CardTitle className="font-heading text-xl text-[#00527a]">
                  Pourquoi ce parcours
                </CardTitle>
              </div>
              <CardDescription>
                Les enjeux identifiés par votre interlocuteur Start Academy
                lors du rendez-vous.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {view.detectedNeeds.length > 0 ? (
                <div>
                  <h3 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-[#00527a]">
                    Besoins identifiés
                  </h3>
                  <ul className="space-y-1 text-sm text-foreground/80">
                    {view.detectedNeeds.slice(0, 6).map((need, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[#3ea9ff]" />
                        <span>{need}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {view.performanceIssues.length > 0 ? (
                <div>
                  <h3 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-[#00527a]">
                    Enjeux prioritaires
                  </h3>
                  <ul className="space-y-1 text-sm text-foreground/80">
                    {view.performanceIssues.slice(0, 6).map((issue, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[#00527a]" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* D. Modules proposés */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Modules proposés
              </CardTitle>
            </div>
            <CardDescription>
              Sélectionnés dans le catalogue Start Academy pour vos
              équipes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {view.modules.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                Le détail du programme sera ajouté après validation
                interne.
              </p>
            ) : (
              <ol className="space-y-3">
                {view.modules.map((m, idx) => (
                  <li
                    key={`${m.name}-${idx}`}
                    className="rounded-md border border-border/60 bg-muted/10 p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-heading text-base font-semibold text-[#00527a]">
                        {idx + 1}. {m.name}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(m.durationHours)}
                        {m.family ? ` · ${m.family}` : ""}
                      </span>
                    </div>
                    {m.reason ? (
                      <p className="mt-2 text-sm text-foreground/80">
                        {m.reason}
                      </p>
                    ) : null}
                    {m.useCases.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {m.useCases.slice(0, 4).map((uc, ucIdx) => (
                          <li
                            key={`${uc}-${ucIdx}`}
                            className="rounded-full bg-[#eaf5ff] px-2.5 py-0.5 text-[11px] text-[#00527a]"
                          >
                            {uc}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* D bis. Ce que Start Academy va produire */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Ce que Start Academy va produire
              </CardTitle>
            </div>
            <CardDescription>
              Les livrables préparés pour votre session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {SA_DELIVERABLES.map((d) => (
                <div
                  key={d.title}
                  className="rounded-md border border-border/60 bg-muted/10 p-3"
                >
                  <p className="font-heading text-sm font-semibold text-[#00527a]">
                    {d.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* E. Guide initial — timeline */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarCheck2 className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Guide initial
              </CardTitle>
            </div>
            <CardDescription>
              Les prochaines étapes pour démarrer votre formation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {TIMELINE.map((step, idx) => {
                const isDone = idx < activeTimelineStep;
                const isCurrent = idx === activeTimelineStep;
                return (
                  <li
                    key={step.title}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-0.5">
                      {isDone ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : isCurrent ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#00527a] text-[10px] font-bold text-white">
                          {idx + 1}
                        </div>
                      ) : (
                        <CircleDashed className="h-5 w-5 text-muted-foreground/60" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p
                        className={
                          isCurrent
                            ? "font-heading text-sm font-semibold text-[#00527a]"
                            : "font-heading text-sm font-medium text-foreground/80"
                        }
                      >
                        {step.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        {/* E bis. Ce que vous devez faire maintenant */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Ce que vous devez faire maintenant
              </CardTitle>
            </div>
            <CardDescription>
              Une checklist courte pour faire avancer la formation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {DIRIGEANT_CHECKLIST.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md border border-[#00527a]/30 bg-[#eaf5ff] text-[10px] text-[#00527a]">
                    ☐
                  </span>
                  <span className="text-foreground/85">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* E ter. Ce que vos collaborateurs vont compléter */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Ce que vos collaborateurs vont compléter
              </CardTitle>
            </div>
            <CardDescription>
              Quelques informations pour personnaliser la formation. 5
              minutes par collaborateur.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {COLLAB_FIELDS.map((f) => (
                <div
                  key={f.label}
                  className="rounded-md border border-border/60 bg-muted/10 p-3"
                >
                  <p className="font-heading text-sm font-semibold text-[#00527a]">
                    {f.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* E quat. Documents utiles à préparer */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Documents utiles à préparer
              </CardTitle>
            </div>
            <CardDescription>
              Tous ces éléments sont optionnels, mais ils permettent de
              personnaliser davantage la formation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {DOCUMENT_SUGGESTIONS.map((doc) => (
                <li key={doc} className="flex gap-2 text-foreground/80">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[#3ea9ff]" />
                  <span>{doc}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Vous pourrez transmettre ces documents à votre interlocuteur
              Start Academy ou via la collecte collaborateurs lorsque le
              dépôt sera ouvert.
            </p>
          </CardContent>
        </Card>

        {/* F. Collecte collaborateurs */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Préparation des collaborateurs
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {view.hasActiveCollectionToken ? (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-medium">
                  Un lien de préparation est actif pour vos collaborateurs.
                </p>
                <p className="mt-1 text-xs">
                  Pour des raisons de sécurité, ce lien ne s&apos;affiche
                  pas sur cette page. Demandez-le à votre interlocuteur
                  Start Academy — il vous sera transmis par email ou par
                  votre canal habituel. Vous pourrez ensuite le
                  partager à votre équipe.
                </p>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                Le lien collaborateurs sera communiqué par votre
                interlocuteur Start Academy après validation de la
                formation.
              </p>
            )}
          </CardContent>
        </Card>

        {/* F bis. Choix des dates */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarCheck2 className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Choix des dates
              </CardTitle>
            </div>
            <CardDescription>
              Sélectionnez le créneau qui vous convient. Votre choix sera
              transmis à votre interlocuteur Start Academy pour
              confirmation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DateChoiceList
              token={token}
              initialOptions={dateOptionsForChoice}
              recipientEmail={validation.recipientEmail}
            />
          </CardContent>
        </Card>

        {/* G. Validation formation */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Validation de la formation
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              type="button"
              disabled
              className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-md border border-[#00527a]/20 bg-[#eaf5ff]/40 px-4 text-sm font-medium text-[#00527a] opacity-70"
            >
              <FileSignature className="h-4 w-4" />
              Valider la formation (à venir)
            </button>
            <p className="text-xs text-muted-foreground">
              La validation en ligne sera disponible prochainement.
              Pour cette version, la validation se fait par retour email
              auprès de votre interlocuteur Start Academy.
            </p>
          </CardContent>
        </Card>

        {/* H. Contact Start Academy */}
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Votre contact Start Academy
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {view.commercialName || view.commercialEmail ? (
              <div className="rounded-md border border-border/60 bg-muted/10 p-4">
                {view.commercialName ? (
                  <p className="font-heading text-base font-semibold text-[#00527a]">
                    {view.commercialName}
                  </p>
                ) : null}
                {view.commercialEmail ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    <a
                      href={`mailto:${view.commercialEmail}`}
                      className="hover:text-[#00527a]"
                    >
                      {view.commercialEmail}
                    </a>
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  Votre interlocuteur Start Academy reste votre point de
                  contact pour toute question sur la formation.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Votre interlocuteur Start Academy reste votre point de
                contact pour toute question sur la formation. Si vous
                avez perdu ses coordonnées, contactez Start Academy.
              </p>
            )}
            {view.director ? (
              <p className="text-xs text-muted-foreground">
                Référence dossier : {view.director} · {clientName}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Separator />
        <p className="text-center text-xs text-muted-foreground">
          Cet espace est strictement personnel et confidentiel. Ne le
          partagez pas — il est associé
          {validation.recipientEmail
            ? ` à votre adresse email (${validation.recipientEmail}).`
            : "."}
        </p>
      </div>
    </PublicShell>
  );
}

function SummaryStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-sm font-semibold text-foreground/90">
        {value}
      </p>
    </div>
  );
}
