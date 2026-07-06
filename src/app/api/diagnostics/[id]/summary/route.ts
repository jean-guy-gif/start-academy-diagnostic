import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/diagnostics/[id]/summary
 *
 * Renvoie le diagnostic + le client + les réponses + des stats
 * (count answered/skipped/weak signals). Réservé aux rôles internes.
 * Renvoie 404 si le diagnostic n'existe pas.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const { id: diagnosticId } = await context.params;
  if (!diagnosticId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "diagnosticId manquant." },
      { status: 400 }
    );
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        code: "service_unavailable",
        error: "Persistance Supabase indisponible.",
      },
      { status: 503 }
    );
  }

  const { data: diagRow, error: diagErr } = await supabase
    .from("diagnostics")
    .select("*")
    .eq("id", diagnosticId)
    .maybeSingle();
  if (diagErr) {
    return NextResponse.json(
      { ok: false, code: "query_failed", error: diagErr.message },
      { status: 500 }
    );
  }
  if (!diagRow) {
    return NextResponse.json(
      { ok: false, code: "not_found", error: "Diagnostic introuvable." },
      { status: 404 }
    );
  }

  const [{ data: clientRow }, { data: answerRows }] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("id", diagRow.client_id)
      .maybeSingle(),
    supabase
      .from("diagnostic_answers")
      .select("*")
      .eq("diagnostic_id", diagnosticId)
      .order("created_at", { ascending: true }),
  ]);

  const answers = (answerRows ?? []).map((row) => ({
    id: row.id,
    diagnosticId: row.diagnostic_id,
    questionId: row.question_id,
    questionText: row.question_text ?? "",
    category: row.category,
    answer: row.answer,
    note: row.note,
    isWeakSignal: row.is_weak_signal,
    isSkipped: row.is_skipped,
    createdAt: row.created_at,
  }));

  return NextResponse.json({
    ok: true,
    summary: {
      diagnostic: {
        id: diagRow.id,
        clientId: diagRow.client_id,
        mode: diagRow.mode,
        status: diagRow.status,
        declaredGoal: diagRow.declared_goal,
        profilesInScope: diagRow.profiles_in_scope,
        expectedParticipants: diagRow.expected_participants,
        notes: diagRow.notes,
        createdAt: diagRow.created_at,
        updatedAt: diagRow.updated_at,
      },
      client: clientRow
        ? {
            id: clientRow.id,
            companyName: clientRow.company_name,
            director: clientRow.director,
            email: clientRow.email,
            phone: clientRow.phone,
            collaboratorsCount: clientRow.collaborators_count,
            teamTypology: clientRow.team_typology,
            createdAt: clientRow.created_at,
          }
        : null,
      answers,
      stats: {
        answered: answers.filter((a) => !a.isSkipped).length,
        skipped: answers.filter((a) => a.isSkipped).length,
        weakSignals: answers.filter((a) => a.isWeakSignal).length,
      },
    },
  });
}
