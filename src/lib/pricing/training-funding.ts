/**
 * Estimation de prise en charge potentielle — règle MVP.
 *
 * RAPPEL JURIDIQUE :
 *   Aucune estimation produite par ce module n'est une garantie de
 *   prise en charge. Les organismes financeurs (FAFCEA, AGEFICE,
 *   OPCO selon le statut) ont leurs propres critères, dossiers et
 *   plafonds. Toute valeur calculée doit être affichée avec le
 *   libellé `FUNDING_DISCLAIMER` ci-dessous.
 *
 * Module pur (pas de Supabase, pas de secret) — importable côté
 * client comme serveur.
 */

import {
  computeAgeficePresentielFunding,
  type AgeficePresentielFundingResult,
} from "./agefice-presentiel-funding";
import { formatPriceEuros } from "./training-pricing";

// Règle MVP : seuil de production N-1 au-delà duquel un agent
// commercial indépendant est considéré comme « potentiellement
// éligible » à une prise en charge (à confirmer dossier par dossier).
//
// Depuis v1.0 du référentiel diagnostic, ces valeurs sont
// paramétrables via `funding_config` en base et lues côté serveur par
// `getActiveFundingConfig()` (cf. `funding-config-service.ts`). Les
// constantes ci-dessous restent la source de vérité fallback pour :
//   • Le rendu client (browser) où l'admin client n'est pas dispo.
//   • Les appels qui n'ont pas encore été refactorisés pour passer
//     `config`.
// Toute nouvelle valeur en base doit rester rétro-compatible avec
// ces défauts pour ne pas invalider les propositions existantes.
export const FUNDING_REVENUE_THRESHOLD = 7000;
export const MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT = 3000;
export const OPCO_EP_ANNUAL_CAP_DEFAULT = 2500;
export const CONSUMPTION_LEVER_PERCENT_DEFAULT = 30;

/**
 * Config runtime — quand fournie, override les constantes ci-dessus.
 * Aucun champ n'est requis : chaque champ manquant retombe sur son
 * défaut MVP. Rétro-compat parfaite : un appelant qui ne passe pas
 * `config` obtient le comportement historique inchangé.
 */
export interface RuntimeFundingConfig {
  ageficeThreshold?: number;
  ageficeAnnualCap?: number;
  opcoEpAnnualCap?: number;
  consumptionLeverPercent?: number;
  pricePerHourPerParticipant?: number;
  followupHoursMultiplier?: number;
  ageficeHourlyCapPresentiel2026?: number;
}

function resolveConfig(config?: RuntimeFundingConfig): {
  ageficeThreshold: number;
  ageficeAnnualCap: number;
  opcoEpAnnualCap: number;
  consumptionLeverPercent: number;
} {
  return {
    ageficeThreshold: config?.ageficeThreshold ?? FUNDING_REVENUE_THRESHOLD,
    ageficeAnnualCap:
      config?.ageficeAnnualCap ?? MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT,
    opcoEpAnnualCap: config?.opcoEpAnnualCap ?? OPCO_EP_ANNUAL_CAP_DEFAULT,
    consumptionLeverPercent:
      config?.consumptionLeverPercent ?? CONSUMPTION_LEVER_PERCENT_DEFAULT,
  };
}

export const FUNDING_DISCLAIMER =
  "Estimation de prise en charge potentielle, à confirmer selon l'organisme financeur et le dossier administratif.";

export type FundingEligibility =
  | "potentially_eligible"
  | "not_eligible"
  | "unknown";

export type ParticipantProfessionalStatus =
  | "salarie"
  | "agent_commercial_independant"
  | "autre";

export interface ParticipantFundingEstimate {
  eligibility: FundingEligibility;
  estimatedFundingAmount: number;
  estimatedRemainingCost: number;
  note: string | null;
  /**
   * Rempli uniquement pour un indé AGEFICE quand `trainingHours` est
   * fourni. Utilisé par `estimateTrainingFunding` pour agréger la
   * décision d'affichage `ageficePresentielCoverage`.
   */
  ageficePresentielResult?: AgeficePresentielFundingResult;
}

