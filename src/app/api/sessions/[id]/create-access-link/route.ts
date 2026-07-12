import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessSession } from "@/lib/auth/assert-session-access";
import { absoluteAppUrl } from "@/lib/config/app-url";
import { ACCESS_TYPES } from "@/lib/public-access/access-types";
import { generatePublicToken } from "@/lib/public-access/public-token-service";
import { createActivityLog } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

const BodySchema = z.object({
  accessType: z.enum(ACCESS_TYPES),
  recipientEmail: z
    .string()
    .email("Email destinataire invalide.")
    .nullable()
    .optional(),
  recipientName: z.string().min(1).max(120).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  maxUses: z.number().int().min(1).max(10_000).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  // 1. Authentification + autorisation : seuls les rôles internes
  //    Start Academy peuvent créer un lien d'invitation.
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  // 2. Validation des paramètres.
  const { id: sessionId } = await context.params;
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "Identifiant de session manquant." },
      { status: 400 }
    );
  }

  // 3. Garde d'ownership session : un commercial ne peut générer un
  //    token public que sur une session qu'il possède. Admin bypass.
  //    Empêche la fuite cross-commercial où un user créerait un
  //    `client_session_view` (lien dirigeant) sur la session d'un
  //    collègue (audit I-3).
  const access = await assertCanAccessSession(auth.profile, sessionId);
  if (!access.ok) return access.response;

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

  // 4. Génération du token. Lance une erreur si Supabase service_role
  //    n'est pas disponible (les liens publics ne peuvent pas
  //    fonctionner sans persistance partagée).
  try {
    const generated = await generatePublicToken(
      sessionId,
      parsed.data.accessType,
      {
        recipientEmail: parsed.data.recipientEmail ?? null,
        recipientName: parsed.data.recipientName ?? null,
        expiresInDays: parsed.data.expiresInDays ?? null,
        maxUses: parsed.data.maxUses ?? null,
        createdBy: auth.profile.id,
      }
    );

    // 5. Journal d'activité : on ne logge NI le token brut NI le hash.
    //    Le metadata contient juste le type d'accès et l'identifiant
    //    du token (clé public_access_tokens.id), suffisant pour tracer.
    createActivityLog({
      eventType: "access_link_created",
      sessionId,
      actorId: auth.profile.id,
      actorName: auth.profile.full_name ?? auth.profile.email ?? null,
      actorRole: auth.profile.role,
      entityType: "public_access_token",
      entityId: generated.id,
      metadata: {
        accessType: generated.accessType,
        recipientName: parsed.data.recipientName ?? null,
        expiresAt: generated.expiresAt,
        maxUses: generated.maxUses,
      },
    }).catch(() => {
      /* log déjà silencieux côté service */
    });

    // 6. On NE retourne JAMAIS `token_hash`. Le brut ne réapparaît
    //    qu'ici, une seule fois. `url` est ABSOLUE (préfixée par
    //    `absoluteAppUrl()`) — le client la copie/envoie telle quelle
    //    sans jamais reconstruire un origin avec `window.location`.
    //    Cf. commentaires de `src/lib/config/app-url.ts` sur la
    //    politique de fallback (dev = localhost, prod = throw si
    //    `NEXT_PUBLIC_APP_URL` manquante).
    return NextResponse.json({
      id: generated.id,
      accessType: generated.accessType,
      url: `${absoluteAppUrl()}${generated.publicPath}`,
      token: generated.token,
      expiresAt: generated.expiresAt,
      maxUses: generated.maxUses,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erreur inconnue.";
    return NextResponse.json(
      { ok: false, code: "generate_failed", error: `Génération du lien impossible : ${message}` },
      { status: 500 }
    );
  }
}
