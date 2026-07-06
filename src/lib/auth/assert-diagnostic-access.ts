import "server-only";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ProfileWithRole } from "./roles";

/**
 * Garde d'ownership diagnostic pour les routes serveur qui lisent /
 * écrivent via `createSupabaseAdminClient()` (service_role bypasse
 * RLS) avec un `diagnosticId` fourni par URL/body. Empêche un
 * commercial interne d'agir sur un diagnostic d'un collègue
 * (consommation OpenRouter, persistence de recommandation, etc.).
 *
 * Pattern :
 * ```ts
 * const auth = await requireApiRole(INTERNAL_APP_ROLES);
 * if (!auth.ok) return auth.response;
 * const access = await assertCanAccessDiagnostic(auth.profile, diagnosticId);
 * if (!access.ok) return access.response;
 * // ... appel OpenRouter / load Supabase autorisé
 * ```
 *
 * - `admin` → bypass direct (perf, pas de roundtrip Supabase).
 * - Autres rôles internes → appel
 *   `can_user_access_diagnostic(p_user_id, p_diagnostic_id)`
 *   (SECURITY DEFINER côté SQL — découplé de `auth.uid()`).
 * - Refus → `NextResponse` 403 JSON standardisée.
 * - Erreur Supabase / config absente → 503 / 500 explicite.
 */
export type AssertDiagnosticAccessResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

export async function assertCanAccessDiagnostic(
  profile: ProfileWithRole,
  diagnosticId: string
): Promise<AssertDiagnosticAccessResult> {
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
    "can_user_access_diagnostic",
    { p_user_id: profile.id, p_diagnostic_id: diagnosticId }
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
        { ok: false, code: "forbidden", error: "Accès diagnostic refusé." },
        { status: 403 }
      ),
    };
  }

  return { ok: true };
}
