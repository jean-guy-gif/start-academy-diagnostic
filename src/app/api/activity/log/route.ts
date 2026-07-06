import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessSession } from "@/lib/auth/assert-session-access";
import { assertCanAccessDiagnostic } from "@/lib/auth/assert-diagnostic-access";
import { createActivityLog } from "@/lib/activity/activity-log-service";
import { ACTIVITY_EVENT_TYPES } from "@/lib/activity/activity-event-types";

export const runtime = "nodejs";

const BodySchema = z.object({
  eventType: z.enum(ACTIVITY_EVENT_TYPES),
  sessionId: z.string().uuid().nullable().optional(),
  diagnosticId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  eventLabel: z.string().min(1).max(200).optional(),
  eventDescription: z.string().max(500).nullable().optional(),
  entityType: z.string().max(80).nullable().optional(),
  entityId: z.string().max(200).nullable().optional(),
  severity: z.enum(["info", "success", "warning", "error"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/activity/log — endpoint best-effort que les services
 * client-side peuvent appeler pour journaliser une action métier.
 *
 * Politique : ne JAMAIS faire échouer une action métier. Cette route
 * retourne toujours 200 (ou 401/403 en cas d'auth refusée). Si la
 * persistance échoue, le service logge en console et renvoie
 * `{ ok: false, code: "log_failed" }` — le client ignore et continue.
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

  // Garde ownership : empêche un commercial d'injecter un événement
  // (ex: `note_added`) dans le journal d'une session/diagnostic
  // d'un collègue (audit I-5). Admin bypass via les helpers.
  if (parsed.data.sessionId) {
    const access = await assertCanAccessSession(
      auth.profile,
      parsed.data.sessionId
    );
    if (!access.ok) return access.response;
  }
  if (parsed.data.diagnosticId) {
    const access = await assertCanAccessDiagnostic(
      auth.profile,
      parsed.data.diagnosticId
    );
    if (!access.ok) return access.response;
  }

  const result = await createActivityLog({
    eventType: parsed.data.eventType,
    sessionId: parsed.data.sessionId ?? null,
    diagnosticId: parsed.data.diagnosticId ?? null,
    clientId: parsed.data.clientId ?? null,
    actorId: auth.profile.id,
    actorName: auth.profile.full_name ?? auth.profile.email ?? null,
    actorRole: auth.profile.role,
    eventLabel: parsed.data.eventLabel,
    eventDescription: parsed.data.eventDescription ?? null,
    entityType: parsed.data.entityType ?? null,
    entityId: parsed.data.entityId ?? null,
    severity: parsed.data.severity,
    metadata: parsed.data.metadata,
  });

  if (!result) {
    // Échec persistance → 200 OK quand même côté http (best-effort)
    return NextResponse.json({ ok: false, code: "log_failed" });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
