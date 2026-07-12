import "server-only";

import type { ProfileWithRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  buildActivityLabel,
  defaultSeverity,
  parseActivityEventType,
  type ActivityEventType,
  type ActivitySeverity,
} from "./activity-event-types";

/**
 * Service d'écriture / lecture du journal d'activité.
 *
 * Règle d'or : **un échec de log ne doit JAMAIS faire échouer une
 * action métier**. Tous les helpers d'écriture sont try/catchés et
 * silencieux côté console.warn — la requête appelante voit toujours
 * `void` ou un objet best-effort.
 *
 * Politique de données — ne JAMAIS persister :
 *   - token brut / token_hash
 *   - contenu d'une CNI / RIB
 *   - production N-1 individuelle
 *   - contenu complet d'un diagnostic / support
 *   - email exact d'un participant DANS les metadata visibles à un
 *     autre commercial — on persiste seulement le prénom + statut
 *     fonctionnel quand utile.
 */

export interface CreateActivityLogInput {
  eventType: ActivityEventType;
  sessionId?: string | null;
  diagnosticId?: string | null;
  clientId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  /** Override le label automatique si fourni. */
  eventLabel?: string;
  eventDescription?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  severity?: ActivitySeverity;
  metadata?: Record<string, unknown>;
}

export interface ActivityLogRecord {
  id: string;
  sessionId: string | null;
  diagnosticId: string | null;
  clientId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  eventType: ActivityEventType | string;
  eventLabel: string;
  eventDescription: string | null;
  entityType: string | null;
  entityId: string | null;
  severity: ActivitySeverity;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface ActivityLogRow {
  id: string;
  session_id: string | null;
  diagnostic_id: string | null;
  client_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  event_type: string;
  event_label: string;
  event_description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  severity: ActivitySeverity;
  metadata: unknown;
  created_at: string;
}

function rowToRecord(row: ActivityLogRow): ActivityLogRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    diagnosticId: row.diagnostic_id,
    clientId: row.client_id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    eventType: parseActivityEventType(row.event_type) ?? row.event_type,
    eventLabel: row.event_label,
    eventDescription: row.event_description,
    entityType: row.entity_type,
    entityId: row.entity_id,
    severity: row.severity,
    metadata:
      typeof row.metadata === "object" && row.metadata !== null
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
  };
}

/**
 * Crée une entrée de log. JAMAIS bloquant. Renvoie l'entrée créée
 * si succès, `null` sinon (log silencieux côté `console.warn`).
 */
