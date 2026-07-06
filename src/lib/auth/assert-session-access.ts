import "server-only";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ProfileWithRole } from "./roles";

/**
 * Garde d'ownership session pour les routes serveur qui lisent /
 * écrivent via `createSupabaseAdminClient()` (service_role bypasse
 * RLS) mais qui veulent quand même empêcher un utilisateur interne
 * d'accéder à la session d'un collègue.
 *
 * Pattern :
 * ```ts
 * const auth = await requireApiRole(INTERNAL_APP_ROLES);
 * if (!auth.ok) return auth.response;
 * const access = await assertCanAccessSession(auth.profile, sessionId);
 * if (!access.ok) return access.response;
 * // ... lecture/écriture en admin client autorisée
 * ```
 *
 * - `admin` → bypass direct (perf, pas de roundtrip Supabase).
 * - Autres rôles internes → appelle `can_user_access_session(uuid, uuid)`
 *   qui prend `p_user_id` explicitement (le helper SECURITY DEFINER
 *   coupe la dépendance à `auth.uid()`, qui serait NULL en
 *   service_role).
 * - Si refus → renvoie une `NextResponse` 403 JSON standardisée.
 * - Si erreur Supabase / config absente → 503 / 500 explicite.
 */
export type AssertSessionAccessResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

export async function assertCanAccessSession(
  profile: ProfileWithRole,
  sessionId: string
): Promise<AssertSessionAccessResult> {
  if (profile.role === "admin") return { ok: true };

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          code: "service_unavailable",
          error: "Persistance Supabase indisponible.",
        },
        { status: 503 }
      ),
    };
  }

  const { data: allowed, error } = await supabase.rpc(
    "can_user_access_session",
    { p_user_id: profile.id, p_session_id: sessionId }
  );

  if (error) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          code: "access_check_failed",
          error: error.message,
        },
        { status: 500 }
      ),
    };
  }

  if (allowed !== true) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "forbidden", error: "Accès session refusé." },
        { status: 403 }
      ),
    };
  }

  return { ok: true };
}
