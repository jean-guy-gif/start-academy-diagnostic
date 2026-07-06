import "server-only";

import type { BuiltEmailTemplate } from "@/lib/public-access/email-templates";

/**
 * Gmail draft service — interface typée, provider PAS encore branché.
 *
 * Règles non négociables :
 *   - AUCUN envoi automatique. Cette couche ne sait créer que des
 *     BROUILLONS. Le commercial relit et envoie depuis sa boîte Gmail.
 *   - AUCUNE clé exposée côté client. Les credentials OAuth restent
 *     server-only (cf. `import "server-only"`).
 *   - Si les variables d'environnement requises sont absentes, on
 *     renvoie un statut `not_configured` explicite — jamais
 *     d'exception, jamais d'envoi silencieux.
 *   - Tant que le provider Gmail n'est pas branché (cf. TODO ci-dessous),
 *     on renvoie `not_implemented` même si les credentials existent.
 *     Cela évite tout effet de bord en pré-prod.
 *
 * Branchement futur (NOT IN THIS PR) :
 *   1. `npm i googleapis` (lib officielle).
 *   2. Échange OAuth2 : refresh_token long-lived stocké en env.
 *   3. `google.gmail({ version: "v1", auth }).users.drafts.create(...)`.
 *   4. Encoder le payload en RFC 2822 base64url.
 *   5. Retourner `{ ok: true, draftId, draftUrl }`.
 */

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export type GmailDraftFailureCode =
  | "not_configured"
  | "not_implemented"
  | "invalid_input"
  | "provider_error";

export interface GmailDraftSuccess {
  ok: true;
  draftId: string;
  /** URL ouvrant le brouillon dans Gmail web. Best-effort — peut être
   *  absent si la lib ne le retourne pas. */
  draftUrl: string | null;
}

export interface GmailDraftFailure {
  ok: false;
  code: GmailDraftFailureCode;
  message: string;
}

export type GmailDraftResult = GmailDraftSuccess | GmailDraftFailure;

export interface CreateGmailDraftInput {
  to: string;
  subject: string;
  body: string;
  /** Identifiant du token d'accès lié (audit). N'apparaît PAS dans
   *  l'email — sert uniquement pour le log. */
  accessLinkId?: string | null;
  /** Identifiant de session lié (audit). */
  sessionId?: string | null;
}

// ---------------------------------------------------------------------------
// Détection des credentials
// ---------------------------------------------------------------------------

function readEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : null;
}

/**
 * `true` si toutes les variables d'environnement requises pour le flux
 * OAuth Gmail sont présentes. Ne lit AUCUNE valeur dans le résultat —
 * seul un booléen sort de la fonction.
 */
export function isGmailDraftAvailable(): boolean {
  return (
    readEnv("GMAIL_CLIENT_ID") !== null &&
    readEnv("GMAIL_CLIENT_SECRET") !== null &&
    readEnv("GMAIL_REFRESH_TOKEN") !== null &&
    readEnv("GMAIL_SENDER_EMAIL") !== null
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateInput(input: CreateGmailDraftInput): GmailDraftFailure | null {
  if (!input.to || !EMAIL_RE.test(input.to.trim())) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Adresse email destinataire invalide.",
    };
  }
  if (!input.subject || input.subject.trim().length === 0) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Sujet manquant.",
    };
  }
  if (input.subject.length > 250) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Sujet trop long (max 250 caractères).",
    };
  }
  if (!input.body || input.body.trim().length === 0) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Corps du message vide.",
    };
  }
  if (input.body.length > 50_000) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Corps du message trop long (max 50 000 caractères).",
    };
  }
  return null;
}

/**
 * Helper utilitaire : convertit un `BuiltEmailTemplate` (sortie de
 * `buildEmailTemplate`) en payload prêt pour `createGmailDraft`.
 *
 * Fonction pure — utile pour les callers serveur qui voudraient
 * regénérer le template côté serveur plutôt que de faire confiance
 * au client. À ce stade, le client envoie déjà {to, subject, body}
 * pré-construits, donc ce helper reste optionnel.
 */
export function buildDraftPayloadFromAccessLink(params: {
  template: BuiltEmailTemplate;
  fallbackTo?: string | null;
  accessLinkId?: string | null;
  sessionId?: string | null;
}): CreateGmailDraftInput | null {
  const to = params.template.to ?? params.fallbackTo ?? null;
  if (!to) return null;
  return {
    to,
    subject: params.template.subject,
    body: params.template.body,
    accessLinkId: params.accessLinkId ?? null,
    sessionId: params.sessionId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Création du brouillon
// ---------------------------------------------------------------------------

/**
 * Crée un brouillon Gmail. NE PAS ENVOYER — drafts uniquement.
 *
 * Tant que le provider n'est pas branché (cf. TODO en tête de fichier),
 * cette fonction retourne :
 *   - `{ ok: false, code: "not_configured" }` si les variables d'env
 *     OAuth Gmail manquent ;
 *   - `{ ok: false, code: "invalid_input" }` si la validation locale
 *     échoue ;
 *   - `{ ok: false, code: "not_implemented" }` si tout est OK mais
 *     que la lib `googleapis` n'a pas encore été branchée.
 *
 * Quand la lib sera branchée, ce dernier cas devient `{ ok: true }`.
 */
export async function createGmailDraft(
  input: CreateGmailDraftInput
): Promise<GmailDraftResult> {
  // Validation cheap d'abord — pas la peine de toucher l'env si la
  // forme est mauvaise.
  const validationError = validateInput(input);
  if (validationError) return validationError;

  if (!isGmailDraftAvailable()) {
    return {
      ok: false,
      code: "not_configured",
      message:
        "Gmail non configuré : variables GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN ou GMAIL_SENDER_EMAIL manquantes.",
    };
  }

  // TODO — Branchement Gmail :
  //   1. Charger `googleapis` côté serveur.
  //   2. Créer un OAuth2Client avec CLIENT_ID + CLIENT_SECRET + REFRESH_TOKEN.
  //   3. Construire le message RFC 2822 :
  //        From: <GMAIL_SENDER_EMAIL>
  //        To: <input.to>
  //        Subject: <input.subject>
  //        Content-Type: text/plain; charset=utf-8
  //        <body>
  //   4. Encoder en base64url.
  //   5. Appeler `gmail.users.drafts.create({ userId: "me", requestBody: { message: { raw } } })`.
  //   6. Construire l'URL `https://mail.google.com/mail/u/0/#drafts?compose=<draftId>`
  //      (best-effort — la lib ne renvoie pas directement l'URL).
  //   7. Logger l'opération SANS le corps du message (privacy).
  //
  // Pour le MVP, on reste explicitement non-implémenté.
  return {
    ok: false,
    code: "not_implemented",
    message:
      "Le provider Gmail n'est pas encore branché côté serveur. La création réelle de brouillons arrive bientôt.",
  };
}
