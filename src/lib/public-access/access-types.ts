/**
 * Types partagés autour des liens publics (`public_access_tokens`).
 *
 * Ce module ne contient AUCUN secret et peut être importé côté client.
 * Le service générateur de tokens lui-même reste server-only
 * (`public-token-service.ts`).
 */

export const ACCESS_TYPES = [
  "client_session_view",
  "participant_collect",
  "trainer_session_view",
] as const;

export type AccessType = (typeof ACCESS_TYPES)[number];

export function parseAccessType(value: unknown): AccessType | null {
  if (typeof value !== "string") return null;
  return (ACCESS_TYPES as readonly string[]).includes(value)
    ? (value as AccessType)
    : null;
}

/**
 * Chemin public correspondant à un type d'accès. Centralisé ici pour
 * éviter les chaînes magiques disséminées dans les composants.
 */
export function publicPathForAccessType(
  accessType: AccessType,
  token: string
): string {
  switch (accessType) {
    case "client_session_view":
      return `/public/session/${token}`;
    case "participant_collect":
      return `/public/collect/${token}`;
    case "trainer_session_view":
      return `/public/trainer/${token}`;
  }
}

/**
 * Payload retourné par la validation d'un token (route publique).
 *
 * Aucun secret n'apparaît ici — notamment pas le `token_hash`.
 */
export interface ValidatedTokenPayload {
  valid: true;
  accessType: AccessType;
  sessionId: string;
  sessionTitle: string | null;
  clientName: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
}

export interface InvalidTokenPayload {
  valid: false;
  reason:
    | "not_found"
    | "expired"
    | "exhausted"
    | "disabled"
    | "malformed"
    | "session_not_found";
}

export type TokenValidationResult =
  | ValidatedTokenPayload
  | InvalidTokenPayload;