export interface EstimateParticipantFundingParams {
  professionalStatus: ParticipantProfessionalStatus | null;
  previousYearProduction: number | null;
  costPerParticipant: number | null;
  /** v1.0 : salarié éligible OPCO ? Défaut : inconnu → route salarié classique. */
  eligibleOpco?: boolean | null;
  /**
   * Chantier A funding-opco-ep §9.2 — montant AGEFICE déjà consommé par
   * ce collaborateur (indé) cette année civile. Retranché du plafond
   * `ageficeAnnualCap` AVANT plafonnement du coût par participant. NULL
   * = non renseigné → warning « estimation à valider » remonté par le
   * summary, JAMAIS de calcul sur 0 silencieux.
   *
   * Note : ce retranchement est mathématiquement correct en A car le
   * plafond AGEFICE est PAR indé (3 000 €/an/pers.) et le champ est
   * PAR indé. Contrairement à OPCO EP (enveloppe entreprise
   * partagée — cf. branche salarié plus bas), il n'y a pas de
   * duplication du retranchement à corriger en B.
   */
  ageficeAmountConsumedCurrentYear?: number | null;
  /**
   * Volume horaire de la formation (totalDurationHours de la reco).
   * Opt-in :
   *   • Absent → comportement historique inchangé (branche indé AGEFICE
   *     éligible utilise `cap = min(costPerParticipant, envelope)`).
   *   • Fourni → la branche indé AGEFICE éligible délègue à
   *     `computeAgeficePresentielFunding` (plafond horaire).
   * La branche salarié OPCO EP n'est jamais affectée.
   */
  trainingHours?: number | null;
  /** v1.0 : override du référentiel `funding_config` en base. */
  config?: RuntimeFundingConfig;
}

/**
 * Estimation pour UN participant. Renvoie `eligibility = "unknown"` +
 * 0 € quand on ne peut pas conclure (statut manquant, durée
 * inconnue…). Ne dépasse JAMAIS le coût réel par participant —
 * pas de reste à charge négatif.
 *
 * v1.0 : accepte un `config` opt-in (override du référentiel
 * `funding_config`) et `eligibleOpco` (statut OPCO EP pour salarié).
 * Sans config, les valeurs par défaut MVP sont utilisées → rétro-compat
 * parfaite avec les appelants antérieurs.
 */
