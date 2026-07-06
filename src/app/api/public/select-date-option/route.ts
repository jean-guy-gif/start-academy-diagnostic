import { NextResponse } from "next/server";
import { z } from "zod";

import { validatePublicToken } from "@/lib/public-access/public-token-service";
import { selectDateOptionViaServiceRole } from "@/lib/sessions/session-date-options-server";
import { createActivityLog } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

const BodySchema = z.object({
  token: z.string().min(16).max(256),
  optionId: z.string().uuid(),
  selectedByEmail: z.string().email().nullable().optional(),
});

/**
 * Route publique : le dirigeant sélectionne un créneau depuis son
 * lien sécurisé. Aucune auth Supabase requise pour le caller — la
 * validation passe par le token public.
 *
 * Garde-fous :
 *   - token validé AVANT toute opération ;
 *   - accessType strictement `client_session_view` ;
 *   - l'option doit appartenir à la session du token (pas de
 *     cross-session reach) ;
 *   - écriture via `service_role` (ce module n'expose JAMAIS la clé) ;
 *   - sélection unique garantie par le helper serveur (les autres
 *     `selected` repassent en `proposed`).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Corps JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Payload invalide.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const validation = await validatePublicToken(parsed.data.token);
  if (!validation.valid) {
    return NextResponse.json(
      { ok: false, error: "Lien invalide.", reason: validation.reason },
      { status: 403 }
    );
  }
  if (validation.accessType !== "client_session_view") {
    return NextResponse.json(
      {
        ok: false,
        error: "Ce lien ne permet pas la sélection de créneau.",
      },
      { status: 403 }
    );
  }

  const result = await selectDateOptionViaServiceRole(
    parsed.data.optionId,
    validation.sessionId,
    parsed.data.selectedByEmail ?? validation.recipientEmail ?? null
  );

  if (!result.ok) {
    const status =
      result.error === "service_unavailable"
        ? 503
        : result.error === "option_not_found" ||
          result.error === "option_wrong_session"
        ? 404
        : 400;
    return NextResponse.json(
      { ok: false, error: result.error ?? "Sélection refusée." },
      { status }
    );
  }

  // Journal d'activité — actor anon (dirigeant client). On NE LOGGE
  // PAS l'email exact dans metadata (déjà persisté en clair côté
  // `session_date_options.selected_by_email`).
  if (result.record) {
    createActivityLog({
      eventType: "date_option_selected",
      sessionId: validation.sessionId,
      actorId: null,
      actorName: validation.recipientName ?? null,
      actorRole: null,
      entityType: "session_date_option",
      entityId: result.record.id,
      metadata: {
        startAt: result.record.startAt,
        endAt: result.record.endAt,
        format: result.record.format,
        location: result.record.location,
      },
    }).catch(() => {
      /* log déjà silencieux côté service */
    });
  }

  return NextResponse.json({
    ok: true,
    dateOption: result.record,
  });
}
