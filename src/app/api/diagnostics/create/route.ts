import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessClient } from "@/lib/auth/assert-client-access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createActivityLog } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

const ProfileTargetSchema = z.enum([
  "conseiller",
  "manager",
  "assistant",
  "direction",
]);

const ModeSchema = z.enum(["guided", "transcript", "hybrid"]);

const BodySchema = z.object({
  clientId: z.string().uuid(),
  mode: ModeSchema,
  declaredGoal: z.string().max(2000).nullable().optional(),
  profilesInScope: z.array(ProfileTargetSchema).max(20).default([]),
  expectedParticipants: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

/**
 * POST /api/diagnostics/create
 *
 * Crée un diagnostic (status `in_progress` à la création). Réservé
 * aux rôles internes. `created_by` posé sur le profil appelant — la
 * future policy Phase 2B s'appuiera dessus.
 *
 * Journal d'activité : `diagnostic_created` (best-effort).
 */
export async function POST(request: Request) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

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

  // T-10a fix (2026-07-09) — cloisonnement création diagnostic. Sans
  // cette assertion, un commercial pouvait fournir le `clientId` d'un
  // collègue et créer un diagnostic parasite sur le client d'autrui
  // (pollution cockpit + rapports, pas de fuite lecture).
  const clientAccess = await assertCanAccessClient(
    auth.profile,
    parsed.data.clientId
  );
  if (!clientAccess.ok) return clientAccess.response;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        code: "service_unavailable",
        error:
          "Persistance Supabase indisponible (mode local sans service_role).",
      },
      { status: 503 }
    );
  }

  const { data, error } = await supabase
    .from("diagnostics")
    .insert({
      client_id: parsed.data.clientId,
      mode: parsed.data.mode,
      status: "in_progress",
      declared_goal: parsed.data.declaredGoal ?? null,
      profiles_in_scope: parsed.data.profilesInScope,
      expected_participants: parsed.data.expectedParticipants ?? null,
      notes: parsed.data.notes ?? null,
      created_by: auth.profile.id,
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

  createActivityLog({
    eventType: "diagnostic_created",
    diagnosticId: data.id,
    clientId: data.client_id,
    actorId: auth.profile.id,
    actorName: auth.profile.full_name ?? auth.profile.email ?? null,
    actorRole: auth.profile.role,
    metadata: {
      mode: data.mode,
      profilesInScope: data.profiles_in_scope,
      expectedParticipants: data.expected_participants,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  return NextResponse.json({
    ok: true,
    diagnostic: {
      id: data.id,
      clientId: data.client_id,
      mode: data.mode,
      status: data.status,
      declaredGoal: data.declared_goal,
      profilesInScope: data.profiles_in_scope,
      expectedParticipants: data.expected_participants,
      notes: data.notes,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}
