/**
 * Moteur ratios + alertes — référentiel diagnostic v1.0.
 *
 * Module PUR : pas de Supabase, pas de secret, pas d'IO. Importable
 * côté client et côté serveur. Prend en entrée un contexte typé
 * (client + diagnostic + answers + participants + funding config) et
 * renvoie :
 *   • un `RatiosSnapshot` (calculs ratios du référentiel v1.0)
 *   • un `AlertsSnapshot` (alertes structurées avec sévérité, seuil,
 *     observation)
 *
 * Correction (4) validée : `missing_required_data` — pour chaque
 * question `required: true` skippée OU sans réponse, on émet une
 * alerte transverse `severity: "warning"` avec le chapitre concerné.
 *
 * Correction (6) validée : le taux de consommation des droits est
 * TOUJOURS présenté comme une estimation ("environ X %") — le
 * label vient de `computeConsumptionRate` côté `training-funding.ts`.
 *
 * Le moteur ne persiste rien : c'est l'appelant serveur qui prend
 * le résultat et l'écrit dans `diagnostics.ratios_snapshot` /
 * `alerts_snapshot` (jsonb).
 */

import {
  computeConsumptionRate,
  type RuntimeFundingConfig,
} from "@/lib/pricing/training-funding";
import { diagnosticQuestions } from "@/lib/data/diagnostic-questions";
import type { DiagnosticChapter, DiagnosticQuestion } from "@/types";

export type AlertSeverity = "info" | "warning" | "error";

export interface DiagnosticAlert {
  /** Identifiant stable de l'alerte (utilisé pour dedupe / cockpit). */
  code: string;
  chapter: DiagnosticChapter | null;
  label: string;
  severity: AlertSeverity;
  /** Valeur observée quand mesurable (ratio, count…). */
  observed: number | null;
  /** Seuil de déclenchement quand applicable. */
  threshold: number | null;
  /** Contexte libre (question_id concernée, benchmark, etc.). */
  context?: Record<string, unknown>;
}

export interface RatiosSnapshot {
  ratios: Record<string, number | null>;
  /**
   * Libellé descriptif prêt à afficher — préfixé « environ » quand
   * il s'agit d'une estimation (cf. correction 6 pour le taux de
   * consommation).
   */
  labels: Record<string, string>;
  computedAt: string;
}

export interface AlertsSnapshot {
  alerts: DiagnosticAlert[];
  computedAt: string;
}

// Benchmarks paramétrables — défauts alignés sur le référentiel v1.0
// §"Ratios & benchmarks". Sortis explicitement en constantes pour
// pouvoir être surchargées via l'input `benchmarks` (une future
// itération pourra les faire vivre en base).
export const DEFAULT_BENCHMARKS = {
  contactsToRdvPercent: 20,
  rdvToMandatPercent: 40,
  exclusivityPercent: 30,
  visitsPerActe: 15,
  offresToCompromisPercent: 60,
  compromisToActePercent: 85,
  reviewsPerVentePercent: 30,
  consumptionLeverPercent: 30,
  transactionAncienMinPercent: 50,
} as const;

export type BenchmarksOverride = Partial<typeof DEFAULT_BENCHMARKS>;

// --------------------------------------------------------------------------
// Entrées du moteur — types minimums, pas de dépendance Supabase
// --------------------------------------------------------------------------

export interface RatiosDiagnosticInput {
  ventesNMoins1: number | null;
  caGlobalNMoins1: number | null;
  nbSalaries: number | null;
  nbAgentsIndep: number | null;
  activiteRepartition: Record<string, unknown> | null;
}

export interface RatiosClientInput {
  collaboratorsCount: number | null;
}

export interface RatiosAnswerInput {
  questionId: string;
  answer: string | null;
  isSkipped: boolean;
}

export interface RatiosParticipantInput {
  professionalStatus:
    | "salarie"
    | "agent_commercial_independant"
    | "autre"
    | null;
  eligibleOpco?: boolean | null;
  previousYearProduction?: number | null;
  formations24mAmount?: number | null;
}

