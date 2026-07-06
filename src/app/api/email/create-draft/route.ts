import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { hasRole, INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import {
  createGmailDraft,
  isGmailDraftAvailable,
} from "@/lib/email/gmail-draft-service";

export const runtime = "nodejs";

const BodySchema = z.object({
  to: z.string().email("Adresse email invalide."),
  subject: z.string().min(1).max(250),
  body: z.string().min(1).max(50_000),
  accessLinkId: z.string().min(1).max(200).nullable().optional(),
  sessionId: z.string().min(1).max(200).nullable().optional(),
});

/**
 * Crée un brouillon Gmail à partir d'un lien d'accès généré.
 *
 * Politique :
 *   - Auth obligatoire (rôle interne `admin` / `commercial` / `trainer`).
 *   - JAMAIS d'envoi automatique — drafts uniquement.
 *   - Si Gmail n'est pas configuré côté serveur, on renvoie
 *     `{ ok: false, code: "not_configured" }` avec HTTP 200 pour que
 *     l'UI puisse afficher proprement le message.
 *   - Logs : on enregistre une trace minimale (qui, vers qui, taille).
 *     Pas le corps du message — donnée potentiellement sensible.
 */
export async function POST(request: Request) {
  // 1. Auth.
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json(
      { ok: false, code: "unauthenticated", message: "Authentification requise." },
      { status: 401 }
    );
  }
  if (!hasRole(profile, INTERNAL_APP_ROLES)) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: "Rôle insuffisant." },
      { status: 403 }
    );
  }

  // 2. Validation payload.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_input", message: "Corps JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_input",
        message: "Payload invalide.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  // 3. Court-circuit si Gmail n'est pas configuré côté serveur. On
  //    répond 200 + status "not_configured" pour que l'UI puisse
  //    afficher proprement « Gmail n'est pas encore configuré ».
  if (!isGmailDraftAvailable()) {
    return NextResponse.json({
      ok: false,
      code: "not_configured",
      message:
        "Gmail n'est pas encore configuré côté serveur. Utilisez Copier le message ou Ouvrir dans mon mail.",
    });
  }

  // 4. Délégation au service. Renvoie aujourd'hui `not_implemented`
  //    tant que la lib `googleapis` n'a pas été branchée (cf.
  //    docs/gmail-draft-integration.md). L'UI doit traiter ce cas
  //    exactement comme `not_configured` côté ergonomie.
  const result = await createGmailDraft({
    to: parsed.data.to,
    subject: parsed.data.subject,
    body: parsed.data.body,
    accessLinkId: parsed.data.accessLinkId ?? null,
    sessionId: parsed.data.sessionId ?? null,
  });

  // 5. Réponse. On reste sur HTTP 200 quand l'échec est un état
  //    contrôlé (not_configured / not_implemented / invalid_input qui
  //    aurait échappé à Zod). 500 réservé aux vrais imprévus.
  if (!result.ok) {
    const httpStatus = result.code === "provider_error" ? 502 : 200;
    return NextResponse.json(result, { status: httpStatus });
  }

  return NextResponse.json(result);
}
