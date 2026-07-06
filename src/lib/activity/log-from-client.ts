/**
 * Helper fire-and-forget pour les services côté navigateur qui veulent
 * écrire dans `activity_logs` sans dépendre du `service_role` (réservé
 * server-only). Tape l'endpoint authentifié `/api/activity/log` et
 * ignore toute erreur — un log raté ne DOIT JAMAIS faire échouer
 * l'action métier qui l'a déclenché (cf. activity-log-prd.md §7).
 */

import type { ActivityEventType, ActivitySeverity } from "./activity-event-types";

export interface LogActivityFromClientInput {
  eventType: ActivityEventType;
  sessionId?: string | null;
  diagnosticId?: string | null;
  clientId?: string | null;
  eventLabel?: string;
  eventDescription?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  severity?: ActivitySeverity;
  metadata?: Record<string, unknown>;
}

export function logActivityFromClient(input: LogActivityFromClientInput): void {
  // SSR-safe : si on est côté serveur (RSC), on no-op. Les routes
  // serveur appellent `createActivityLog` directement.
  if (typeof window === "undefined") return;
  void fetch("/api/activity/log", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {
    /* silencieux — best-effort */
  });
}
