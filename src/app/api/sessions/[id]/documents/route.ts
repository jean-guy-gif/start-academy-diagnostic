import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessSession } from "@/lib/auth/assert-session-access";
import {
  createSignedDownloadUrl,
  listSessionDocuments,
} from "@/lib/documents/document-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Liste les documents d'une session avec signed URLs courte durée.
 *
 * Sécurité (post-Phase 2D) :
 *   - `requireApiRole(INTERNAL_APP_ROLES)` : seul admin / commercial /
 *     trainer interne peut appeler la route.
 *   - **Vérification ownership explicite** via
 *     `can_user_access_session(profile.id, sessionId)` AVANT toute
 *     lecture admin. Admin → bypass direct. Autres rôles internes →
 *     accès uniquement si propriétaire de la session ou du
 *     diagnostic/client lié.
 *   - Signed URLs : durée 60 s, créées via service_role serveur,
 *     jamais cachées côté client.
 *   - `storage_path` n'est JAMAIS renvoyé au client.
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

  // Garde d'ownership session : admin bypasse, autres rôles internes
  // doivent prouver l'accès via `can_user_access_session` avant qu'on
  // lise en service_role (cf. src/lib/auth/assert-session-access.ts).
  const access = await assertCanAccessSession(auth.profile, sessionId);
  if (!access.ok) return access.response;

  const documents = await listSessionDocuments(sessionId);

  // Génère les signed URLs en parallèle. Si une signature échoue, on
  // garde le document mais sans URL — la UI affichera un état dégradé.
  const enriched = await Promise.all(
    documents.map(async (d) => {
      const url = await createSignedDownloadUrl(d.storagePath, 60);
      return {
        id: d.id,
        fileName: d.fileName,
        fileType: d.fileType,
        fileSize: d.fileSize,
        category: d.category,
        participantName: d.participantName,
        participantEmail: d.participantEmail,
        createdAt: d.createdAt,
        downloadUrl: url,
      };
    })
  );

  return NextResponse.json({ documents: enriched });
}
