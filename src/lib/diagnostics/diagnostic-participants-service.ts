import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  estimateParticipantFunding,
  type FundingEligibility,
  type ParticipantProfessionalStatus,
} from "@/lib/pricing/training-funding";

/**
 * Participants prévisionnels d'un diagnostic — saisis par le commercial
 * en début de diagnostic, AVANT la collecte collaborateur (qui passe
 * par `session_participants` via le lien public).
 *
 * Ce module est server-only : il utilise service_role pour ignorer
 * RLS quand on insère pour un diagnostic dont le created_by n'est pas
 * forcément l'utilisateur courant (cas migration / admin).
 */

export interface DiagnosticParticipantInput {
  firstName: string | null;
  // Chantier C1 — CA N-1 (previousYearProduction) réservé aux indés :
  // le CHECK constraint SQL `diagnostic_participants_no_n1_for_salarie`
  // (migration 20260719120000) rejette toute écriture non-null pour
  // un salarié. La route Zod fait le même filet côté API.
  professionalStatus: ParticipantProfessionalStatus | null;
  previousYearProduction: number | null;
  notes: string | null;
  // v1.0 — champs communs (optionnels, saisie partielle autorisée).
  lastName?: string | null;
  entryDate?: string | null;
  // Chantier C1 — heures de formation utilisées cette année civile.
  // Les 2 statuts. Nouveau champ (migration 20260719120000).
  formationsCurrentYearHours?: number | null;
  // v1.0 — champs indé
  expertLevel?: "debutant" | "confirme" | "expert" | null;
  caAnneeEnCours?: number | null;
  wantsEvolution?: boolean | null;
  wantsTraining?: boolean | null;
  priorityNeed?: string | null;
  // Chantier A funding-opco-ep §9.2 — montant AGEFICE déjà consommé par
  // ce collaborateur (indé) depuis janvier de l'année civile en cours.
  // NULL si non renseigné (le code affiche une alerte « estimation à
  // valider » plutôt que de calculer sur 0 silencieusement).
  ageficeAmountConsumedCurrentYear?: number | null;
  // v1.0 — champs salarié
  jobTitle?: string | null;
  contractType?: "temps_plein" | "temps_partiel" | null;
  conventionCollective?: string | null;
  eligibleOpco?: boolean | null;
  // Chantier C1 — montant OPCO EP pris en charge pour ce salarié cette
  // année civile (nouveau champ, migration 20260719120000). Collecté
  // seulement, PAS utilisé dans le calcul (même dette que le champ
  // entreprise du chantier A ; refonte au chantier B).
  opcoEpAmountConsumedCurrentYear?: number | null;
}

export interface DiagnosticParticipantRecord
  extends DiagnosticParticipantInput {
  id: string;
  diagnosticId: string;
  fundingEligibility: FundingEligibility;
  estimatedFundingAmount: number | null;
  estimatedRemainingCost: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  diagnostic_id: string;
  first_name: string | null;
  professional_status: ParticipantProfessionalStatus | null;
  previous_year_production: number | null;
  funding_eligibility: FundingEligibility;
  estimated_funding_amount: number | null;
  estimated_remaining_cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // v1.0 — colonnes ajoutées par la migration 20260702100000
  last_name: string | null;
  entry_date: string | null;
  // Chantier C1 — nouveaux champs migration 20260719120000.
  formations_current_year_hours: number | null;
  opco_ep_amount_consumed_current_year: number | null;
  expert_level: "debutant" | "confirme" | "expert" | null;
  ca_annee_en_cours: number | null;
  wants_evolution: boolean | null;
  wants_training: boolean | null;
  priority_need: string | null;
  agefice_amount_consumed_current_year: number | null;
  job_title: string | null;
  contract_type: "temps_plein" | "temps_partiel" | null;
  convention_collective: string | null;
  eligible_opco: boolean | null;
  // NB — les 3 colonnes `formations_24m_*` restent en base (dead
  // data, drop en PR de cleanup séparée) et sont volontairement
  // OMISES du SELECT ci-dessous : le code C1 ne les lit plus.
}

function rowToRecord(row: Row): DiagnosticParticipantRecord {
  return {
    id: row.id,
    diagnosticId: row.diagnostic_id,
    firstName: row.first_name,
    professionalStatus: row.professional_status,
    previousYearProduction: row.previous_year_production,
    fundingEligibility: row.funding_eligibility,
    estimatedFundingAmount: row.estimated_funding_amount,
    estimatedRemainingCost: row.estimated_remaining_cost,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastName: row.last_name,
    entryDate: row.entry_date,
    formationsCurrentYearHours: row.formations_current_year_hours,
    expertLevel: row.expert_level,
    caAnneeEnCours: row.ca_annee_en_cours,
    ageficeAmountConsumedCurrentYear:
      row.agefice_amount_consumed_current_year,
    wantsEvolution: row.wants_evolution,
    wantsTraining: row.wants_training,
    priorityNeed: row.priority_need,
    jobTitle: row.job_title,
    contractType: row.contract_type,
    conventionCollective: row.convention_collective,
    eligibleOpco: row.eligible_opco,
    opcoEpAmountConsumedCurrentYear:
      row.opco_ep_amount_consumed_current_year,
  };
}

