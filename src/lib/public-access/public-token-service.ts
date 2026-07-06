import "server-only";

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  parseAccessType,
  publicPathForAccessType,
  type AccessType,
  type TokenValidationResult,
} from "./access-types";

/**
 * Service de gestion des tokens d'accès public.
 *
 * Règles de sécurité strictes :
 *   - Le token BRUT est généré ici (32 octets aléatoires
 *     cryptographiquement sûrs → base64url).
 *   - Seul son hash SHA-256 (hex) est persisté.
 *   - Le token brut n'est RETOURNÉ qu'une seule fois (à la création).
 *     Il ne peut PAS être relu en base — il faut en générer un nouveau.
 *   - La validation utilise service_role pour contourner RLS sans
 *     exposer le token côté client (les pages publiques n'attaquent
 *     JAMAIS Supabase directement).
 */

const RAW_TOKEN_BYTES = 32; // 256 bits d'entropie

function generateRawToken(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Comparaison constante en temps pour les hashs hex. Empêche les
 * timing attacks même si on ne fait *que* du lookup indexé : on
 * compare deux fois pour être idempotent — c'est ceinture + bretelles.
 */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export interface GenerateTokenOptions {
  recipientEmail?: string | null;
  recipientName?: string | null;
  expiresInDays?: number | null;
  maxUses?: number | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}

export interface GeneratedToken {
  /** Token BRUT — visible une seule fois côté serveur, à transmettre
   *  immédiatement à l'utilisateur (ou stocker côté client). */
  token: string;
  /** Chemin public à utiliser pour cet accès. */
  publicPath: string;
  /** Identifiant en base. Utile pour révocation ultérieure. */
  id: string;
  accessType: AccessType;
  expiresAt: string | null;
  maxUses: number | null;
}

export interface PublicTokenService {
  generatePublicToken(
    sessionId: string,
    accessType: AccessType,
    options?: GenerateTokenOptions
  ): Promise<GeneratedToken>;
  validatePublicToken(rawToken: string): Promise<TokenValidationResult>;
  incrementTokenUse(tokenId: string): Promise<void>;
}

/**
 * Construit le service. Lance une erreur si Supabase n'est pas
 * configuré — les liens publics ne peuvent pas fonctionner sans
 * persistance partagée entre commercial et destinataire.
 */
function requireAdminClient() {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new Error(
      "Supabase service_role non configuré : impossible de gérer les liens publics."
    );
  }
  return client;
}

export async function generatePublicToken(
  sessionId: string,
  accessType: AccessType,
  options: GenerateTokenOptions = {}
): Promise<GeneratedToken> {
  const client = requireAdminClient();

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  const expiresAt =
    options.expiresInDays && options.expiresInDays > 0
      ? new Date(
          Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000
        ).toISOString()
      : null;

  const { data, error } = await client
    .from("public_access_tokens")
    .insert({
      token_hash: tokenHash,
      session_id: sessionId,
      access_type: accessType,
      recipient_email: options.recipientEmail ?? null,
      recipient_name: options.recipientName ?? null,
      expires_at: expiresAt,
      max_uses: options.maxUses ?? null,
      is_active: true,
      created_by: options.createdBy ?? null,
      metadata: (options.metadata ?? {}) as never,
    })
    .select("id, access_type, expires_at, max_uses")
    .single();

  if (error || !data) {
    throw new Error(
      `Création du token impossible : ${error?.message ?? "raison inconnue"}`
    );
  }

  const resolvedAccessType = parseAccessType(data.access_type) ?? accessType;

  return {
    token: rawToken,
    publicPath: publicPathForAccessType(resolvedAccessType, rawToken),
    id: data.id,
    accessType: resolvedAccessType,
    expiresAt: data.expires_at,
    maxUses: data.max_uses,
  };
}

interface TokenRow {
  id: string;
  token_hash: string;
  session_id: string;
  access_type: string;
  recipient_email: string | null;
  recipient_name: string | null;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
}

