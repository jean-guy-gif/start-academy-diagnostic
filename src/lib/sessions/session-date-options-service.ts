/**
 * Session — créneaux proposés (`session_date_options`).
 *
 * Deux faces :
 *   - **Interne** : ce module exporte des helpers utilisables côté
 *     navigateur (Supabase browser client) pour le flux commercial
 *     dans la fiche session. Soumis à RLS authenticated.
 *   - **Public** : la sélection par le dirigeant passe par
 *     `/api/public/select-date-option`, qui utilise service_role
 *     côté serveur APRÈS validation du token. Le helper serveur
 *     correspondant (`selectDateOptionViaServiceRole`) est exporté
 *     dans `./session-date-options-server.ts` (server-only).
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type SessionDateOptionStatus =
  | "proposed"
  | "selected"
  | "rejected"
  | "cancelled";

export type SessionDateOptionFormat = "presentiel" | "visio" | "hybride";

export interface SessionDateOptionRecord {
  id: string;
  sessionId: string;
  title: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  format: SessionDateOptionFormat | null;
  status: SessionDateOptionStatus;
  selectedByEmail: string | null;
  selectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDateOptionInput {
  title?: string | null;
  startAt: string;
  endAt: string;
  location?: string | null;
  format?: SessionDateOptionFormat | null;
  createdBy?: string | null;
}

interface DateOptionRow {
  id: string;
  session_id: string;
  title: string | null;
  start_at: string;
  end_at: string;
  location: string | null;
  format: SessionDateOptionFormat | null;
  status: SessionDateOptionStatus;
  selected_by_email: string | null;
  selected_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: DateOptionRow): SessionDateOptionRecord {
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

export type DateOptionServiceError =
  | { kind: "supabase_unavailable" }
  | { kind: "request_failed"; message: string };

export type DateOptionServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DateOptionServiceError };

/**
 * Crée un créneau pour une session. Source côté commercial — soumis
 * à RLS authenticated.
 */
export async function createDateOption(
  sessionId: string,
  input: CreateDateOptionInput
): Promise<DateOptionServiceResult<SessionDateOptionRecord>> {
  const client = createSupabaseBrowserClient();
  if (!client) {
    return { ok: false, error: { kind: "supabase_unavailable" } };
  }
  const { data, error } = await client
    .from("session_date_options")
    .insert({
      session_id: sessionId,
      title: input.title ?? null,
      start_at: input.startAt,
      end_at: input.endAt,
      location: input.location ?? null,
      format: input.format ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: { kind: "request_failed", message: error?.message ?? "—" },
    };
  }
  return { ok: true, data: rowToRecord(data as DateOptionRow) };
}

export async function listDateOptions(
  sessionId: string
): Promise<DateOptionServiceResult<SessionDateOptionRecord[]>> {
  const client = createSupabaseBrowserClient();
  if (!client) {
    return { ok: false, error: { kind: "supabase_unavailable" } };
  }
  const { data, error } = await client
    .from("session_date_options")
    .select("*")
    .eq("session_id", sessionId)
    .order("start_at", { ascending: true });
  if (error) {
    return {
      ok: false,
      error: { kind: "request_failed", message: error.message },
    };
  }
  return {
    ok: true,
    data: (data ?? []).map((r) => rowToRecord(r as DateOptionRow)),
  };
}

/**
 * Annule un créneau (statut → cancelled). Réservé aux rôles internes
 * via la route protégée — utilisable depuis la fiche session.
 */
export async function cancelDateOption(
  optionId: string
): Promise<DateOptionServiceResult<SessionDateOptionRecord>> {
  const client = createSupabaseBrowserClient();
  if (!client) {
    return { ok: false, error: { kind: "supabase_unavailable" } };
  }
  const { data, error } = await client
    .from("session_date_options")
    .update({ status: "cancelled" })
    .eq("id", optionId)
    .select("*")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: { kind: "request_failed", message: error?.message ?? "—" },
    };
  }
  return { ok: true, data: rowToRecord(data as DateOptionRow) };
}

/**
 * Sélectionne un créneau côté commercial (route interne — pas le
 * flux dirigeant public). La sélection publique passe par le helper
 * server-only (cf. `session-date-options-server.ts`).
 */
export async function selectDateOption(
  optionId: string,
  selectedByEmail?: string | null
): Promise<DateOptionServiceResult<SessionDateOptionRecord>> {
  const client = createSupabaseBrowserClient();
  if (!client) {
    return { ok: false, error: { kind: "supabase_unavailable" } };
  }

  // 1. Récupère la session pour pouvoir dé-sélectionner les autres.
  const { data: target, error: fetchErr } = await client
    .from("session_date_options")
    .select("session_id")
    .eq("id", optionId)
    .maybeSingle();
  if (fetchErr || !target) {
    return {
      ok: false,
      error: {
        kind: "request_failed",
        message: fetchErr?.message ?? "Créneau introuvable.",
      },
    };
  }

  // 2. Repasse les autres `selected` en `proposed` pour garantir
  //    l'unicité du selected. Best-effort — la transaction stricte
  //    arrivera quand on aura un RPC dédié.
  await client
    .from("session_date_options")
    .update({ status: "proposed", selected_at: null, selected_by_email: null })
    .eq("session_id", target.session_id)
    .neq("id", optionId)
    .eq("status", "selected");

  // 3. Sélectionne le créneau cible.
  const { data, error } = await client
    .from("session_date_options")
    .update({
      status: "selected",
      selected_at: new Date().toISOString(),
      selected_by_email: selectedByEmail ?? null,
    })
    .eq("id", optionId)
    .select("*")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: { kind: "request_failed", message: error?.message ?? "—" },
    };
  }
  return { ok: true, data: rowToRecord(data as DateOptionRow) };
}