export function estimateParticipantFunding(
  params: EstimateParticipantFundingParams
): ParticipantFundingEstimate {
  const {
    professionalStatus,
    previousYearProduction,
    costPerParticipant,
    eligibleOpco,
    ageficeAmountConsumedCurrentYear,
    trainingHours,
    config,
  } = params;
  const {
    ageficeThreshold,
    ageficeAnnualCap,
    opcoEpAnnualCap,
  } = resolveConfig(config);

  // Chantier A funding-opco-ep §5.2 — retranchement AGEFICE AVANT
  // plafonnement (plafond PAR indé, champ PAR indé — pas de dérive).
  // NULL = « inconnu, à valider » — le summary remonte un warning
  // (cf. `estimateTrainingFunding`), jamais 0 silencieux.
  const ageficeEnvelopeAvailable = Math.max(
    0,
    ageficeAnnualCap - (ageficeAmountConsumedCurrentYear ?? 0)
  );

  // Sans coût par participant on ne peut rien borner : on retourne 0.
  if (costPerParticipant === null || costPerParticipant <= 0) {
    return {
      eligibility: "unknown",
      estimatedFundingAmount: 0,
      estimatedRemainingCost: 0,
      note: null,
    };
  }

  if (professionalStatus === "agent_commercial_independant") {
    if (
      typeof previousYearProduction === "number" &&
      previousYearProduction > ageficeThreshold
    ) {
      // trainingHours fourni → délégation au module horaire.
      // envelopeRemaining=null si ageficeAmountConsumedCurrentYear=null
      // (« droits à vérifier »), sinon plafond annuel − consommé.
      if (typeof trainingHours === "number" && trainingHours > 0) {
        const envelopeRemaining =
          ageficeAmountConsumedCurrentYear === null ||
          ageficeAmountConsumedCurrentYear === undefined
            ? null
            : Math.max(
                0,
                ageficeAnnualCap - ageficeAmountConsumedCurrentYear
              );
        const ageficePresentielResult = computeAgeficePresentielFunding({
          trainingHours,
          envelopeRemaining,
          hourlyCap: config?.ageficeHourlyCapPresentiel2026,
          followupHoursMultiplier: config?.followupHoursMultiplier,
          pricePerHour: config?.pricePerHourPerParticipant,
        });
        const estimatedFundingAmount = roundEuro(
          ageficePresentielResult.priseEnCharge
        );
        const estimatedRemainingCost = roundEuro(
          Math.max(costPerParticipant - estimatedFundingAmount, 0)
        );
        return {
          eligibility: "potentially_eligible",
          estimatedFundingAmount,
          estimatedRemainingCost,
          note: FUNDING_DISCLAIMER,
          ageficePresentielResult,
        };
      }
      // Fallback historique (trainingHours absent) — cap = min(cost, envelope).
      const cap = Math.min(costPerParticipant, ageficeEnvelopeAvailable);
      const estimatedFundingAmount = roundEuro(cap);
      const estimatedRemainingCost = roundEuro(
        Math.max(costPerParticipant - estimatedFundingAmount, 0)
      );
      return {
        eligibility: "potentially_eligible",
        estimatedFundingAmount,
        estimatedRemainingCost,
        note: FUNDING_DISCLAIMER,
      };
    }
    return {
      eligibility: "unknown",
      estimatedFundingAmount: 0,
      estimatedRemainingCost: roundEuro(costPerParticipant),
      note:
        previousYearProduction === null
          ? `Production N-1 à compléter pour estimer l'éligibilité (seuil indicatif : ${formatPriceEuros(
              ageficeThreshold
            )} / an).`
          : `Production N-1 inférieure au seuil indicatif (${formatPriceEuros(
              ageficeThreshold
            )}) — éligibilité à confirmer dossier par dossier.`,
    };
  }

  if (professionalStatus === "salarie") {
    if (eligibleOpco === true) {
      // OPCO EP: cap par-participant = comportement HEAD, INCORRECT vs
      // PRD §3 (enveloppe entreprise globale). Refonte au chantier B.
      // Le champ opcoEpAmountConsumedCurrentYear est collecté mais PAS
      // utilisé ici — B fera le vrai calcul.
      //
      // Détail du bug préexistant : `opcoEpAnnualCap` est un plafond
      // par-personne (2 500 €), alors que le PRD dit que l'OPCO EP est
      // une enveloppe entreprise partagée (2 500 € total, barème par
      // effectif < 11 / 11-50 / > 50). Résultat actuel : le funding
      // OPCO EP est multiplié par le nombre de salariés éligibles
      // (surestimation historique). Le chantier A a délibérément choisi
      // de NE PAS retrancher `opcoEpAmountConsumedCurrentYear` ici pour
      // ne pas figer un chiffre différent et faux (retranchement
      // dupliqué N fois par N salariés). Le chantier B devra à la fois :
      //   1. remplacer ce cap par-personne par un calcul enveloppe
      //      entreprise (barème par effectif),
      //   2. retrancher `opcoEpAmountConsumedCurrentYear` UNE SEULE fois
      //      de cette enveloppe globale.
      const cap = Math.min(costPerParticipant, opcoEpAnnualCap);
      const estimatedFundingAmount = roundEuro(cap);
      const estimatedRemainingCost = roundEuro(
        Math.max(costPerParticipant - estimatedFundingAmount, 0)
      );
      return {
        eligibility: "potentially_eligible",
        estimatedFundingAmount,
        estimatedRemainingCost,
        note: FUNDING_DISCLAIMER,
      };
    }
    return {
      eligibility: "unknown",
      estimatedFundingAmount: 0,
      estimatedRemainingCost: roundEuro(costPerParticipant),
      note:
        eligibleOpco === false
          ? "Salarié non éligible OPCO EP — reste à charge entreprise."
          : "Financement salarié à étudier via OPCO EP selon fonction / convention (à confirmer).",
    };
  }

  // statut "autre" ou null
  return {
    eligibility: "unknown",
    estimatedFundingAmount: 0,
    estimatedRemainingCost: roundEuro(costPerParticipant),
    note:
      professionalStatus === null
        ? "Statut professionnel à renseigner pour estimer la prise en charge."
        : null,
  };
}

export interface TrainingFundingSummary {
  totalBudget: number | null;
  estimatedFundingTotal: number;
  estimatedRemainingCost: number | null;
  eligibleParticipantCount: number;
  totalParticipantCount: number;
  disclaimer: string;
  /**
   * Chantier A funding-opco-ep §9.3 — warnings « estimation à valider »
   * quand un champ de consommation entamée est NULL. Le calcul est
   * effectué (avec 0 en retranchement) mais l'appelant DOIT afficher
   * ces warnings au dirigeant / commercial pour prévenir que
   * l'enveloppe pourrait être plus faible en réalité.
   */
  fundingWarnings: string[];
  /**
   * Décision agrégée d'affichage pour la branche indé AGEFICE
   * présentiel (chantier 2026-07-20) :
   *   • 'badge' — au moins un indé, TOUS les indés éligibles sont
   *     isFullyCovered avec enveloppe connue ET CA N-1 renseigné.
   *   • 'alert' — au moins un indé en 'alert' (CA N-1 manquant OU
   *     enveloppe inconnue). Prioritaire sur 'badge'.
   *   • 'none' — au moins un indé mais aucune décision définitive.
   *   • null — `trainingHours` non fourni (chemin fallback). Le test
   *     de contrat (i) échoue si ce cas se produit en prod.
   */
  ageficePresentielCoverage: "badge" | "alert" | "none" | null;
}

