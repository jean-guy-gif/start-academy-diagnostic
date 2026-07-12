import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { SessionStatus } from "@/types";
import { isTransitionAllowed } from "./session-status-transitions";

/**
 * Service serveur pour la transition de statut d'une `training_sessions`
 * (ticket T-8, §11.2).
 *
 * Toutes les mutations passent par ici — la fonction historique
 * `updateTrainingSessionStatus` du module client `session-service.ts`
 * est du code mort et sera supprimée dans cette même PR.
 *
 * Politique :
 *   • service_role justifié : après authentification + assertion
 *     d'ownership côté route (`assertCanAccessSession`), on utilise le
 *     client admin pour appliquer l'UPDATE et lire la row à jour.
 *     Sans admin client, `updated_at` trigger + activity_log serveur
 *     seraient impossibles à faire de manière fiable.
 *   • Machine à états respectée : toute transition non autorisée
 *     produit `{ ok: false, reason: 'transition_forbidden' }` AVANT
 *     tout write DB.
 *   • Nuance T-8 : la transition `support_ready → delivered` exige que
 *     le `support_quality_reviews.status = 'validated'` existe pour
 *     cette session. Refus `{ ok: false, reason: 'support_not_validated' }`
 *     sinon.
 *   • Aucun log ici — le logging `activity_logs` est décidé côté route
 *     pour rester cohérent avec le reste du sous-arbre `sessions/*`.
 */

export interface UpdateSessionStatusOk {
  ok: true;
  from: SessionStatus;
  to: SessionStatus;
}

export type UpdateSessionStatusFailure =
  | {
      ok: false;
      reason: "session_not_found";
    }
  | {
      ok: false;
      reason: "transition_forbidden";
      from: SessionStatus;
      to: SessionStatus;
    }
  | {
      ok: false;
      reason: "support_not_validated";
      from: SessionStatus;
      to: SessionStatus;
    }
  | {
      ok: false;
      reason: "persistence_failed";
      message: string;
    };

export type UpdateSessionStatusResult =
  | UpdateSessionStatusOk
  | UpdateSessionStatusFailure;

/**
 * Applique la transition demandée après validation exhaustive :
 *   1. Lit le statut courant en base (source de vérité, pas un statut
 *      envoyé par le client).
 *   2. Vérifie que la transition `current → next` est autorisée par la
 *      machine à états.
 *   3. Nuance `support_ready → delivered` : vérifie qu'un
 *      `support_quality_reviews.status = 'validated'` existe pour
 *      cette session.
 *   4. UPDATE `training_sessions.status`.
 *
 * L'appelant DOIT avoir vérifié l'authentification et l'ownership
 * (typiquement `requireApiRole` + `assertCanAccessSession`) avant
 * d'invoquer cette fonction.
 */
export async function transitionSessionStatus(
  sessionId: string,
  targetStatus: SessionStatus
): Promise<UpdateSessionStatusResult> {
  const client = createSupabaseAdminClient();
  if (!client) {
    return {
      ok: false,
      reason: "persistence_failed",
      message: "service_role indisponible",
    };
  }

  // Étape 1 — lecture du statut courant (source de vérité serveur).
  const { data: current, error: readError } = await client
    .from("training_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (readError) {
    return {
      ok: false,
      reason: "persistence_failed",
      message: readError.message,
    };
  }
  if (!current) {
    return { ok: false, reason: "session_not_found" };
  }

  const from = current.status as SessionStatus;

  // Étape 2 — machine à états.
  if (!isTransitionAllowed(from, targetStatus)) {
    return {
      ok: false,
      reason: "transition_forbidden",
      from,
      to: targetStatus,
    };
  }

  // Étape 3 — garde support validation (T-8 nuance 1).
  //   `support_ready → delivered` exige un `support_quality_reviews`
  //   avec `status = 'validated'` pour cette session. Motif produit :
  //   on ne marque pas une formation « réalisée » si le support n'a
  //   pas été validé pédagogiquement au préalable.
  if (from === "support_ready" && targetStatus === "delivered") {
    const validated = await hasValidatedSupportQualityReview(sessionId);
    if (!validated) {
      return {
        ok: false,
        reason: "support_not_validated",
        from,
        to: targetStatus,
      };
    }
  }

  // Étape 4 — UPDATE.
  const { error: updateError } = await client
    .from("training_sessions")
    .update({ status: targetStatus })
    .eq("id", sessionId);
  if (updateError) {
    return {
      ok: false,
      reason: "persistence_failed",
      message: updateError.message,
    };
  }

  return { ok: true, from, to: targetStatus };
}

/**
 * Retourne `true` s'il existe au moins une `support_quality_reviews`
 * liée à `sessionId` avec `status = 'validated'`. Best-effort : en cas
 * d'erreur Supabase, retourne `false` (refus par sécurité).
 */
async function hasValidatedSupportQualityReview(
  sessionId: string
): Promise<boolean> {
  const client = createSupabaseAdminClient();
  if (!client) return false;
  const { data, error } = await client
    .from("support_quality_reviews")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "validated")
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * Retourne le statut courant d'une session ou `null` si introuvable.
 * Réutilisé par les gardes de pré-condition (T-8-BIS post-training-review,
 * corollaire éventuel support-quality).
 *
 * service_role justifié : appelé après ownership check côté route.
 */
export async function getSessionStatusById(
  sessionId: string
): Promise<SessionStatus | null> {
  const client = createSupabaseAdminClient();
  if (!client) return null;
  const { data, error } = await client
    .from("training_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return null;
  return data.status as SessionStatus;
}
