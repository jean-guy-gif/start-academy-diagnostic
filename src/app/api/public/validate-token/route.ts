import { NextResponse } from "next/server";
import { z } from "zod";

import { validatePublicToken } from "@/lib/public-access/public-token-service";

export const runtime = "nodejs";

const BodySchema = z.object({
  token: z.string().min(16).max(256),
});

/**
 * Route publique : valide un token brut envoyé par une page publique.
 *
 * - Anonyme (pas d'auth Supabase requise).
 * - Hash + lookup côté serveur via service_role (jamais exposé).
 * - Retourne uniquement les données strictement nécessaires à
 *   l'affichage : aucun token_hash, aucun champ sensible.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { valid: false, reason: "malformed" },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { valid: false, reason: "malformed" },
      { status: 400 }
    );
  }

  const result = await validatePublicToken(parsed.data.token);
  return NextResponse.json(result);
}