export interface ParticipantFundingInput {
  professionalStatus: ParticipantProfessionalStatus | null;
  previousYearProduction: number | null;
  /** v1.0 : salarié éligible OPCO ? Optionnel, rétro-compat. */
  eligibleOpco?: boolean | null;
  /**
   * Chantier A funding-opco-ep §9.2 — montant AGEFICE déjà consommé
   * par cet indé cette année civile. NULL = non renseigné → warning.
   */
  ageficeAmountConsumedCurrentYear?: number | null;
}

/**
 * Estimation pour l'ensemble des participants d'une session /
 * diagnostic. Cumule les estimations individuelles, clampe le reste
 * à charge à 0 mini, renvoie le compte d'éligibles.
 *
 * v1.0 : `config` opt-in — sans config, comportement historique
 * inchangé (défauts constants).
 */
export function estimateTrainingFunding(params: {
  participants: ParticipantFundingInput[];
  costPerParticipant: number | null;
  totalBudget: number | null;
  config?: RuntimeFundingConfig;
  /**
   * Chantier A funding-opco-ep §9.1 — montant OPCO EP déjà consommé
   * PAR L'ENTREPRISE cette année civile. Retranché de l'enveloppe
   * OPCO EP dans chaque estimation salariée. NULL = non renseigné →
   * warning « estimation à valider ».
   */
  opcoEpAmountConsumedCurrentYear?: number | null;
  /**
   * Chantier 2026-07-20 — volume horaire de la formation (globale à
   * la reco). Propagé à chaque appel `estimateParticipantFunding` pour
   * activer la branche indé AGEFICE présentiel horaire. Absent →
   * chemin fallback (ageficePresentielCoverage = null).
   */
  trainingHours?: number | null;
}): TrainingFundingSummary {
  const {
    participants,
    costPerParticipant,
    totalBudget,
    config,
    opcoEpAmountConsumedCurrentYear,
    trainingHours,
  } = params;
  let estimatedFundingTotal = 0;
  let eligibleCount = 0;
  const fundingWarnings: string[] = [];
  let indepsMissingAgeficeConsumption = 0;
  let hasSalarieOpcoEpTouched = false;

  const ageficeThreshold =
    config?.ageficeThreshold ?? FUNDING_REVENUE_THRESHOLD;
  // Décisions par indé pour agrégation `ageficePresentielCoverage`.
  const ageficePresentielKinds: Array<"badge" | "alert" | "none"> = [];
  const trainingHoursProvided =
    typeof trainingHours === "number" && trainingHours > 0;

  for (const p of participants) {
    // Trace des indés éligibles qui n'ont pas renseigné leur AGEFICE
    // consommé cette année — pour warning consolidé côté summary.
    if (
      p.professionalStatus === "agent_commercial_independant" &&
      (p.ageficeAmountConsumedCurrentYear === null ||
        p.ageficeAmountConsumedCurrentYear === undefined)
    ) {
      indepsMissingAgeficeConsumption += 1;
    }
    if (p.professionalStatus === "salarie" && p.eligibleOpco === true) {
      hasSalarieOpcoEpTouched = true;
    }

    // Chantier A : `opcoEpAmountConsumedCurrentYear` est volontairement
    // NON transmis à `estimateParticipantFunding` — il n'est utilisé
    // que pour émettre le warning ci-dessous. Le calcul OPCO EP sera
    // refondu au chantier B (cf. commentaire branche salarié).
    const est = estimateParticipantFunding({
      professionalStatus: p.professionalStatus,
      previousYearProduction: p.previousYearProduction,
      eligibleOpco: p.eligibleOpco ?? null,
      ageficeAmountConsumedCurrentYear:
        p.ageficeAmountConsumedCurrentYear ?? null,
      costPerParticipant,
      trainingHours: trainingHoursProvided ? trainingHours : undefined,
      config,
    });
    estimatedFundingTotal += est.estimatedFundingAmount;
    if (est.eligibility === "potentially_eligible") eligibleCount += 1;

    // Décision d'affichage par indé, si trainingHours propagé.
    // CA N-1 manquant → 'alert'.
    // CA N-1 sous seuil → non éligible, aucun indicateur.
    // CA N-1 > seuil : dérive du résultat calculé (envelope inconnue
    // → 'alert' ; couverture 100 % → 'badge' ; reste > 0 → 'none').
    if (
      trainingHoursProvided &&
      p.professionalStatus === "agent_commercial_independant"
    ) {
      if (p.previousYearProduction === null) {
        ageficePresentielKinds.push("alert");
      } else if (p.previousYearProduction > ageficeThreshold) {
        const r = est.ageficePresentielResult;
        if (!r || r.alert !== null || r.envelopeRemaining === null) {
          ageficePresentielKinds.push("alert");
        } else if (r.isFullyCovered && r.resteACharge === 0) {
          ageficePresentielKinds.push("badge");
        } else {
          ageficePresentielKinds.push("none");
        }
      }
      // CA sous seuil → non éligible AGEFICE, pas d'entrée.
    }
  }

  // Agrégation : alerte prioritaire sur badge.
  let ageficePresentielCoverage: TrainingFundingSummary["ageficePresentielCoverage"];
  if (!trainingHoursProvided) {
    ageficePresentielCoverage = null;
  } else if (ageficePresentielKinds.length === 0) {
    ageficePresentielCoverage = "none";
  } else if (ageficePresentielKinds.includes("alert")) {
    ageficePresentielCoverage = "alert";
  } else if (ageficePresentielKinds.every((k) => k === "badge")) {
    ageficePresentielCoverage = "badge";
  } else {
    ageficePresentielCoverage = "none";
  }

  if (indepsMissingAgeficeConsumption > 0) {
    fundingWarnings.push(
      `Consommation AGEFICE non renseignée pour ${indepsMissingAgeficeConsumption} collaborateur${
        indepsMissingAgeficeConsumption > 1 ? "s" : ""
      } indépendant${
        indepsMissingAgeficeConsumption > 1 ? "s" : ""
      } — enveloppe individuelle affichée = maximum théorique, à vérifier avant engagement.`
    );
  }
  if (
    hasSalarieOpcoEpTouched &&
    (opcoEpAmountConsumedCurrentYear === null ||
      opcoEpAmountConsumedCurrentYear === undefined)
  ) {
    fundingWarnings.push(
      "Consommation OPCO EP de l'entreprise non renseignée — enveloppe affichée = maximum théorique, à vérifier avant engagement."
    );
  }

  estimatedFundingTotal = roundEuro(estimatedFundingTotal);
  const estimatedRemainingCost =
    totalBudget === null
      ? null
      : roundEuro(Math.max(totalBudget - estimatedFundingTotal, 0));

  return {
    totalBudget,
    estimatedFundingTotal,
    estimatedRemainingCost,
    eligibleParticipantCount: eligibleCount,
    totalParticipantCount: participants.length,
    disclaimer: FUNDING_DISCLAIMER,
    fundingWarnings,
    ageficePresentielCoverage,
  };
}