/**
 * Remplace l'ensemble des participants prévisionnels d'un diagnostic
 * par la liste fournie. Approche simple : DELETE puis INSERT — sans
 * impact côté users car cette table n'est pas exposée publiquement et
 * un diagnostic n'a qu'un seul commercial éditeur en MVP.
 *
 * Pour chaque participant on calcule l'estimation de prise en charge
 * via la règle MVP (cf. `training-funding.ts`) et on persiste
 * `funding_eligibility` / `estimated_funding_amount` /
 * `estimated_remaining_cost`. Le coût par participant est calculé en
 * fonction de la durée totale connue à ce moment-là — null si la
 * recommandation n'a pas encore été générée.
 */
export async function replaceDiagnosticParticipants(params: {
  diagnosticId: string;
  participants: DiagnosticParticipantInput[];
  costPerParticipant: number | null;
}): Promise<DiagnosticParticipantRecord[]> {
  const { diagnosticId, participants, costPerParticipant } = params;
  const client = createSupabaseAdminClient();
  if (!client) return [];

  await client
    .from("diagnostic_participants")
    .delete()
    .eq("diagnostic_id", diagnosticId);

  if (participants.length === 0) return [];

  const rows = participants.map((p) => {
    const est = estimateParticipantFunding({
      professionalStatus: p.professionalStatus,
      previousYearProduction: p.previousYearProduction,
      costPerParticipant,
    });
    return {
      diagnostic_id: diagnosticId,
      first_name: p.firstName,
      professional_status: p.professionalStatus,
      previous_year_production: p.previousYearProduction,
      funding_eligibility: est.eligibility,
      estimated_funding_amount: est.estimatedFundingAmount,
      estimated_remaining_cost: est.estimatedRemainingCost,
      notes: p.notes,
      last_name: p.lastName ?? null,
      entry_date: p.entryDate ?? null,
      // Chantier C1 — 3 colonnes `formations_24m_*` volontairement
      // OMISES du payload d'INSERT. Le mécanisme DELETE + INSERT du
      // service écrasait déjà avec null tout champ non fourni ; l'arrêt
      // d'écriture C1 rend ce comportement explicite. Les colonnes
      // restent en base jusqu'à la PR de cleanup.
      formations_current_year_hours: p.formationsCurrentYearHours ?? null,
      expert_level: p.expertLevel ?? null,
      ca_annee_en_cours: p.caAnneeEnCours ?? null,
      agefice_amount_consumed_current_year:
        p.ageficeAmountConsumedCurrentYear ?? null,
      wants_evolution: p.wantsEvolution ?? null,
      wants_training: p.wantsTraining ?? null,
      priority_need: p.priorityNeed ?? null,
      job_title: p.jobTitle ?? null,
      contract_type: p.contractType ?? null,
      convention_collective: p.conventionCollective ?? null,
      eligible_opco: p.eligibleOpco ?? null,
      opco_ep_amount_consumed_current_year:
        p.opcoEpAmountConsumedCurrentYear ?? null,
    };
  });

  const { data, error } = await client
    .from("diagnostic_participants")
    .insert(rows)
    .select(
      "id, diagnostic_id, first_name, professional_status, previous_year_production, funding_eligibility, estimated_funding_amount, estimated_remaining_cost, notes, created_at, updated_at, last_name, entry_date, formations_current_year_hours, expert_level, ca_annee_en_cours, agefice_amount_consumed_current_year, wants_evolution, wants_training, priority_need, job_title, contract_type, convention_collective, eligible_opco, opco_ep_amount_consumed_current_year"
    );
  if (error || !data) return [];
  return data.map(rowToRecord);
}

export async function listDiagnosticParticipants(
  diagnosticId: string
): Promise<DiagnosticParticipantRecord[]> {
  const client = createSupabaseAdminClient();
  if (!client) return [];
  const { data, error } = await client
    .from("diagnostic_participants")
    .select(
      "id, diagnostic_id, first_name, professional_status, previous_year_production, funding_eligibility, estimated_funding_amount, estimated_remaining_cost, notes, created_at, updated_at, last_name, entry_date, formations_current_year_hours, expert_level, ca_annee_en_cours, agefice_amount_consumed_current_year, wants_evolution, wants_training, priority_need, job_title, contract_type, convention_collective, eligible_opco, opco_ep_amount_consumed_current_year"
    )
    .eq("diagnostic_id", diagnosticId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(rowToRecord);
}
