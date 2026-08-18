import { notFound, redirect } from "next/navigation";

import { assertCanAccessDiagnostic } from "@/lib/auth/assert-diagnostic-access";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { diagnosticQuestions } from "@/lib/data/diagnostic-questions";
import {
  decideResumeEntryPoint,
  type ResumeAnswerRecord,
} from "@/lib/diagnostics/decide-resume-entry-point";

import { ResumeView } from "./resume-view";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Page de reprise diagnostic — Server Component, aucun appel réseau
 * client. Répare les 3 liens 404 historiques dont le CTA « Reprendre
 * le diagnostic » de la page audit.
 *
 * Auth : même pattern que les pages sœurs (audit / proposal /
 * recommendation) — layout `(app)/` impose déjà `requireRole`, cette
 * page ajoute la garde ownership diagnostic (`assertCanAccessDiagnostic`,
 * RPC `can_user_access_diagnostic`). Bypass service_role UNIQUEMENT
 * après validation d'identité, ordre non permutable (cf.
 * docs/rls-hardening-plan.md §4.1).
 */
export default async function DiagnosticResumePage({ params }: Props) {
  const { id: diagnosticId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const access = await assertCanAccessDiagnostic(profile, diagnosticId);
  if (!access.ok) redirect("/forbidden");

  const supabase = createSupabaseAdminClient();
  if (!supabase) notFound();

  const { data: diagRow } = await supabase
    .from("diagnostics")
    .select("id, client_id, status")
    .eq("id", diagnosticId)
    .maybeSingle();
  if (!diagRow) notFound();

  const { data: clientRow } = await supabase
    .from("clients")
    .select("id, company_name, director")
    .eq("id", diagRow.client_id)
    .maybeSingle();

  const { data: answerRows } = await supabase
    .from("diagnostic_answers")
    .select("question_id, answer, is_skipped")
    .eq("diagnostic_id", diagnosticId);

  const answers: ResumeAnswerRecord[] = (answerRows ?? []).map((r) => ({
    questionId: r.question_id,
    answer: r.answer,
    isSkipped: Boolean(r.is_skipped),
  }));

  const decision = decideResumeEntryPoint(diagnosticQuestions, answers);

  return (
    <ResumeView
      diagnosticId={diagnosticId}
      status={diagRow.status ?? null}
      agencyName={clientRow?.company_name ?? null}
      director={clientRow?.director ?? null}
      decision={decision}
    />
  );
}
