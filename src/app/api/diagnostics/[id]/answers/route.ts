import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { refreshDiagnosticSnapshots } from "@/lib/diagnostics/refresh-snapshots";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ANSWER_CATEGORIES } from "@/types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const BodySchema = z.object({
  questionId: z.string().min(1).max(200),
  questionText: z.string().min(1).max(2000),
  // T-3 (fix 2026-07-08) : consomme ANSWER_CATEGORIES comme source
  // unique — pas de duplication. Aligné avec le check_constraint
  // `diagnostic_answers_category_check` (migration 20260704).
  category: z.enum(ANSWER_CATEGORIES).nullable().optional(),
  answer: z.string().max(4000).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  isWeakSignal: z.boolean().default(false),
  isSkipped: z.boolean().default(false),
});

/**
 * POST /api/diagnostics/[id]/answers
 *
 * Enregistre une réponse au questionnaire diagnostic. Le diagnostic
 * doit exister. Le `created_by` est posé sur le profil appelant si la
 * colonne existe (cf. trigger `set_created_by_if_null`).
 *
 * NB : on insère systématiquement (pas d'upsert). Si une réponse à
 * la même question existe déjà, on garde la nouvelle ET l'ancienne —
 * le moteur d'analyse prend la dernière par `created_at` desc.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const { id: diagnosticId } = await context.params;
  if (!diagnosticId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "diagnosticId manquant." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "Corps JSON invalide." },
      { status: 400 }
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_input",
        error: "Payload invalide.",
        details: parsed.error.flatten(),
      },
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

  const { data, error } = await supabase
    .from("diagnostic_answers")
    .insert({
      diagnostic_id: diagnosticId,
      question_id: parsed.data.questionId,
      question_text: parsed.data.questionText,
      category: parsed.data.category ?? null,
      answer: parsed.data.answer ?? null,
      note: parsed.data.note ?? null,
      is_weak_signal: parsed.data.isWeakSignal,
      is_skipped: parsed.data.isSkipped,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      {
        ok: false,
        code: "insert_failed",
        error: error?.message ?? "Insert refusé.",
      },
      { status: 500 }
    );
  }

  // v1.0b (lot 1) — refresh best-effort des snapshots ratios/alerts.
  // Passe par `createSupabaseRouteHandlerClient` (cookie user, RLS
  // owner OR admin), jamais via service_role. Aucun log de contenu.
  await refreshDiagnosticSnapshots(diagnosticId);

  return NextResponse.json({
    ok: true,
    answer: {
      id: data.id,
      diagnosticId: data.diagnostic_id,
      questionId: data.question_id,
      questionText: data.question_text ?? "",
      category: data.category,
      answer: data.answer,
      note: data.note,
      isWeakSignal: data.is_weak_signal,
      isSkipped: data.is_skipped,
      createdAt: data.created_at,
    },
  });
}