// ---------------------------------------------------------------------------
// v1.0 — Taux de consommation des droits sur 24 mois
// ---------------------------------------------------------------------------

/**
 * Correction (6) validée : le taux est TOUJOURS présenté comme une
 * ESTIMATION dans l'UI et dans le prompt IA. On renvoie le préfixe
 * « environ » dans `label` pour matérialiser cet engagement — les
 * appelants doivent utiliser ce label tel quel.
 */
export interface ConsumptionRateEstimate {
  /** Consommation 24 mois observée (indé + salarié agrégés). */
  observedAmount: number;
  /**
   * Budget mobilisable théorique sur 24 mois (agrégat AGEFICE +
   * OPCO), calculé à partir du référentiel `funding_config` et des
   * plafonds annuels.
   */
  mobilizableAmount: number;
  /** Pourcentage 0..∞ (peut dépasser 100 si sur-consommation observée). */
  percent: number | null;
  /**
   * `true` si le pourcentage est SOUS le seuil de levier commercial
   * (`consumptionLeverPercent` du référentiel). Utilisé pour
   * déclencher l'accroche « vos droits sont sous-utilisés ».
   */
  belowLeverThreshold: boolean;
  /**
   * Libellé prêt à afficher — préfixé « environ » systématiquement
   * (correction 6). L'UI et le prompt IA doivent utiliser ce
   * `label` sans le retraiter.
   */
  label: string;
}