export async function validatePublicToken(
  rawToken: string
): Promise<TokenValidationResult> {
  if (typeof rawToken !== "string" || rawToken.length < 16) {
    return { valid: false, reason: "malformed" };
  }

  const client = requireAdminClient();
  const expectedHash = hashToken(rawToken);

  const { data, error } = await client
    .from("public_access_tokens")
    .select(
      "id, token_hash, session_id, access_type, recipient_email, recipient_name, expires_at, max_uses, used_count, is_active"
    )
    .eq("token_hash", expectedHash)
    .maybeSingle<TokenRow>();

  if (error || !data) return { valid: false, reason: "not_found" };

  // Garde-fou : on vérifie le hash en time-constant même si la requête
  // a déjà filtré par égalité — on ne fait jamais confiance à un seul
  // mécanisme côté sécurité.
  if (!safeEqualHex(data.token_hash, expectedHash)) {
    return { valid: false, reason: "not_found" };
  }

  if (!data.is_active) return { valid: false, reason: "disabled" };

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: "expired" };
  }

  if (data.max_uses !== null && data.used_count >= data.max_uses) {
    return { valid: false, reason: "exhausted" };
  }

  const accessType = parseAccessType(data.access_type);
  if (!accessType) return { valid: false, reason: "malformed" };

  // Charge le strict minimum pour l'affichage public — jamais de
  // contenu sensible (proposition, recommandation, etc.).
  const { data: sessionRow } = await client
    .from("training_sessions")
    .select("id, client_id")
    .eq("id", data.session_id)
    .maybeSingle();

  if (!sessionRow) return { valid: false, reason: "session_not_found" };

  let clientName: string | null = null;
  if (sessionRow.client_id) {
    const { data: clientRow } = await client
      .from("clients")
      .select("company_name")
      .eq("id", sessionRow.client_id)
      .maybeSingle();
    clientName = clientRow?.company_name ?? null;
  }

  // Titre de proposition (best-effort via designed_training_supports OR
  // training_supports, qui contiennent un title).
  let sessionTitle: string | null = null;
  const { data: designed } = await client
    .from("designed_training_supports")
    .select("title")
    .eq("session_id", data.session_id)
    .maybeSingle();
  if (designed?.title) {
    sessionTitle = designed.title;
  } else {
    const { data: support } = await client
      .from("training_supports")
      .select("title")
      .eq("session_id", data.session_id)
      .maybeSingle();
    sessionTitle = support?.title ?? null;
  }

  return {
    valid: true,
    accessType,
    sessionId: data.session_id,
    sessionTitle,
    clientName,
    recipientEmail: data.recipient_email,
    recipientName: data.recipient_name,
  };
}

/**
 * Incrémente `used_count` du token. À appeler après une action
 * effective (ex : soumission participant), pas à chaque navigation
 * sur la page publique — sinon un dirigeant qui rafraîchit épuise
 * son propre lien.
 */
export async function incrementTokenUse(tokenId: string): Promise<void> {
  const client = requireAdminClient();

  // Best-effort : on relit puis on UPDATE. Race condition acceptable
  // pour le MVP (la limite `max_uses` est non critique — un dirigeant
  // qui rafraîchit n'est pas un attaquant). Un RPC atomique arrivera
  // si on doit garantir le anti-replay sur les actions sensibles.
  const { data, error } = await client
    .from("public_access_tokens")
    .select("used_count")
    .eq("id", tokenId)
    .maybeSingle();

  if (error || !data) return;

  await client
    .from("public_access_tokens")
    .update({ used_count: (data.used_count ?? 0) + 1 })
    .eq("id", tokenId);
}

/**
 * Helper : recharge le token_id à partir du hash. Utilisé par les
 * routes serveurs publiques qui re-valident puis incrémentent.
 *
 * N'expose JAMAIS le token brut — uniquement l'identifiant interne.
 */
export async function getTokenIdByRaw(rawToken: string): Promise<string | null> {
  const client = requireAdminClient();
  const expectedHash = hashToken(rawToken);
  const { data, error } = await client
    .from("public_access_tokens")
    .select("id")
    .eq("token_hash", expectedHash)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}
