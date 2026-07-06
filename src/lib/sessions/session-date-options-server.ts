import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  SessionDateOptionRecord,
  SessionDateOptionStatus,
} from "./session-date-options-service";

/**
 * Helpers `service_role` pour les routes publiques.
 *
 * À n'invoquer QU'APRÈS validation d'un token public côté serveur
 * (cf. `validatePublicToken` + check de `accessType`). Aucune
 * exposition côté client.
 */

interface ServerOption {
  id: string;
  session_id: string;
  status: SessionDateOptionStatus;
  selected_by_email: string | null;
  selected_at: string | null;
  title: string | null;
  start_at: string;
  end_at: string;
  location: string | null;
  format: SessionDateOptionRecord["format"];
  created_at: string;
  updated_at: string;
}

function toRecord(row: ServerOption): SessionDateOptionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    location: row.location,
    format: row.format,
    status: row.status,
    selectedByEmail: row.selected_by_email,
    selectedAt: row.selected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type PublicSelectError =
  | "service_unavailable"
  | "option_not_found"
  | "option_wrong_session"
  | "option_cancelled"
  | "update_failed";

export interface PublicSelectResult {
  ok: boolean;
  error?: PublicSelectError;
  record?: SessionDateOptionRecord;
}

/**
 * Sélectionne un créneau pour une session via service_role.
 *
 * Garde-fous :
 *   - vérifie que `optionId` appartient à `expectedSessionId` ;
 *   - repasse les autres `selected` en `proposed` (best-effort)
 *     pour garantir l'unicité ;
 *   - n'autorise pas la sélection d'un créneau `cancelled`.
 *
 * NOTE race condition : implémentation non-transactionnelle (deux
 * UPDATE séquentiels). Acceptable pour le MVP — un RPC atomique
 * pourra durcir si on observe des conflits.
 */
export async function selectDateOptionViaServiceRole(
  optionId: string,
  expectedSessionId: string,
  selectedByEmail: string | null
): Promise<PublicSelectResult> {
  const client = createSupabaseAdminClient();
  if (!client) return { ok: false, error: "service_unavailable" };

  const { data: target, error: fetchErr } = await client
    .from("session_date_options")
    .select("id, session_id, status")
    .eq("id", optionId)
    .maybeSingle();
  if (fetchErr || !target) return { ok: false, error: "option_not_found" };
  if (target.session_id !== expectedSessionId) {
    return { ok: false, error: "option_wrong_session" };
  }
  if (target.status === "cancelled") {
    return { ok: false, error: "option_cancelled" };
  }

  // Dé-sélectionne les autres options actuellement `selected`.
  await client
    .from("session_date_options")
    .update({ status: "proposed", selected_at: null, selected_by_email: null })
    .eq("session_id", expectedSessionId)
    .neq("id", optionId)
    .eq("status", "selected");

  // Sélectionne la cible.
  const { data, error } = await client
    .from("session_date_options")
    .update({
      status: "selected",
      selected_at: new Date().toISOString(),
      selected_by_email: selectedByEmail,
    })
    .eq("id", optionId)
    .select(
      "id, session_id, status, selected_by_email, selected_at, title, start_at, end_at, location, format, created_at, updated_at"
    )
    .single();
  if (error || !data) return { ok: false, error: "update_failed" };

  return { ok: true, record: toRecord(data as ServerOption) };
}

/**
 * Liste les créneaux d'une session via service_role — utilisé par les
 * pages publiques pour afficher les options proposées. Aucune
 * information sensible exposée (titre, dates, lieu, format, statut
 * uniquement).
 */
export async function listDateOptionsViaServiceRole(
  sessionId: string
): Promise<SessionDateOptionRecord[]> {
  const client = createSupabaseAdminClient();
  if (!client) return [];

  const { data, error } = await client
    .from("session_date_options")
    .select(
      "id, session_id, status, selected_by_email, selected_at, title, start_at, end_at, location, format, created_at, updated_at"
    )
    .eq("session_id", sessionId)
    .order("start_at", { ascending: true });
  if (error || !data) return [];
  return (data as ServerOption[]).map(toRecord);
}
