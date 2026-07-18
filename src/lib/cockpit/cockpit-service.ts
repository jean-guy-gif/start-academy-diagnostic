import "server-only";

import type { ProfileWithRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  calculateTotalTrainingBudget,
  calculateCostPerParticipant,
} from "@/lib/pricing/training-pricing";
import { getActiveFundingConfig } from "@/lib/pricing/funding-config-service";
import { estimateTrainingFunding } from "@/lib/pricing/training-funding";
import {
  emptyCockpitData,
  type CockpitAlert,
  type CockpitData,
  type CockpitNextAction,
  type CockpitOverview,
  type CockpitPipelineItem,
  type CockpitPriorityAction,
  type CockpitStage,
} from "./cockpit.types";

/**
 * Cockpit interne Start Academy — service d'agrégation.
 *
 * Lit Supabase via `service_role` (server-only) pour produire une
 * vue consolidée des dossiers en cours. Aucune nouvelle table créée :
 * tout est dérivé des tables existantes.
 *
 * Tolérance aux données manquantes :
 *   - Si Supabase n'est pas configuré → retourne `emptyCockpitData()`
 *     avec un alert "Supabase non configuré".
 *   - Si une session n'a pas de recommendation / proposition /
 *     support, l'item pipeline reste affiché à l'étape adéquate.
 *   - Jamais d'exception remontée — le cockpit ne doit pas crasher
 *     même si un dossier est dans un état partiel.
 */

// ---------------------------------------------------------------------------
// Types row internes
// ---------------------------------------------------------------------------

interface SessionRow {
  id: string;
  client_id: string;
  diagnostic_id: string | null;
  recommendation_id: string | null;
  status: string;
  expected_participants: number | null;
  created_at: string;
  updated_at: string;
}

interface DiagnosticRow {
  id: string;
  client_id: string;
  status: string;
  expected_participants: number | null;
  updated_at: string;
  /**
   * v1.0b — snapshot du moteur ratios/alertes, alimenté best-effort
   * côté routes (Lot 1). Shape : { alerts: DiagnosticAlert[]; computedAt }.
   * `null` si jamais calculé.
   */
  alerts_snapshot: unknown;
  // Chantier A funding-opco-ep §9.1 — consommation OPCO EP annuelle
  // entreprise, retranchée du plafond côté training-funding avant
  // plafonnement. NULL = warning « estimation à valider » côté funding.
  opco_ep_amount_consumed_current_year: number | null;
}

interface ClientLite {
  id: string;
  company_name: string;
  director: string | null;
}

interface RecoRow {
  id: string;
  diagnostic_id: string;
  total_duration_hours: number | null;
}

interface ParticipantsCount {
  session_id: string;
  count: number;
}

interface DiagnosticParticipantRow {
  diagnostic_id: string;
  professional_status:
    | "salarie"
    | "agent_commercial_independant"
    | "autre"
    | null;
  previous_year_production: number | null;
  // Chantier A funding-opco-ep §9.2 — retranchement plafond AGEFICE avant
  // plafonnement pour ce participant (indé). NULL = warning côté funding.
  agefice_amount_consumed_current_year: number | null;
  eligible_opco: boolean | null;
}

interface DateOptionRow {
  session_id: string;
  status: "proposed" | "selected" | "rejected" | "cancelled";
}

interface PublicTokenRow {
  session_id: string;
  access_type:
    | "client_session_view"
    | "participant_collect"
    | "trainer_session_view";
  is_active: boolean;
  expires_at: string | null;
}

interface SupportRow {
  session_id: string;
  status: "draft" | "validated" | "archived";
}

interface DesignedSupportRow {
  session_id: string;
  status: "draft" | "validated" | "archived";
}

// ---------------------------------------------------------------------------
// API publique du service
// ---------------------------------------------------------------------------

/**
 * Cockpit — cloisonné par ownership (T-11, 2026-07-09).
 *
 * • Rôle `admin`     → voit tout Start Academy (pas de filtre).
 * • Autres internes  → voit uniquement ses propres dossiers
 *   (`created_by = profile.id` sur `training_sessions` et
 *   `diagnostics`). Les 10 tables filles suivent par jointure sur les
 *   IDs retenus (`.in()`) — pas de lecture globale puis filtre en
 *   mémoire, pour éviter tout leak PII/CA N-1 côté `clients` et
 *   `diagnostic_participants`.
 *
 * Le catalogue `training_modules` reste global (référentiel commun).
 */
