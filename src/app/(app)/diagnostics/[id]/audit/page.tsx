import { notFound, redirect } from "next/navigation";

import { buildAuditContent } from "@/lib/audit/build-audit-content";
import { assertCanAccessDiagnostic } from "@/lib/auth/assert-diagnostic-access";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { computeRatiosAndAlerts } from "@/lib/diagnostics/ratios-service";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

import { AuditView } from "./audit-view";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Page audit imprimable — Server Component, aucun appel réseau côté
 * client, aucun accès direct Supabase depuis le browser. Toute la
 * donnée est chargée ici puis passée statiquement au composant de
 * rendu.
 *
 * Auth : le layout `(app)/` gère déjà l'exigence de rôle interne
 * (requireRole). Cette page ajoute la garde ownership diagnostic
 * (`assertCanAccessDiagnostic`, RPC `can_user_access_diagnostic`) —
 * un commercial ne peut pas générer l'audit d'un diagnostic tiers.
 */
export default async function AuditPage({ params }: Props) {
  const { id: diagnosticId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const access = await assertCanAccessDiagnostic(profile, diagnosticId);
  if (!access.ok) redirect("/forbidden");

  // Bypass RLS via service_role — autorisé UNIQUEMENT parce que
  // l'identité du user et son droit d'accès à ce diagnostic viennent
  // d'être vérifiés par `assertCanAccessDiagnostic` juste au-dessus
  // (RPC `can_user_access_diagnostic`, ownership + admin bypass).
  // Ordre non permutable — cf. docs/rls-hardening-plan.md §4.1
  // (« Service role abuse » : jamais de bypass avant validation).
  const supabase = createSupabaseAdminClient();
  if (!supabase) notFound();

  // Diagnostic + client — champs minimaux nécessaires (nom agence pour
  // la page de garde, ventes/CA pour ratios agence, activité pour
  // détection ancien).
  const { data: diagRow } = await supabase
    .from("diagnostics")
    .select(
      "id, client_id, ventes_n_moins_1, ca_global_n_moins_1, nb_salaries, nb_agents_indep, activite_repartition"
    )
    .eq("id", diagnosticId)
    .maybeSingle();
  if (!diagRow) notFound();

  const { data: clientRow } = await supabase
    .from("clients")
    .select("id, company_name, collaborators_count")
    .eq("id", diagRow.client_id)
    .maybeSingle();

  const { data: answerRows } = await supabase
    .from("diagnostic_answers")
    .select(
      "id, diagnostic_id, question_id, question_text, category, answer, note, is_weak_signal, is_skipped, created_at"
    )
    .eq("diagnostic_id", diagnosticId);

  const { data: participantRows } = await supabase
    .from("diagnostic_participants")
    .select(
      "professional_status, previous_year_production, eligible_opco, formations_24m_amount"
    )
    .eq("diagnostic_id", diagnosticId);

  const answers = (answerRows ?? []).map((r) => ({
    id: r.id,
    diagnosticId: r.diagnostic_id,
    questionId: r.question_id,
    questionText: r.question_text ?? "",
    category: r.category as ReturnType<typeof String> as never,
    answer: r.answer,
    note: r.note,
    isWeakSignal: Boolean(r.is_weak_signal),
    isSkipped: Boolean(r.is_skipped),
    createdAt: r.created_at,
  }));

  // Alertes : réutilisées telles quelles depuis `computeRatiosAndAlerts`
  // (source unique, cf. commentaire dans `build-audit-content.ts`).
  const ratiosOutput = computeRatiosAndAlerts({
    client: { collaboratorsCount: clientRow?.collaborators_count ?? null },
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
    answers: answers.map((a) => ({
      questionId: a.questionId,
      answer: a.answer,
      isSkipped: a.isSkipped,
    })),
    participants: (participantRows ?? []).map((p) => ({
      professionalStatus:
        (p.professional_status as
          | "salarie"
          | "agent_commercial_independant"
          | "autre"
          | null) ?? null,
      eligibleOpco: p.eligible_opco ?? null,
      previousYearProduction: p.previous_year_production ?? null,
      formations24mAmount: p.formations_24m_amount ?? null,
    })),
  });

  const audit = buildAuditContent({
    answers,
    alerts: ratiosOutput.alerts.alerts,
  });

  return (
    <AuditView
      diagnosticId={diagnosticId}
      agencyName={clientRow?.company_name ?? null}
      commercialName={profile.full_name}
      commercialEmail={profile.email}
      audit={audit}
      generatedOn={new Date()}
    />
  );
}