export interface ConsumptionRateInput {
  /**
   * Historique 24 mois par participant (montant consommé, en €).
   * Null / undefined = donnée manquante — ignorée du numérateur, mais
   * signale une possible sous-estimation.
   */
  consumed24m: Array<number | null>;
  /**
   * Pour chaque participant : compte-t-il comme "mobilisable" côté
   * AGEFICE (indé éligible) ou OPCO (salarié éligible) ? Passé en
   * booléens agrégés pour ne pas dupliquer la logique d'éligibilité
   * ici — c'est l'appelant qui construit ces flags depuis les fiches
   * participants.
   */
  ageficeEligibleCount: number;
  opcoEligibleCount: number;
  config?: RuntimeFundingConfig;
}

export function computeConsumptionRate(
  input: ConsumptionRateInput
): ConsumptionRateEstimate {
  const {
    ageficeAnnualCap,
    opcoEpAnnualCap,
    consumptionLeverPercent,
  } = resolveConfig(input.config);

  const observedAmount = roundEuro(
    input.consumed24m.reduce<number>(
      (sum, v) => sum + (typeof v === "number" && Number.isFinite(v) ? v : 0),
      0
    )
  );

  // Budget mobilisable sur 24 mois = plafond annuel × 2 × nb éligibles
  // (agrégé). Approximation MVP : on ne module pas par convention /
  // fonction — le référentiel `funding_config` centralise la valeur.
  const mobilizableAmount = roundEuro(
    ageficeAnnualCap * 2 * input.ageficeEligibleCount +
      opcoEpAnnualCap * 2 * input.opcoEligibleCount
  );

  let percent: number | null = null;
  if (mobilizableAmount > 0) {
    percent = Math.round((observedAmount / mobilizableAmount) * 1000) / 10;
  }

  const belowLeverThreshold =
    percent !== null && percent < consumptionLeverPercent;

  const label =
    percent === null
      ? "Taux de consommation non estimable (budget mobilisable inconnu)"
      : `Environ ${percent.toFixed(1)} % des droits mobilisables consommés sur 24 mois (estimation)`;

  return {
    observedAmount,
    mobilizableAmount,
    percent,
    belowLeverThreshold,
    label,
  };
}

// ---------------------------------------------------------------------------
// v1.0 — Estimation budget OPCO EP côté agrégat entreprise
// ---------------------------------------------------------------------------

export interface OpcoBudgetEstimate {
  /** Nombre de salariés éligibles OPCO EP considérés. */
  eligibleSalariesCount: number;
  /** Plafond annuel appliqué (€, cf. `funding_config`). */
  annualCapPerSalarie: number;
  /**
   * Budget annuel estimé mobilisable côté OPCO EP entreprise. C'est
   * un plafond THÉORIQUE — cf. `FUNDING_DISCLAIMER` : la validation
   * réelle passe par le dossier OPCO.
   */
  estimatedAnnualBudget: number;
  disclaimer: string;
}

/**
 * Agrège le budget OPCO EP mobilisable sur l'année en cours. Sert au
 * cockpit interne et au bloc « Potentiel de financement » — le
 * calcul reste voluntairement simple (pas de modulation temps
 * plein / partiel côté MVP).
 */
export function estimateOpcoBudget(
  eligibleSalariesCount: number,
  config?: RuntimeFundingConfig
): OpcoBudgetEstimate {
  const { opcoEpAnnualCap } = resolveConfig(config);
  const safeCount = Math.max(0, Math.trunc(eligibleSalariesCount));
  const estimatedAnnualBudget = roundEuro(safeCount * opcoEpAnnualCap);
  return {
    eligibleSalariesCount: safeCount,
    annualCapPerSalarie: opcoEpAnnualCap,
    estimatedAnnualBudget,
    disclaimer: FUNDING_DISCLAIMER,
  };
}

const ELIGIBILITY_LABELS: Record<FundingEligibility, string> = {
  potentially_eligible: "Potentiellement éligible (à confirmer)",
  not_eligible: "Non éligible",
  unknown: "À étudier",
};

export function formatFundingStatus(status: FundingEligibility): string {
  return ELIGIBILITY_LABELS[status];
}

function roundEuro(value: number): number {
  return Math.round(value * 100) / 100;
}
