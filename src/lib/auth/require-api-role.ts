import "server-only";

import { NextResponse } from "next/server";
import { getCurrentProfile } from "./get-current-user";
import { hasRole, type ProfileWithRole, type Role } from "./roles";

/**
 * Helper d'auth pour les routes API JSON.
 *
 * Différence avec `requireRole()` (qui utilise `redirect()`) :
 * cette fonction renvoie une `NextResponse` JSON standardisée que les
 * handlers peuvent retourner directement. Le pattern reste « early
 * return » — pas d'exception.
 *
 * Codes de réponse :
 *   - 401 `{ ok: false, code: "unauthenticated", error: "Connexion requise." }`
 *   - 403 `{ ok: false, code: "forbidden", error: "Rôle insuffisant." }`
 *
 * Usage type dans une route :
 * ```ts
 * export async function POST(request: Request) {
 *   const auth = await requireApiRole(INTERNAL_APP_ROLES);
 *   if (!auth.ok) return auth.response;
 *   // ... auth.profile garanti non null
 * }
 * ```
 */

export type RequireApiRoleResult =
  | { ok: true; profile: ProfileWithRole }
  | { ok: false; response: NextResponse };

export async function requireApiRole(
  allowedRoles: readonly Role[]
): Promise<RequireApiRoleResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          code: "unauthenticated",
          error: "Connexion requise.",
        },
        { status: 401 }
      ),
    };
  }
  if (!hasRole(profile, allowedRoles)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          code: "forbidden",
          error: "Rôle insuffisant.",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true, profile };
}
