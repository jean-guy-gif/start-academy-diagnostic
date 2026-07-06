import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessSession } from "@/lib/auth/assert-session-access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createActivityLog } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const FORMAT_VALUES = ["presentiel", "visio", "hybride"] as const;

const CreateBodySchema = z
  .object({
    title: z.string().min(1).max(200).nullable().optional(),
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    location: z.string().min(1).max(300).nullable().optional(),
    format: z.enum(FORMAT_VALUES).nullable().optional(),
  })
  .refine(
    (v) => {
      const s = Date.parse(v.startAt);
      const e = Date.parse(v.endAt);
      return Number.isFinite(s) && Number.isFinite(e) && e > s;
    },
    {
      message: "endAt doit être postérieur à startAt et au format ISO.",
      path: ["endAt"],
    }
  );

/**
 * GET — liste les créneaux d'une session.
 * POST — crée un nouveau créneau.
 *
 * Auth obligatoire (rôle interne admin/commercial/trainer). La lecture
 * passe par service_role pour éviter qu'un commercial sans policy
 * SELECT sur la table ne se voie refuser la liste — la table est
 * permissive en MVP, mais on prépare déjà le futur durcissement RLS.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await context.params;
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "sessionId manquant." },
      { status: 400 }
    );
  }

  // Garde ownership : empêche un commercial de lister les créneaux
  // d'une session qui ne lui appartient pas (audit I-4). Admin
  // bypass via le helper.
  const access = await assertCanAccessSession(auth.profile, sessionId);
  if (!access.ok) return access.response;

  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json(
      { error: "Persistance indisponible." },
      { status: 503 }
    );
  }

  const { data, error } = await client
    .from("session_date_options")
    .select(
      "id, session_id, title, start_at, end_at, location, format, status, selected_by_email, selected_at, created_at, updated_at"
    )
    .eq("session_id", sessionId)
    .order("start_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ dateOptions: data ?? [] });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await context.params;
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "sessionId manquant." },
      { status: 400 }
    );
  }

  // Garde ownership : empêche un commercial de créer un créneau
  // sur la session d'un collègue (audit I-4).
  const access = await assertCanAccessSession(auth.profile, sessionId);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps JSON invalide." },
      { status: 400 }
    );
  }
  const parsed = CreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json(
      { error: "Persistance indisponible." },
      { status: 503 }
    );
  }

  const { data, error } = await client
    .from("session_date_options")
    .insert({
      session_id: sessionId,
      title: parsed.data.title ?? null,
      start_at: parsed.data.startAt,
      end_at: parsed.data.endAt,
      location: parsed.data.location ?? null,
      format: parsed.data.format ?? null,
      created_by: auth.profile.id,
    })
    .select(
      "id, session_id, title, start_at, end_at, location, format, status, selected_by_email, selected_at, created_at, updated_at"
    )
    .single();
  if (error || !data) {
    return NextResponse.json(
      { ok: false, code: "insert_failed", error: error?.message ?? "Insert refusé." },
      { status: 500 }
    );
  }

  createActivityLog({
    eventType: "date_option_created",
    sessionId,
    actorId: auth.profile.id,
    actorName: auth.profile.full_name ?? auth.profile.email ?? null,
    actorRole: auth.profile.role,
    entityType: "session_date_option",
    entityId: data.id,
    metadata: {
      startAt: data.start_at,
      endAt: data.end_at,
      format: data.format,
      location: data.location,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  return NextResponse.json({ dateOption: data });
}