export async function createActivityLog(
  input: CreateActivityLogInput
): Promise<ActivityLogRecord | null> {
  // Best-effort intégral : on encapsule même la création du client
  // admin pour absorber un éventuel failfast SUPABASE_SERVICE_ROLE_KEY
  // en preprod/prod (cf. `createSupabaseAdminClient`). Un échec de log
  // ne doit JAMAIS faire échouer l'action métier qui l'a déclenché.
  let client: ReturnType<typeof createSupabaseAdminClient>;
  try {
    client = createSupabaseAdminClient();
  } catch (err) {
    console.warn(
      "[activity-log] Admin client indisponible — log ignoré:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
  if (!client) {
    console.warn("[activity-log] Supabase non configuré — log ignoré.");
    return null;
  }
  try {
    const label = input.eventLabel ?? buildActivityLabel(input.eventType, input.metadata);
    const severity = input.severity ?? defaultSeverity(input.eventType);
    const { data, error } = await client
      .from("activity_logs")
      .insert({
        session_id: input.sessionId ?? null,
        diagnostic_id: input.diagnosticId ?? null,
        client_id: input.clientId ?? null,
        actor_id: input.actorId ?? null,
        actor_name: input.actorName ?? null,
        actor_role: input.actorRole ?? null,
        event_type: input.eventType,
        event_label: label,
        event_description: input.eventDescription ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        severity,
        metadata: (input.metadata ?? {}) as never,
      })
      .select(
        "id, session_id, diagnostic_id, client_id, actor_id, actor_name, actor_role, event_type, event_label, event_description, entity_type, entity_id, severity, metadata, created_at"
      )
      .single();
    if (error || !data) {
      console.warn(
        `[activity-log] insert refusé pour ${input.eventType}: ${error?.message ?? "no data"}`
      );
      return null;
    }
    return rowToRecord(data as ActivityLogRow);
  } catch (err) {
    console.warn(
      `[activity-log] exception sur ${input.eventType}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export async function listActivityLogsBySession(
  sessionId: string,
  limit = 30
): Promise<ActivityLogRecord[]> {
  const client = createSupabaseAdminClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("activity_logs")
      .select(
        "id, session_id, diagnostic_id, client_id, actor_id, actor_name, actor_role, event_type, event_label, event_description, entity_type, entity_id, severity, metadata, created_at"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as ActivityLogRow[]).map(rowToRecord);
  } catch {
    return [];
  }
}

export async function listActivityLogsByDiagnostic(
  diagnosticId: string,
  limit = 30
): Promise<ActivityLogRecord[]> {
  const client = createSupabaseAdminClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("activity_logs")
      .select(
        "id, session_id, diagnostic_id, client_id, actor_id, actor_name, actor_role, event_type, event_label, event_description, entity_type, entity_id, severity, metadata, created_at"
      )
      .eq("diagnostic_id", diagnosticId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as ActivityLogRow[]).map(rowToRecord);
  } catch {
    return [];
  }
}

/**
 * Cockpit — activité récente cloisonnée par ownership (T-11, 2026-07-09).
 *
 * • Rôle `admin`     → voit toute l'activité Start Academy.
 * • Autres internes  → voit :
 *     - l'activité de ses propres sessions (`session_id ∈ mes sessions`)
 *     - OU de ses propres diagnostics (`diagnostic_id ∈ mes diagnostics`)
 *     - OU les actions dont il est l'acteur (`actor_id = profile.id`)
 *
 * `event_description` (texte libre `note_added`) reste exclu du SELECT
 * dans tous les cas — décision T-10c-BIS (2026-07-09). Le journal
 * détaillé d'une session (`/api/sessions/[id]/activity`, protégé par
 * `assertCanAccessSession`) conserve `event_description` pour les seuls
 * propriétaires.
 *
 * Historique posture :
 *   • T-10c « cockpit partagé » → **invalidé par T-11** (2026-07-09).
 *     Le contenu réellement exposé (noms clients, PII dirigeant,
 *     budgets, CA N-1) rendait la posture partagée intenable.
 */
export async function listRecentActivity(
  profile: ProfileWithRole,
  limit = 10
): Promise<ActivityLogRecord[]> {
  const client = createSupabaseAdminClient();
  if (!client) return [];
  const isAdmin = profile.role === "admin";
  try {
    let query = client
      .from("activity_logs")
      // event_description volontairement retiré (cf. commentaire ci-dessus).
      .select(
        "id, session_id, diagnostic_id, client_id, actor_id, actor_name, actor_role, event_type, event_label, entity_type, entity_id, severity, metadata, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!isAdmin) {
      // Résolution des IDs qui appartiennent au profile — nécessaire
      // pour construire un filtre `.or(...)` couvrant sessions, diagnostics
      // et actions personnelles. Deux SELECT `id` légers indexés par
      // `created_by`.
      const [sessRes, diagRes] = await Promise.all([
        client
          .from("training_sessions")
          .select("id")
          .eq("created_by", profile.id),
        client
          .from("diagnostics")
          .select("id")
          .eq("created_by", profile.id),
      ]);
      const sessionIds =
        ((sessRes.data as { id: string }[] | null) ?? []).map((r) => r.id);
      const diagIds =
        ((diagRes.data as { id: string }[] | null) ?? []).map((r) => r.id);

      const clauses: string[] = [`actor_id.eq.${profile.id}`];
      if (sessionIds.length > 0) {
        clauses.push(`session_id.in.(${sessionIds.join(",")})`);
      }
      if (diagIds.length > 0) {
        clauses.push(`diagnostic_id.in.(${diagIds.join(",")})`);
      }
      query = query.or(clauses.join(","));
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return (data as Omit<ActivityLogRow, "event_description">[]).map((row) => ({
      ...rowToRecord({ ...row, event_description: null }),
      eventDescription: null,
    }));
  } catch {
    return [];
  }
}
