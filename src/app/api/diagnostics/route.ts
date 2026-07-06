import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/diagnostics
 *
 * Liste les diagnostics — par défaut 100 derniers, plus récents en
 * tête, avec client joint et nombre de réponses. Réservé aux rôles
 * internes.
 *
 * Lecture en service_role pour rester compatible avec le durcissement
 * RLS Phase 2B à venir (la policy SELECT future sera basée sur
 * `created_by = auth.uid()` — l'API serveur reste libre d'agréger).
 */
export async function GET(request: Request) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = (() => {
    const parsed = rawLimit ? Number(rawLimit) : 100;
    if (!Number.isFinite(parsed) || parsed <= 0) return 100;
    return Math.min(parsed, 500);
  })();

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
    .from("diagnostics")
    .select(
      "*, client:clients(*), answer_count:diagnostic_answers(count)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { ok: false, code: "query_failed", error: error.message },
      { status: 500 }
    );
  }

  const items = (data ?? []).map((row) => {
    const raw = row as typeof row & {
      client:
        | {
            id: string;
            company_name: string;
            director: string | null;
            email: string | null;
            phone: string | null;
            collaborators_count: number | null;
            team_typology: string[];
            created_at: string;
          }
        | null;
      answer_count: { count: number }[] | null;
    };
    return {
      diagnostic: {
        id: raw.id,
        clientId: raw.client_id,
        mode: raw.mode,
        status: raw.status,
        declaredGoal: raw.declared_goal,
        profilesInScope: raw.profiles_in_scope,
        expectedParticipants: raw.expected_participants,
        notes: raw.notes,
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
      },
      client: raw.client
        ? {
            id: raw.client.id,
            companyName: raw.client.company_name,
            director: raw.client.director,
            email: raw.client.email,
            phone: raw.client.phone,
            collaboratorsCount: raw.client.collaborators_count,
            teamTypology: raw.client.team_typology,
            createdAt: raw.client.created_at,
          }
        : null,
      answerCount: raw.answer_count?.[0]?.count ?? 0,
    };
  });

  return NextResponse.json({ ok: true, items });
}
