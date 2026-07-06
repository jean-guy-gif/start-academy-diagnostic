import "server-only";

import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import {
  computeRatiosAndAlerts,
  type RatiosComputeInput,
} from "./ratios-service";
import { getActiveFundingConfig } from "@/lib/pricing/funding-config-service";

/**
 * v1.0b — Recalcule `ratios_snapshot` / `alerts_snapshot` sur un
 * diagnostic et les persiste.
 *
 * Contraintes (v1.0b lot 1) :
 *   • **Jamais via `service_role`** — on utilise
 *     `createSupabaseRouteHandlerClient` (cookie user SSR), soumis à
 *     la policy UPDATE Phase 2B (`owner = auth.uid() OR is_admin()`).
 *     Un commercial owner passe, admin passe. Un commercial non-owner
 *     est bloqué par RLS → l'UPDATE renvoie 0 ligne.
 *   • **Best-effort** — jamais bloquant. Toute erreur est absorbée
 *     (console.warn sans contenu).
 *   • **Aucun log du contenu snapshot** — pas de `console.log` des
 *     valeurs, pas de `createActivityLog`. La politique de
 *     minimisation d'`activity_logs` (cf. activity-log-prd.md §6)
 *     reste stricte.
 *
 * Le calcul est un module pur (`computeRatiosAndAlerts`). Cette
 * fonction ne fait que l'orchestration : charger le contexte via
 * cookie client → appeler le moteur → écrire les 2 colonnes jsonb.
 */
export async function refreshDiagnosticSnapshots(
  diagnosticId: string
): Promise<void> {
  try {
    const client = await createSupabaseRouteHandlerClient();
    if (!client) return;

    // Charge le contexte minimal nécessaire au moteur ratios/alerts.
    // Sous RLS Phase 2B : un commercial non-owner ne verra rien
    // (SELECT policy `owner OR admin`). Aucun leak cross-commercial.
    const { data: diagRow, error: diagErr } = await client
      .from("diagnostics")
      .select(
        "id, client_id, ventes_n_moins_1, ca_global_n_moins_1, nb_salaries, nb_agents_indep, activite_repartition"
      )
      .eq("id", diagnosticId)
      .maybeSingle();
    if (diagErr || !diagRow) return;

    const [{ data: clientRow }, { data: answerRows }, { data: participantRows }] =
      await Promise.all([
        client
          .from("clients")
          .select("collaborators_count")
          .eq("id", diagRow.client_id)
          .maybeSingle(),
        client
          .from("diagnostic_answers")
          .select("question_id, answer, is_skipped")
          .eq("diagnostic_id", diagnosticId),
        client
          .from("diagnostic_participants")
          .select(
            "professional_status, previous_year_production, eligible_opco, formations_24m_amount"
          )
          .eq("diagnostic_id", diagnosticId),
      ]);

    // Config funding — best-effort (fallback constants si absente).
    const fundingConfig = await getActiveFundingConfig().catch(() => ({
      ageficeThreshold: 7000,
      ageficeAnnualCap: 3000,
      opcoEpAnnualCap: 2500,
      consumptionLeverPercent: 30,
    }));

    const input: RatiosComputeInput = {
      client: {
        collaboratorsCount: clientRow?.collaborators_count ?? null,
      },
      diagnostic: {
        ventesNMoins1: diagRow.ventes_n_moins_1 ?? null,
        caGlobalNMoins1: diagRow.ca_global_n_moins_1 ?? null,
        nbSalaries: diagRow.nb_salaries ?? null,
        nbAgentsIndep: diagRow.nb_agents_indep ?? null,
        activiteRepartition:
          typeof diagRow.activite_repartition === "object" &&
          diagRow.activite_repartition !== null &&
          !Array.isArray(diagRow.activite_repartition)
            ? (diagRow.activite_repartition as Record<string, unknown>)
            : null,
      },
      answers: (answerRows ?? []).map((r) => ({
        questionId: r.question_id,
        answer: r.answer,
        isSkipped: r.is_skipped,
      })),
      participants: (participantRows ?? []).map((p) => ({
        professionalStatus: p.professional_status,
        previousYearProduction: p.previous_year_production,
        eligibleOpco: p.eligible_opco,
        formations24mAmount: p.formations_24m_amount,
      })),
      fundingConfig,
    };

    const { ratios, alerts } = computeRatiosAndAlerts(input);

    // Écriture via le même client cookie (soumis à RLS UPDATE
    // `owner OR admin`). On n'écrit RIEN d'autre — pas de log
    // d'activité, pas de trace du contenu.
    await client
      .from("diagnostics")
      .update({
        ratios_snapshot: ratios as unknown as never,
        alerts_snapshot: alerts as unknown as never,
      })
      .eq("id", diagnosticId);
  } catch {
    // Best-effort strict — pas de log du contenu ni de la stack.
    console.warn("[snapshots] refresh failed");
  }
}