export async function getCockpitData(
  profile: ProfileWithRole
): Promise<CockpitData> {
  const client = createSupabaseAdminClient();
  if (!client) {
    const data = emptyCockpitData();
    data.alerts.push({
      id: "supabase-not-configured",
      severity: "warning",
      title: "Supabase non configuré",
      message:
        "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant — le cockpit n'a pas pu lire l'état des dossiers.",
    });
    data.alerts.push(...await collectSystemAlerts(false));
    return data;
  }

  const isAdmin = profile.role === "admin";

  // Étape 1 — sessions + diagnostics filtrés par ownership.
  const sessionsQuery = client
    .from("training_sessions")
    .select(
      "id, client_id, diagnostic_id, recommendation_id, status, expected_participants, created_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(200);
  const diagnosticsQuery = client
    .from("diagnostics")
    .select(
      "id, client_id, status, expected_participants, updated_at, alerts_snapshot, opco_ep_amount_consumed_current_year"
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  const [sessionsRes, diagnosticsRes] = await Promise.all([
    isAdmin ? sessionsQuery : sessionsQuery.eq("created_by", profile.id),
    isAdmin ? diagnosticsQuery : diagnosticsQuery.eq("created_by", profile.id),
  ]);

  const sessions: SessionRow[] =
    (sessionsRes.data as SessionRow[] | null) ?? [];
  const diagnostics: DiagnosticRow[] =
    ((diagnosticsRes.data as unknown) as DiagnosticRow[] | null) ?? [];

  // Étape 2 — dérivation des IDs pour les jointures aval. Sans dossier
  // en propre (non-admin sans sessions ni diagnostics), on ne charge
  // rien d'autre — le cockpit est vide, ce qui est le comportement
  // voulu (le commercial pilote depuis zéro).
  const sessionIds = sessions.map((s) => s.id);
  const diagIds = diagnostics.map((d) => d.id);
  const clientIdSet = new Set<string>();
  for (const s of sessions) if (s.client_id) clientIdSet.add(s.client_id);
  for (const d of diagnostics) if (d.client_id) clientIdSet.add(d.client_id);
  const clientIds = Array.from(clientIdSet);

  // Étape 3 — 10 tables filles + catalogue global, tolérant à l'erreur.
  const emptyRes = { data: [], error: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empty = emptyRes as any;
  const [
    clientsRes,
    recosRes,
    participantsRes,
    diagParticipantsRes,
    dateOptionsRes,
    publicTokensRes,
    supportsRes,
    designedRes,
    qualityReviewsRes,
    postTrainingReviewsRes,
    trainingModulesCountRes,
  ] = await Promise.all([
    clientIds.length > 0
      ? client
          .from("clients")
          .select("id, company_name, director")
          .in("id", clientIds)
      : empty,
    diagIds.length > 0
      ? client
          .from("recommendations")
          .select("id, diagnostic_id, total_duration_hours")
          .in("diagnostic_id", diagIds)
      : empty,
    sessionIds.length > 0
      ? client
          .from("session_participants")
          .select("session_id")
          .in("session_id", sessionIds)
      : empty,
    diagIds.length > 0
      ? client
          .from("diagnostic_participants")
          .select(
            "diagnostic_id, professional_status, previous_year_production, agefice_amount_consumed_current_year, eligible_opco"
          )
          .in("diagnostic_id", diagIds)
      : empty,
    sessionIds.length > 0
      ? client
          .from("session_date_options")
          .select("session_id, status")
          .in("session_id", sessionIds)
      : empty,
    sessionIds.length > 0
      ? client
          .from("public_access_tokens")
          .select("session_id, access_type, is_active, expires_at")
          .in("session_id", sessionIds)
      : empty,
    sessionIds.length > 0
      ? client
          .from("training_supports")
          .select("session_id, status")
          .in("session_id", sessionIds)
      : empty,
    sessionIds.length > 0
      ? client
          .from("designed_training_supports")
          .select("session_id, status")
          .in("session_id", sessionIds)
      : empty,
    sessionIds.length > 0
      ? client
          .from("support_quality_reviews")
          .select("session_id, status")
          .in("session_id", sessionIds)
      : empty,
    sessionIds.length > 0
      ? client
          .from("post_training_reviews")
          .select("session_id, status")
          .in("session_id", sessionIds)
      : empty,
    // Catalogue global — pas de cloisonnement, c'est un référentiel.
    client
      .from("training_modules")
      .select("id", { count: "exact", head: true }),
  ]);

  const clientsMap = new Map<string, ClientLite>();
  for (const c of (clientsRes.data as ClientLite[] | null) ?? []) {
    clientsMap.set(c.id, c);
  }
  const recosByDiag = new Map<string, RecoRow>();
  for (const r of (recosRes.data as RecoRow[] | null) ?? []) {
    recosByDiag.set(r.diagnostic_id, r);
  }
  const recosById = new Map<string, RecoRow>();
  for (const r of (recosRes.data as RecoRow[] | null) ?? []) {
    recosById.set(r.id, r);
  }
  const participantsBySession = new Map<string, number>();
  for (const p of (participantsRes.data as ParticipantsCount[] | null) ?? []) {
    participantsBySession.set(
      p.session_id,
      (participantsBySession.get(p.session_id) ?? 0) + 1
    );
  }
  // Chantier A funding-opco-ep §9.1 — pour chaque diagnostic, lookup
  // O(1) de la consommation OPCO EP entreprise déjà entamée (à
  // retrancher de l'enveloppe salariés côté training-funding).
  const opcoEpConsumedByDiag = new Map<string, number | null>();
  for (const d of diagnostics) {
    opcoEpConsumedByDiag.set(d.id, d.opco_ep_amount_consumed_current_year);
  }
  const diagParticipantsByDiag = new Map<
    string,
    DiagnosticParticipantRow[]
  >();
  // Cast unknown : colonnes `agefice_amount_consumed_current_year` +
  // `eligible_opco` pas encore dans `database.types.ts` (migration
  // 20260718180000 en cours).
  for (const p of ((diagParticipantsRes.data as unknown) as
    | DiagnosticParticipantRow[]
    | null) ?? []) {
    const list = diagParticipantsByDiag.get(p.diagnostic_id) ?? [];
    list.push(p);
    diagParticipantsByDiag.set(p.diagnostic_id, list);
  }
  const dateOptionsBySession = new Map<string, DateOptionRow[]>();
  for (const d of (dateOptionsRes.data as DateOptionRow[] | null) ?? []) {
    const list = dateOptionsBySession.get(d.session_id) ?? [];
    list.push(d);
    dateOptionsBySession.set(d.session_id, list);
  }
  const tokensBySession = new Map<string, PublicTokenRow[]>();
  for (const t of (publicTokensRes.data as PublicTokenRow[] | null) ?? []) {
    const list = tokensBySession.get(t.session_id) ?? [];
    list.push(t);
    tokensBySession.set(t.session_id, list);
  }
  const supportsBySession = new Map<string, SupportRow>();
  for (const s of (supportsRes.data as SupportRow[] | null) ?? []) {
    supportsBySession.set(s.session_id, s);
  }
  const designedBySession = new Map<string, DesignedSupportRow>();
  for (const d of (designedRes.data as DesignedSupportRow[] | null) ?? []) {
    designedBySession.set(d.session_id, d);
  }
  // Validation pédagogique : on retient le status de la review courante
  // par session (s'il en existe une).
  const qualityReviewBySession = new Map<string, { status: string }>();
  for (const q of (qualityReviewsRes.data as
    | { session_id: string; status: string }[]
    | null) ?? []) {
    // Si plusieurs reviews existent par session (historique futur),
    // on garde la dernière vue — l'ordre des lignes n'est pas
    // garanti ici, mais le service côté API garantit une seule
    // review courante.
    qualityReviewBySession.set(q.session_id, { status: q.status });
  }
  // Suivi post-formation : status de la review courante par session.
  const postTrainingReviewBySession = new Map<string, { status: string }>();
  for (const p of (postTrainingReviewsRes.data as
    | { session_id: string; status: string }[]
    | null) ?? []) {
    postTrainingReviewBySession.set(p.session_id, { status: p.status });
  }

  // Tarif horaire Start Academy — lu UNE fois ici depuis
  // `funding_config` (seed PRICE_PER_HOUR_PER_PARTICIPANT). Propagé
  // aux 2 fonctions de construction pipeline. Best-effort : ne throw
  // jamais, retombe sur DEFAULT_FUNDING_CONFIG si Supabase indisponible.
  const fundingConfigForPricing = await getActiveFundingConfig();
  const pricePerHour = fundingConfigForPricing.pricePerHourPerParticipant;

  // Construction des items pipeline : un par session, puis on ajoute
  // les diagnostics ORPHELINS (sans session attachée).
  const sessionsByDiag = new Set<string>();
  const pipeline: CockpitPipelineItem[] = sessions.map((s) => {
    if (s.diagnostic_id) sessionsByDiag.add(s.diagnostic_id);
    return buildItemFromSession(s, {
      clientsMap,
      recosById,
      recosByDiag,
      participantsBySession,
      diagParticipantsByDiag,
      opcoEpConsumedByDiag,
      dateOptionsBySession,
      tokensBySession,
      supportsBySession,
      designedBySession,
      qualityReviewBySession,
      postTrainingReviewBySession,
      pricePerHour,
    });
  });

  for (const d of diagnostics) {
    if (sessionsByDiag.has(d.id)) continue;
    pipeline.push(
      buildItemFromOrphanDiagnostic(d, {
        clientsMap,
        recosByDiag,
        pricePerHour,
      })
    );
  }

  // Tri stable : pipeline trié par updated_at desc (le plus récent en haut).
  pipeline.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // v1.0b — compte de diagnostics avec au moins une alerte détectée
  // dans `alerts_snapshot`. Un snapshot absent ou vide ne compte pas.
  const diagnosticsWithAlerts = diagnostics.reduce((acc, d) => {
    const snap = d.alerts_snapshot as
      | { alerts?: unknown[] }
      | null
      | undefined;
    return acc +
      (snap && Array.isArray(snap.alerts) && snap.alerts.length > 0 ? 1 : 0);
  }, 0);

  const overview = computeOverview(pipeline, { diagnosticsWithAlerts });
  const priorityActions = computePriorityActions(pipeline);
  const alerts = await collectSystemAlerts(true);

  // Alerte si catalogue Supabase vide
  if (
    trainingModulesCountRes.count !== null &&
    trainingModulesCountRes.count === 0
  ) {
    alerts.push({
      id: "catalog-empty",
      severity: "error",
      title: "Catalogue Supabase vide",
      message:
        "training_modules ne contient aucun module. Exécuter supabase/seed.sql avant toute génération.",
    });
  }

  return {
    overview,
    pipeline,
    priorityActions,
    alerts,
    fellBackToEmpty: false,
  };
}

// ---------------------------------------------------------------------------
// Façade publique alternative — pour respecter le contrat du PRD.
// ---------------------------------------------------------------------------

export async function getCockpitOverview(
  profile: ProfileWithRole
): Promise<CockpitOverview> {
  return (await getCockpitData(profile)).overview;
}

export async function getCockpitPipeline(
  profile: ProfileWithRole
): Promise<CockpitPipelineItem[]> {
  return (await getCockpitData(profile)).pipeline;
}

export async function getCockpitPriorityActions(
  profile: ProfileWithRole
): Promise<CockpitPriorityAction[]> {
  return (await getCockpitData(profile)).priorityActions;
}

export async function getCockpitAlerts(
  profile: ProfileWithRole
): Promise<CockpitAlert[]> {
  return (await getCockpitData(profile)).alerts;
}

// ---------------------------------------------------------------------------
// Construction d'un item pipeline depuis une session
// ---------------------------------------------------------------------------

interface BuildContext {
  clientsMap: Map<string, ClientLite>;
  recosById: Map<string, RecoRow>;
  recosByDiag: Map<string, RecoRow>;
  participantsBySession: Map<string, number>;
  diagParticipantsByDiag: Map<string, DiagnosticParticipantRow[]>;
  opcoEpConsumedByDiag: Map<string, number | null>;
  dateOptionsBySession: Map<string, DateOptionRow[]>;
  tokensBySession: Map<string, PublicTokenRow[]>;
  supportsBySession: Map<string, SupportRow>;
  designedBySession: Map<string, DesignedSupportRow>;
  qualityReviewBySession: Map<string, { status: string }>;
  postTrainingReviewBySession: Map<string, { status: string }>;
  /**
   * Tarif horaire par participant Start Academy (funding_config, seed
   * PRICE_PER_HOUR_PER_PARTICIPANT). Injecté en une seule lecture
   * depuis `getCockpitData`, propagé à toutes les fonctions de
   * construction pipeline (session + orphan diagnostic).
   */
  pricePerHour: number;
}

function buildItemFromSession(
  s: SessionRow,
  ctx: BuildContext
): CockpitPipelineItem {
  const client = ctx.clientsMap.get(s.client_id) ?? null;
  // Recommandation : d'abord par recommendation_id, fallback par
  // diagnostic_id (cas où la session pointe pas encore la reco).
  let reco: RecoRow | null = null;
  if (s.recommendation_id) reco = ctx.recosById.get(s.recommendation_id) ?? null;
  if (!reco && s.diagnostic_id) reco = ctx.recosByDiag.get(s.diagnostic_id) ?? null;

  const totalDurationHours = reco?.total_duration_hours ?? null;
  const totalBudget = calculateTotalTrainingBudget(
    totalDurationHours,
    s.expected_participants ?? null,
    ctx.pricePerHour
  );

  // Estimation funding (best-effort, depuis diagnostic_participants).
  let estimatedRemainingCost: number | null = null;
  if (s.diagnostic_id) {
    const diagParts = ctx.diagParticipantsByDiag.get(s.diagnostic_id) ?? [];
    if (diagParts.length > 0 && totalDurationHours !== null) {
      const costPerParticipant = calculateCostPerParticipant(
        totalDurationHours,
        ctx.pricePerHour
      );
      const summary = estimateTrainingFunding({
        participants: diagParts.map((p) => ({
          professionalStatus: p.professional_status,
          previousYearProduction: p.previous_year_production,
          eligibleOpco: p.eligible_opco,
          ageficeAmountConsumedCurrentYear:
            p.agefice_amount_consumed_current_year,
        })),
        costPerParticipant,
        totalBudget,
        opcoEpAmountConsumedCurrentYear:
          ctx.opcoEpConsumedByDiag.get(s.diagnostic_id) ?? null,
      });
      estimatedRemainingCost = summary.estimatedRemainingCost;
    }
  }

  const participantCount = ctx.participantsBySession.get(s.id) ?? 0;
  const dateOptions = ctx.dateOptionsBySession.get(s.id) ?? [];
  const tokens = ctx.tokensBySession.get(s.id) ?? [];
  const support = ctx.supportsBySession.get(s.id) ?? null;
  const designed = ctx.designedBySession.get(s.id) ?? null;

  const stage = computeStageForSession({
    sessionStatus: s.status,
    hasRecommendation: !!reco,
    hasSupport: !!support,
    hasDesigned: !!designed,
    designedStatus: designed?.status ?? null,
    participantsCount: participantCount,
    expectedParticipants: s.expected_participants,
    dateOptions,
  });

  const qualityReview = ctx.qualityReviewBySession.get(s.id) ?? null;
  const postTrainingReview =
    ctx.postTrainingReviewBySession.get(s.id) ?? null;

  const nextAction = computeNextActionForSession({
    sessionId: s.id,
    sessionStatus: s.status,
    diagnosticId: s.diagnostic_id,
    hasRecommendation: !!reco,
    hasSupport: !!support,
    hasDesigned: !!designed,
    designedStatus: designed?.status ?? null,
    qualityReviewStatus: qualityReview?.status ?? null,
    postTrainingReviewStatus: postTrainingReview?.status ?? null,
    participantsCount: participantCount,
    expectedParticipants: s.expected_participants,
    dateOptions,
    tokens,
  });

  return {
    id: s.id,
    kind: "session",
    clientName: client?.company_name ?? null,
    director: client?.director ?? null,
    expectedParticipants: s.expected_participants ?? null,
    totalDurationHours,
    totalBudget,
    estimatedRemainingCost,
    stage,
    rawStatus: s.status,
    nextAction,
    updatedAt: s.updated_at,
    diagnosticId: s.diagnostic_id,
    sessionId: s.id,
  };
}

function buildItemFromOrphanDiagnostic(
  d: DiagnosticRow,
  ctx: Pick<BuildContext, "clientsMap" | "recosByDiag" | "pricePerHour">
): CockpitPipelineItem {
  const client = ctx.clientsMap.get(d.client_id) ?? null;
  const reco = ctx.recosByDiag.get(d.id) ?? null;
  const totalDurationHours = reco?.total_duration_hours ?? null;
  const totalBudget = calculateTotalTrainingBudget(
    totalDurationHours,
    d.expected_participants ?? null,
    ctx.pricePerHour
  );

  const stage: CockpitStage = reco
    ? "recommendation_done"
    : "diagnostic_in_progress";
  const nextAction: CockpitNextAction = reco
    ? {
        label: "Générer la proposition",
        href: `/diagnostics/${d.id}/proposal`,
        urgency: "today",
        code: "generate_proposal",
      }
    : {
        label: "Générer la recommandation",
        href: `/diagnostics/${d.id}/recommendation`,
        urgency: "today",
        code: "generate_recommendation",
      };

  return {
    id: d.id,
    kind: "diagnostic_only",
    clientName: client?.company_name ?? null,
    director: client?.director ?? null,
    expectedParticipants: d.expected_participants ?? null,
    totalDurationHours,
    totalBudget,
    estimatedRemainingCost: null,
    stage,
    rawStatus: d.status,
    nextAction,
    updatedAt: d.updated_at,
    diagnosticId: d.id,
    sessionId: null,
  };
}

// ---------------------------------------------------------------------------
// Stage + Next action — règles métier
// ---------------------------------------------------------------------------

interface StageInputs {
  sessionStatus: string;
  hasRecommendation: boolean;
  hasSupport: boolean;
  hasDesigned: boolean;
  designedStatus: string | null;
  participantsCount: number;
  expectedParticipants: number | null;
  dateOptions: DateOptionRow[];
}

function computeStageForSession(i: StageInputs): CockpitStage {
  // Mapping principal par status SQL — surchargé ponctuellement.
  switch (i.sessionStatus) {
    case "created":
      return i.hasRecommendation ? "proposal_to_send" : "diagnostic_in_progress";
    case "awaiting_client_validation":
      return "awaiting_validation";
    case "dates_to_position":
      return "dates_to_position";
    case "dates_validated":
      // Si dates validées mais collecte pas ouverte, on est encore en "dates".
      return "dates_proposed";
    case "collection_open":
      // Comparer count des participants vs attendus
      if (
        i.expectedParticipants !== null &&
        i.participantsCount >= i.expectedParticipants
      ) {
        return "collection_complete";
      }
      return "collection_open";
    case "data_collected":
      return i.hasSupport ? "support_to_generate" : "collection_complete";
    case "support_generating":
      return i.hasDesigned ? "support_designing" : "support_to_generate";
    case "support_ready":
      return i.designedStatus === "validated"
        ? "ready_for_training"
        : "support_designing";
    case "delivered":
      return "delivered";
    case "report_sent":
      return "post_training";
    default:
      return "diagnostic_in_progress";
  }
}

interface NextActionInputs extends StageInputs {
  sessionId: string;
  diagnosticId: string | null;
  tokens: PublicTokenRow[];
  /** Status de la review qualité courante (null si aucune). */
  qualityReviewStatus: string | null;
  /** Status de la review post-formation courante (null si aucune). */
  postTrainingReviewStatus: string | null;
}

export function computeNextActionForSession(
  i: NextActionInputs
): CockpitNextAction {
  // 1. Pas de recommandation → générer la reco (très peu probable car
  //    la session implique normalement une reco, mais on garde).
  if (!i.hasRecommendation && i.diagnosticId) {
    return {
      label: "Générer la recommandation",
      href: `/diagnostics/${i.diagnosticId}/recommendation`,
      urgency: "today",
      code: "generate_recommendation",
    };
  }

  // 2. Session créée mais proposition pas envoyée → générer/envoyer.
  if (i.sessionStatus === "created") {
    return {
      label: "Finaliser et envoyer la proposition",
      href: `/sessions/${i.sessionId}`,
      urgency: "today",
      code: "generate_proposal",
    };
  }

  // 3. En attente validation client.
  if (i.sessionStatus === "awaiting_client_validation") {
    const hasClientLink = i.tokens.some(
      (t) => t.access_type === "client_session_view" && t.is_active
    );
    if (!hasClientLink) {
      return {
        label: "Générer le lien dirigeant",
        href: `/sessions/${i.sessionId}`,
        urgency: "today",
        code: "generate_client_link",
      };
    }
    return {
      label: "Attendre choix dirigeant",
      href: `/sessions/${i.sessionId}`,
      urgency: "this_week",
      code: "await_client_choice",
    };
  }

  // 4. Dates à positionner.
  if (i.sessionStatus === "dates_to_position") {
    const hasProposed = i.dateOptions.some((d) => d.status === "proposed");
    if (!hasProposed) {
      return {
        label: "Proposer des créneaux",
        href: `/sessions/${i.sessionId}`,
        urgency: "today",
        code: "propose_dates",
      };
    }
    return {
      label: "Attendre choix dirigeant",
      href: `/sessions/${i.sessionId}`,
      urgency: "this_week",
      code: "await_client_choice",
    };
  }

  // 5. Dates validées : lancer la collecte.
  if (i.sessionStatus === "dates_validated") {
    const hasCollectionLink = i.tokens.some(
      (t) => t.access_type === "participant_collect" && t.is_active
    );
    if (!hasCollectionLink) {
      return {
        label: "Envoyer lien collaborateurs",
        href: `/sessions/${i.sessionId}`,
        urgency: "today",
        code: "send_collection_link",
      };
    }
    return {
      label: "Relancer collaborateurs",
      href: `/sessions/${i.sessionId}`,
      urgency: "this_week",
      code: "remind_collaborators",
    };
  }

  // 6. Collecte ouverte.
  if (i.sessionStatus === "collection_open") {
    if (
      i.expectedParticipants !== null &&
      i.participantsCount < i.expectedParticipants
    ) {
      return {
        label: `Relancer collaborateurs (${i.participantsCount}/${i.expectedParticipants})`,
        href: `/sessions/${i.sessionId}`,
        urgency: "this_week",
        code: "remind_collaborators",
      };
    }
    return {
      label: "Lancer la génération support",
      href: `/sessions/${i.sessionId}/support`,
      urgency: "today",
      code: "generate_support",
    };
  }

  // 7. Données collectées sans support brut.
  if (i.sessionStatus === "data_collected" && !i.hasSupport) {
    return {
      label: "Générer support brut",
      href: `/sessions/${i.sessionId}/support`,
      urgency: "today",
      code: "generate_support",
    };
  }

  // 8. Support brut OK, designed manquant.
  if (i.hasSupport && !i.hasDesigned) {
    return {
      label: "Générer support designé",
      href: `/sessions/${i.sessionId}/support/design`,
      urgency: "today",
      code: "generate_designed_support",
    };
  }

  // 9. Support designé en draft.
  if (i.hasDesigned && i.designedStatus === "draft") {
    return {
      label: "Valider le support designé",
      href: `/sessions/${i.sessionId}/support/design`,
      urgency: "this_week",
      code: "validate_designed_support",
    };
  }

  // 9.bis Support designé existant SANS review pédagogique validée :
  // prioriser la validation pédagogique interne avant de considérer
  // la session comme prête (cf. support-quality-validation-prd).
  if (
    i.hasDesigned &&
    i.qualityReviewStatus !== "validated"
  ) {
    return {
      label: "Valider le support pédagogique",
      href: `/sessions/${i.sessionId}/support/design`,
      urgency: "this_week",
      code: "validate_support_quality",
    };
  }

  // 10. Support ready : tout est prêt — synchronisation calendar future.
  if (i.sessionStatus === "support_ready") {
    return {
      label: "Prêt pour formation",
      href: `/sessions/${i.sessionId}`,
      urgency: "later",
      code: "sync_calendar",
    };
  }

  // 11. Formation terminée — suivi post-formation.
  if (i.sessionStatus === "delivered") {
    if (i.postTrainingReviewStatus !== "completed") {
      return {
        label: "Compléter le suivi post-formation",
        href: `/sessions/${i.sessionId}`,
        urgency: "this_week",
        code: "complete_post_training_review",
      };
    }
    return {
      label: "Préparer suivi post-formation",
      href: `/sessions/${i.sessionId}`,
      urgency: "later",
      code: "post_training_followup",
    };
  }

  // 12. Bilan envoyé — rien à faire.
  if (i.sessionStatus === "report_sent") {
    return {
      label: "Bilan envoyé",
      href: `/sessions/${i.sessionId}`,
      urgency: "later",
      code: "none",
    };
  }

  return {
    label: "Voir la session",
    href: `/sessions/${i.sessionId}`,
    urgency: "later",
    code: "none",
  };
}

// ---------------------------------------------------------------------------
// KPI / Overview
// ---------------------------------------------------------------------------

function computeOverview(
  items: CockpitPipelineItem[],
  extras: { diagnosticsWithAlerts?: number } = {}
): CockpitOverview {
  const o: CockpitOverview = {
    diagnosticsInProgress: 0,
    proposalsToFinalize: 0,
    proposalsSent: 0,
    formationsValidated: 0,
    supportsToGenerate: 0,
    collectionsIncomplete: 0,
    datesToPosition: 0,
    formationsReady: 0,
    totalActiveDossiers: 0,
    diagnosticsWithAlerts: extras.diagnosticsWithAlerts ?? 0,
  };
  for (const it of items) {
    const isPostTraining = it.stage === "post_training";
    if (!isPostTraining) o.totalActiveDossiers += 1;
    switch (it.stage) {
      case "diagnostic_in_progress":
        o.diagnosticsInProgress += 1;
        break;
      case "recommendation_done":
      case "proposal_to_send":
        o.proposalsToFinalize += 1;
        break;
      case "awaiting_validation":
        o.proposalsSent += 1;
        break;
      case "dates_to_position":
        o.datesToPosition += 1;
        break;
      case "dates_proposed":
      case "collection_open":
        if (it.nextAction.code === "remind_collaborators") {
          o.collectionsIncomplete += 1;
        }
        o.formationsValidated += 1;
        break;
      case "collection_complete":
      case "support_to_generate":
        o.supportsToGenerate += 1;
        break;
      case "support_designing":
        o.supportsToGenerate += 1;
        break;
      case "ready_for_training":
        o.formationsReady += 1;
        break;
      case "delivered":
        o.formationsReady += 1;
        break;
    }
  }
  return o;
}

function computePriorityActions(
  items: CockpitPipelineItem[]
): CockpitPriorityAction[] {
  return items
    .filter((it) => it.nextAction.urgency === "today")
    .map((it) => ({
      pipelineItemId: it.id,
      clientName: it.clientName,
      label: it.nextAction.label,
      href: it.nextAction.href,
      code: it.nextAction.code,
      urgency: it.nextAction.urgency,
    }))
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// Alertes système
// ---------------------------------------------------------------------------

async function collectSystemAlerts(
  supabaseReachable: boolean
): Promise<CockpitAlert[]> {
  const alerts: CockpitAlert[] = [];
  if (!process.env.OPENROUTER_API_KEY) {
    alerts.push({
      id: "openrouter-not-configured",
      severity: "warning",
      title: "OpenRouter non configuré",
      message:
        "OPENROUTER_API_KEY absent — toutes les générations IA basculent sur le moteur heuristique.",
    });
  }
  if (!supabaseReachable) {
    alerts.push({
      id: "supabase-unreachable",
      severity: "error",
      title: "Supabase inaccessible",
      message:
        "Le cockpit n'a pas pu joindre la base. Mode dégradé localStorage.",
    });
  }
  return alerts;
}