export interface RatiosComputeInput {
  client: RatiosClientInput;
  diagnostic: RatiosDiagnosticInput;
  answers: RatiosAnswerInput[];
  participants: RatiosParticipantInput[];
  fundingConfig?: RuntimeFundingConfig;
  benchmarks?: BenchmarksOverride;
  /**
   * Horodatage `computedAt` — passé explicitement pour rendre le
   * moteur déterministe (tests reproductibles + module pur).
   * Défaut : `new Date().toISOString()`.
   */
  computedAt?: string;
}

// --------------------------------------------------------------------------
// Helpers internes
// --------------------------------------------------------------------------

function parseNumericAnswer(answer: string | null): number | null {
  if (answer === null) return null;
  const trimmed = answer.trim();
  if (trimmed.length === 0) return null;
  // Tolère "20%", "20 %", "20", "20.5", virgule décimale
  const normalized = trimmed.replace(/%/g, "").replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function findAnswer(
  answers: RatiosAnswerInput[],
  questionId: string
): RatiosAnswerInput | null {
  return answers.find((a) => a.questionId === questionId) ?? null;
}

function ratioPercent(
  numerator: number | null,
  denominator: number | null
): number | null {
  if (
    numerator === null ||
    denominator === null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }
  return Math.round((numerator / denominator) * 1000) / 10; // 0.1 %
}

function round2(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Extrait le % `transaction_ancien` de la répartition d'activité
 * (jsonb). Tolère les 2 formats : { transaction_ancien: 60 }
 * ou { "transaction ancien": 60 }.
 */
function transactionAncienPercent(
  repartition: Record<string, unknown> | null
): number | null {
  if (!repartition) return null;
  const raw =
    repartition["transaction_ancien"] ??
    repartition["transaction ancien"] ??
    repartition["ancien"];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

// --------------------------------------------------------------------------
// Fonction principale
// --------------------------------------------------------------------------

export interface RatiosComputeOutput {
  ratios: RatiosSnapshot;
  alerts: AlertsSnapshot;
}

export function computeRatiosAndAlerts(
  input: RatiosComputeInput
): RatiosComputeOutput {
  const computedAt = input.computedAt ?? new Date().toISOString();
  const benchmarks = { ...DEFAULT_BENCHMARKS, ...(input.benchmarks ?? {}) };
  const alerts: DiagnosticAlert[] = [];
  const ratios: Record<string, number | null> = {};
  const labels: Record<string, string> = {};

  // ---- Ratios agence (Ch. 1 / Ch. 2) --------------------------------------
  const { caGlobalNMoins1, ventesNMoins1, nbAgentsIndep } = input.diagnostic;
  const collaborators = input.client.collaboratorsCount;

  ratios.caMoyenParVente = round2(
    ratio(caGlobalNMoins1, ventesNMoins1)
  );
  labels.caMoyenParVente = "CA moyen par vente (€)";

  ratios.caParCollaborateur = round2(
    ratio(caGlobalNMoins1, collaborators)
  );
  labels.caParCollaborateur = "CA par collaborateur (€)";

  ratios.ventesParAgent = round2(ratio(ventesNMoins1, nbAgentsIndep));
  labels.ventesParAgent = "Ventes par agent";

  // ---- Ratios chaîne commerciale (Ch. 3 → Ch. 8) --------------------------
  const contacts = parseAnswerNumber(input.answers, "prospecting-contacts-per-month");
  const rdvMonth = parseAnswerNumber(input.answers, "seller-meetings-per-month");
  const mandates = parseAnswerNumber(input.answers, "mandates-per-month");
  const exclu = parseAnswerNumber(input.answers, "mandates-exclusivity-percent");
  const visites = parseAnswerNumber(input.answers, "visits-per-month");
  const offres = parseAnswerNumber(input.answers, "offers-per-month");
  const compromis = parseAnswerNumber(input.answers, "compromis-per-month");
  const actes = parseAnswerNumber(input.answers, "actes-per-month");
  const nbAvis = parseAnswerNumber(input.answers, "google-reviews-count");

  ratios.contactsToRdvPercent = ratioPercent(rdvMonth, contacts);
  labels.contactsToRdvPercent = "Contacts vendeurs → RDV (%)";

  ratios.rdvToMandatPercent = ratioPercent(mandates, rdvMonth);
  labels.rdvToMandatPercent = "RDV → mandat (%)";

  ratios.exclusivityPercent = exclu;
  labels.exclusivityPercent = "% exclusivité";

  ratios.visitesParVente =
    actes !== null && actes > 0 && visites !== null
      ? round2(visites / actes)
      : null;
  labels.visitesParVente = "Visites par vente";

  ratios.offresToCompromisPercent = ratioPercent(compromis, offres);
  labels.offresToCompromisPercent = "Offres → compromis (%)";

  ratios.compromisToActePercent = ratioPercent(actes, compromis);
  labels.compromisToActePercent = "Compromis → acte (%)";

  ratios.avisParVentePercent = ratioPercent(nbAvis, ventesNMoins1);
  labels.avisParVentePercent = "Avis Google / ventes N-1 (%)";

  // ---- Taux de consommation des droits 24 mois -----------------------------
  // Correction (6) : l'objet `ConsumptionRateEstimate` renvoie déjà
  // un `label` préfixé « environ ». On l'expose tel quel sans le
  // reformatter.
  const ageficeEligibleCount = input.participants.filter(
    (p) =>
      p.professionalStatus === "agent_commercial_independant" &&
      typeof p.previousYearProduction === "number" &&
      p.previousYearProduction >
        (input.fundingConfig?.ageficeThreshold ?? 7000)
  ).length;
  const opcoEligibleCount = input.participants.filter(
    (p) => p.professionalStatus === "salarie" && p.eligibleOpco === true
  ).length;

  const consumption = computeConsumptionRate({
    consumed24m: input.participants.map((p) => p.formations24mAmount ?? null),
    ageficeEligibleCount,
    opcoEligibleCount,
    config: input.fundingConfig,
  });
  ratios.consumptionRatePercent = consumption.percent;
  labels.consumptionRatePercent = consumption.label;

  // ==========================================================================
  // Alertes
  // ==========================================================================

  // Correction (4) : missing_required_data — transverse
  const missingByChapter = missingRequiredData(input.answers, diagnosticQuestions);
  for (const entry of missingByChapter) {
    alerts.push({
      code: `missing_required_data:${entry.questionId}`,
      chapter: entry.chapter,
      label: `Donnée obligatoire manquante — ${entry.questionText}`,
      severity: "warning",
      observed: null,
      threshold: null,
      context: { questionId: entry.questionId, isSkipped: entry.isSkipped },
    });
  }

  // Ch. 1 — Transaction ancien < 50 %
  const ancienPercent = transactionAncienPercent(
    input.diagnostic.activiteRepartition
  );
  if (
    ancienPercent !== null &&
    ancienPercent < benchmarks.transactionAncienMinPercent
  ) {
    alerts.push({
      code: "transaction_ancien_lt_50",
      chapter: 1,
      label: `Transaction ancien = ${ancienPercent} % — le diagnostic est calibré ancien, pertinence à vérifier avec le dirigeant`,
      severity: "warning",
      observed: ancienPercent,
      threshold: benchmarks.transactionAncienMinPercent,
    });
  }

  // Ch. 3 — Personne ne prospecte
  const prospectingWho = findAnswer(input.answers, "prospecting-who");
  if (prospectingWho?.answer === "personne") {
    alerts.push({
      code: "no_one_prospects",
      chapter: 3,
      label: "Personne ne prospecte — cause n°1 des mandats insuffisants",
      severity: "error",
      observed: null,
      threshold: null,
    });
  }

  // Ch. 3 — Contacts → RDV sous benchmark
  if (
    ratios.contactsToRdvPercent !== null &&
    ratios.contactsToRdvPercent < benchmarks.contactsToRdvPercent
  ) {
    alerts.push({
      code: "contacts_to_rdv_below_benchmark",
      chapter: 3,
      label: `Contacts → RDV à ${ratios.contactsToRdvPercent} % (benchmark ${benchmarks.contactsToRdvPercent} %)`,
      severity: "warning",
      observed: ratios.contactsToRdvPercent,
      threshold: benchmarks.contactsToRdvPercent,
    });
  }

  // Ch. 4 — Découverte vendeur non formalisée
  const sellerDiscovery = findAnswer(input.answers, "seller-discovery-formalized");
  if (
    sellerDiscovery &&
    sellerDiscovery.answer !== null &&
    ["non", "no", "false", "0"].includes(sellerDiscovery.answer.toLowerCase())
  ) {
    alerts.push({
      code: "seller_discovery_not_formalized",
      chapter: 4,
      label:
        "Découverte vendeur non formalisée — cause n°1 des mandats simples surévalués",
      severity: "warning",
      observed: null,
      threshold: null,
    });
  }

  // Ch. 4/5 — RDV → mandat sous benchmark
  if (
    ratios.rdvToMandatPercent !== null &&
    ratios.rdvToMandatPercent < benchmarks.rdvToMandatPercent
  ) {
    alerts.push({
      code: "rdv_to_mandat_below_benchmark",
      chapter: 5,
      label: `RDV → mandat à ${ratios.rdvToMandatPercent} % (benchmark ${benchmarks.rdvToMandatPercent} %)`,
      severity: "warning",
      observed: ratios.rdvToMandatPercent,
      threshold: benchmarks.rdvToMandatPercent,
    });
  }

  // Ch. 5 — % exclusivité faible
  if (
    exclu !== null &&
    exclu < benchmarks.exclusivityPercent
  ) {
    alerts.push({
      code: "exclusivity_below_benchmark",
      chapter: 5,
      label: `% exclusivité à ${exclu} % (benchmark ${benchmarks.exclusivityPercent} %)`,
      severity: "warning",
      observed: exclu,
      threshold: benchmarks.exclusivityPercent,
    });
  }

  // Ch. 6 — Suivi vendeur à la demande / jamais
  const followupFrequency = findAnswer(
    input.answers,
    "commercial-followup-frequency"
  );
  if (
    followupFrequency?.answer === "a_la_demande" ||
    followupFrequency?.answer === "jamais"
  ) {
    alerts.push({
      code: "seller_followup_weak",
      chapter: 6,
      label: `Suivi vendeur ${followupFrequency.answer.replace("_", " ")} — vendeur peu tenu au courant`,
      severity: "warning",
      observed: null,
      threshold: null,
    });
  }

  // Ch. 7 — Financement acquéreur non vérifié
  const financingVerified = findAnswer(input.answers, "buyers-financing-verified");
  if (
    financingVerified &&
    financingVerified.answer !== null &&
    ["non", "no", "false", "0"].includes(financingVerified.answer.toLowerCase())
  ) {
    alerts.push({
      code: "buyer_financing_not_verified",
      chapter: 7,
      label:
        "Financement acquéreur non vérifié — visites inutiles + chutes compromis",
      severity: "error",
      observed: null,
      threshold: null,
    });
  }

  // Ch. 8 — visites/vente > seuil
  if (
    ratios.visitesParVente !== null &&
    ratios.visitesParVente > benchmarks.visitsPerActe
  ) {
    alerts.push({
      code: "visits_per_vente_high",
      chapter: 8,
      label: `Visites/vente = ${ratios.visitesParVente} (benchmark < ${benchmarks.visitsPerActe})`,
      severity: "warning",
      observed: ratios.visitesParVente,
      threshold: benchmarks.visitsPerActe,
    });
  }

  // Ch. 8 — Offres → compromis / compromis → acte sous benchmark
  if (
    ratios.offresToCompromisPercent !== null &&
    ratios.offresToCompromisPercent < benchmarks.offresToCompromisPercent
  ) {
    alerts.push({
      code: "offres_to_compromis_below_benchmark",
      chapter: 8,
      label: `Offres → compromis à ${ratios.offresToCompromisPercent} % (benchmark ${benchmarks.offresToCompromisPercent} %)`,
      severity: "warning",
      observed: ratios.offresToCompromisPercent,
      threshold: benchmarks.offresToCompromisPercent,
    });
  }
  if (
    ratios.compromisToActePercent !== null &&
    ratios.compromisToActePercent < benchmarks.compromisToActePercent
  ) {
    alerts.push({
      code: "compromis_to_acte_below_benchmark",
      chapter: 8,
      label: `Compromis → acte à ${ratios.compromisToActePercent} % (benchmark ${benchmarks.compromisToActePercent} %)`,
      severity: "warning",
      observed: ratios.compromisToActePercent,
      threshold: benchmarks.compromisToActePercent,
    });
  }

  // Ch. 9 — Avis / vente sous benchmark
  if (
    ratios.avisParVentePercent !== null &&
    ratios.avisParVentePercent < benchmarks.reviewsPerVentePercent
  ) {
    alerts.push({
      code: "reviews_per_vente_below_benchmark",
      chapter: 9,
      label: `Avis / ventes = ${ratios.avisParVentePercent} % (benchmark ${benchmarks.reviewsPerVentePercent} %) — gisement e-réputation`,
      severity: "warning",
      observed: ratios.avisParVentePercent,
      threshold: benchmarks.reviewsPerVentePercent,
    });
  }

  // Ch. 11 — Aucun indicateur suivi
  const indicators = findAnswer(input.answers, "mgmt-indicators-followed");
  if (indicators?.answer && /aucun/i.test(indicators.answer)) {
    alerts.push({
      code: "no_indicators_followed",
      chapter: 11,
      label: "Aucun indicateur de pilotage suivi — pilotage à l'aveugle",
      severity: "error",
      observed: null,
      threshold: null,
    });
  }

  // Taux de consommation des droits sous levier commercial
  if (consumption.belowLeverThreshold && consumption.percent !== null) {
    alerts.push({
      code: "consumption_rate_below_lever",
      chapter: 2,
      label: `${consumption.label} — levier commercial disponible`,
      severity: "info",
      observed: consumption.percent,
      threshold: benchmarks.consumptionLeverPercent,
    });
  }

  return {
    ratios: { ratios, labels, computedAt },
    alerts: { alerts, computedAt },
  };
}

// --------------------------------------------------------------------------
// Détail interne
// --------------------------------------------------------------------------

function ratio(a: number | null, b: number | null): number | null {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b))
    return null;
  if (b === 0) return null;
  return a / b;
}

function parseAnswerNumber(
  answers: RatiosAnswerInput[],
  questionId: string
): number | null {
  const found = findAnswer(answers, questionId);
  if (!found || found.isSkipped) return null;
  return parseNumericAnswer(found.answer);
}

interface MissingRequiredEntry {
  questionId: string;
  chapter: DiagnosticChapter;
  questionText: string;
  isSkipped: boolean;
}

/**
 * Correction (4) : itère sur `diagnosticQuestions` (source de vérité
 * du référentiel v1.0). Pour chaque question `required: true`, on
 * regarde s'il y a une réponse non-vide et non-skippée dans les
 * answers passées. Sinon → alerte.
 *
 * Note : on n'utilise pas ici le filtrage par profil (chargé côté UI
 * dans `new-diagnostic-flow.tsx`) — un `required` non affiché parce
 * qu'hors profil ne remonte donc pas en alerte de saisie (il ne
 * peut pas manquer).
 * Pour rester correct, on ne signale que les questions requises qui
 * ont une trace dans `answers` (skippée) ou dont on a une trace
 * partielle (answer nulle). Les questions requises jamais présentées
 * (profil hors scope) ne génèrent PAS d'alerte.
 */
function missingRequiredData(
  answers: RatiosAnswerInput[],
  questions: readonly DiagnosticQuestion[]
): MissingRequiredEntry[] {
  const result: MissingRequiredEntry[] = [];
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  for (const q of questions) {
    if (!q.required) continue;
    const present = byId.get(q.id);
    if (!present) continue;
    const skipped = present.isSkipped === true;
    const emptyAnswer =
      present.answer === null || present.answer.trim().length === 0;
    if (skipped || emptyAnswer) {
      result.push({
        questionId: q.id,
        chapter: q.chapter,
        questionText: q.question,
        isSkipped: skipped,
      });
    }
  }
  return result;
}
