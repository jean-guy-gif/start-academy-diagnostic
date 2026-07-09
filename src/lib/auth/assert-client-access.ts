import "server-only";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ProfileWithRole } from "./roles";

/**
 * Garde d'ownership client — miroir de `assertCanAccessDiagnostic`
 * et `assertCanAccessSession`, pour les routes qui reçoivent un
 * `clientId` en payload (ex : `POST /api/diagnostics/create` qui crée
 * un diagnostic pour un client). Empêche un commercial interne
 * d'agir sur le client d'un collègue.
 *
 * Pattern :
 * ```ts
 * const auth = await requireApiRole(INTERNAL_APP_ROLES);
 * if (!auth.ok) return auth.response;
 * const access = await assertCanAccessClient(auth.profile, clientId);
 * if (!access.ok) return access.response;
 * // ... création autorisée
 * ```
 *
 * - `admin` → bypass direct (perf, pas de roundtrip Supabase).
 * - Autres rôles internes → lecture directe de `clients.created_by`
 *   avec service_role, comparaison avec `profile.id`. Aligné sur la
 *   policy RLS `clients_owner_or_admin_select` déjà en place (Phase 2B).
 * - Client absent → 404.
 * - `created_by = null` (données historiques pré-Phase 2) → 403 sauf admin.
 * - Refus → `NextResponse` 403 JSON standardisée.
 * - Erreur Supabase / config absente → 503 / 500 explicite.
 *
 * NB : contrairement à `assertCanAccessDiagnostic` (RPC dédiée
 * `can_user_access_diagnostic`), on lit ici directement la colonne —
 * c'est équivalent fonctionnellement et évite d'ajouter une migration
 * SQL pour ce seul usage. Si le besoin d'auditer plusieurs voies
 * d'accès émerge (partage de client entre commerciaux, délégation), le
 * pattern RPC pourra être ajouté ultérieurement sans changer la
 * signature du helper.
 */
export type AssertClientAccessResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

export async function assertCanAccessClient(
  profile: ProfileWithRole,
  clientId: string
): Promise<AssertClientAccessResult> {
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

  const { data, error } = await supabase
    .from("clients")
    .select("id, created_by")
    .eq("id", clientId)
    .maybeSingle();

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

  if (!data) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "not_found", error: "Client introuvable." },
        { status: 404 }
      ),
    };
  }

  if (data.created_by !== profile.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "forbidden", error: "Accès client refusé." },
        { status: 403 }
      ),
    };
  }

  return { ok: true };
}
